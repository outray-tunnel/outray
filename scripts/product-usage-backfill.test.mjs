import assert from "node:assert/strict";
import test from "node:test";
import { backfillOptions, historicalTrafficSql, runBackfill } from "./product-usage-backfill.mjs";

test("backfill defaults to dry run and requires an explicit target and production apply guard", () => {
  assert.throws(() => backfillOptions([]), /Explicit/);
  assert.equal(backfillOptions(["--target=development"]).apply, false);
  assert.equal(backfillOptions(["--target=development", "--apply"]).apply, true);
  assert.throws(() => backfillOptions(["--target=production", "--apply"]), /separate approval/);
  assert.throws(() => backfillOptions(["--target=development", "--invent"]).apply, /Unknown/);
});

test("historical queries deduplicate, use closed UTC days and never infer tunnel sessions", () => {
  for (const kind of ["http", "protocol", "spans", "logs", "metric_points", "status"]) {
    const query = historicalTrafficSql(kind, "org'quoted", "2026-10-22T12:00:00Z");
    assert.match(query, /FINAL/);
    assert.match(query, /toDate\('2026-10-22'\)/);
    assert.match(query, /org''quoted/);
    assert.doesNotMatch(query, /tunnels\.opens\./);
  }
  assert.match(historicalTrafficSql("status", "org", "2026-10-22"), /GROUP BY page_id,event_id/);
  assert.match(historicalTrafficSql("spans", "org", "2026-10-22"), /'unknown'/);
});

function fixture() {
  const calls = [], imported = new Set();
  const checkpoint = { status: "pending", cutoff_at: new Date(), updated_at: new Date(), cursor: "" };
  const pool = {
    async connect() { return { query: pool.query, release() {} }; },
    async query(sql, values = []) {
      calls.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("FROM organizations WHERE")) return { rows: [{ id: "org", slug: "acme" }] };
      if (sql.includes("FROM product_usage_backfill_checkpoints")) return { rows: [values[1] === "secrets" ? { ...checkpoint } : { status: "complete" }] };
      if (sql.includes("SELECT collection_started_at")) return { rows: [{ collection_started_at: new Date() }] };
      if (sql.startsWith("SELECT id,created_at::text")) return { rows: values[2] < "row-2" ? [{ id: "row-2", at: "2026-10-20T12:00:00Z", deltas: { "secrets.added": "2" } }] : [] };
      if (sql.includes("FROM jsonb_to_recordset")) for (const row of JSON.parse(values[2])) {
        assert.equal(imported.has(row.id), false, "a resumed job must not import a completed page"); imported.add(row.id);
      }
      if (sql.includes("SET cursor=$4,processed=processed+$5")) checkpoint.cursor = values[3];
      if (sql.includes("SET status='complete'")) checkpoint.status = "complete";
      if (!/^(BEGIN|SET LOCAL|COMMIT|ROLLBACK|UPDATE|SELECT pg_advisory_unlock|SELECT record_product_usage)/.test(sql)) throw new Error(`Unexpected SQL: ${sql}`);
      return { rows: [] };
    },
  };
  return { pool, calls, imported, checkpoint };
}

test("dry run performs no imports or checkpoint mutations", async () => {
  const h = fixture();
  await runBackfill(backfillOptions(["--target=development", "--organization=acme"]), { pool: h.pool, log() {}, tinybird() { assert.fail("completed sources must be skipped"); } });
  assert.equal(h.imported.size, 0);
  assert.equal(h.checkpoint.cursor, "");
  assert.ok(h.calls.every(sql => !/^(INSERT|UPDATE|DELETE|BEGIN|SELECT record_product_usage)/.test(sql)));
});

test("apply checkpoints atomically and completed checkpoints make repeated jobs no-ops", async () => {
  const h = fixture();
  const options = backfillOptions(["--target=development", "--organization=acme", "--apply"]);
  await runBackfill(options, { pool: h.pool, log() {} });
  assert.deepEqual([...h.imported], ["row-2"]);
  assert.equal(h.checkpoint.cursor, "row-2");
  assert.equal(h.checkpoint.status, "complete");
  assert.ok(h.calls.includes("SET LOCAL TIME ZONE 'UTC'"));
  const before = h.calls.filter(sql => sql.includes("FROM jsonb_to_recordset")).length;
  await runBackfill(options, { pool: h.pool, log() {} });
  assert.equal(h.calls.filter(sql => sql.includes("FROM jsonb_to_recordset")).length, before);
});
