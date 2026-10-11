import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupExpiredTelemetryReceipts,
  createTelemetryReceiptCleanup,
  TELEMETRY_RECEIPT_CLEANUP_BATCH_SIZE,
  TELEMETRY_RECEIPT_CLEANUP_INTERVAL_MS,
  TELEMETRY_RECEIPT_RETENTION_DAYS,
} from "../src/lib/telemetry-receipts";

const now = new Date("2026-10-10T08:00:00.000Z");
const cutoff = new Date(now.getTime() - 120 * 24 * 60 * 60_000);

type Receipt = { organizationId: string; receiptKey: string; createdAt: Date; locked?: boolean };

// This injected SQL model never imports the configured PostgreSQL pool or cron entrypoint.
function databaseModel(receipts: Receipt[]) {
  const monthlyUsage = new Map([["organization-a:2026-06", 5_000]]);
  let calls = 0;
  return {
    monthlyUsage,
    get calls() { return calls; },
    async query(sql: string, parameters: Array<Date | number>) {
      calls++;
      assert.match(sql, /FROM organization_telemetry_receipts/);
      assert.match(sql, /WHERE created_at < \$1/);
      assert.match(sql, /ORDER BY created_at ASC/);
      assert.match(sql, /LIMIT \$2\s+FOR UPDATE SKIP LOCKED/);
      assert.match(sql, /receipt\.organization_id = expired\.organization_id/);
      assert.match(sql, /receipt\.receipt_key = expired\.receipt_key/);
      assert.doesNotMatch(sql, /organization_monthly_usage|TRUNCATE/i);
      const [expiry, limit] = parameters;
      assert.ok(expiry instanceof Date);
      assert.equal(limit, 1_000);
      const expired = receipts
        .filter((row) => row.createdAt < expiry && !row.locked)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .slice(0, limit as number);
      for (const row of expired) receipts.splice(receipts.indexOf(row), 1);
      return { rowCount: expired.length };
    },
  };
}

test("receipt cleanup uses a strict 120-day cutoff and leaves monthly counters intact", async () => {
  assert.equal(TELEMETRY_RECEIPT_RETENTION_DAYS, 120);
  assert.equal(TELEMETRY_RECEIPT_CLEANUP_INTERVAL_MS, 60_000);
  const receipts: Receipt[] = [
    { organizationId: "organization-a", receiptKey: "same-key", createdAt: new Date(cutoff.getTime() - 1) },
    { organizationId: "organization-b", receiptKey: "same-key", createdAt: now },
    { organizationId: "organization-a", receiptKey: "boundary", createdAt: cutoff },
    { organizationId: "organization-a", receiptKey: "newer", createdAt: new Date(cutoff.getTime() + 1) },
  ];
  const database = databaseModel(receipts);
  const before = Array.from(database.monthlyUsage.entries());
  assert.equal(await cleanupExpiredTelemetryReceipts(database, now), 1);
  assert.deepEqual(receipts.map((row) => `${row.organizationId}:${row.receiptKey}`), [
    "organization-b:same-key", "organization-a:boundary", "organization-a:newer",
  ]);
  assert.deepEqual(Array.from(database.monthlyUsage.entries()), before);
});

test("each cleanup performs only one bounded batch, oldest first", async () => {
  const receipts = Array.from({ length: 1_005 }, (_, index) => ({
    organizationId: "organization-a", receiptKey: String(index),
    createdAt: new Date(cutoff.getTime() - 1_005 + index),
  }));
  const database = databaseModel(receipts);
  assert.equal(await cleanupExpiredTelemetryReceipts(database, now), TELEMETRY_RECEIPT_CLEANUP_BATCH_SIZE);
  assert.equal(database.calls, 1);
  assert.deepEqual(receipts.map((row) => row.receiptKey), ["1000", "1001", "1002", "1003", "1004"]);
  assert.equal(await cleanupExpiredTelemetryReceipts(database, now), 5);
  assert.equal(database.calls, 2);
});

test("rows held by another cleanup remain available for a later run", async () => {
  const receipts: Receipt[] = [
    { organizationId: "organization-a", receiptKey: "locked", createdAt: new Date(cutoff.getTime() - 2), locked: true },
    { organizationId: "organization-a", receiptKey: "available", createdAt: new Date(cutoff.getTime() - 1) },
  ];
  const database = databaseModel(receipts);
  assert.equal(await cleanupExpiredTelemetryReceipts(database, now), 1);
  assert.equal(receipts[0].receiptKey, "locked");
  receipts[0].locked = false;
  assert.equal(await cleanupExpiredTelemetryReceipts(database, now), 1);
});

test("cleanup handles nullable row counts as an empty batch", async () => {
  assert.equal(await cleanupExpiredTelemetryReceipts({ query: async () => ({ rowCount: null }) }, now), 0);
});

test("polling skips overlap and shutdown waits for the active batch and stops new runs", async () => {
  let finish!: (result: { rowCount: number }) => void;
  let calls = 0;
  const messages: string[] = [];
  const cleanup = createTelemetryReceiptCleanup({
    async query() {
      calls++;
      return new Promise<{ rowCount: number }>((resolve) => { finish = resolve; });
    },
  }, { log: (message: string) => messages.push(message), error: () => assert.fail("unexpected cleanup error") }, () => now);
  const first = cleanup.run();
  await cleanup.run();
  assert.equal(calls, 1);
  let stopped = false;
  const shutdown = cleanup.shutdown().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  finish({ rowCount: 7 });
  await Promise.all([first, shutdown]);
  assert.equal(stopped, true);
  assert.match(messages[0], /Removed 7.*120-day retention/);
  await cleanup.run();
  assert.equal(calls, 1);
});

test("cleanup failure is logged without disabling later polls", async () => {
  const failure = new Error("database unavailable");
  let calls = 0;
  const errors: unknown[][] = [];
  const cleanup = createTelemetryReceiptCleanup({
    async query() {
      if (++calls === 1) throw failure;
      return { rowCount: 0 };
    },
  }, { log: () => assert.fail("empty cleanup should not log a deletion"), error: (...args: unknown[]) => errors.push(args) }, () => now);
  await cleanup.run();
  assert.deepEqual(errors, [["[Telemetry] Failed to clean up deduplication receipts", failure]]);
  await cleanup.run();
  assert.equal(calls, 2);
  await cleanup.shutdown();
});
