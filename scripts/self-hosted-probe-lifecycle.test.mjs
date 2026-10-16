import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { assertStandardProbe, probeComposeEnvironment, probePolicyConfiguration, standardProbeActivation, standardProbeMarkerCode, standardProbeOptions, standardProbeUnitText } from "./self-hosted-probe-lifecycle.mjs";
import { createProbePolicy } from "./self-hosted-probe-policy.mjs";

const config = {
  OUTRAY_DEPLOYMENT_MODE: "self-hosted", OUTRAY_APP_HOST: "console.example.com", OUTRAY_STATUS_HOST: "status.example.com",
  UPTIME_PROBES_ENABLED: "true", UPTIME_NOTIFICATIONS_ENABLED: "false", UPTIME_EGRESS_POLICY_READY: "true",
  POSTGRES_USER: "outray", POSTGRES_PASSWORD: "a".repeat(64), POSTGRES_DB: "outray",
  OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID: "v1", OUTRAY_SECRETS_ACTIVE_MASTER_KEY: "test-key", OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS: "{}",
  ZEPTO_API_KEY: "private-provider-key", ZEPTO_FROM_EMAIL: "alerts@example.com", STATUS_EDGE_SECRET: "private-edge-key",
};
const postgresIp = "172.30.42.2";
const policy = createProbePolicy(probePolicyConfiguration(config, postgresIp, [], []));

function metadata() {
  const environment = {
    NODE_ENV: "production", HOST: "0.0.0.0", PATH: "/usr/bin", OUTRAY_DEPLOYMENT_MODE: "self-hosted", OUTRAY_PRODUCTS: "uptime",
    UPTIME_ENABLED: "true", UPTIME_PROBES_ENABLED: "true", UPTIME_NOTIFICATIONS_ENABLED: "false", UPTIME_EGRESS_POLICY_READY: "true",
    OUTRAY_PROBE_ACTIVATION_ID: standardProbeActivation, OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID: "v1", OUTRAY_SECRETS_ACTIVE_MASTER_KEY: "test-key",
    OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS: "{}", DATABASE_URL: `postgresql://outray:${config.POSTGRES_PASSWORD}@${postgresIp}:5432/outray?sslmode=disable`,
    OUTRAY_DASHBOARD_URL: "https://console.example.com", STATUS_PUBLIC_URL: "https://status.example.com", OUTRAY_STATUS_URL: "https://status.example.com",
    ZEPTO_API_KEY: "", ZEPTO_FROM_EMAIL: "", ZEPTO_FROM_NAME: "", STATUS_EDGE_SECRET: "", UPTIME_RATE_LIMIT_SECRET: "", UPTIME_UNSUBSCRIBE_SECRET: "",
  };
  return {
    Id: "a".repeat(64), Image: `sha256:${"b".repeat(64)}`, State: { Status: "running", Running: true, Pid: 222, OOMKilled: false },
    Config: { User: "node", WorkingDir: "/app", Cmd: ["node", "/app/probe-boot.mjs"], Entrypoint: [], Labels: { "com.docker.compose.project": "outray-self-hosted", "com.docker.compose.service": "uptime-probe" }, Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`) },
    HostConfig: { ReadonlyRootfs: true, Privileged: false, PublishAllPorts: false, PortBindings: {}, RestartPolicy: { Name: "no" }, Init: true, CapDrop: ["ALL"], CapAdd: [], SecurityOpt: ["no-new-privileges:true"], Tmpfs: { "/tmp": "size=16m" }, NetworkMode: "outray-self-hosted_probe", Dns: ["1.1.1.1"], Memory: 268435456, MemorySwap: 268435456, PidsLimit: 64 },
    Mounts: [{ Type: "tmpfs", Destination: "/tmp" }], NetworkSettings: { Networks: { "outray-self-hosted_probe": { IPAMConfig: { IPv4Address: "172.30.41.2" }, IPAddress: "172.30.41.2" } } },
  };
}

test("probe lifecycle options remain generic and reject unknown flags", () => {
  assert.deepEqual(standardProbeOptions(["supervise", "--file", "/opt/outray/config/instance.env"], "/opt/outray/source"), { command: "supervise", root: "/opt/outray/source", envFile: "/opt/outray/config/instance.env" });
  assert.throws(() => standardProbeOptions(["--image", "unverified-image"]));
  assert.throws(() => standardProbeOptions(["--file", "one", "--file", "two"]));
  assert.equal(standardProbeOptions(["--endpoint", "unix:///run/docker.sock"]).endpoint, "unix:///run/docker.sock");
  assert.throws(() => standardProbeOptions(["--endpoint", "tcp://remote.example.com:2375"]));
  assert.throws(() => standardProbeOptions(["--endpoint", "unix:///run/docker.sock%inject"]));
});

test("notification credentials are stripped unless delivery is enabled", () => {
  const disabled = probeComposeEnvironment(config, postgresIp);
  assert.equal(disabled.OUTRAY_PROBE_DATABASE_HOST, postgresIp);
  assert.equal(disabled.OUTRAY_PROBE_NOTIFY_ZEPTO_API_KEY, "");
  assert.equal(disabled.OUTRAY_PROBE_NOTIFY_STATUS_EDGE_SECRET, "");
  const enabled = probeComposeEnvironment({ ...config, UPTIME_NOTIFICATIONS_ENABLED: "true" }, postgresIp);
  assert.equal(enabled.OUTRAY_PROBE_NOTIFY_ZEPTO_API_KEY, config.ZEPTO_API_KEY);
  assert.equal(enabled.OUTRAY_PROBE_NOTIFY_ZEPTO_FROM_NAME, "OutRay");
  assert.throws(() => probeComposeEnvironment(config, "postgres"));
});

test("all host addresses and nondefault routes enter the denial policy", () => {
  const result = probePolicyConfiguration({ ...config, OUTRAY_PROBE_BLOCKED_CIDRS: "198.18.0.0/15" }, postgresIp,
    [{ addr_info: [{ family: "inet", local: "209.74.86.89" }, { family: "inet6", local: "::1" }] }],
    [{ dst: "default" }, { dst: "209.74.86.0/24" }, { dst: "172.30.42.2" }, { type: "broadcast", dst: "209.74.86.255" }, { type: "local", dst: "209.74.86.89" }]);
  assert.deepEqual(result.blockedHostAddresses, ["172.30.42.2/32", "198.18.0.0/15", "209.74.86.0/24", "209.74.86.89"]);
  assert.doesNotThrow(() => createProbePolicy(result));
});

test("only inert isolated standard service metadata passes", () => {
  assert.doesNotThrow(() => assertStandardProbe(metadata(), config, policy, postgresIp));
  for (const change of [
    (value) => { value.HostConfig.RestartPolicy.Name = "unless-stopped"; },
    (value) => { value.HostConfig.Memory = 0; },
    (value) => { value.Config.Entrypoint = ["docker-entrypoint.sh"]; },
    (value) => { value.Config.Cmd = ["node", "apps/uptime-probe/dist/index.js"]; },
    (value) => { value.Config.Env.push("GITHUB_CLIENT_SECRET=not-allowed"); },
    (value) => { value.Config.Env = value.Config.Env.map((entry) => entry.startsWith("ZEPTO_API_KEY=") ? "ZEPTO_API_KEY=must-not-leak" : entry); },
    (value) => { value.NetworkSettings.Networks.extra = {}; },
  ]) { const value = metadata(); change(value); assert.throws(() => assertStandardProbe(value, config, policy, postgresIp)); }
});

test("unit uses generic service and rejects systemd path injection", () => {
  const content = standardProbeUnitText({ root: "/opt/outray/source", envFile: "/opt/outray/config/instance.env", node: "/usr/local/bin/node", endpoint: "unix:///run/pinned-docker.sock" });
  assert.match(content, /outray.*self-hosted.*probe/i);
  assert.match(content, /supervise --root \/opt\/outray\/source --file \/opt\/outray\/config\/instance.env/);
  assert.match(content, /Restart=on-failure/);
  assert.match(content, /ProtectHome=read-only/);
  assert.match(content, /--endpoint unix:\/\/\/run\/pinned-docker.sock/);
  assert.doesNotMatch(content, /outray-ops|ops\.outray/);
  assert.throws(() => standardProbeUnitText({ root: "/opt/unsafe %n", endpoint: "unix:///run/docker.sock" }));
  assert.throws(() => standardProbeUnitText({ root: "/opt/outray/source", endpoint: "unix:///run/docker.sock\nEnvironment=INJECT" }));
});

test("marker writer cannot arm a replacement unverified namespace", () => {
  const writes = [];
  const events = [];
  const context = (namespace) => ({ require: (name) => name === "node:crypto" ? { randomUUID: () => "test-uuid" } : ({ readlinkSync: () => namespace, writeFileSync: (...args) => { writes.push(args); events.push("write"); }, linkSync: (source, target) => { assert.equal(source, "/tmp/outray-probe-activate-test-uuid"); assert.equal(target, "/tmp/outray-probe-activate"); events.push("publish"); }, unlinkSync: () => events.push("unlink") }), process: { env: { OUTRAY_PROBE_ACTIVATION_ID: standardProbeActivation }, exit: () => { throw new Error("namespace refused"); } } });
  const code = standardProbeMarkerCode("net:[123]");
  assert.throws(() => runInNewContext(code, context("net:[999]")), /namespace refused/);
  assert.equal(writes.length, 0);
  runInNewContext(code, context("net:[123]"));
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0][1]), { activation: standardProbeActivation, namespace: "net:[123]" });
  assert.equal(writes[0][2].flag, "wx");
  assert.deepEqual(events, ["write", "publish", "unlink"]);
  assert.throws(() => standardProbeMarkerCode("/proc/unsafe"));
});
