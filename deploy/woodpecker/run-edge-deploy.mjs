import { execFileSync, spawnSync } from "node:child_process";

// The edge already has its production runtime values in the active PM2 process.
// Read only the values deploy.sh needs; never print or send them to CI.
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

// Cron runs separately on Aeroplane. Do not start a second evaluator here.
runtime.DEPLOY_CRON = "false";

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
  console.error(`Missing edge runtime variables: ${missing.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--check")) {
  console.log(`Edge runtime verified from ${tunnel.name}; cron deployment disabled.`);
  process.exit(0);
}

const result = spawnSync("/bin/bash", ["/root/outray/deploy.sh"], {
  cwd: "/root/outray",
  env: { ...process.env, ...runtime },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
