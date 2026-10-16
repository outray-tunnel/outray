import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseEnv } from "node:util";
import { acquireInstallationLock } from "./self-hosted-operation-lock.mjs";
import { initialEnvironment, main } from "./self-hosted.mjs";

const workerId = "a".repeat(64), postgresId = "b".repeat(64);
async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "outray-up-test-")), file = join(root, "instance.env");
  const config = { ...parseEnv(initialEnvironment("console.example.net", "owner@example.net")), GITHUB_CLIENT_ID: "fixture", GITHUB_CLIENT_SECRET: "private-oauth", TINYBIRD_INGEST_TOKEN: "append", TINYBIRD_QUERY_TOKEN: "read", ...(options.enabled ? { UPTIME_PROBES_ENABLED: "true", UPTIME_EGRESS_POLICY_READY: "true" } : {}) };
  await writeFile(file, Object.entries(config).map(([key, value]) => `${key}=${value}`).join("\n"), { mode: 0o600 });
  const calls = [], lock = join(root, ".self-hosted-state/update.lock");
  const probe = {
    manageProbeSupervisor: (action) => { assert.ok(existsSync(lock)); calls.push({ supervisor: action }); },
    probeComposeEnvironment: (_config, address) => { assert.equal(address, "172.30.42.2"); return { OUTRAY_PROBE_DATABASE_HOST: address }; },
    activateStandardProbe: (settings) => { assert.ok(existsSync(lock)); assert.equal(settings.endpoint, "unix:///test.sock"); assert.equal(settings.allowUpdateLock, true); calls.push({ activate: true }); },
  };
  const spawn = (command, args, settings) => {
    assert.equal(command, "docker"); calls.push({ args, settings });
    if (args[0] === "context") return { status: 0, stdout: options.remoteContext ? "ssh://remote" : "unix:///test.sock" };
    assert.deepEqual(args.slice(0, 2), ["--host", "unix:///test.sock"]);
    assert.ok(existsSync(lock), "every Docker operation must be serialized");
    for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) assert.equal(settings.env[key], undefined);
    const argv = args.slice(2);
    if (argv[0] === "ps") { assert.ok(argv.includes("--no-trunc")); return { status: 0, stdout: workerId }; }
    if (argv[0] === "container") {
      const postgres = argv.at(-1) === postgresId;
      return { status: 0, stdout: JSON.stringify([{ Id: postgres ? postgresId : workerId, State: { Running: true }, Config: { Labels: { "com.docker.compose.project": options.foreign ? "unrelated" : "outray-self-hosted", "com.docker.compose.service": postgres ? "postgres" : "uptime-probe" } }, NetworkSettings: { Networks: { "outray-self-hosted_database": { IPAddress: "172.30.42.2" } } } }]) };
    }
    if (argv[0] === "compose" && argv.includes("ps")) return { status: 0, stdout: postgresId };
    if (argv[0] === "compose" && (options.migrationFails && argv.includes("run") || options.gatewayFails && argv.includes("up") && argv.at(-1) === "caddy")) return { status: 1, stdout: "private diagnostics" };
    if (argv[0] === "compose" && options.composeFails) return { status: 1, stdout: "" };
    return { status: 0, stdout: "" };
  };
  return { root, file, calls, lock,
    run: (extra = {}) => main(["up", "--file", file], { root, spawn, env: { PATH: process.env.PATH, DOCKER_CONTEXT: "chosen-context" }, platform: "linux", uid: 0, probe, ...extra }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("setup rejects remote Docker selection before any installation mutation", async () => {
  for (const options of [{ remoteContext: true }, {}]) {
    const f = await fixture(options);
    try {
      await assert.rejects(f.run(options.remoteContext ? {} : { env: { DOCKER_HOST: "tcp://remote:2375" } }), /local Unix Docker/);
      assert.ok(f.calls.every((call) => call.args?.[0] === "context"));
      assert.ok(!existsSync(join(f.root, ".self-hosted-state")));
    } finally { await f.cleanup(); }
  }
});

test("disabled worker reconciliation stops the managed supervisor and only the exact owned worker", async () => {
  const f = await fixture();
  try {
    await f.run();
    assert.equal(f.calls[1].supervisor, "stop");
    const stopped = f.calls.find((call) => call.args?.[2] === "stop");
    assert.deepEqual(stopped.args.slice(2), ["stop", "--time", "30", workerId]);
    assert.ok(f.calls.some((call) => call.args?.[2] === "compose" && call.args.includes("up")));
    assert.ok(!f.calls.some((call) => call.activate || call.supervisor === "start" || call.args?.includes("--profile")));
    assert.ok(!existsSync(f.lock));
  } finally { await f.cleanup(); }
});

test("enabled worker setup pins all Docker calls and authorizes activation under the shared lock", async () => {
  const f = await fixture({ enabled: true });
  try {
    await f.run();
    assert.deepEqual(f.calls.filter((call) => call.supervisor).map((call) => call.supervisor), ["stop", "start"]);
    assert.equal(f.calls.filter((call) => call.activate).length, 1);
    assert.ok(f.calls.some((call) => call.args?.includes("--profile") && call.args.includes("uptime-worker")));
    const stage = (predicate) => f.calls.findIndex((call) => call.args?.[2] === "compose" && predicate(call.args));
    const build = stage((args) => args.includes("build")), migration = stage((args) => args.includes("run") && args.at(-1) === "migrate");
    const gateway = stage((args) => args.includes("up") && args.at(-1) === "caddy"), applications = stage((args) => args.includes("up") && args.includes("web"));
    assert.ok(build < migration && migration < gateway && gateway < applications);
    for (const index of [gateway, applications]) assert.ok(f.calls[index].args.includes("--no-deps"));
    assert.ok(f.calls[applications].args.includes("--no-build"));
    assert.ok(!existsSync(f.lock));
  } finally { await f.cleanup(); }
});

test("migration or fixed-IP gateway failures never launch dynamic application services", async () => {
  for (const options of [{ migrationFails: true }, { gatewayFails: true }]) {
    const f = await fixture(options);
    try { await assert.rejects(f.run(), options.migrationFails ? /migration\/bootstrap/ : /Gateway startup/); assert.ok(!f.calls.some((call) => call.args?.[2] === "compose" && call.args.includes("up") && call.args.includes("web"))); assert.ok(!existsSync(f.lock)); }
    finally { await f.cleanup(); }
  }
});

test("setup cannot overlap an update or stop a worker with changed ownership, and releases failed-operation locks", async () => {
  const busy = await fixture(), foreign = await fixture({ foreign: true }), failed = await fixture({ composeFails: true });
  try {
    const release = await acquireInstallationLock(busy.root);
    try { await assert.rejects(busy.run(), /Another installation operation/); assert.equal(busy.calls.length, 1); assert.equal(await readFile(busy.lock, "utf8"), String(process.pid)); }
    finally { await release(); }
    await assert.rejects(foreign.run(), /ownership changed/);
    assert.ok(!foreign.calls.some((call) => call.args?.[2] === "stop" || call.args?.[2] === "compose"));
    await assert.rejects(failed.run(), /Docker Compose did not complete/);
    for (const f of [foreign, failed]) assert.ok(!existsSync(f.lock));
  } finally { await Promise.all([busy.cleanup(), foreign.cleanup(), failed.cleanup()]); }
});
