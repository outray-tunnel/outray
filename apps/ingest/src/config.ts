function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const config = {
  port: positiveInteger(process.env.INGEST_PORT, 4318),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  tinybirdApiHost: required("TINYBIRD_API_HOST").replace(/\/$/, ""),
  tinybirdIngestToken: required("TINYBIRD_INGEST_TOKEN"),
  maxPayloadBytes: positiveInteger(
    process.env.OTLP_MAX_PAYLOAD_BYTES,
    8 * 1024 * 1024,
  ),
  maxRecordsPerRequest: positiveInteger(
    process.env.OTLP_MAX_RECORDS_PER_REQUEST,
    10_000,
  ),
  rateLimitPerMinute: positiveInteger(
    process.env.OTLP_RATE_LIMIT_PER_MINUTE,
    600,
  ),
};
