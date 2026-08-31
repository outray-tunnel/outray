import dotenv from "dotenv";

dotenv.config();

export const config = {
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  tigerDataUrl:
    process.env.TIMESCALE_URL || "postgresql://localhost:5432/outray",
  // PostgreSQL for web app (subscriptions)
  databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/outray",
  databaseSslRejectUnauthorized: booleanValue(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    true,
  ),
  // Paystack
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
  tinybirdApiHost: (process.env.TINYBIRD_API_HOST || "").replace(/\/$/, ""),
  tinybirdQueryToken: process.env.TINYBIRD_QUERY_TOKEN || "",
  zeptoApiKey: process.env.ZEPTO_API_KEY || "",
  appUrl: (process.env.APP_URL || "http://localhost:6767").replace(/\/$/, ""),
  alertPollIntervalMs: boundedInteger(
    process.env.ALERT_POLL_INTERVAL_MS,
    15_000,
    5_000,
    60_000,
  ),
  alertBatchSize: boundedInteger(
    process.env.ALERT_BATCH_SIZE,
    25,
    1,
    100,
  ),
  alertEvaluationConcurrency: boundedInteger(
    process.env.ALERT_EVALUATION_CONCURRENCY,
    5,
    1,
    20,
  ),
  alertLeaseSeconds: boundedInteger(
    process.env.ALERT_LEASE_SECONDS,
    120,
    30,
    600,
  ),
  alertLateDataSeconds: boundedInteger(
    process.env.ALERT_LATE_DATA_SECONDS,
    60,
    0,
    300,
  ),
  alertEvaluationRetentionDays: boundedInteger(
    process.env.ALERT_EVALUATION_RETENTION_DAYS,
    30,
    7,
    365,
  ),
};

function booleanValue(value: string | undefined, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}
