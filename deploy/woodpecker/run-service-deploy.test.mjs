import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./run-service-deploy.mjs", import.meta.url),
  "utf8",
).replace(/^import[^\n]+\n/gm, "");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runHelper = new AsyncFunction(
  "execFileSync", "spawnSync", "existsSync", "readFileSync", "statSync", "process", "fetch",
  "URLSearchParams", "AbortSignal", "console", source,
);

const managedSecrets = {
  REDIS_URL: "redis://synthetic-redis",
  TINYBIRD_INGEST_TOKEN: "synthetic-ingest-token",
  DATABASE_URL: "postgres://synthetic-database",
  INTERNAL_API_SECRET: "synthetic-internal-secret",
  TINYBIRD_API_HOST: "https://synthetic-tinybird.test",
  TINYBIRD_QUERY_TOKEN: "synthetic-query-token",
  STATUS_EDGE_SECRET: "synthetic-status-secret",
  UPTIME_RATE_LIMIT_SECRET: "synthetic-rate-limit-secret",
  UPTIME_UNSUBSCRIBE_SECRET: "synthetic-unsubscribe-secret",
  ZEPTO_API_KEY: "synthetic-email-key",
  OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID: "synthetic-master-key-id",
  OUTRAY_SECRETS_ACTIVE_MASTER_KEY: "synthetic-master-key",
  OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS: "synthetic-previous-keys",
};

async function run(service, { check = false, secrets = managedSecrets, nodeVersion = "22.23.3", statusTls, statusCa, hostCa = false, writableCa = false } = {}) {
  const spawnCalls = [];
  const logs = [];
  const exit = {};
  let exitCode;
  const current = {
    status: "online",
    DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
    ...managedSecrets,
    OUTRAY_DASHBOARD_URL: "https://outray.co",
    WEB_API_URL: "https://outray.co/api",
    OUTRAY_STATUS_URL: "https://status.outray.app",
    APP_URL: "https://synthetic-app.test",
    UPTIME_ENABLED: "false",
    UPTIME_PROBES_ENABLED: "false",
    UPTIME_NOTIFICATIONS_ENABLED: "false",
    UPTIME_EGRESS_POLICY_READY: "false",
  };
  const process = {
    versions: { node: nodeVersion },
    argv: ["node", "run-service-deploy.mjs", "--service", service,
      "--token-stdin", ...(check ? ["--check"] : [])],
    // An inherited shell API URL must not override the public production host.
    env: { WEB_API_URL: "https://outray.co/api", UNRELATED_SETTING: "keep-me" },
    stdin: (async function* () { yield "synthetic-ops-token"; })(),
    exit(code) { exitCode = code; throw exit; },
  };

  try {
    await runHelper(
      (command, args) => {
        assert.equal(command, "pm2");
        assert.deepEqual(args, ["jlist"]);
        return JSON.stringify([
          { name: "outray-blue", pm2_env: current },
          ...(statusTls || statusCa ? [{ name: "outray-status", pm2_env: { DATABASE_SSL_REJECT_UNAUTHORIZED: statusTls, NODE_EXTRA_CA_CERTS: statusCa } }] : []),
        ]);
      },
      (...args) => { spawnCalls.push(args); return { status: 0 }; },
      (path) => { assert.equal(path, "/etc/ssl/outray/brimble-ca.pem"); return hostCa; },
      () => { throw new Error("Must not read real credential files"); },
      (path) => {
        assert.equal(path, "/etc/ssl/outray/brimble-ca.pem");
        return { isFile: () => true, uid: 0, mode: writableCa ? 0o100666 : 0o100644 };
      },
      process,
      async (url, options) => {
        assert.equal(new URL(url).origin, "https://ops.outray.dev");
        assert.equal(new URL(url).searchParams.get("organization"), "outray");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { confirmProduction: true });
        assert.equal(options.headers.Authorization, "Bearer synthetic-ops-token");
        return {
          ok: true,
          json: async () => ({
            secrets: Object.entries(secrets).map(([key, value]) => ({ key, value })),
          }),
        };
      },
      URLSearchParams,
      AbortSignal,
      { log: (message) => logs.push(message), error: (message) => logs.push(message) },
    );
  } catch (error) {
    if (error !== exit) throw error;
  }

  return { spawnCalls, exitCode, logs, current };
}

test("unsupported VPS Node versions fail before reading credentials or deploying", async () => {
  const { spawnCalls, exitCode, logs } = await run("status", { nodeVersion: "20.20.2" });
  assert.equal(exitCode, 1);
  assert.equal(spawnCalls.length, 0);
  assert.match(logs.join("\n"), /Node\.js >=22\.19\.0/);
});

test("Status retains its deployed TLS policy rather than the tunnel's setting", async () => {
  const { exitCode, spawnCalls } = await run("status", { statusTls: "false" });
  assert.equal(exitCode, 0);
  assert.equal(spawnCalls[0][2].env.DATABASE_SSL_REJECT_UNAUTHORIZED, "false");
});

test("Status retains its deployed extra CA path", async () => {
  const { exitCode, spawnCalls } = await run("status", { statusTls: "true", statusCa: "/etc/ssl/outray/service-ca.pem" });
  assert.equal(exitCode, 0);
  assert.equal(spawnCalls[0][2].env.NODE_EXTRA_CA_CERTS, "/etc/ssl/outray/service-ca.pem");
});

test("all service deploys use the root-owned VPS database CA when installed", async () => {
  for (const service of ["edge", "status", "uptime-probe"]) {
    const { exitCode, spawnCalls } = await run(service, { hostCa: true });
    assert.equal(exitCode, 0);
    assert.equal(spawnCalls[0][2].env.NODE_EXTRA_CA_CERTS, "/etc/ssl/outray/brimble-ca.pem");
  }
});

test("a group or world-writable VPS database CA blocks deployment", async () => {
  const { exitCode, spawnCalls } = await run("status", { hostCa: true, writableCa: true });
  assert.equal(exitCode, 1);
  assert.equal(spawnCalls.length, 0);
});

test("an explicit Ops TLS policy overrides the deployed service setting", async () => {
  const { exitCode, spawnCalls } = await run("status", {
    statusTls: "false", secrets: { ...managedSecrets, DATABASE_SSL_REJECT_UNAUTHORIZED: "true" },
  });
  assert.equal(exitCode, 0);
  assert.equal(spawnCalls[0][2].env.DATABASE_SSL_REJECT_UNAUTHORIZED, "true");
});

test("invalid Ops TLS policy is rejected", async () => {
  const { exitCode, spawnCalls } = await run("status", {
    secrets: { ...managedSecrets, DATABASE_SSL_REJECT_UNAUTHORIZED: "invalid" },
  });
  assert.equal(exitCode, 1);
  assert.equal(spawnCalls.length, 0);
});

for (const service of ["edge", "status", "uptime-probe"]) {
  test(`${service} uses the public dashboard and API instead of stale PM2 origins`, async () => {
    const { spawnCalls, exitCode, logs, current } = await run(service);
    assert.equal(exitCode, 0);
    assert.equal(spawnCalls.length, 1);
    const [command, args, options] = spawnCalls[0];
    assert.equal(command, "/bin/bash");
    const script = service === "edge" ? "deploy.sh" : `deploy-${service}.sh`;
    assert.deepEqual(args, [`/root/outray/${script}`]);
    assert.equal(options.env.OUTRAY_DASHBOARD_URL, "https://outray.dev");
    assert.equal(options.env.WEB_API_URL, "https://outray.dev/api");
    assert.equal(options.env.OUTRAY_STATUS_URL, current.OUTRAY_STATUS_URL);
    assert.equal(options.env.APP_URL, current.APP_URL);
    assert.equal(options.env.UNRELATED_SETTING, "keep-me");
    assert.equal(options.env.DEPLOY_CRON, "false");
    assert.equal(options.env.TIMESCALE_URL, undefined);
    for (const [name, value] of Object.entries(managedSecrets)) {
      assert.equal(options.env[name], value, `${name} must remain unchanged`);
      assert.ok(!logs.some((message) => message.includes(value)));
    }
    for (const name of ["UPTIME_ENABLED", "UPTIME_PROBES_ENABLED",
      "UPTIME_NOTIFICATIONS_ENABLED", "UPTIME_EGRESS_POLICY_READY"]) {
      assert.equal(options.env[name], current[name]);
    }
  });
}

test("check mode validates runtime without running deployment scripts", async () => {
  for (const service of ["edge", "status", "uptime-probe"]) {
    const { spawnCalls, exitCode, logs } = await run(service, { check: true });
    assert.equal(exitCode, 0);
    assert.deepEqual(spawnCalls, []);
    assert.ok(logs.some((message) => message.includes(`${service} runtime verified`)));
  }
});

test("missing managed credentials still prevent every deployment", async () => {
  const secrets = { ...managedSecrets };
  delete secrets.DATABASE_URL;
  for (const service of ["edge", "status", "uptime-probe"]) {
    const { spawnCalls, exitCode, logs } = await run(service, { secrets });
    assert.equal(exitCode, 1);
    assert.deepEqual(spawnCalls, []);
    assert.ok(logs.some((message) => message.includes("missing required secrets: DATABASE_URL")));
  }
});

test("standard OutRay SDK credentials pass through without being logged", async () => {
  const telemetrySecrets = {
    ...managedSecrets,
    OUTRAY_API_KEY: "synthetic-observability-token",
    OUTRAY_OTLP_ENDPOINT: "https://ingest.ops.example.test",
  };
  const { spawnCalls, logs, exitCode } = await run("edge", { secrets: telemetrySecrets });
  assert.equal(exitCode, 0);
  assert.equal(spawnCalls[0][2].env.OUTRAY_API_KEY, telemetrySecrets.OUTRAY_API_KEY);
  assert.equal(spawnCalls[0][2].env.OUTRAY_OTLP_ENDPOINT, telemetrySecrets.OUTRAY_OTLP_ENDPOINT);
  assert.ok(logs.every((message) => !message.includes(telemetrySecrets.OUTRAY_API_KEY)));
});

test("a partial OutRay SDK configuration blocks deployment", async () => {
  const secrets = { ...managedSecrets, OUTRAY_API_KEY: "synthetic-observability-token" };
  const { spawnCalls, logs, exitCode } = await run("edge", { secrets });
  assert.equal(exitCode, 1);
  assert.deepEqual(spawnCalls, []);
  assert.ok(logs.some((message) => message.includes("credentials must be configured together")));
});
