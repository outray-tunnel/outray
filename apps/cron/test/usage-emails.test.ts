import assert from "node:assert/strict";
import test from "node:test";
import { HOSTED_PLAN_LIMITS } from "../../../shared/hosted-plan-limits";
import type { enqueueProductEmail } from "../../../shared/product-email-outbox";
import {
  createUsageEmailScanner,
  scanUsageEmailWarnings,
  USAGE_EMAIL_BATCH_SIZE,
  USAGE_EMAIL_SCAN_INTERVAL_MS,
} from "../src/lib/usage-emails";

type Message = Parameters<typeof enqueueProductEmail>[1];
type Organization = { organization_id: string; plan: string | null };
const now = new Date("2026-10-31T23:59:59.999Z");
const hosted = { OUTRAY_DEPLOYMENT_MODE: "hosted" };
const freeLimits = HOSTED_PLAN_LIMITS.free;
const usageKey = (organizationId: string, metric: "bandwidth" | "telemetry", limitBytes: number, threshold: 80 | 100, month = "2026-10") =>
  `${organizationId}:usage:${month}:${metric}:${limitBytes}:${threshold}`;

/** In-memory dependency seams; importing this test never opens configured clients. */
function model(organizations: Organization[]) {
  const bandwidth = new Map<string, string>();
  const telemetry = new Map<string, string | number>();
  const messages = new Map<string, Message>();
  const queries: { sql: string; values: unknown[] }[] = [];
  const mgets: string[][] = [];
  const database = {
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      if (sql.includes("INSERT INTO product_email_outbox")) {
        assert.match(sql, /member\.role IN \('owner', 'admin'\)/);
        assert.match(sql, /email_verified = true/);
        assert.match(sql, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
        const [, organizationId, eventKey, payload] = values as [string, string, string, string];
        const key = `${organizationId}:${eventKey}`;
        if (messages.has(key)) return { rows: [], rowCount: 0 };
        messages.set(key, { organizationId, eventKey, event: JSON.parse(payload) });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM organizations AS organization")) {
        assert.match(sql, /LEFT JOIN subscriptions/);
        assert.match(sql, /organization\.id > \$1/);
        assert.match(sql, /ORDER BY organization\.id ASC\s+LIMIT \$2/);
        // Status/expiry do not affect app entitlement until the stored plan changes.
        assert.doesNotMatch(sql, /status|current_period_end/);
        const [afterId, limit] = values as [string | null, number];
        return { rows: [...organizations]
          .sort((left, right) => left.organization_id.localeCompare(right.organization_id))
          .filter((row) => afterId === null || row.organization_id > afterId)
          .slice(0, limit) };
      }
      assert.match(sql, /FROM organization_monthly_usage/);
      assert.match(sql, /organization_id = ANY\(\$1::text\[\]\)/);
      assert.match(sql, /month = \$2::date/);
      assert.match(sql, /metric = \$3/);
      const [ids, month, metric] = values as [string[], string, string];
      assert.equal(metric, "telemetry_bytes");
      return { rows: ids.flatMap((organization_id) => {
        const used = telemetry.get(`${organization_id}:${month}`);
        return used === undefined ? [] : [{ organization_id, used }];
      }) };
    },
  };
  const redis = {
    async mget(...keys: string[]) {
      assert.ok(keys.length > 0, "never issue an empty MGET");
      mgets.push(keys);
      return keys.map((key) => bandwidth.get(key) ?? null);
    },
  };
  function usageEvent(key: string) {
    const event = messages.get(key)?.event;
    assert.ok(event?.kind === "usage-warning");
    return event;
  };
  const options = { environment: hosted, now };
  return { database, redis, bandwidth, telemetry, messages, queries, mgets, options, usageEvent };
}

test("usage scanner queues 80% and 100% warnings from bounded explicit monthly counters", async () => {
  assert.equal(USAGE_EMAIL_BATCH_SIZE, 200);
  assert.equal(USAGE_EMAIL_SCAN_INTERVAL_MS, 5 * 60_000);
  const store = model(["a", "b", "c", "d"].map((organization_id) => ({ organization_id, plan: null })));
  const eighty = Math.ceil(freeLimits.bandwidthPerMonth * 0.8);
  store.bandwidth.set("bw:a:2026-10", String(eighty - 1));
  store.bandwidth.set("bw:b:2026-10", String(eighty));
  store.bandwidth.set("bw:c:2026-10", String(freeLimits.bandwidthPerMonth));
  store.bandwidth.set("bw:d:2026-10", String(freeLimits.bandwidthPerMonth + 1));
  store.telemetry.set("a:2026-10-01", Math.ceil(freeLimits.telemetryBytesPerMonth * 0.8));
  store.telemetry.set("b:2026-10-01", freeLimits.telemetryBytesPerMonth);
  // Another month's counter is never considered.
  store.telemetry.set("c:2026-09-01", freeLimits.telemetryBytesPerMonth);

  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, { ...store.options, batchSize: 2 }), 5);
  assert.deepEqual(store.mgets, [["bw:a:2026-10", "bw:b:2026-10"], ["bw:c:2026-10", "bw:d:2026-10"]]);
  assert.deepEqual([...store.messages.keys()], [
    usageKey("a", "telemetry", freeLimits.telemetryBytesPerMonth, 80),
    usageKey("b", "bandwidth", freeLimits.bandwidthPerMonth, 80),
    usageKey("b", "telemetry", freeLimits.telemetryBytesPerMonth, 100),
    usageKey("c", "bandwidth", freeLimits.bandwidthPerMonth, 100),
    usageKey("d", "bandwidth", freeLimits.bandwidthPerMonth, 100),
  ]);
  assert.deepEqual(store.messages.get(usageKey("c", "bandwidth", freeLimits.bandwidthPerMonth, 100))?.event, {
    kind: "usage-warning", metric: "bandwidth", threshold: 100,
    usedBytes: freeLimits.bandwidthPerMonth, limitBytes: freeLimits.bandwidthPerMonth,
    resetsAt: "2026-11-01T00:00:00.000Z",
  });
  assert.deepEqual(store.queries.filter(({ sql }) => sql.includes("FROM organizations AS organization")).map(({ values }) => values), [
    [null, 2], ["b", 2], ["d", 2],
  ]);
});

test("outbox keys dedupe repeated scans and allow the next threshold and UTC month", async () => {
  const store = model([{ organization_id: "a", plan: "free" }]);
  store.bandwidth.set("bw:a:2026-10", String(Math.ceil(freeLimits.bandwidthPerMonth * 0.8)));
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 1);
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 0);
  store.bandwidth.set("bw:a:2026-10", String(freeLimits.bandwidthPerMonth));
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 1);
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 0);
  const november = new Date("2026-11-01T00:00:00Z");
  store.bandwidth.set("bw:a:2026-11", String(freeLimits.bandwidthPerMonth));
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, { ...store.options, now: november }), 1);
  assert.deepEqual([...store.messages.keys()], [
    usageKey("a", "bandwidth", freeLimits.bandwidthPerMonth, 80),
    usageKey("a", "bandwidth", freeLimits.bandwidthPerMonth, 100),
    usageKey("a", "bandwidth", freeLimits.bandwidthPerMonth, 100, "2026-11"),
  ]);
  assert.equal(store.usageEvent(usageKey("a", "bandwidth", freeLimits.bandwidthPerMonth, 100, "2026-11")).resetsAt, "2026-12-01T00:00:00.000Z");
});

test("same-month allowance upgrades receive new 80% and 100% warnings after exhausted free quotas", async () => {
  const organization = { organization_id: "a", plan: "free" };
  const store = model([organization]);
  store.bandwidth.set("bw:a:2026-10", String(freeLimits.bandwidthPerMonth));
  store.telemetry.set("a:2026-10-01", freeLimits.telemetryBytesPerMonth);
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 2);

  organization.plan = "ray";
  const paidLimits = HOSTED_PLAN_LIMITS.ray;
  // Existing usage remains well below the newly purchased allowances.
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 0);
  store.bandwidth.set("bw:a:2026-10", String(Math.ceil(paidLimits.bandwidthPerMonth * 0.8)));
  store.telemetry.set("a:2026-10-01", Math.ceil(paidLimits.telemetryBytesPerMonth * 0.8));
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 2);
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 0);
  store.bandwidth.set("bw:a:2026-10", String(paidLimits.bandwidthPerMonth));
  store.telemetry.set("a:2026-10-01", paidLimits.telemetryBytesPerMonth);
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 2);
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 0);
  assert.deepEqual([...store.messages.keys()], [
    usageKey("a", "bandwidth", freeLimits.bandwidthPerMonth, 100),
    usageKey("a", "telemetry", freeLimits.telemetryBytesPerMonth, 100),
    usageKey("a", "bandwidth", paidLimits.bandwidthPerMonth, 80),
    usageKey("a", "telemetry", paidLimits.telemetryBytesPerMonth, 80),
    usageKey("a", "bandwidth", paidLimits.bandwidthPerMonth, 100),
    usageKey("a", "telemetry", paidLimits.telemetryBytesPerMonth, 100),
  ]);
});

test("stored hosted plans match enforcement, unknown plans fall back to free, and internal unlimited is skipped", async () => {
  const store = model([
    { organization_id: "a", plan: "ray" },
    { organization_id: "b", plan: "unknown" },
    { organization_id: "c", plan: "unlimited" },
    { organization_id: "d", plan: null },
  ]);
  for (const id of ["a", "b", "c", "d"]) {
    store.bandwidth.set(`bw:${id}:2026-10`, String(freeLimits.bandwidthPerMonth));
    store.telemetry.set(`${id}:2026-10-01`, freeLimits.telemetryBytesPerMonth);
  }
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 4);
  assert.deepEqual(store.mgets[0], ["bw:a:2026-10", "bw:b:2026-10", "bw:d:2026-10"]);
  assert.ok([...store.messages.values()].every((message) => ["b", "d"].includes(message.organizationId)));
  store.bandwidth.set("bw:a:2026-10", String(HOSTED_PLAN_LIMITS.ray.bandwidthPerMonth));
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 1);
  assert.equal(store.usageEvent(usageKey("a", "bandwidth", HOSTED_PLAN_LIMITS.ray.bandwidthPerMonth, 100)).limitBytes, HOSTED_PLAN_LIMITS.ray.bandwidthPerMonth);
});

test("hosted billing policy and enabled products gate all reads and notifications", async () => {
  const store = model([{ organization_id: "a", plan: "free" }]);
  store.bandwidth.set("bw:a:2026-10", String(freeLimits.bandwidthPerMonth));
  store.telemetry.set("a:2026-10-01", freeLimits.telemetryBytesPerMonth);
  for (const environment of [
    { OUTRAY_DEPLOYMENT_MODE: "self-hosted" },
    { OUTRAY_DEPLOYMENT_MODE: "hosted", OUTRAY_PRODUCTS: "secrets,uptime" },
  ]) {
    assert.equal(await scanUsageEmailWarnings(store.database, store.redis, { ...store.options, environment }), 0);
  }
  assert.equal(store.queries.length, 0);
  assert.equal(store.mgets.length, 0);
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, {
    ...store.options, environment: { ...hosted, OUTRAY_PRODUCTS: "observability" },
  }), 1);
  assert.equal(store.mgets.length, 0);
  store.queries.length = 0;
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, {
    ...store.options, environment: { ...hosted, OUTRAY_PRODUCTS: "tunnels" },
  }), 1);
  assert.ok(store.queries.every(({ sql }) => !sql.includes("organization_monthly_usage")));
});

test("invalid or absent counters cannot create false warnings", async () => {
  const store = model(["a", "b", "c", "d", "e", "f"].map((organization_id) => ({ organization_id, plan: null })));
  for (const [id, invalid] of [["a", "NaN"], ["b", "Infinity"], ["c", "-1"], ["e", "9007199254740992"], ["f", "1717986918.5"]]) {
    store.bandwidth.set(`bw:${id}:2026-10`, invalid);
    store.telemetry.set(`${id}:2026-10-01`, invalid);
  }
  assert.equal(await scanUsageEmailWarnings(store.database, store.redis, store.options), 0);
  assert.equal(store.messages.size, 0);
});

test("invalid dates and unbounded batch sizes fail before querying dependencies", async () => {
  const store = model([]);
  for (const batchSize of [0, 1_001, 1.5, Infinity]) {
    await assert.rejects(scanUsageEmailWarnings(store.database, store.redis, { ...store.options, batchSize }), /batch size/);
  }
  await assert.rejects(scanUsageEmailWarnings(store.database, store.redis, { ...store.options, now: new Date("invalid") }), /Invalid usage time/);
  assert.equal(store.queries.length, 0);
});

test("polling is single-flight, and shutdown waits for the active scan and rejects further runs", async () => {
  const store = model([{ organization_id: "a", plan: null }]);
  let finish!: (value: { rows: Organization[] }) => void;
  let calls = 0;
  const scanner = createUsageEmailScanner({
    async query() {
      calls++;
      return new Promise<{ rows: Organization[] }>((resolve) => { finish = resolve; });
    },
  }, store.redis, {
    environment: hosted, clock: () => now,
    logger: { log: () => assert.fail("empty scan must not log"), error: () => assert.fail("unexpected error") },
  });
  const first = scanner.run();
  await scanner.run();
  assert.equal(calls, 1);
  let stopped = false;
  const shutdown = scanner.shutdown().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  finish({ rows: [] });
  await Promise.all([first, shutdown]);
  assert.equal(stopped, true);
  await scanner.run();
  assert.equal(calls, 1);
});

test("scan failures are logged and a later poll retries", async () => {
  const store = model([{ organization_id: "a", plan: null }]);
  const failure = new Error("Redis unavailable");
  const errors: unknown[][] = [];
  const logs: string[] = [];
  let calls = 0;
  store.bandwidth.set("bw:a:2026-10", String(freeLimits.bandwidthPerMonth));
  const scanner = createUsageEmailScanner(store.database, {
    async mget(...keys: string[]) {
      if (++calls === 1) throw failure;
      return store.redis.mget(...keys);
    },
  }, {
    ...store.options, clock: () => now,
    logger: { error: (...args: unknown[]) => errors.push(args), log: (message: string) => logs.push(message) },
  });
  await scanner.run();
  assert.deepEqual(errors, [["[Usage] Failed to queue usage warning emails", failure]]);
  assert.equal(store.messages.size, 0);
  await scanner.run();
  assert.equal(store.messages.size, 1);
  assert.deepEqual(logs, ["[Usage] Queued 1 usage warning email(s)"]);
  await scanner.shutdown();
});
