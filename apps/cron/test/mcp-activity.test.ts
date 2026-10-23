import assert from "node:assert/strict";
import test from "node:test";
import { cleanupMcpActivity, createMcpActivityCleanup } from "../../../shared/mcp-activity";

test("MCP retention deletes bounded expired activity and revoked connections only", async () => {
  const calls: Array<{ sql: string; values: Array<Date | number> }> = [];
  await cleanupMcpActivity({ async query(sql, values) { calls.push({ sql, values }); return { rowCount: 0 }; } }, new Date("2026-10-22T12:00:00Z"));
  assert.equal(calls.length, 2);
  assert.equal((calls[0].values[0] as Date).toISOString(), "2026-07-24T12:00:00.000Z");
  assert.match(calls[0].sql, /created_at < \$1/); assert.match(calls[1].sql, /revoked_at < \$1/);
  for (const call of calls) { assert.match(call.sql, /SKIP LOCKED/); assert.match(call.sql, /LIMIT \$2/); }
});

test("cleanup coalesces overlapping runs and shutdown waits for work", async () => {
  let queries = 0;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const worker = createMcpActivityCleanup({ async query() { queries++; if (queries === 1) await wait; return { rowCount: 0 }; } });
  const a = worker.run(); const b = worker.run(); assert.equal(a, b);
  const stopped = worker.shutdown(); release(); await stopped;
  await worker.run(); assert.equal(queries, 2);
});
