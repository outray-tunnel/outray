import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { initialEnvironment } from "./self-hosted.mjs";
import { configurationFrom, labelsFor, project } from "./self-hosted-rehearsal.mjs";
import { assertProbeEnvironment, assertProbeNetworkCollisions, probeArguments, probeConfigurationLabel, probeContainer, probeContainerArguments, probeDefinition, probeHealthCommand, probeImageLabel, probeLabels, probeRuntimeAudit, runProbe, safeProbeContainer } from "./self-hosted-probe.mjs";

const imageName = "outray-ops-probe-preview:fresh", imageId = `sha256:${"a".repeat(64)}`;
const net = { probeNetwork: "outray-ops-probe-egress", probeAddress: "172.21.42.2", probeResolver: "1.1.1.1", probeSubnet: "172.21.42.0/29", probeBridge: "br-or-probe", safeProbeNetwork: (metadata, labels) => Object.entries(labels).every(([key, value]) => metadata.Labels?.[key] === value) };
function fixture() {
  const text = initialEnvironment("ops.outray.dev", "owner@example.net"), config = configurationFrom(parseEnv(text)), definition = probeDefinition(config, "172.18.0.2");
  return { text, config, definition };
}
function metadata(f, status = "running", healthy = true) {
  return { Id: "c".repeat(64), Image: imageId, Config: { User: "node", WorkingDir: "/app", Cmd: f.definition.command, Entrypoint: null,
    Env: [...Object.entries(f.definition.env).map(([key, value]) => `${key}=${value}`), "PATH=/usr/bin", "NODE_VERSION=22.23.3", "YARN_VERSION=1.22.22"],
    Labels: probeLabels(f.config, imageId, f.definition), Healthcheck: { Test: ["CMD-SHELL", probeHealthCommand], Interval: 10_000_000_000, Timeout: 3_000_000_000, Retries: 3, StartPeriod: 120_000_000_000 } },
    HostConfig: { ReadonlyRootfs: true, Privileged: false, PublishAllPorts: false, PortBindings: {}, CapDrop: ["ALL"], CapAdd: [], SecurityOpt: ["no-new-privileges:true"], Init: true, NetworkMode: net.probeNetwork, RestartPolicy: { Name: "no" }, Dns: [net.probeResolver], Memory: 268435456, MemorySwap: 268435456, PidsLimit: 64, Tmpfs: { "/tmp": "size=16m,mode=1777" } },
    State: { Status: status, Pid: status === "running" ? 1001 : 0, Health: { Status: healthy ? "healthy" : "starting" }, OOMKilled: false },
    NetworkSettings: { Networks: { [net.probeNetwork]: { IPAddress: status === "created" ? "" : net.probeAddress, IPAMConfig: { IPv4Address: net.probeAddress } } } }, Mounts: [{ Type: "tmpfs", Destination: "/tmp" }] };
}
async function privateFixture(callback, mode = 0o600) {
  const f = fixture(), dir = mkdtempSync(join(tmpdir(), "outray-probe-test-")), file = join(dir, "instance.env");
  writeFileSync(file, f.text + "\nGITHUB_CLIENT_SECRET=never-forward\nTINYBIRD_QUERY_TOKEN=never-forward\nDATABASE_URL=postgresql://hosted/never-use\n", { mode });
  try { await callback(f, file); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function fake(f, options = {}) {
  const calls = [], events = [], containers = new Map();
  containers.set(`${project}-postgres`, { Config: { Labels: labelsFor(f.config) }, State: { Status: "running", Health: { Status: options.badDatabase ? "unhealthy" : "healthy" } }, HostConfig: { NetworkMode: project, PortBindings: {} }, NetworkSettings: { Networks: { [project]: { IPAddress: "172.18.0.2" } } } });
  if (options.existing) containers.set(probeContainer, metadata(f, options.existing));
  if (options.drift) containers.get(probeContainer).HostConfig.RestartPolicy.Name = "unless-stopped";
  const result = (stdout = "", status = 0, stderr = "") => ({ status, stdout, stderr });
  const spawn = (command, input, config) => {
    if (command === "ip") { assert.match(config.env.PATH, /\/usr\/sbin/); return result(JSON.stringify(options.collidingRoute ? [{ dst: "172.21.0.0/16", dev: "other" }] : [])); }
    assert.equal(command, "docker");
    if (input[0] === "context") return result(options.remoteDocker ? "ssh://unrelated-host" : "unix:///var/run/docker.sock");
    const args = input.slice(2); calls.push({ args, env: config.env }); events.push(args[0]);
    if (args[1] === "inspect") {
      const name = args.at(-1);
      if (args[0] === "network") return result(JSON.stringify({ Name: project, Labels: labelsFor(f.config), Internal: true, Driver: "bridge", IPAM: { Config: [{ Subnet: "172.18.0.0/16" }] } }));
      if (args[0] === "image") return result(JSON.stringify({ Id: imageId, Config: { User: options.badImage ? "root" : "node", WorkingDir: "/app", Cmd: f.definition.command, Labels: { [probeImageLabel]: "true" } } }));
      return containers.has(name) ? result(JSON.stringify(containers.get(name))) : result("", 1, `Error: No such container: ${name}`);
    }
    if (args[0] === "network" && args[1] === "ls") return result("a".repeat(12));
    if (args[0] === "run") return result("", options.failAudit ? 1 : 0, "secret-bearing diagnostic must stay suppressed");
    if (args[0] === "create") {
      for (const [key, value] of Object.entries(f.definition.env)) assert.equal(config.env[key], value);
      assert.equal(config.env.GITHUB_CLIENT_SECRET, undefined); assert.equal(config.env.TINYBIRD_QUERY_TOKEN, undefined);
      containers.set(probeContainer, metadata(f, "created", false)); return result("c".repeat(64));
    }
    if (args[0] === "start") { containers.get(probeContainer).State.Status = "running"; containers.get(probeContainer).State.Pid = 1001; containers.get(probeContainer).NetworkSettings.Networks[net.probeNetwork].IPAddress = net.probeAddress; return result(); }
    if (args[0] === "exec") { assert.match(args.at(-1), /outray-probe-activate/); containers.get(probeContainer).State.Health.Status = options.failReady ? "unhealthy" : "healthy"; events.push("activate"); return result(); }
    if (args[0] === "stop") { assert.equal(args.at(-1), "c".repeat(64)); containers.get(probeContainer).State.Status = "exited"; return result(); }
    if (args[0] === "rm") { assert.equal(args.at(-1), "c".repeat(64)); containers.delete(probeContainer); return result(); }
    assert.fail(`Unexpected Docker command: ${args[0]}`);
  };
  const network = { ...net,
    ensureProbeNetwork: () => { events.push("ensure-network"); },
    installProbeHostPolicy: ({ postgresIp }) => { assert.equal(postgresIp, "172.18.0.2"); events.push("host-policy"); },
    installProbeNamespace: ({ pid }) => { assert.equal(pid, 1001); events.push("namespace-policy"); },
    verifyProbeNamespace: ({ pid }) => { assert.equal(pid, 1001); events.push("verify"); if (options.failNetwork) throw new Error("network verification failed"); },
    verifyProbeHostPolicy: () => { events.push("verify-host"); if (options.failHostPolicy) throw new Error("host policy verification failed"); },
    verifyProbeConnectivity: () => { events.push("live-connectivity"); if (options.failConnectivity) throw new Error("live connectivity verification failed"); },
  };
  return { spawn, network, calls, events, containers };
}

test("only private fresh config, exact image and explicit recovery/supervision flags are accepted", () => {
  assert.equal(probeArguments(["--file", "private.env", "--image", imageName, "--recover", "--supervise"]).recover, true);
  for (const args of [[], ["--file", ".env.prod", "--image", imageName], ["--file", "private.env", "--image", "unsafe;x"], ["--file", "private.env", "--image", imageName, "--enable-email"], ["--file", "private.env", "--image", imageName, "--recover", "--recover"]]) assert.throws(() => probeArguments(args));
});
test("probe environment contains only fresh database/keyring and flags, never unrelated credentials", () => {
  const f = fixture(), env = f.definition.env;
  assert.match(env.DATABASE_URL, /@172\.18\.0\.2:5432/); assert.equal(env.UPTIME_PROBES_ENABLED, "true"); assert.equal(env.UPTIME_NOTIFICATIONS_ENABLED, "false");
  assert.equal(env.OUTRAY_PRODUCTS, "uptime"); assert.equal(env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY, f.config.OUTRAY_SECRETS_ACTIVE_MASTER_KEY);
  for (const value of [{ ...env, ZEPTO_API_KEY: "never" }, { ...env, TINYBIRD_QUERY_TOKEN: "never" }, { ...env, GITHUB_CLIENT_SECRET: "never" }, { ...env, UPTIME_NOTIFICATIONS_ENABLED: "true" }, { ...env, DATABASE_URL: "postgresql://other" }]) assert.throws(() => assertProbeEnvironment(value, f.definition));
  for (const ip of ["127.0.0.1", "8.8.8.8", "172.18.300.2", "172.18.0.2;bad"]) assert.throws(() => probeDefinition(f.config, ip));
});
test("container starts gated, with no automatic restart/ports/capabilities and only secret names in arguments", () => {
  const f = fixture(), args = probeContainerArguments(f.definition, imageName, probeLabels(f.config, imageId, f.definition), net);
  assert.equal(args[0], "create"); assert.equal(args[args.indexOf("--restart") + 1], "no"); assert.equal(args[args.indexOf("--network") + 1], net.probeNetwork);
  assert.equal(args[args.indexOf("--ip") + 1], net.probeAddress); assert.equal(args[args.indexOf("--dns") + 1], "1.1.1.1");
  assert.ok(args.includes("--read-only")); assert.equal(args[args.indexOf("--cap-drop") + 1], "ALL"); assert.deepEqual(args.slice(-2), ["node", "probe-boot.mjs"]);
  for (const forbidden of ["--publish", "-p", "--privileged", "--env-file", "--mount", "--volumes-from", "--cap-add"]) assert.ok(!args.includes(forbidden));
  for (const secret of [f.config.POSTGRES_PASSWORD, f.config.OUTRAY_SECRETS_ACTIVE_MASTER_KEY]) assert.ok(!args.join(" ").includes(secret));
});
test("exact ownership guard rejects restart, privilege, namespace, environment, mounts and image drift", () => {
  const f = fixture(), m = metadata(f), labels = probeLabels(f.config, imageId, f.definition);
  assert.equal(safeProbeContainer(m, imageId, labels, f.definition, net), true);
  assert.equal(safeProbeContainer(metadata(f, "created"), imageId, labels, f.definition, net), true);
  const exited = metadata(f, "exited"); exited.NetworkSettings.Networks[net.probeNetwork].IPAddress = "";
  assert.equal(safeProbeContainer(exited, imageId, labels, f.definition, net), true, "Docker releases runtime IP after stop; exact static IPAM survives and recovery recreates before activation");
  const mutations = [
    (x) => x.Image = "other", (x) => x.Config.User = "root", (x) => x.Config.Env.push("ZEPTO_API_KEY=provider"), (x) => x.Config.Cmd = ["node", "apps/uptime-probe/dist/index.js"],
    (x) => x.Config.Labels[probeConfigurationLabel] = "drift", (x) => x.HostConfig.RestartPolicy.Name = "unless-stopped", (x) => x.HostConfig.CapAdd = ["NET_ADMIN"],
    (x) => x.HostConfig.Privileged = true, (x) => x.HostConfig.PortBindings = { "5432/tcp": [] }, (x) => x.HostConfig.Dns = ["8.8.8.8"],
    (x) => x.HostConfig.Memory = 0, (x) => x.HostConfig.Tmpfs["/app"] = "size=16m", (x) => x.NetworkSettings.Networks.other = {},
    (x) => x.NetworkSettings.Networks[net.probeNetwork].IPAddress = "172.21.42.3", (x) => x.Mounts.push({ Type: "bind", Destination: "/private" }),
  ];
  for (const mutate of mutations) { const x = structuredClone(m); mutate(x); assert.equal(safeProbeContainer(x, imageId, labels, f.definition, net), false); }
});
test("audit and firewall verification occur before activation; console/status and config remain untouched", async () => {
  await privateFixture(async (f, file) => {
    const x = fake(f); await runProbe(["--file", file, "--image", imageName], { ...x, delay: async () => {} });
    for (const [before, after] of [["run", "create"], ["host-policy", "start"], ["start", "namespace-policy"], ["namespace-policy", "verify"], ["verify", "live-connectivity"], ["live-connectivity", "activate"]]) assert.ok(x.events.indexOf(before) < x.events.indexOf(after), `${before} before ${after}`);
    const audit = x.calls.find((call) => call.args[0] === "run"); assert.equal(audit.args[audit.args.indexOf("--network") + 1], "none"); assert.equal(audit.env.DATABASE_URL, undefined);
    assert.ok(!x.calls.some((call) => ["update", "stop", "rm"].includes(call.args[0])));
    assert.ok(!x.calls.some((call) => call.args.includes("outray-ops-public-web") || call.args.includes("outray-ops-public-status")));
    assert.match(readFileSync(file, "utf8"), /UPTIME_PROBES_ENABLED=false/);
  });
});
test("unsafe audit/database/image/context/metadata fail before creating or activating any worker", async () => {
  await privateFixture(async (f, file) => {
    for (const options of [{ failAudit: true }, { badDatabase: true }, { badImage: true }, { remoteDocker: true }, { existing: "running", drift: true }, { collidingRoute: true }]) {
      const x = fake(f, options); await assert.rejects(runProbe(["--file", file, "--image", imageName], { ...x, delay: async () => {} }));
      assert.ok(!x.calls.some((call) => ["create", "start", "exec", "stop", "rm"].includes(call.args[0])));
    }
  });
});
test("network verification failure stops only exact inert owned worker and never activates", async () => {
  await privateFixture(async (f, file) => {
    const x = fake(f, { failNetwork: true }); await assert.rejects(runProbe(["--file", file, "--image", imageName], { ...x, delay: async () => {} }), /network verification/);
    assert.ok(!x.events.includes("activate")); assert.equal(x.containers.get(probeContainer).State.Status, "exited"); assert.equal(x.calls.filter((call) => call.args[0] === "stop").length, 1);
  });
});
test("real connectivity gate is mandatory before activation and rejects rule-only success", async () => {
  await privateFixture(async (f, file) => {
    const x = fake(f, { failConnectivity: true }); await assert.rejects(runProbe(["--file", file, "--image", imageName], { ...x, delay: async () => {} }), /live connectivity/);
    assert.ok(x.events.includes("verify")); assert.ok(!x.events.includes("activate")); assert.equal(x.containers.get(probeContainer).State.Status, "exited");
  });
});
test("existing healthy worker is validated but not restarted or rewritten", async () => {
  await privateFixture(async (f, file) => {
    const x = fake(f, { existing: "running" }); await runProbe(["--file", file, "--image", imageName], { ...x, delay: async () => {} });
    assert.ok(x.events.includes("verify")); assert.ok(!x.calls.some((call) => ["create", "start", "exec", "rm", "stop"].includes(call.args[0])));
  });
});
test("existing healthy worker with firewall drift is stopped before any reuse", async () => {
  await privateFixture(async (f, file) => {
    const x = fake(f, { existing: "running", failHostPolicy: true }); await assert.rejects(runProbe(["--file", file, "--image", imageName], { ...x, delay: async () => {} }), /host policy/);
    assert.equal(x.containers.get(probeContainer).State.Status, "exited"); assert.ok(!x.events.includes("activate"));
  });
});
test("termination during readiness stops the exact activated owned worker", async () => {
  await privateFixture(async (f, file) => {
    const x = fake(f, { failReady: true });
    await assert.rejects(runProbe(["--file", file, "--image", imageName, "--supervise"], { ...x, delay: async () => { process.emit("SIGTERM"); } }), /interrupted/);
    assert.ok(x.events.includes("activate")); assert.equal(x.containers.get(probeContainer).State.Status, "exited"); assert.equal(x.calls.filter((call) => call.args[0] === "stop").length, 1);
  });
});
test("host routes, Docker IPAM and existing bridge collisions are rejected before networking", () => {
  const labels = { managed: "true" }, base = { networks: [], routes: [], interfaces: [], network: net, labels };
  assert.doesNotThrow(() => assertProbeNetworkCollisions(base));
  for (const change of [
    { networks: [{ Name: "other", IPAM: { Config: [{ Subnet: "172.21.0.0/16" }] } }] },
    { routes: [{ dst: "172.16.0.0/12", dev: "vpn" }] }, { interfaces: [{ ifname: net.probeBridge }] },
    { networks: [{ Name: net.probeNetwork, Labels: { managed: "false" } }] },
    { networks: [{ Name: "other", Options: { "com.docker.network.bridge.name": net.probeBridge } }] },
  ]) assert.throws(() => assertProbeNetworkCollisions({ ...base, ...change }));
  assert.doesNotThrow(() => assertProbeNetworkCollisions({ ...base, routes: [{ dst: "default" }, { dst: "172.18.0.0/16" }], networks: [{ Name: net.probeNetwork, Labels: labels }], interfaces: [{ ifname: net.probeBridge }] }));
});
test("recovery explicitly recreates only exact owned worker so stale activation marker cannot survive", async () => {
  await privateFixture(async (f, file) => {
    const no = fake(f, { existing: "exited" }); await assert.rejects(runProbe(["--file", file, "--image", imageName], { ...no, delay: async () => {} }), /--recover/); assert.ok(!no.events.includes("rm"));
    const yes = fake(f, { existing: "exited" }); await runProbe(["--file", file, "--image", imageName, "--recover"], { ...yes, delay: async () => {} });
    assert.ok(yes.events.indexOf("rm") < yes.events.indexOf("create")); assert.ok(yes.events.indexOf("verify") < yes.events.indexOf("activate"));
  });
});
test("startup requires mode0600 and failed readiness stops active worker without restart policy", async () => {
  await privateFixture(async (_f, file) => { await assert.rejects(runProbe(["--file", file, "--image", imageName]), /mode0600/); }, 0o644);
  await privateFixture(async (f, file) => {
    const x = fake(f, { failReady: true }); await assert.rejects(runProbe(["--file", file, "--image", imageName], { ...x, delay: async () => {} }), /readiness/);
    assert.equal(x.containers.get(probeContainer).State.Status, "exited"); assert.equal(x.containers.get(probeContainer).HostConfig.RestartPolicy.Name, "no");
  });
});
test("image and boot packaging contain only probe output and wait for explicit activation", () => {
  const dockerfile = readFileSync(new URL("../deploy/self-hosted/Dockerfile.probe-preview", import.meta.url), "utf8"), boot = readFileSync(new URL("../deploy/self-hosted/probe-boot.mjs", import.meta.url), "utf8"), service = readFileSync(new URL("../deploy/self-hosted/outray-ops-uptime-probe.service", import.meta.url), "utf8");
  assert.match(dockerfile, /ARG PROBE_DEPENDENCY_IMAGE/); assert.match(dockerfile, /self-hosted-artifacts\.mjs verify/); assert.ok(!dockerfile.includes("npm ci"));
  assert.match(dockerfile, /USER node/); assert.match(dockerfile, /probe-node_modules/); assert.match(probeRuntimeAudit, /file\.sha256/);
  assert.ok(boot.indexOf("while (!stopped)") < boot.indexOf("child = spawn")); assert.match(boot, /readFileSync\(marker, "utf8"\) === activation/); assert.match(boot, /Worker ready/);
  assert.match(service, /--recover --supervise/); assert.match(service, /Restart=on-failure/); assert.ok(!service.includes("EnvironmentFile"));
  assert.match(service, /ExecStart=\/usr\/local\/bin\/node scripts\/self-hosted-probe\.mjs/);
  assert.ok(!service.includes("ExecStart=/usr/bin/node"));
});
