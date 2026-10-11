export const TELEMETRY_RECEIPT_RETENTION_DAYS = 120;
export const TELEMETRY_RECEIPT_CLEANUP_BATCH_SIZE = 1_000;
export const TELEMETRY_RECEIPT_CLEANUP_INTERVAL_MS = 60_000;

interface ReceiptDatabase {
  query(sql: string, parameters: Array<Date | number>): Promise<{ rowCount: number | null }>;
}

/**
 * Expire deduplication receipts, never the monthly billing/usage counters.
 * A single indexed batch bounds each run; other cron instances skip locked rows.
 */
export async function cleanupExpiredTelemetryReceipts(
  database: ReceiptDatabase,
  now = new Date(),
) {
  const cutoff = new Date(
    now.getTime() - TELEMETRY_RECEIPT_RETENTION_DAYS * 24 * 60 * 60_000,
  );
  const result = await database.query(
    `WITH expired AS (
       SELECT organization_id, receipt_key
       FROM organization_telemetry_receipts
       WHERE created_at < $1
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     DELETE FROM organization_telemetry_receipts AS receipt
     USING expired
     WHERE receipt.organization_id = expired.organization_id
       AND receipt.receipt_key = expired.receipt_key`,
    [cutoff, TELEMETRY_RECEIPT_CLEANUP_BATCH_SIZE],
  );
  return result.rowCount ?? 0;
}

/** The caller owns the timer, matching cron's existing shutdown lifecycle. */
export function createTelemetryReceiptCleanup(
  database: ReceiptDatabase,
  logger: Pick<Console, "log" | "error"> = console,
  clock: () => Date = () => new Date(),
) {
  let activeRun: Promise<void> | null = null;
  let stopped = false;

  function run() {
    if (stopped || activeRun) return Promise.resolve();
    activeRun = (async () => {
      try {
        const removed = await cleanupExpiredTelemetryReceipts(database, clock());
        if (removed) {
          logger.log(
            `[Telemetry] Removed ${removed} deduplication receipts beyond ${TELEMETRY_RECEIPT_RETENTION_DAYS}-day retention`,
          );
        }
      } catch (error) {
        logger.error("[Telemetry] Failed to clean up deduplication receipts", error);
      }
    })().finally(() => { activeRun = null; });
    return activeRun;
  }

  async function shutdown() {
    stopped = true;
    await activeRun;
  }

  return { run, shutdown };
}
