import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import { parseEnv } from "node:util";
import { runInNewContext } from "node:vm";
import { initialEnvironment } from "./self-hosted.mjs";
import { determineUpdateRef, imageRollbackAllowed, parseUpdateOptions, runUpdate, schemaFingerprint, stableJson } from "./self-hosted-update.mjs";

const oldCommit = "a".repeat(40), nextCommit = "b".repeat(40);
const oldImage = `sha256:${"c".repeat(64)}`, nextImage = `sha256:${"d".repeat(64)}`;
const apps = ["web", "internal-check", "tunnel", "ingest", "cron", "status", "secrets-share"];
const roles = ["postgres", "redis", "caddy", ...apps];
const logicalVolumes = ["postgres-data", "redis-data", "status-page-logos", "caddy-data", "caddy-config"];
const password = "credential-that-must-not-be-printed";

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "outray-update-test-"));
  const config = parseEnv(initialEnvironment("console.example.net", "owner@example.net"));
  Object.assign(config, { GITHUB_CLIENT_ID: "fixture", GITHUB_CLIENT_SECRET: password, TINYBIRD_INGEST_TOKEN: "fixture-append", TINYBIRD_QUERY_TOKEN: "fixture-read" });
  const configuration = Object.entries(config).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  await writeFile(join(root, ".env.self-hosted"), configuration, { mode: 0o600 });
  const materialize = async (source) => {
    for (const [path, content] of [["scripts/self-hosted.mjs", "export const checkEnvironment=()=>({errors:[]});\n"], ["deploy/self-hosted/compose.yaml", "services: {}\n"], ["deploy/self-hosted/Caddyfile", ":443 { respond ok }\n"]]) {
      await mkdir(dirname(join(source, path)), { recursive: true }); await writeFile(join(source, path), content);
    }
  };
  await materialize(root);
  const ids = Object.fromEntries([...roles, ...(options.runningMigration ? ["migrate"] : [])].map((role, index) => [role, (index + 1).toString(16).padStart(64, "0")]));
  const mounts = { postgres: [["postgres-data", "/var/lib/postgresql/data"]], redis: [["redis-data", "/data"]], web: [["status-page-logos", "/var/lib/outray/status-page-logos"]], caddy: [["caddy-data", "/data"], ["caddy-config", "/config"]] };
  let migrated = false, replaced = false;
  const calls = [], output = [];
  const result = (stdout = "", status = 0) => ({ status, stdout, stderr: status ? password : "" });
  const environment = (role) => {
    if (role === "postgres") return ["POSTGRES_USER", "POSTGRES_DB", "POSTGRES_PASSWORD"].map((key) => `${key}=${config[key]}`);
    if (role === "web") return ["BETTER_AUTH_SECRET", "INTERNAL_API_SECRET", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY", "OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS"].map((key) => `${key}=${config[key]}`);
    return role === "secrets-share" ? [`SHARE_DATABASE_URL=postgresql://outray_share_app:${config.SHARE_DATABASE_PASSWORD}@postgres:5432/outray?sslmode=disable`] : [];
  };
  const metadata = () => Object.keys(ids).map((role) => ({ Id: ids[role], Image: replaced && apps.includes(role) ? nextImage : oldImage, Config: { Labels: { "com.docker.compose.project": "outray-self-hosted", "com.docker.compose.service": role }, Env: environment(role) }, State: { Running: true, Health: { Status: "healthy" } }, Mounts: (mounts[role] || []).map(([name, destination]) => ({ Type: "volume", Name: `outray-self-hosted_${name}`, Destination: destination, RW: true })) }));
  const execute = async (command, args, settings) => {
    calls.push({ command, args, settings });
    if (command === "git") {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return result(root);
      if (args[0] === "rev-parse") return result(args.includes("--verify") ? nextCommit : oldCommit);
      if (args[0] === "status") return result(options.dirty ? " M local-file" : "");
      if (args[0] === "ls-files") return result("", 1);
      if (args[0] === "symbolic-ref") return result("next");
      if (args[0] === "config") return result(args.at(-1).endsWith(".remote") ? "origin" : "refs/heads/next");
      if (args[0] === "remote") return result("origin");
      if (args[0] === "worktree") await materialize(args.at(-2));
      return result();
    }
    assert.equal(command, "docker");
    if (args[0] === "context") return result("unix:///var/run/docker.sock");
    assert.equal(args[0], "--host");
    const argv = args.slice(2);
    if (argv[0] === "ps") return result(options.missing || argv.some((arg) => arg.startsWith("name=")) || argv.includes("label=com.docker.compose.service=migrate") ? "" : Object.values(ids).join("\n"));
    if (argv[0] === "container") return result(JSON.stringify(metadata()));
    if (argv[0] === "image") return result(JSON.stringify([{ Id: nextImage }]));
    if (argv[0] === "volume") return result(JSON.stringify([{ Name: argv.at(-1), Driver: "local", Scope: "local", Options: null, Labels: { "com.docker.compose.project": "outray-self-hosted" } }]));
    if (argv[0] === "exec") {
      if (argv.includes("pg_dump")) return result(migrated && options.schemaChanged ? "CREATE TABLE changed();" : "CREATE TABLE original();");
      if (argv.includes("psql")) return result("[]");
      return result("OK\n");
    }
    if (argv[0] === "compose") {
      if (argv.includes("config")) {
        const source = dirname(argv[argv.indexOf("--file") + 1]);
        return result(JSON.stringify({ services: { postgres: { image: "postgres:16-bookworm" }, redis: { image: "redis:7-bookworm" }, caddy: { image: "caddy:2-alpine", volumes: [{ type: "bind", source: join(source, "Caddyfile"), target: "/etc/caddy/Caddyfile", read_only: true }] } }, volumes: Object.fromEntries(logicalVolumes.map((key) => [key, { name: `outray-self-hosted_${key}` }])) }));
      }
      if (argv.includes("build")) return result(password, options.buildFail ? 1 : 0);
      if (argv.includes("run")) { migrated = true; return { ...result(password, options.migrationTimeout ? -1 : options.migrationFail ? 1 : 0), timedOut: Boolean(options.migrationTimeout) }; }
      if (argv.includes("up") && !argv.some((arg) => arg.endsWith("images.previous.json"))) {
        replaced = true; return result(password, options.replaceFail ? 1 : 0);
      }
      if (argv.includes("up")) replaced = false;
    }
    return result();
  };
  const backupInstallation = async ({ beforeVolumeBackup }) => {
    await beforeVolumeBackup();
    if (options.backupFail) throw new Error(password);
    return { files: [] };
  };
  if (options.unchanged) {
    await mkdir(join(root, ".self-hosted-state"), { mode: 0o700 });
    await writeFile(join(root, ".self-hosted-state/current.json"), JSON.stringify({ commit: nextCommit, imageId: oldImage, configHash: createHash("sha256").update(configuration).digest("hex") }), { mode: 0o600 });
  }
  return { root, calls, output, execute, async run() {
    const original = { log: console.log, error: console.error }, dockerEnvironment = Object.fromEntries(["DOCKER_HOST", "DOCKER_CONTEXT"].map((key) => [key, process.env[key]]));
    for (const key of Object.keys(dockerEnvironment)) delete process.env[key];
    console.log = console.error = (...messages) => output.push(messages.join(" "));
    let clock = 0;
    try { return await runUpdate([], { root, execute, backupInstallation, delay: async () => {}, now: () => clock += 300000 }); }
    finally { console.log = original.log; console.error = original.error; for (const [key, value] of Object.entries(dockerEnvironment)) if (value !== undefined) process.env[key] = value; }
  }, async record() { const files = await readdir(join(root, ".self-hosted-state")); return JSON.parse(await readFile(join(root, ".self-hosted-state", files.find((file) => file.endsWith(".json") && file !== "current.json")), "utf8")); }, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const dockerAction = (entry, action) => entry.command === "docker" && entry.args[0] === "--host" && entry.args[2] === action;
const composeAction = (entry, action) => dockerAction(entry, "compose") && entry.args.includes(action);

async function captureFixture(script, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "outray-backup-stream-test-"));
  const stdinFile = join(root, "postgres.dump"), destination = join(root, "postgres.list");
  await writeFile(stdinFile, Buffer.alloc(8 * 1024 * 1024, 1), { mode: 0o600 });
  const source = await readFile(new URL("./self-hosted-update.mjs", import.meta.url), "utf8");
  const helper = source.slice(source.indexOf("async function captureDocker("), source.indexOf("\nexport async function runUpdate("));
  const stdinErrors = [], signals = [];
  const capture = runInNewContext(`(${helper})`, {
    constants, open, createReadStream, createWriteStream, pipeline,
    setTimeout, clearTimeout,
    fail: (message) => { throw new Error(message); },
    spawn: (command, args, options) => {
      assert.equal(command, "docker");
      assert.deepEqual(Array.from(args), ["--host", "unix:///test.sock", "exec", "-i", "postgres", "pg_restore", "--list"]);
      const child = spawn(process.execPath, ["-e", script], { stdio: options.stdio });
      child.stdin.on("error", (error) => stdinErrors.push(error.code));
      const kill = child.kill.bind(child);
      child.kill = (signal) => { signals.push(signal); return kill(signal); };
      return child;
    },
    ...overrides,
  });
  return {
    run: () => capture("unix:///test.sock", {}, ["exec", "-i", "postgres", "pg_restore", "--list"], destination, { stdinFile }),
    destination, stdinErrors, signals,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("backup capture accepts early stdin EPIPE only after a successful child exit and drains its complete output", async () => {
  const f = await captureFixture('require("node:fs").closeSync(0); process.stdout.write("TOC start\\n"); setTimeout(() => process.stdout.end("TOC complete\\n"), 30);');
  try {
    await f.run();
    assert.ok(f.stdinErrors.includes("EPIPE"), "the successful early-close case must exercise EPIPE");
    assert.equal(await readFile(f.destination, "utf8"), "TOC start\nTOC complete\n");
    assert.deepEqual(f.signals, []);
  } finally { await f.cleanup(); }
});

test("backup capture never accepts EPIPE from an unsuccessful or timed-out child", async () => {
  const failed = await captureFixture('require("node:fs").closeSync(0); process.stdout.end("incomplete index\\n"); setTimeout(() => process.exit(17), 30);');
  const timedOut = await captureFixture('require("node:fs").closeSync(0); process.stdout.write("incomplete index\\n"); setInterval(() => {}, 1000);', { setTimeout: (callback) => setTimeout(callback, 150) });
  for (const f of [failed, timedOut]) {
    try {
      await assert.rejects(f.run(), /A backup could not be completed/);
      assert.ok(f.stdinErrors.includes("EPIPE"));
      assert.ok(f.signals.includes("SIGKILL"));
    } finally { await f.cleanup(); }
  }
});

test("backup capture preserves genuine input and output stream failures even if the child would succeed", async () => {
  const script = 'process.stdin.resume(); process.stdout.write("TOC\\n"); setTimeout(() => process.exit(0), 1000);';
  const sourceError = Object.assign(new Error("private source diagnostics"), { code: "EPIPE" });
  const input = await captureFixture(script, { createReadStream: () => new Readable({ read() { this.destroy(sourceError); } }) });
  const output = await captureFixture(script, { createWriteStream: () => new Writable({ write(_chunk, _encoding, callback) { callback(Object.assign(new Error("private disk diagnostics"), { code: "ENOSPC" })); } }) });
  for (const f of [input, output]) {
    try {
      await assert.rejects(f.run(), (error) => error.message === "A backup could not be completed; existing data has not been replaced.");
      assert.ok(f.signals.includes("SIGKILL"));
    } finally { await f.cleanup(); }
  }
});

test("update options and target selection reject unsafe or ambiguous refs", () => {
  assert.equal(parseUpdateOptions(["--dry-run", "--ref", "next", "--timeout", "30"], "/checkout").file, "/checkout/.env.self-hosted");
  assert.deepEqual(determineUpdateRef({}, { OUTRAY_UPDATE_REF: "v1.2.3" }, { remote: "upstream", ref: "refs/heads/next" }), { remote: "upstream", ref: "v1.2.3" });
  for (const args of [["--ref", "../main"], ["--ref", "main;echo"], ["--remote", "https://example.net/repo"], ["--timeout", "0"], ["--dry-run", "--dry-run"], ["--unknown"]]) assert.throws(() => parseUpdateOptions(args));
  assert.throws(() => determineUpdateRef({}, {}, {}));
});

test("schema equality ignores psql safety nonces but never migration history changes", () => {
  const before = schemaFingerprint("\\restrict random1\nCREATE TABLE app();\n\\unrestrict random1\n", "[]");
  assert.equal(before, schemaFingerprint("\\restrict random2\nCREATE TABLE app();\n\\unrestrict random2\n", "[]"));
  assert.ok(imageRollbackAllowed(before, before));
  assert.ok(!imageRollbackAllowed(before, schemaFingerprint("CREATE TABLE app();\n", "[1]")));
  assert.ok(!imageRollbackAllowed(undefined, undefined));
  assert.equal(stableJson({ b: 1, a: { d: 2, c: 3 } }), stableJson({ a: { c: 3, d: 2 }, b: 1 }));
});

test("dirty checkouts and missing standard installations abort without mutation", async () => {
  for (const mode of [{ dirty: true }, { missing: true }]) {
    const f = await fixture(mode);
    try { await assert.rejects(f.run()); assert.ok(!f.calls.some((call) => call.command === "git" && call.args[0] === "fetch")); assert.ok(!f.calls.some((call) => ["stop", "pause", "start", "run"].some((action) => dockerAction(call, action)) || composeAction(call, "build"))); }
    finally { await f.cleanup(); }
  }
});

test("an unchanged healthy image/config skips builds, migrations and restarts", async () => {
  const f = await fixture({ unchanged: true });
  try { assert.equal((await f.run()).unchanged, true); assert.ok(!f.calls.some((call) => composeAction(call, "build") || composeAction(call, "run") || dockerAction(call, "stop"))); }
  finally { await f.cleanup(); }
});

test("failed builds leave old apps running and never disclose provider diagnostics", async () => {
  const f = await fixture({ buildFail: true });
  try { await assert.rejects(f.run()); assert.ok(f.calls.some((call) => composeAction(call, "build"))); assert.ok(!f.calls.some((call) => dockerAction(call, "stop"))); assert.ok(!f.output.join("\n").includes(password)); }
  finally { await f.cleanup(); }
});

test("backup failure unpauses infrastructure and restarts existing application IDs", async () => {
  const f = await fixture({ backupFail: true });
  try { await assert.rejects(f.run()); const record = await f.record(); assert.equal(record.rollback, "previous-containers-restarted"); assert.equal(record.rollbackHealthy, true); assert.equal(f.calls.filter((call) => dockerAction(call, "unpause")).length, 2); assert.ok(f.calls.some((call) => dockerAction(call, "start"))); assert.ok(!f.calls.some((call) => composeAction(call, "run"))); assert.ok(!f.output.join("\n").includes(password)); }
  finally { await f.cleanup(); }
});

test("failed schema-changing migrations keep apps stopped for reviewed recovery", async () => {
  const f = await fixture({ migrationFail: true, schemaChanged: true });
  try { await assert.rejects(f.run()); assert.equal((await f.record()).rollback, "schema-changed-or-unknown-apps-stopped-review-backup"); assert.ok(!f.calls.some((call) => dockerAction(call, "start") || composeAction(call, "up"))); }
  finally { await f.cleanup(); }
});

test("migration timeouts forbid automatic image rollback despite unchanged schema", async () => {
  const f = await fixture({ migrationTimeout: true });
  try { await assert.rejects(f.run()); assert.equal((await f.record()).rollback, "schema-changed-or-unknown-apps-stopped-review-backup"); assert.ok(f.calls.some((call) => composeAction(call, "run") && call.args.includes("-T"))); assert.ok(!f.calls.some((call) => composeAction(call, "up") || dockerAction(call, "start"))); }
  finally { await f.cleanup(); }
});

test("already running migrations block updates before build or application interruption", async () => {
  const f = await fixture({ runningMigration: true });
  try { await assert.rejects(f.run()); assert.match((await f.record()).failure, /migration\/bootstrap is running/); assert.ok(!f.calls.some((call) => composeAction(call, "build") || dockerAction(call, "stop"))); }
  finally { await f.cleanup(); }
});

test("failed replacement with unchanged schema restores pinned old images only", async () => {
  const f = await fixture({ replaceFail: true });
  try { await assert.rejects(f.run()); const record = await f.record(); assert.equal(record.rollback, "previous-images-restored-check-health"); assert.equal(record.rollbackHealthy, true); const rollback = f.calls.find((call) => composeAction(call, "up") && call.args.some((arg) => arg.endsWith("images.previous.json"))); assert.ok(rollback); for (const option of ["--no-build", "--no-deps", "--pull"]) assert.ok(rollback.args.includes(option)); assert.ok(!f.calls.some((call) => call.args.includes("pg_restore"))); }
  finally { await f.cleanup(); }
});

test("successful standard update uses one immutable image without recreating infrastructure", async () => {
  const f = await fixture();
  try { assert.equal((await f.run()).stage, "complete"); assert.equal(f.calls.filter((call) => composeAction(call, "build")).length, 1); const replace = f.calls.find((call) => composeAction(call, "up")); assert.equal(replace.settings.env.OUTRAY_IMAGE, nextImage); assert.ok(["postgres", "redis", "caddy"].every((role) => !replace.args.includes(role))); assert.equal(f.calls.filter((call) => dockerAction(call, "pause")).length, 2); }
  finally { await f.cleanup(); }
});

test("generic updater has no internal Ops deployment or destructive volume path", async () => {
  const source = await readFile(new URL("./self-hosted-update.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /outray-ops|ops\.outray|ops:update|"down"|"--volumes"|"prune"/);
});
