import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { runInNewContext } from "node:vm";
import { initialEnvironment } from "./self-hosted.mjs";
import { argumentsFor, configurationFrom, labelsFor, project, serviceDefinitions } from "./self-hosted-rehearsal.mjs";
import { assertStatusEnvironment, publicStatus, runStatusServices, safeStatusContainer, statusCheck, statusConfigurationLabel, statusContainerArguments, statusImageLabel, statusRuntimeAudit, statusServiceDefinitions, statusServiceLabels } from "./self-hosted-status-services.mjs";

const fixture = () => {
  const text = initialEnvironment("ops.outray.dev", "owner@example.net"), raw = parseEnv(text), config = configurationFrom(raw);
  return { text, raw, config, definitions: statusServiceDefinitions(config) };
};
const imageId = `sha256:${"a".repeat(64)}`, imageName = "outray-status-preview:fresh";

function metadata(config, kind, definition, status = "running", health = "healthy") {
  return {
    Id: `${kind}-exact-id`, Image: imageId,
    Config: {
      User: "node", WorkingDir: "/app", Cmd: definition.command,
      Labels: statusServiceLabels(config, imageId, kind, definition),
      Env: Object.entries(definition.env).map(([key, value]) => `${key}=${value}`),
      Healthcheck: { Test: ["CMD-SHELL", definition.healthCommand], Interval: 2_000_000_000, Timeout: 3_000_000_000, Retries: 20, StartPeriod: 5_000_000_000 },
    },
    State: { Status: status, Health: { Status: health }, OOMKilled: false },
    HostConfig: { ReadonlyRootfs: true, NetworkMode: project, PortBindings: {}, CapDrop: ["ALL"], CapAdd: [], SecurityOpt: ["no-new-privileges:true"], Init: true, RestartPolicy: { Name: "no" } },
    NetworkSettings: { Networks: { [project]: {} } }, Mounts: [{ Type: "tmpfs" }],
  };
}

function fakeDocker(f, options = {}) {
  const calls = [], containers = new Map();
  for (const kind of ["postgres", "redis"]) containers.set(`${project}-${kind}`, {
    Config: { Labels: labelsFor(f.config) }, State: { Status: "running", Health: { Status: options.badInfrastructure ? "unhealthy" : "healthy" } },
    HostConfig: { NetworkMode: project, PortBindings: {} }, NetworkSettings: { Networks: { [project]: {} } },
  });
  const kinds = { [publicStatus]: "status", [statusCheck]: "internal-check" };
  if (options.existing || options.partial) {
    containers.set(publicStatus, metadata(f.config, "status", f.definitions.status));
    if (!options.partial) containers.set(statusCheck, metadata(f.config, "internal-check", f.definitions["internal-check"]));
  }
  if (options.drift) containers.get(publicStatus).Image = "sha256:unrelated";
  const result = (value = "", status = 0, stderr = "") => ({ status, stdout: value, stderr });
  const spawn = (command, input, config) => {
    assert.equal(command, "docker");
    if (input[0] === "context") return result(options.remoteDocker || "unix:///var/run/docker.sock\n");
    assert.equal(input[0], "--host");
    const args = input.slice(2); calls.push({ args, env: config.env });
    if (args[1] === "inspect") {
      const target = args.at(-1);
      if (args[0] === "network") return result(JSON.stringify({ Labels: labelsFor(f.config), Internal: true, Driver: "bridge" }));
      if (args[0] === "image") return result(JSON.stringify({ Id: imageId, Config: { User: options.badImage ? "root" : "node", WorkingDir: "/app", Cmd: f.definitions.status.command, Labels: { [statusImageLabel]: "true" } } }));
      const value = containers.get(target);
      return value ? result(JSON.stringify(value)) : result("", 1, `Error: No such container: ${target}`);
    }
    if (args[0] === "run") return options.failAudit ? result("", 1, "Sensitive upstream diagnostic must not escape") : result();
    if (args[0] === "create") {
      const name = args[args.indexOf("--name") + 1], kind = kinds[name], definition = f.definitions[kind];
      for (const [key, value] of Object.entries(definition.env)) assert.equal(config.env[key], value);
      for (const key of ["GITHUB_CLIENT_SECRET", "TINYBIRD_QUERY_TOKEN", "HUGEICONS_LICENSE_KEY", "ZEPTO_API_KEY"]) assert.ok(!config.env[key]);
      const value = metadata(f.config, kind, definition, "created", "starting");
      containers.set(name, value); return result(value.Id);
    }
    if (args[0] === "start") {
      const value = [...containers.values()].find((item) => item.Id === args[1]); assert.ok(value);
      value.State.Status = "running"; value.State.Health.Status = options.unhealthyNew ? "unhealthy" : "healthy"; return result();
    }
    if (args[0] === "update") {
      const value = [...containers.values()].find((item) => item.Id === args.at(-1)); assert.ok(value);
      value.HostConfig.RestartPolicy.Name = "unless-stopped"; return result();
    }
    assert.fail(`Unexpected Docker command ${args[0]}`);
  };
  return { spawn, calls, containers };
}

async function withPrivateFixture(callback, mode = 0o600, extra = "") {
  const f = fixture(), directory = mkdtempSync(join(tmpdir(), "outray-status-test-")), file = join(directory, "instance.env");
  writeFileSync(file, f.text + extra, { mode });
  try { await callback(f, file); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("status services require explicit private config/image and no additional modes", () => {
  assert.equal(argumentsFor(["--file", "private.env", "--image", imageName]).image, imageName);
  for (const args of [[], ["--file", ".env.prod", "--image", imageName], ["--file", "private.env", "--image", imageName, "--enable-github"], ["--file", "private.env", "--image", "x;unsafe"]]) assert.throws(() => argumentsFor(args));
});

test("only uptime renderer/check definitions and independent internal secrets are selected", () => {
  const f = fixture(), selected = Object.keys(f.definitions);
  assert.deepEqual(selected, ["status", "internal-check"]);
  const raw = { ...f.raw, DATABASE_URL: "postgresql://hosted/never-use", GITHUB_CLIENT_SECRET: "private-oauth", TINYBIRD_QUERY_TOKEN: "private-analytics", ZEPTO_API_KEY: "private-email" };
  const definitions = statusServiceDefinitions(configurationFrom(raw));
  for (const definition of Object.values(definitions)) {
    assert.equal(definition.env.OUTRAY_PRODUCTS, "uptime");
    assert.equal(definition.env.UPTIME_PROBES_ENABLED, "false");
    assert.equal(definition.env.UPTIME_NOTIFICATIONS_ENABLED, "false");
    assert.equal(definition.env.STATUS_EDGE_SECRET, f.config.STATUS_EDGE_SECRET);
    assert.match(definition.env.DATABASE_URL, new RegExp(`@${project}-postgres:5432/`));
    assert.match(definition.healthCommand, /^node -e /);
    for (const value of ["private-oauth", "private-analytics", "private-email", "postgresql://hosted/never-use"]) assert.ok(!JSON.stringify(definition).includes(value));
  }
  assert.equal(serviceDefinitions(f.config).status.env.OUTRAY_PRODUCTS, "tunnels,observability,secrets,uptime", "normal rehearsal policy is untouched");
});

test("external credentials, workers, unapproved hosts and malformed internal credentials are rejected", () => {
  const env = fixture().definitions.status.env;
  for (const change of [
    { OUTRAY_DEPLOYMENT_MODE: "hosted" }, { OUTRAY_PRODUCTS: "uptime,tunnels" }, { UPTIME_PROBES_ENABLED: "true" }, { UPTIME_NOTIFICATIONS_ENABLED: "true" },
    { STATUS_PUBLIC_URL: "https://other.example.net" }, { GITHUB_CLIENT_SECRET: "private" }, { TINYBIRD_QUERY_TOKEN: "private" }, { ZEPTO_API_KEY: "private" },
    { OUTRAY_SECRETS_ACTIVE_MASTER_KEY: "private" }, { STATUS_EDGE_SECRET: "invalid" }, { DATABASE_URL: "postgresql://external/never-use" },
  ]) assert.throws(() => assertStatusEnvironment({ ...env, ...change }));
});

test("Docker create arguments configure real health, exact isolation and secret names only", () => {
  const f = fixture();
  for (const [kind, name] of [["status", publicStatus], ["internal-check", statusCheck]]) {
    const definition = f.definitions[kind], args = statusContainerArguments(name, definition, imageName, statusServiceLabels(f.config, imageId, kind, definition));
    assert.equal(args[0], "create"); assert.equal(args[args.indexOf("--network") + 1], project);
    assert.equal(args[args.indexOf("--restart") + 1], "no");
    assert.equal(args[args.indexOf("--health-cmd") + 1], definition.healthCommand);
    assert.equal(args[args.indexOf("--user") + 1], "node"); assert.equal(args[args.indexOf("--cap-drop") + 1], "ALL");
    assert.ok(args.includes("--read-only")); assert.ok(args.includes("--init"));
    assert.ok(args.includes("no-new-privileges:true"));
    for (const secret of [f.config.POSTGRES_PASSWORD, f.config.STATUS_EDGE_SECRET, f.config.UPTIME_RATE_LIMIT_SECRET, f.config.UPTIME_UNSUBSCRIBE_SECRET]) assert.ok(!args.join(" ").includes(secret));
    for (const forbidden of ["--detach", "--publish", "-p", "--publish-all", "--privileged", "--env-file", "--volumes-from", "--volumes"]) assert.ok(!args.includes(forbidden));
    for (let i = 0; i < args.indexOf(imageName); i++) if (args[i] === "-e") assert.match(args[i + 1], /^[A-Z][A-Z_0-9]*$/);
  }
  assert.throws(() => statusContainerArguments("other-app", f.definitions.status, imageName, {}));
});

test("exact reusable metadata rejects image, environment, command, health, privilege and network drift", () => {
  const f = fixture(), d = f.definitions.status, m = metadata(f.config, "status", d), labels = statusServiceLabels(f.config, imageId, "status", d);
  assert.equal(safeStatusContainer(m, imageId, labels, d), true);
  for (const change of [
    { Image: "sha256:wrong" }, { Config: { ...m.Config, User: "root" } }, { Config: { ...m.Config, Cmd: ["sh"] } },
    { Config: { ...m.Config, Healthcheck: undefined } }, { Config: { ...m.Config, Env: [...m.Config.Env, "TINYBIRD_INGEST_TOKEN=private"] } },
    { Config: { ...m.Config, Labels: { ...m.Config.Labels, [statusConfigurationLabel]: "other" } } },
    { HostConfig: { ...m.HostConfig, Privileged: true } }, { HostConfig: { ...m.HostConfig, Init: false } },
    { HostConfig: { ...m.HostConfig, PortBindings: { "4323/tcp": [{ HostPort: "4323" }] } } },
    { HostConfig: { ...m.HostConfig, CapAdd: ["NET_ADMIN"] } }, { HostConfig: { ...m.HostConfig, CapDrop: ["NET_RAW"] } },
    { HostConfig: { ...m.HostConfig, ReadonlyRootfs: false } }, { NetworkSettings: { Networks: { [project]: {}, public: {} } } },
    { Mounts: [{ Type: "volume" }] },
  ]) assert.equal(safeStatusContainer({ ...m, ...change }, imageId, labels, d), false);
  assert.equal(safeStatusContainer(m, imageId, labels, { ...d, env: { ...d.env, STATUS_EDGE_SECRET: "b".repeat(64) } }), false);
});

test("runtime audit accepts patched Node22/free status-only output and rejects stale/insecure images", () => {
  const prefix = statusRuntimeAudit.split("(async () =>")[0];
  const run = (options = {}) => {
    const manifest = { version: 1, iconMode: "free", deploymentMode: "self-hosted", targetNodeMajor: 22, source: { sha256: "a".repeat(64) }, ...options.manifest };
    const files = new Set(["/app/apps/status/dist/server/entry.mjs", "/app/apps/internal-check/dist/index.js", ...(options.files || [])]);
    if (options.missing) files.delete(options.missing);
    return runInNewContext(prefix, { require: () => ({ readFileSync: (path) => path.endsWith("manifest.json") ? JSON.stringify(manifest) : path.endsWith("index.js") ? options.oldChecker ? "old combined checker" : "/internal/status-domain-check" : JSON.stringify({ version: options.version || "1.6.3" }), existsSync: (path) => files.has(path), readdirSync: () => options.proPacks || [] }), process: { versions: { node: options.node || "22.23.3" }, exit: () => { throw new Error("audit denied"); } } });
  };
  assert.doesNotThrow(() => run()); assert.doesNotThrow(() => run({ version: "1.7.0" }));
  for (const change of [
    { version: "1.4.2" }, { version: "1.6.2" }, { version: "not-semver" }, { node: "24.1.0" }, { manifest: { iconMode: "pro" } },
    { manifest: { source: { sha256: "stale" } } }, { files: ["/app/apps/web"] }, { files: ["/app/apps/tunnel"] }, { files: ["/app/.npmrc"] },
    { files: ["/app/scripts"] }, { missing: "/app/apps/status/dist/server/entry.mjs" },
    { files: ["/app/node_modules/@hugeicons-pro"], proPacks: ["private"] }, { oldChecker: true },
  ]) assert.throws(() => run(change), /audit denied/);
  assert.match(statusRuntimeAudit, /'astro\/app\/node'.*'pg'.*'express'.*'sharp'/);
});

test("first installation audits without network/secrets, creates both before start and enables restarts only after health", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f);
    await runStatusServices(["--file", file, "--image", imageName], { spawn: docker.spawn, delay: async () => {} });
    const commands = docker.calls.map((call) => call.args[0]);
    assert.ok(commands.indexOf("run") < commands.indexOf("create"));
    assert.equal(commands.filter((name) => name === "create").length, 2);
    assert.ok(commands.lastIndexOf("create") < commands.indexOf("start"));
    assert.equal(commands.filter((name) => name === "update").length, 2);
    const audit = docker.calls.find((call) => call.args[0] === "run");
    assert.equal(audit.args[audit.args.indexOf("--network") + 1], "none");
    assert.ok(!audit.args.slice(0, audit.args.indexOf(imageName)).includes("-e")); assert.equal(audit.env.DATABASE_URL, undefined);
    assert.match(audit.args.at(-1), /if\(m\.source\.sha256!=="[a-f0-9]{64}"\)/);
    for (const call of docker.calls) for (const forbidden of ["rm", "stop", "--publish", "--volumes", "--env-file"]) assert.ok(!call.args.includes(forbidden));
  }, 0o600, "\nGITHUB_CLIENT_SECRET=do-not-forward\nTINYBIRD_QUERY_TOKEN=do-not-forward\n");
});

test("idempotent healthy reuse performs audit but never creates, restarts, or deletes targets", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { existing: true });
    await runStatusServices(["--file", file, "--image", imageName], { spawn: docker.spawn, delay: async () => {} });
    assert.equal(docker.calls.filter((call) => call.args[0] === "run").length, 1);
    for (const call of docker.calls) assert.ok(!["create", "start", "update", "stop", "rm"].includes(call.args[0]));
  });
});

test("partial/drifted targets, unsafe image, unhealthy DB and remote Docker fail before creation", async () => {
  await withPrivateFixture(async (f, file) => {
    for (const options of [{ partial: true }, { existing: true, drift: true }, { badImage: true }, { badInfrastructure: true }, { remoteDocker: "ssh://other-host" }]) {
      const docker = fakeDocker(f, options);
      await assert.rejects(runStatusServices(["--file", file, "--image", imageName], { spawn: docker.spawn, delay: async () => {} }));
      for (const call of docker.calls) assert.ok(!["create", "start", "update", "stop", "rm"].includes(call.args[0]));
    }
  });
});

test("failed runtime audit suppresses diagnostic values and leaves all resources unchanged", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { failAudit: true });
    await assert.rejects(runStatusServices(["--file", file, "--image", imageName], { spawn: docker.spawn }), (error) => {
      assert.match(error.message, /diagnostics suppressed/); assert.ok(!error.message.includes("Sensitive upstream")); return true;
    });
    assert.ok(!docker.calls.some((call) => ["create", "start", "update"].includes(call.args[0])));
  });
});

test("failed new service health leaves gateway/data unchanged and automatic restarts off", async () => {
  await withPrivateFixture(async (f, file) => {
    const docker = fakeDocker(f, { unhealthyNew: true });
    await assert.rejects(runStatusServices(["--file", file, "--image", imageName], { spawn: docker.spawn, delay: async () => {} }), /gateway remains unchanged/);
    assert.ok(!docker.calls.some((call) => ["update", "stop", "rm"].includes(call.args[0])));
    for (const target of [publicStatus, statusCheck]) assert.equal(docker.containers.get(target).HostConfig.RestartPolicy.Name, "no");
  });
});

test("non-private config files fail before any Docker operation", async () => {
  await withPrivateFixture(async (_f, file) => {
    await assert.rejects(runStatusServices(["--file", file, "--image", imageName], { spawn: () => assert.fail("Docker must not run") }), /regular private/);
  }, 0o644);
});

test("status Dockerfile verifies all fresh artifacts and omits console/tunnel/config from runtime", () => {
  const code = readFileSync(resolve("deploy/self-hosted/Dockerfile.status-preview"), "utf8"), runtime = code.split(" AS runtime\n")[1];
  assert.match(code, /self-hosted-artifacts\.mjs verify/); assert.match(code, /npm ci --ignore-scripts/); assert.match(code, /assert-free-deps/);
  assert.match(runtime, /LABEL com\.outray\.status-preview="true"/); assert.match(runtime, /USER node/);
  assert.match(runtime, /COPY.*\/app\/node_modules/); assert.match(runtime, /COPY.*\/app\/apps\/status /); assert.match(runtime, /COPY.*\/app\/apps\/internal-check /);
  assert.match(runtime, /\.self-hosted-artifacts\/apps\/status\/dist/); assert.match(runtime, /\.self-hosted-artifacts\/apps\/internal-check\/dist/);
  assert.ok(!/COPY.*(?:\/apps\/web|\/apps\/tunnel|\/app\/shared|\.npmrc|\.env|\/app\/scripts|\/app\/package\.json)/.test(runtime));
  assert.match(runtime, /CMD \["node", "apps\/status\/dist\/server\/entry\.mjs"\]/);
  const ignore = readFileSync(resolve("deploy/self-hosted/Dockerfile.status-preview.dockerignore"), "utf8");
  for (const pattern of ["**/node_modules", "!.self-hosted-artifacts/**", "**/.env*", "**/*.pem", "**/*.key", "deploy/woodpecker/secrets"]) assert.ok(ignore.includes(pattern));
});
