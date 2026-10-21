import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 19)) {
  console.error("The VPS requires Node.js >=22.19.0 before deploying built services.");
  process.exit(1);
}

// Preserve the active process settings, then override the service credentials
// from our standard self-hosted OutRay Secrets API. Values are never printed.
const serviceIndex = process.argv.indexOf("--service");
const service = serviceIndex < 0 ? undefined : process.argv[serviceIndex + 1];
const scripts = {
  edge: "/root/outray/deploy.sh",
  status: "/root/outray/deploy-status.sh",
  "uptime-probe": "/root/outray/deploy-uptime-probe.sh",
};
if (!Object.hasOwn(scripts, service)) {
  console.error("Specify --service edge, status, or uptime-probe.");
  process.exit(1);
}
const names = [
  "REDIS_URL",
  "REDIS_TUNNEL_TTL_SECONDS",
  "REDIS_HEARTBEAT_INTERVAL_MS",
  "TINYBIRD_INGEST_TOKEN",
  "DATABASE_URL",
  "DATABASE_SSL_REJECT_UNAUTHORIZED",
  "INTERNAL_API_SECRET",
  "PAYSTACK_SECRET_KEY",
  "TINYBIRD_API_HOST",
  "TINYBIRD_QUERY_TOKEN",
  "ZEPTO_API_KEY",
  "APP_URL",
  "ALERT_POLL_INTERVAL_MS",
  "ALERT_BATCH_SIZE",
  "ALERT_EVALUATION_CONCURRENCY",
  "ALERT_LEASE_SECONDS",
  "ALERT_LATE_DATA_SECONDS",
  "ALERT_EVALUATION_RETENTION_DAYS",
  "UPTIME_ENABLED",
  "UPTIME_PROBES_ENABLED",
  "UPTIME_NOTIFICATIONS_ENABLED",
  "UPTIME_EGRESS_POLICY_READY",
  "OUTRAY_DASHBOARD_URL",
  "OUTRAY_STATUS_URL",
  "STATUS_EDGE_SECRET",
  "UPTIME_RATE_LIMIT_SECRET",
  "UPTIME_UNSUBSCRIBE_SECRET",
  "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID",
  "OUTRAY_SECRETS_ACTIVE_MASTER_KEY",
  "OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS",
  "OUTRAY_API_KEY",
  "OUTRAY_OTLP_ENDPOINT",
];

const managedSecrets = [
  "REDIS_URL",
  "TINYBIRD_INGEST_TOKEN",
  "DATABASE_URL",
  "INTERNAL_API_SECRET",
  "TINYBIRD_API_HOST",
  "TINYBIRD_QUERY_TOKEN",
  "STATUS_EDGE_SECRET",
  "UPTIME_RATE_LIMIT_SECRET",
  "UPTIME_UNSUBSCRIBE_SECRET",
  "ZEPTO_API_KEY",
  "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID",
  "OUTRAY_SECRETS_ACTIVE_MASTER_KEY",
  "OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS",
];

const uptimeFlags = [
  "UPTIME_ENABLED",
  "UPTIME_PROBES_ENABLED",
  "UPTIME_NOTIFICATIONS_ENABLED",
  "UPTIME_EGRESS_POLICY_READY",
];

const optionalTelemetrySecrets = [
  "OUTRAY_API_KEY",
  "OUTRAY_OTLP_ENDPOINT",
];

async function readOutRayToken() {
  if (process.argv.includes("--token-stdin")) {
    let token = "";
    for await (const chunk of process.stdin) {
      token += chunk;
      if (token.length > 2048) throw new Error("OutRay token input is too large.");
    }
    if (!token.trim()) throw new Error("OutRay token input is empty.");
    return token.trim();
  }

  // Root-only fallback for manual edge deployments outside Woodpecker.
  const tokenPath = "/etc/outray/ops-secrets-token";
  const tokenFile = statSync(tokenPath);
  if (tokenFile.uid !== 0 || (tokenFile.mode & 0o077) !== 0) {
    throw new Error("OutRay token must be root-owned and readable only by root.");
  }

  const token = readFileSync(tokenPath, "utf8").trim();
  if (!token) throw new Error("OutRay token is empty.");
  return token;
}

async function readOutRaySecrets() {
  const token = await readOutRayToken();

  const target = new URLSearchParams({
    organization: "outray",
    project: "outray",
    environment: "production",
  });
  const response = await fetch(`https://ops.outray.dev/api/cli/secrets?${target}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmProduction: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`OutRay Secrets returned HTTP ${response.status}.`);
  }

  const result = await response.json();
  if (!Array.isArray(result.secrets) || result.secrets.some(
    (entry) => typeof entry?.key !== "string" || typeof entry?.value !== "string",
  )) {
    throw new Error("OutRay Secrets returned an invalid response.");
  }
  const secrets = Object.fromEntries(
    result.secrets.map(({ key, value }) => [key, value]),
  );
  const missing = managedSecrets.filter(
    (name) => typeof secrets[name] !== "string" || !secrets[name],
  );
  if (missing.length > 0) {
    throw new Error(`OutRay is missing required secrets: ${missing.join(", ")}`);
  }

  const configuredFlags = uptimeFlags.filter((name) => Object.hasOwn(secrets, name));
  if (configuredFlags.length > 0 && configuredFlags.length !== uptimeFlags.length) {
    const missingFlags = uptimeFlags.filter((name) => !Object.hasOwn(secrets, name));
    throw new Error(`OutRay Uptime flags must be configured together; missing: ${missingFlags.join(", ")}`);
  }
  for (const name of configuredFlags) {
    if (secrets[name] !== "true" && secrets[name] !== "false") {
      throw new Error(`OutRay ${name} must be exactly true or false.`);
    }
  }

  const configuredTelemetrySecrets = optionalTelemetrySecrets.filter((name) => Object.hasOwn(secrets, name));
  if (configuredTelemetrySecrets.length > 0 && configuredTelemetrySecrets.length !== optionalTelemetrySecrets.length) {
    throw new Error("OutRay SDK credentials must be configured together.");
  }
  const databaseTlsSettings = Object.hasOwn(secrets, "DATABASE_SSL_REJECT_UNAUTHORIZED")
    ? ["DATABASE_SSL_REJECT_UNAUTHORIZED"] : [];
  if (databaseTlsSettings.length && !["true", "false"].includes(secrets.DATABASE_SSL_REJECT_UNAUTHORIZED)) {
    throw new Error("OutRay DATABASE_SSL_REJECT_UNAUTHORIZED must be exactly true or false.");
  }

  console.log(configuredFlags.length > 0
    ? "Uptime feature flags loaded from Ops Secrets."
    : "Uptime feature flags not in Ops Secrets; retaining active tunnel settings.");
  return Object.fromEntries(
    [...managedSecrets, ...configuredFlags, ...configuredTelemetrySecrets, ...databaseTlsSettings].map((name) => [name, secrets[name]]),
  );
}

let processes;
try {
  processes = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8" }));
} catch (error) {
  console.error("Cannot read the edge's active PM2 configuration.");
  process.exit(1);
}

const tunnel = processes.find(
  (process) =>
    ["outray-blue", "outray-green"].includes(process.name) &&
    process.pm2_env?.status === "online",
);
if (!tunnel) {
  console.error("No online OutRay tunnel process; refusing to guess runtime values.");
  process.exit(1);
}

const current = tunnel.pm2_env;
const runtime = Object.fromEntries(
  names
    .filter((name) => typeof current[name] === "string" && current[name].length > 0)
    .map((name) => [name, current[name]]),
);
// Preserve Status's explicitly deployed TLS policy, not an unrelated tunnel
// setting. An explicit value in Ops Secrets still takes precedence below.
if (service === "status") {
  const statusTls = processes.find((process) => process.name === "outray-status")?.pm2_env?.DATABASE_SSL_REJECT_UNAUTHORIZED;
  if (["true", "false"].includes(statusTls)) runtime.DATABASE_SSL_REJECT_UNAUTHORIZED = statusTls;
}

try {
  Object.assign(runtime, await readOutRaySecrets());
} catch (error) {
  console.error(`Cannot load production secrets from Ops: ${error.message}`);
  process.exit(1);
}

// Keep every service on the currently public dashboard. Inheriting an older
// origin can silently send authenticated API calls to another deployment.
// Change this origin explicitly only when the new dashboard is launched.
const dashboardOrigin = "https://outray.dev";
runtime.OUTRAY_DASHBOARD_URL = dashboardOrigin;
runtime.WEB_API_URL = `${dashboardOrigin}/api`;
// The hosted status origin is fixed by deploy.sh, but older PM2 processes did
// not retain OUTRAY_STATUS_URL in their environment. Do not let that prevent
// the next blue/green deploy from recovering the edge.
runtime.OUTRAY_STATUS_URL ||= "https://status.outray.app";

// Cron runs separately on Aeroplane. Do not start a second evaluator here.
runtime.DEPLOY_CRON = "false";
const required = [
  "REDIS_URL",
  "TINYBIRD_API_HOST",
  "TINYBIRD_INGEST_TOKEN",
  "DATABASE_URL",
  "INTERNAL_API_SECRET",
  "OUTRAY_DASHBOARD_URL",
  "WEB_API_URL",
  "OUTRAY_STATUS_URL",
  "STATUS_EDGE_SECRET",
];
if (runtime.UPTIME_ENABLED === "true") {
  required.push("UPTIME_RATE_LIMIT_SECRET", "UPTIME_UNSUBSCRIBE_SECRET", "ZEPTO_API_KEY");
}
const missing = required.filter((name) => !runtime[name]);
if (missing.length > 0) {
  console.error(`Missing ${service} runtime variables: ${missing.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--check")) {
  console.log(`${service} runtime verified from ${tunnel.name} and Ops Secrets; cron deployment disabled.`);
  process.exit(0);
}

const result = spawnSync("/bin/bash", [scripts[service]], {
  cwd: "/root/outray",
  env: { ...process.env, ...runtime },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
