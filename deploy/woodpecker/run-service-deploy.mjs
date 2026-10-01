import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

// Preserve the active process settings, then override the service credentials
// from Unbe. None of these values are sent to Woodpecker or printed.
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
  "TIMESCALE_URL",
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
];

const managedSecrets = [
  "REDIS_URL",
  "TIMESCALE_URL",
  "DATABASE_URL",
  "INTERNAL_API_SECRET",
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

async function readUnbeToken() {
  if (process.argv.includes("--token-stdin")) {
    let token = "";
    for await (const chunk of process.stdin) {
      token += chunk;
      if (token.length > 256) throw new Error("Unbe token input is too large.");
    }
    if (!token.trim()) throw new Error("Unbe token input is empty.");
    return token.trim();
  }

  // Root-only fallback for manual edge deployments outside Woodpecker.
  const tokenPath = "/etc/outray/unbe-token";
  const tokenFile = statSync(tokenPath);
  if (tokenFile.uid !== 0 || (tokenFile.mode & 0o077) !== 0) {
    throw new Error("Unbe token must be root-owned and readable only by root.");
  }

  const token = readFileSync(tokenPath, "utf8").trim();
  if (!token) throw new Error("Unbe token is empty.");
  return token;
}

async function readUnbeSecrets() {
  const token = await readUnbeToken();

  const target = new URLSearchParams({
    workspace: "outray",
    project: "outray",
    environment: "production",
  });
  const response = await fetch(`https://unbe.dev/api/cli/secrets?${target}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Unbe returned HTTP ${response.status}.`);
  }

  const result = await response.json();
  const secrets = Object.fromEntries(
    result.secrets.map(({ key, value }) => [key, value]),
  );
  const missing = managedSecrets.filter(
    (name) => typeof secrets[name] !== "string" || !secrets[name],
  );
  if (missing.length > 0) {
    throw new Error(`Unbe is missing required secrets: ${missing.join(", ")}`);
  }

  const configuredFlags = uptimeFlags.filter((name) => Object.hasOwn(secrets, name));
  if (configuredFlags.length > 0 && configuredFlags.length !== uptimeFlags.length) {
    const missingFlags = uptimeFlags.filter((name) => !Object.hasOwn(secrets, name));
    throw new Error(`Unbe Uptime flags must be configured together; missing: ${missingFlags.join(", ")}`);
  }
  for (const name of configuredFlags) {
    if (secrets[name] !== "true" && secrets[name] !== "false") {
      throw new Error(`Unbe ${name} must be exactly true or false.`);
    }
  }

  console.log(configuredFlags.length > 0
    ? "Uptime feature flags loaded from Unbe."
    : "Uptime feature flags not in Unbe; retaining active tunnel settings.");
  return Object.fromEntries(
    [...managedSecrets, ...configuredFlags].map((name) => [name, secrets[name]]),
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

try {
  Object.assign(runtime, await readUnbeSecrets());
} catch (error) {
  console.error(`Cannot load production secrets from Unbe: ${error.message}`);
  process.exit(1);
}

// Uptime notification links must use the production dashboard origin, not an
// older value inherited from the edge process during deployment.
if (service === "uptime-probe") {
  runtime.OUTRAY_DASHBOARD_URL = "https://outray.co";
}

// Cron runs separately on Aeroplane. Do not start a second evaluator here.
runtime.DEPLOY_CRON = "false";
// Brimble owns database migrations; service deploys must not run them.
runtime.DEPLOY_TIMESCALE_MIGRATIONS = "false";

const required = [
  "REDIS_URL",
  "TIMESCALE_URL",
  "DATABASE_URL",
  "INTERNAL_API_SECRET",
  "OUTRAY_DASHBOARD_URL",
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
  console.log(`${service} runtime verified from ${tunnel.name} and Unbe; cron deployment disabled.`);
  process.exit(0);
}

const result = spawnSync("/bin/bash", [scripts[service]], {
  cwd: "/root/outray",
  env: { ...process.env, ...runtime },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
