import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { spawnSync } from "node:child_process";
import { initialEnvironment } from "./self-hosted.mjs";
import { configurationFrom, labelsFor, project } from "./self-hosted-rehearsal.mjs";
import { opsTinybirdHost } from "./self-hosted-config-tinybird.mjs";
import { assertIngestEnvironment, ingestArguments, ingestConfigurationLabel, ingestContainer, ingestContainerArguments, ingestDefinition, ingestEgressNetwork, ingestHealthCommand, ingestHealthScript, ingestImageLabel, ingestLabels, ingestRuntimeAudit, runIngest, safeIngestContainer, safeIngestEgress } from "./self-hosted-ingest.mjs";

const imageName = "outray-ops-ingest-preview:fresh", imageId = `sha256:${"b".repeat(64)}`;
function fixture() {
  const text = initialEnvironment("ops.outray.dev", "owner@example.net");
  const raw = { ...parseEnv(text), TINYBIRD_API_HOST: opsTinybirdHost, TINYBIRD_QUERY_TOKEN: "query_fixture_token_never_deliver", TINYBIRD_INGEST_TOKEN: "append_fixture_token_never_print" };
  const config = configurationFrom(raw), definition = ingestDefinition(config, raw);
  return { text, raw, config, definition };
}
function metadata(f, state = "running", health = "healthy") {
  return {
    Id: "new-ingest-id", Image: imageId,
    Config: { User: "node", WorkingDir: "/app", Hostname: ingestContainer, Cmd: f.definition.command, Entrypoint: [], Labels: ingestLabels(f.config, imageId, f.definition),
      Env: Object.entries(f.definition.env).map(([key, value]) => `${key}=${value}`),
      Healthcheck: { Test: ["CMD-SHELL", f.definition.healthCommand], Interval: 10_000_000_000, Timeout: 8_000_000_000, Retries: 3, StartPeriod: 20_000_000_000 } },
    State: { Status: state, Health: { Status: health }, OOMKilled: false },
    HostConfig: { NetworkMode: project, ReadonlyRootfs: true, CapDrop: ["ALL"], CapAdd: [], SecurityOpt: ["no-new-privileges:true"], Init: true,
      RestartPolicy: { Name: "no" }, Memory: 536870912, MemorySwap: 536870912, PidsLimit: 128, Tmpfs: { "/tmp": "size=64m,mode=1777" }, LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } }, PortBindings: {} },
    NetworkSettings: { Networks: { [project]: { NetworkID: "core-network-id" }, [ingestEgressNetwork]: { NetworkID: "egress-network-id" } } },
    Mounts: [{ Type: "tmpfs", Destination: "/tmp" }],
  };
}
function egress(f, containerId = null) {
  return { Id: "egress-network-id", Name: ingestEgressNetwork, Labels: { ...labelsFor(f.config), [ingestImageLabel]: "true" }, Driver: "bridge", Scope: "local", Internal: false, EnableIPv6: false, Ingress: false, Attachable: false, Options: {}, Containers: containerId ? { [containerId]: { Name: ingestContainer } } : {} };
}
function fakeDocker(f, options = {}) {
  const calls = [], network = { Id: "core-network-id", Labels: labelsFor(f.config), Internal: true, Driver: "bridge" };
  let outbound = options.existing ? egress(f, "new-ingest-id") : null;
  let container = options.existing ? metadata(f, options.inactive ? "exited" : "running", options.unhealthyExisting ? "unhealthy" : "healthy") : null;
  if (options.drift && container) container.Config.Labels[ingestConfigurationLabel] = "foreign";
  if (options.shared) outbound = { ...egress(f), Containers: { other: { Name: "foreign" } } };
  const result = (stdout = "", status = 0, stderr = "") => ({ status, stdout, stderr });
  const spawn = (command, input, config) => {
    assert.equal(command, "docker");
    if (input[0] === "context") return result(options.remote || "unix:///var/run/docker.sock");
    assert.equal(input[0], "--host");
    const args = input.slice(2); calls.push({ args, env: config.env });
    if (args[1] === "inspect") {
      const name = args.at(-1);
      if (args[0] === "network") {
        const value = name === project ? network : outbound;
        return value ? result(JSON.stringify(value)) : result("", 1, `No such network: ${name}`);
      }
      if (args[0] === "image") return result(JSON.stringify({ Id: imageId, Config: { User: "node", WorkingDir: "/app", Cmd: f.definition.command, Entrypoint: [], Labels: { [ingestImageLabel]: "true" } } }));
      if (name === `${project}-postgres` || name === `${project}-redis`) return result(JSON.stringify({ Config: { Labels: labelsFor(f.config) }, State: { Status: "running", Health: { Status: options.badInfrastructure ? "unhealthy" : "healthy" } }, HostConfig: { NetworkMode: project, PortBindings: {} }, NetworkSettings: { Networks: { [project]: { NetworkID: network.Id } } } }));
      return container ? result(JSON.stringify(container)) : result("", 1, `No such container: ${name}`);
    }
    if (args[0] === "run") return options.failAudit ? result("", 1, "provider secret diagnostics must remain suppressed") : result();
    if (args[0] === "network" && args[1] === "create") { outbound = egress(f); return result(outbound.Id); }
    if (args[0] === "create") {
      for (const [key, value] of Object.entries(f.definition.env)) assert.equal(config.env[key], value);
      for (const key of ["TINYBIRD_QUERY_TOKEN", "GITHUB_CLIENT_SECRET", "ZEPTO_API_KEY", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY", "HUGEICONS_LICENSE_KEY"]) assert.equal(config.env[key], undefined);
      container = metadata(f, "created", "starting"); container.NetworkSettings.Networks[project].NetworkID = ""; delete container.NetworkSettings.Networks[ingestEgressNetwork]; return result(container.Id);
    }
    if (args[0] === "network" && args[1] === "connect") {
      if (options.failConnect) return result("", 1, "credentials suppressed");
      assert.equal(args[args.indexOf("--gw-priority") + 1], "1");
      container.NetworkSettings.Networks[ingestEgressNetwork] = { NetworkID: outbound.Id };
      outbound.Containers = { [container.Id]: { Name: ingestContainer } }; return result();
    }
    if (args[0] === "start") { assert.equal(args[1], container.Id); container.NetworkSettings.Networks[project].NetworkID = network.Id; container.State.Status = "running"; container.State.Health.Status = options.unhealthyNew ? "unhealthy" : options.starting ? "starting" : "healthy"; return result(); }
    if (args[0] === "exec") return options.failReady ? result("", 1, "credentials suppressed") : result();
    if (args[0] === "update") { assert.equal(args.at(-1), container.Id); container.HostConfig.RestartPolicy.Name = args[args.indexOf("--restart") + 1]; return result(); }
    if (args[0] === "stop") { assert.equal(args.at(-1), container.Id); container.State.Status = "exited"; return result(); }
    if (args[0] === "rm") { assert.equal(args[1], container.Id); container = null; outbound.Containers = {}; return result(); }
    assert.fail(`Unexpected command ${args[0]}`);
  };
  return { calls, spawn, container: () => container };
}
async function withPrivateFixture(callback, mode = 0o600) {
  const f = fixture(), directory = mkdtempSync(join(tmpdir(), "outray-ingest-test-")), file = join(directory, "instance.env");
  const content = f.text.replace(/^TINYBIRD_API_HOST=.*$/m, `TINYBIRD_API_HOST=${f.raw.TINYBIRD_API_HOST}`).replace(/^TINYBIRD_QUERY_TOKEN=.*$/m, `TINYBIRD_QUERY_TOKEN=${f.raw.TINYBIRD_QUERY_TOKEN}`).replace(/^TINYBIRD_INGEST_TOKEN=.*$/m, `TINYBIRD_INGEST_TOKEN=${f.raw.TINYBIRD_INGEST_TOKEN}`);
  writeFileSync(file, content, { mode });
  try { await callback(f, file); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("activation requires explicit fresh file and image; recovery is opt-in", () => {
  assert.deepEqual(ingestArguments(["--file", "/private/instance.env", "--image", imageName, "--recover"]), { file: "/private/instance.env", image: imageName, recover: true });
  for (const args of [[], ["--file", ".env.prod", "--image", imageName], ["--file", "private.env", "--image", "x;unsafe"], ["--file", "private.env", "--image", imageName, "--recover", "--recover"], ["--file", "private.env", "--image", imageName, "--enable-github"]]) assert.throws(() => ingestArguments(args));
});

test("environment includes only independent storage, APPEND and observability policy", () => {
  const f = fixture(), env = f.definition.env;
  assert.equal(env.OUTRAY_PRODUCTS, "observability"); assert.equal(env.OUTRAY_DEPLOYMENT_MODE, "self-hosted");
  assert.match(env.DATABASE_URL, new RegExp(`@${project}-postgres:5432/`)); assert.equal(env.REDIS_URL, `redis://${project}-redis:6379`);
  assert.equal(env.TINYBIRD_INGEST_TOKEN, f.raw.TINYBIRD_INGEST_TOKEN);
  for (const key of ["TINYBIRD_QUERY_TOKEN", "GITHUB_CLIENT_SECRET", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY", "UPTIME_PROBES_ENABLED", "ZEPTO_API_KEY"]) assert.equal(env[key], undefined);
  for (const change of [{ GITHUB_CLIENT_SECRET: "other" }, { TINYBIRD_QUERY_TOKEN: "other" }, { DATABASE_URL: "postgresql://hosted/never" }, { OUTRAY_PRODUCTS: "tunnels" }, { REDIS_URL: "redis://hosted" }, { HTTP_PROXY: "https://bad" }]) assert.throws(() => assertIngestEnvironment({ ...env, ...change }, f.definition));
});

test("known Ops origin, separate APPEND token and valid retention are required", () => {
  const f = fixture();
  for (const raw of [{ ...f.raw, TINYBIRD_API_HOST: "https://api.tinybird.co" }, { ...f.raw, TINYBIRD_INGEST_TOKEN: f.raw.TINYBIRD_QUERY_TOKEN }, { ...f.raw, TINYBIRD_INGEST_TOKEN: "" }, { ...f.raw, TINYBIRD_TUNNEL_INGEST_TOKEN: "foreign" }, { ...f.raw, OUTRAY_RETENTION_DAYS: "999" }]) assert.throws(() => ingestDefinition(f.config, raw));
  assert.throws(() => ingestDefinition({ ...f.config, OUTRAY_APP_HOST: "outray.dev" }, f.raw));
});

test("Docker receives environment names, limits, hardened private networking and dependency health", () => {
  const f = fixture(), args = ingestContainerArguments(f.definition, imageName, ingestLabels(f.config, imageId, f.definition));
  assert.equal(args[0], "create"); assert.equal(args[args.indexOf("--restart") + 1], "no"); assert.equal(args[args.indexOf("--network") + 1], project);
  assert.equal(args[args.indexOf("--hostname") + 1], ingestContainer); assert.equal(args[args.indexOf("--memory") + 1], "512m");
  assert.equal(args[args.indexOf("--health-cmd") + 1], f.definition.healthCommand);
  for (const secret of [f.config.POSTGRES_PASSWORD, f.raw.TINYBIRD_INGEST_TOKEN, f.raw.TINYBIRD_QUERY_TOKEN]) assert.ok(!args.join(" ").includes(secret));
  for (const forbidden of ["--publish", "-p", "--publish-all", "--privileged", "--env-file", "--volumes-from"]) assert.ok(!args.includes(forbidden));
  for (let i = 0; i < args.indexOf(imageName); i++) if (args[i] === "-e") assert.match(args[i + 1], /^[A-Z][A-Z_0-9]*$/);
});

test("exact owned metadata rejects isolation, credentials, command, network and health drift", () => {
  const f = fixture(), m = metadata(f), labels = ingestLabels(f.config, imageId, f.definition), ids = { [project]: "core-network-id", [ingestEgressNetwork]: "egress-network-id" };
  assert.equal(safeIngestContainer(m, imageId, labels, f.definition, ids), true);
  const changes = [
    { Image: "foreign" }, { Config: { ...m.Config, User: "root" } }, { Config: { ...m.Config, Hostname: "foreign" } }, { Config: { ...m.Config, Cmd: ["sh"] } },
    { Config: { ...m.Config, Env: [...m.Config.Env, "TINYBIRD_QUERY_TOKEN=private"] } }, { Config: { ...m.Config, Healthcheck: undefined } },
    { HostConfig: { ...m.HostConfig, Privileged: true } }, { HostConfig: { ...m.HostConfig, ReadonlyRootfs: false } }, { HostConfig: { ...m.HostConfig, CapAdd: ["NET_ADMIN"] } },
    { HostConfig: { ...m.HostConfig, PortBindings: { "4318/tcp": [{ HostPort: "4318" }] } } }, { HostConfig: { ...m.HostConfig, Memory: 0 } },
    { HostConfig: { ...m.HostConfig, MemorySwap: -1 } }, { HostConfig: { ...m.HostConfig, PidsLimit: -1 } }, { HostConfig: { ...m.HostConfig, Init: false } },
    { HostConfig: { ...m.HostConfig, Tmpfs: {} } }, { HostConfig: { ...m.HostConfig, SecurityOpt: ["no-new-privileges:true", "seccomp:unconfined"] } },
    { NetworkSettings: { Networks: { [project]: {}, [ingestEgressNetwork]: {}, foreign: {} } } }, { Mounts: [{ Type: "volume", Destination: "/data" }] },
  ];
  for (const change of changes) assert.equal(safeIngestContainer({ ...m, ...change }, imageId, labels, f.definition, ids), false);
  assert.equal(safeIngestContainer(m, imageId, labels, f.definition, { ...ids, [project]: "different-network" }), false);
});

test("egress network ownership forbids foreign members and unsafe settings", () => {
  const f = fixture(), labels = { ...labelsFor(f.config), [ingestImageLabel]: "true" }, n = egress(f);
  assert.equal(safeIngestEgress(n, labels), true); assert.equal(safeIngestEgress(egress(f, "own-id"), labels, "own-id"), true);
  for (const change of [{ Internal: true }, { EnableIPv6: true }, { Ingress: true }, { Attachable: true }, { Options: { "com.docker.network.bridge.name": "other" } }, { Labels: {} }, { Containers: { foreign: { Name: "foreign" } } }]) assert.equal(safeIngestEgress({ ...n, ...change }, labels, "own-id"), false);
});

test("unresolved created/exited primary network IDs are safe only before running; foreign nonblank IDs always fail", () => {
  const f = fixture(), labels = ingestLabels(f.config, imageId, f.definition), ids = { [project]: "core-network-id", [ingestEgressNetwork]: "egress-network-id" };
  for (const status of ["created", "exited"]) {
    const m = metadata(f, status); m.NetworkSettings.Networks[project].NetworkID = "";
    assert.equal(safeIngestContainer(m, imageId, labels, f.definition, ids), true);
    m.State.Status = "running"; assert.equal(safeIngestContainer(m, imageId, labels, f.definition, ids), false);
    m.State.Status = status; m.NetworkSettings.Networks[project].NetworkID = "foreign";
    assert.equal(safeIngestContainer(m, imageId, labels, f.definition, ids), false);
  }
});

test("runtime audit checks actual ingest artifacts and Node22/free standalone policy", () => {
  const content = "fresh bundle", path = "apps/ingest/dist/server.js";
  const manifest = { version: 1, iconMode: "free", deploymentMode: "self-hosted", targetNodeMajor: 22, artifacts: { files: [{ path, sha256: createHash("sha256").update(content).digest("hex") }] } };
  const run = (options = {}) => runInNewContext(ingestRuntimeAudit, {
    require: (name) => name === "node:crypto" ? { createHash } : name === "node:fs" ? { readFileSync: (name) => name.endsWith("manifest.json") ? JSON.stringify({ ...manifest, ...options.manifest }) : options.stale ? "old bundle" : content, existsSync: (path) => options.files?.includes(path), readdirSync: (path) => path.endsWith("/apps") ? options.apps || ["ingest"] : options.modules || [] } : {},
    process: { versions: { node: options.node || "22.23.3" }, exit: () => { throw new Error("audit denied"); } },
  });
  assert.doesNotThrow(() => run());
  for (const change of [{ stale: true }, { node: "24.0.0" }, { manifest: { iconMode: "pro" } }, { files: ["/app/.env"] }, { apps: ["ingest", "web"] }, { modules: ["@hugeicons-pro"] }]) assert.throws(() => run(change), /audit denied/);
});

test("first activation audits without networking/secrets and enables restart only after deep readiness", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f);
    await runIngest(["--file", file, "--image", imageName], { spawn: docker.spawn, delay: async () => {} });
    const actions = docker.calls.map((call) => call.args[0]), audit = docker.calls.find((call) => call.args[0] === "run");
    assert.ok(actions.indexOf("run") < actions.indexOf("create")); assert.ok(actions.indexOf("exec") < actions.indexOf("update"));
    assert.equal(audit.args[audit.args.indexOf("--network") + 1], "none"); assert.equal(audit.env.DATABASE_URL, undefined); assert.equal(audit.env.TINYBIRD_INGEST_TOKEN, undefined);
    assert.match(audit.args.at(-1), /m\.source\.sha256!=="[a-f0-9]{64}"/);
    assert.equal(docker.container().HostConfig.RestartPolicy.Name, "unless-stopped");
    for (const call of docker.calls) for (const forbidden of ["--publish", "--env-file", "--volumes"]) assert.ok(!call.args.includes(forbidden));
  });
});

test("healthy exact reuse repeats deep readiness without container or network mutations", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { existing: true });
    await runIngest(["--file", file, "--image", imageName], { spawn: docker.spawn });
    assert.ok(docker.calls.some((call) => call.args[0] === "exec"));
    for (const action of ["create", "start", "stop", "rm", "update"]) assert.ok(!docker.calls.some((call) => call.args[0] === action));
  });
});

test("new unhealthy worker is stopped and automatic restart remains disabled", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { unhealthyNew: true });
    await assert.rejects(runIngest(["--file", file, "--image", imageName], { spawn: docker.spawn, delay: async () => {} }), /readiness/);
    assert.equal(docker.container().State.Status, "exited"); assert.equal(docker.container().HostConfig.RestartPolicy.Name, "no");
    assert.ok(!docker.calls.some((call) => call.args[0] === "update" && call.args.includes("unless-stopped")));
  });
});

test("failed explicit dependency recheck is stopped with diagnostics suppressed", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { failReady: true });
    await assert.rejects(runIngest(["--file", file, "--image", imageName], { spawn: docker.spawn, delay: async () => {} }), /diagnostics suppressed/);
    assert.equal(docker.container().State.Status, "exited");
  });
});

test("failed audit or unhealthy core cannot create or activate resources", async () => {
  await withPrivateFixture(async (f, file) => {
    for (const options of [{ failAudit: true }, { badInfrastructure: true }, { shared: true }, { remote: "tcp://remote:2375" }]) {
      const docker = fakeDocker(f, options);
      await assert.rejects(runIngest(["--file", file, "--image", imageName], { spawn: docker.spawn }));
      assert.ok(!docker.calls.some((call) => ["create", "start", "stop", "rm"].includes(call.args[0]) || (call.args[0] === "network" && call.args[1] === "create")));
    }
  });
});

test("inactive reuse requires recovery; exact recovery touches only the ingestion ID", async () => {
  await withPrivateFixture(async (f, file) => {
    const denied = fakeDocker(f, { existing: true, inactive: true });
    await assert.rejects(runIngest(["--file", file, "--image", imageName], { spawn: denied.spawn }), /--recover/);
    assert.ok(!denied.calls.some((call) => ["rm", "start", "stop"].includes(call.args[0])));
    const docker = fakeDocker(f, { existing: true, inactive: true });
    await runIngest(["--file", file, "--image", imageName, "--recover"], { spawn: docker.spawn, delay: async () => {} });
    const removes = docker.calls.filter((call) => call.args[0] === "rm"); assert.equal(removes.length, 1); assert.deepEqual(removes[0].args, ["rm", "new-ingest-id"]);
  });
});

test("recovery cannot adopt an existing foreign or drifted container", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { existing: true, drift: true });
    await assert.rejects(runIngest(["--file", file, "--image", imageName, "--recover"], { spawn: docker.spawn }), /refusing replacement/);
    for (const action of ["run", "rm", "stop", "start", "update", "create"]) assert.ok(!docker.calls.some((call) => call.args[0] === action));
  });
});

test("egress connection failure never starts a partially connected worker", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { failConnect: true });
    await assert.rejects(runIngest(["--file", file, "--image", imageName], { spawn: docker.spawn }), /suppressed/);
    assert.equal(docker.container().State.Status, "created"); assert.ok(!docker.calls.some((call) => call.args[0] === "start"));
  });
});

test("interruption during readiness stops only the new owned ID and cannot enable restart", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { starting: true });
    await assert.rejects(runIngest(["--file", file, "--image", imageName], { spawn: docker.spawn, delay: async () => { process.emit("SIGTERM"); } }), /interrupted/);
    assert.equal(docker.container().State.Status, "exited");
    assert.equal(docker.container().HostConfig.RestartPolicy.Name, "no");
    assert.ok(!docker.calls.some((call) => call.args[0] === "update" && call.args.includes("unless-stopped")));
    assert.equal(docker.calls.filter((call) => call.args[0] === "stop").length, 1);
  });
});

test("configuration must be private; readiness checks all three consumer streams", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f);
    await assert.rejects(runIngest(["--file", file, "--image", imageName], { spawn: docker.spawn }), /mode0600/);
    assert.equal(docker.calls.length, 0);
  }, 0o644);
  for (const fragment of ["SELECT 1 AS ready", "redis.ping()", "outray:otel:traces", "outray:otel:logs", "outray:otel:metrics", "tinybird-writers", "os.hostname()", "Number(item.idle)<10000"]) assert.ok(ingestHealthScript.includes(fragment));
  const dockerfile = readFileSync(new URL("../deploy/self-hosted/Dockerfile.ingest-preview", import.meta.url), "utf8");
  assert.ok(!dockerfile.includes("npm ci")); assert.match(dockerfile, /ENTRYPOINT \[\]/); assert.match(dockerfile, /self-hosted-artifacts.mjs verify/);
});

test("Docker's real POSIX shell launches the entire multiline health script without escape corruption", () => {
  const directory = mkdtempSync(join(tmpdir(), "outray-ingest-shell-test-")), stub = join(directory, "node-stub.cjs"), executable = join(directory, "node");
  try {
    writeFileSync(stub, `const vm=require('node:vm');if(process.argv[2]!=='-e'||process.argv.length!==4)process.exit(1);vm.runInNewContext(process.argv[3],{Buffer,eval:(script)=>{if(script!==${JSON.stringify(ingestHealthScript)})process.exit(2);new vm.Script(script);process.stdout.write('health-script-valid')}});`);
    writeFileSync(executable, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(stub)} "$@"\n`); chmodSync(executable, 0o700);
    const result = spawnSync("/bin/sh", ["-c", ingestHealthCommand], { env: { PATH: `${directory}:/usr/bin:/bin` }, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, "health-script-valid");
    assert.ok(!ingestHealthCommand.includes("\n"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
