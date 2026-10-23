import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type pg from "pg";
import usagePolicy from "../../../shared/telemetry-usage.js";
import productUsage from "../../../shared/product-usage.js";
const { recordProductUsage } = productUsage;
import type { IngestAuthContext } from "./auth.js";

const { TELEMETRY_USAGE_METRIC, telemetryUsagePeriod } = usagePolicy;

export type TelemetrySignal = "traces" | "logs" | "metrics";
export type UsageDatabase = Pick<pg.PoolClient, "query">;
type NormalizedRecord = { organization_id: string };

export class TelemetryQuotaExceeded extends Error {
  readonly status = 429;
  constructor(readonly resetsAt: string) {
    super("Monthly telemetry allowance exceeded");
    this.name = "TelemetryQuotaExceeded";
  }
}

interface AdmissionChunk<T> {
  records: T[];
  key: string;
  bytes: number;
}

/** Stable ordering makes JSON/protobuf retries and attribute key order equivalent. */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function receiptRecord(record: NormalizedRecord) {
  const {
    ingested_at: _receivedAt,
    retention_days: _retention,
    ...stable
  } = record as NormalizedRecord & {
    ingested_at?: string;
    retention_days?: number;
  };
  return stableValue(stable);
}

/** A chunk fits one Queue send, or one oversized-row R2 reference, in either runtime. */
export function telemetryAdmissionChunks<T extends NormalizedRecord>(
  signal: TelemetrySignal,
  records: readonly T[],
): AdmissionChunk<T>[] {
  const chunks: AdmissionChunk<T>[] = [];
  let rows: T[] = [];
  let bytes = 0;
  let stableBytes = 0;
  const flush = () => {
    if (!rows.length) return;
    chunks.push({
      records: rows,
      bytes,
      key: createHash("sha256")
        .update(JSON.stringify([signal, rows.map(receiptRecord)]))
        .digest("hex"),
    });
    rows = [];
    bytes = 0;
    stableBytes = 0;
  };
  for (const record of records) {
    const size = Buffer.byteLength(JSON.stringify(record), "utf8");
    const stableSize = Buffer.byteLength(
      JSON.stringify(receiptRecord(record)),
      "utf8",
    );
    // Volatile retention metadata must not change retry batch boundaries.
    if (
      rows.length &&
      (rows.length >= 250 || stableBytes + stableSize > 100_000)
    )
      flush();
    rows.push(record);
    bytes += size;
    stableBytes += stableSize;
    if (stableSize > 100_000) flush();
  }
  flush();
  return chunks;
}

/**
 * Admission is shared across Node and Workers through the authentication database.
 * The caller supplies an exclusive connection, never a pool query method: holding
 * the counter row lock through confirmed queue storage bounds concurrent exports.
 * Receipts contain only hashes/byte counts, never captured payloads or credentials.
 * Consumers and derived HTTP analytics never call this helper, so redelivery is free.
 */
export async function enqueueWithTelemetryQuota<T extends NormalizedRecord>(
  database: UsageDatabase,
  auth: IngestAuthContext,
  signal: TelemetrySignal,
  records: readonly T[],
  enqueue: (records: T[]) => Promise<void>,
  now: Date = new Date(),
): Promise<void> {
  if (records.length === 0) return;
  const limit = auth.telemetryBytesPerMonth;
  if (
    (limit !== -1 && (!Number.isSafeInteger(limit) || limit < 1)) ||
    records.some((record) => record.organization_id !== auth.organizationId)
  ) {
    throw new Error("Invalid telemetry quota context");
  }
  const period = telemetryUsagePeriod(now);
  const chunks = telemetryAdmissionChunks(signal, records);
  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    // Receipts survive month boundaries. Serialize only this organization's
    // telemetry admissions, including concurrent retries across a UTC reset.
    await database.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('telemetry:' || $1::text, 0))",
      [auth.organizationId],
    );
    await database.query(
      `INSERT INTO organization_monthly_usage (organization_id, month, metric, used, updated_at)
       VALUES ($1, $2::date, $3, 0, NOW())
       ON CONFLICT (organization_id, month, metric) DO NOTHING`,
      [auth.organizationId, period.month, TELEMETRY_USAGE_METRIC],
    );
    const counter = await database.query<{ used: string | number }>(
      `SELECT used FROM organization_monthly_usage
       WHERE organization_id = $1 AND month = $2::date AND metric = $3 FOR UPDATE`,
      [auth.organizationId, period.month, TELEMETRY_USAGE_METRIC],
    );
    if (!counter.rows.length)
      throw new Error("Telemetry usage counter unavailable");
    const used = Number(counter.rows[0].used);
    if (!Number.isSafeInteger(used) || used < 0)
      throw new Error("Invalid telemetry usage counter");
    const receipts = await database.query<{ receipt_key: string }>(
      `SELECT receipt_key FROM organization_telemetry_receipts
       WHERE organization_id = $1 AND receipt_key = ANY($2::text[]) AND status = 'accepted'`,
      [auth.organizationId, chunks.map((chunk) => chunk.key)],
    );
    const acceptedKeys = new Set(
      receipts.rows.map((receipt) => receipt.receipt_key),
    );
    // Repeated identical chunks within an export are telemetry duplicates too.
    const pending = chunks.filter((chunk) => {
      if (acceptedKeys.has(chunk.key)) return false;
      acceptedKeys.add(chunk.key);
      return true;
    });
    const requestedBytes = pending.reduce(
      (total, chunk) => total + chunk.bytes,
      0,
    );
    if (!Number.isSafeInteger(used + requestedBytes))
      throw new Error("Telemetry usage overflow");
    if (limit !== -1 && requestedBytes > Math.max(0, limit - used)) {
      throw new TelemetryQuotaExceeded(period.resetsAt);
    }
    if (requestedBytes === 0) {
      await database.query("COMMIT");
      transactionOpen = false;
      return;
    }
    const reserved = await database.query(
      `UPDATE organization_monthly_usage SET used = used + $4::bigint, updated_at = NOW()
       WHERE organization_id = $1 AND month = $2::date AND metric = $3
         AND ($5::bigint = -1 OR used + $4::bigint <= $5::bigint) RETURNING used`,
      [
        auth.organizationId,
        period.month,
        TELEMETRY_USAGE_METRIC,
        requestedBytes,
        limit,
      ],
    );
    if (!reserved.rows.length)
      throw new TelemetryQuotaExceeded(period.resetsAt);
    const accepted: AdmissionChunk<T>[] = [];
    let queueFailure: unknown;
    let queueFailed = false;
    for (const chunk of pending) {
      try {
        await enqueue(chunk.records);
        accepted.push(chunk);
      } catch (error) {
        queueFailed = true;
        queueFailure = error;
        break;
      }
    }
    const acceptedBytes = accepted.reduce(
      (total, chunk) => total + chunk.bytes,
      0,
    );
    if (acceptedBytes !== requestedBytes) {
      await database.query(
        `UPDATE organization_monthly_usage SET used = used - $4::bigint, updated_at = NOW()
         WHERE organization_id = $1 AND month = $2::date AND metric = $3 RETURNING used`,
        [
          auth.organizationId,
          period.month,
          TELEMETRY_USAGE_METRIC,
          requestedBytes - acceptedBytes,
        ],
      );
    }
    if (accepted.length) {
      await database.query(
        `INSERT INTO organization_telemetry_receipts
           (organization_id, receipt_key, month, bytes, status, created_at, updated_at)
         SELECT $1, receipt_key, $2::date, bytes, 'accepted', NOW(), NOW()
         FROM unnest($3::text[], $4::bigint[]) AS receipt(receipt_key, bytes)`,
        [
          auth.organizationId,
          period.month,
          accepted.map((chunk) => chunk.key),
          accepted.map((chunk) => chunk.bytes),
        ],
      );
      // Account only admitted chunks, in the same transaction as their receipts.
      // Queue consumers never record these counters, so redelivery is free.
      for (const chunk of accepted) {
        const metric = signal === "traces" ? "observability.spans" : signal === "logs" ? "observability.logs" : "observability.metric_points";
        await recordProductUsage(database, {
          organizationId: auth.organizationId, source: "telemetry", id: chunk.key,
          timestamp: now.toISOString(),
          deltas: { "observability.telemetry_bytes": chunk.bytes, [metric]: chunk.records.length },
        });
      }
    }
    await database.query("COMMIT");
    transactionOpen = false;
    if (queueFailed) throw queueFailure;
  } catch (error) {
    if (transactionOpen) await database.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
