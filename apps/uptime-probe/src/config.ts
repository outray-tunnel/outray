import "dotenv/config";

export const config = {
  enabled: process.env.UPTIME_ENABLED !== "false" && process.env.OUTRAY_UPTIME_DISABLED !== "true",
  probesEnabled: process.env.UPTIME_PROBES_ENABLED === "true",
  notificationsEnabled: process.env.UPTIME_NOTIFICATIONS_ENABLED === "true",
  production: process.env.NODE_ENV === "production",
  egressPolicyReady: process.env.UPTIME_EGRESS_POLICY_READY === "true",
  databaseUrl: process.env.DATABASE_URL ?? "",
  sslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
  batchSize: boundedInt("UPTIME_PROBE_BATCH_SIZE", 10, 1, 100),
  concurrency: boundedInt("UPTIME_PROBE_CONCURRENCY", 5, 1, 20),
  pollIntervalMs: boundedInt("UPTIME_PROBE_POLL_MS", 5_000, 1_000, 30_000),
  retentionIntervalMs: 60 * 60_000,
  dashboardUrl: process.env.OUTRAY_DASHBOARD_URL ?? process.env.UPTIME_DASHBOARD_URL ?? "",
  statusPublicUrl: process.env.OUTRAY_STATUS_URL ?? process.env.STATUS_PUBLIC_URL ?? "",
  unsubscribeSecret: process.env.UPTIME_UNSUBSCRIBE_SECRET ?? "",
  zeptoApiKey: process.env.ZEPTO_API_KEY ?? "",
};

function boundedInt(name: string, fallback: number, min: number, max: number) {
  const candidate = Number(process.env[name]);
  return Number.isInteger(candidate) ? Math.min(max, Math.max(min, candidate)) : fallback;
}
