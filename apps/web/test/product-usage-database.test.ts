import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";
import { parse } from "dotenv";
import productUsage from "../../../shared/product-usage";
import statusAnalyticsOutbox from "../../../shared/status-analytics-outbox";
import { loadUsageAggregates } from "../src/lib/product-usage-report.server";
const { recordProductUsage } = productUsage;
const { admitStatusAnalytics, deliverStatusAnalyticsOutbox, cleanupProductUsage } = statusAnalyticsOutbox;

test("permanent usage database invariants in an isolated development schema", { skip: process.env.RUN_PRODUCT_USAGE_DATABASE_TESTS !== "1" }, async t => {
  const env = parse(readFileSync(new URL("../../../.env", import.meta.url)));
  let prod: Record<string, string> = {};
  try { prod = parse(readFileSync(new URL("../../../.env.prod", import.meta.url))); } catch { /* No production env is needed. */ }
  const identity = (value: string) => { const url = new URL(value); return `${url.hostname}:${url.port}${url.pathname}`; };
  assert.ok(env.DATABASE_URL, "Development DATABASE_URL is required");
  if (prod.DATABASE_URL) assert.notEqual(identity(env.DATABASE_URL), identity(prod.DATABASE_URL), "Refusing tests against the production database");
  const schema = `usage_test_${randomUUID().replaceAll("-", "")}`;
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5, options: `-c search_path=${schema},public` });
  const admin = await pool.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE organizations(id text PRIMARY KEY);
      CREATE TABLE uptime_status_pages(id text PRIMARY KEY,organization_id text,published boolean);
      CREATE TABLE secret_audit_events(id text PRIMARY KEY,organization_id text,created_at timestamptz,action text,result text,metadata jsonb);
      CREATE TABLE tunnels(id text PRIMARY KEY,organization_id text,created_at timestamp,protocol text);
      CREATE TABLE uptime_checks(id text PRIMARY KEY,organization_id text,checked_at timestamptz,success boolean);
      CREATE TABLE observability_alert_evaluations(id text PRIMARY KEY,organization_id text,evaluated_at timestamptz,status text);
      CREATE TABLE agent_threads(id uuid PRIMARY KEY,organization_id text);
      CREATE TABLE agent_runs(id uuid PRIMARY KEY,thread_id uuid,started_at timestamptz,status text,input_tokens integer,output_tokens integer);`);
    const migration = readFileSync(new URL("../drizzle/0039_permanent_product_usage.sql", import.meta.url), "utf8").replaceAll('"public".', `"${schema}".`);
    await admin.query(migration);
    await admin.query("INSERT INTO organizations VALUES('acme'),('other')");
    // Simulate data already counted by the initial mapper, then migrate it.
    await admin.query("INSERT INTO secret_audit_events VALUES('legacy-share','other',now(),'share.snapshot_revealed','success','{\"count\":2}')");
    for (const name of ["0040_permanent_usage_reconciliation", "0041_permanent_usage_read_reconciliation"]) {
      await admin.query(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
    }
    const at = new Date().toISOString();
    const event = { organizationId: "acme", source: "tunnel-opens", id: "session-1", timestamp: at, deltas: { "tunnels.opens.http": 1 } } as const;
    const value = async (metric: string, platform = false) => String((await admin.query(`SELECT coalesce(sum(value),0)::text AS value FROM ${platform ? "platform_product_usage_daily" : "organization_product_usage_daily"} WHERE metric=$1 ${platform ? "" : "AND organization_id='acme'"}`, [metric])).rows[0].value);
    await t.test("concurrent retry records one session; reconnect is a new session", async () => {
      const result = await Promise.all([recordProductUsage(pool, event), recordProductUsage(pool, event)]);
      assert.equal(result.filter(Boolean).length, 1);
      await recordProductUsage(pool, { ...event, id: "session-2" });
      assert.equal(await value("tunnels.opens.http"), "2");
      await assert.rejects(recordProductUsage(pool, { ...event, deltas: { "tunnels.opens.http": 5 } }), /Conflicting/);
    });
    await t.test("rollback, invalid deltas and stale replays do not change counters", async () => {
      await admin.query("BEGIN");
      await recordProductUsage(admin, { ...event, id: "rolled-back" });
      await admin.query("ROLLBACK");
      assert.equal(await value("tunnels.opens.http"), "2");
      await assert.rejects(recordProductUsage(pool, { ...event, id: "invalid", deltas: { "tunnels.opens.http": -1 } }));
      await assert.rejects(recordProductUsage(pool, { ...event, id: "old", timestamp: "2020-01-01T00:00:00Z" }), /replay window/);
      assert.equal(await value("tunnels.opens.http"), "2");
    });
    await t.test("secrets count creations/imports, read operations and returned values, not moves or metadata", async () => {
      for (const [action, metadata] of [["secret.created", {}], ["secrets.imported", { created: 3, updated: 2 }], ["secrets.bulk_moved", { moved: 5 }], ["secrets.runtime_read", { count: 20 }], ["secret.revealed", {}], ["share.snapshot_revealed", { count: 3 }], ["secrets.listed", {}]] as const) {
        await admin.query("INSERT INTO secret_audit_events VALUES($1,'acme',now(),$2,'success',$3)", [randomUUID(), action, JSON.stringify(metadata)]);
      }
      assert.equal(await value("secrets.added"), "4");
      assert.equal(await value("secrets.read_operations"), "3");
      assert.equal(await value("secrets.values_read"), "24");
      assert.equal(await value("secrets.operations.success"), "7");
      const other = await loadUsageAggregates(pool, { organizationId: "other", product: "secrets", range: "all" });
      assert.equal(other.metrics.find(m => m.key === "secrets.values_read")?.lifetime, "2");
      await admin.query("DELETE FROM secret_audit_events");
      assert.equal(await value("secrets.values_read"), "24");
    });
    await t.test("checks, registrations and evaluations persist after source deletion", async () => {
      await admin.query("INSERT INTO tunnels VALUES('registration','acme',now() AT TIME ZONE 'UTC','tcp'); INSERT INTO uptime_checks VALUES('check','acme',now(),true); INSERT INTO observability_alert_evaluations VALUES('evaluation','acme',now(),'error')");
      await admin.query("DELETE FROM tunnels; DELETE FROM uptime_checks; DELETE FROM observability_alert_evaluations");
      assert.equal(await value("tunnels.registrations.tcp"), "1");
      assert.equal(await value("uptime.checks.success"), "1");
      assert.equal(await value("observability.evaluations.error"), "1");
    });
    await t.test("Agent snapshots count high-water token deltas and the first terminal transition", async () => {
      const thread = randomUUID(), run = randomUUID();
      await admin.query("INSERT INTO agent_threads VALUES($1,'acme')", [thread]);
      await admin.query("INSERT INTO agent_runs VALUES($1,$2,now(),'running',0,0)", [run, thread]);
      for (const tokens of [10, 5, 10, 15]) await admin.query("UPDATE agent_runs SET input_tokens=$2 WHERE id=$1", [run, tokens]);
      await admin.query("UPDATE agent_runs SET status='complete',output_tokens=7 WHERE id=$1", [run]);
      await admin.query("UPDATE agent_runs SET status='complete',output_tokens=7 WHERE id=$1", [run]);
      assert.equal(await value("agent.runs_started"), "1");
      assert.equal(await value("agent.runs.complete"), "1");
      assert.equal(await value("agent.input_tokens"), "15");
      assert.equal(await value("agent.output_tokens"), "7");
    });
    await t.test("status view counts and the outbox commit once, even when Tinybird is unavailable", async () => {
      await admin.query("INSERT INTO uptime_status_pages VALUES('page','acme',true)");
      const view = { organization_id: "acme", page_id: "page", event_id: randomUUID(), timestamp: at.replace("T", " ").replace("Z", ""), visitor_hash: "f".repeat(64), path: "/", referrer: "", country: "", retention_days: 1 };
      assert.equal(await admitStatusAnalytics(pool, view), true);
      assert.equal(await admitStatusAnalytics(pool, view), false);
      await deliverStatusAnalyticsOutbox(pool, { environment: { TINYBIRD_API_HOST: "https://api.example.test", TINYBIRD_INGEST_TOKEN: "fixture" }, fetch: async () => new Response(null, { status: 503 }), logger: { error() {} } });
      assert.equal(await value("uptime.status_views"), "1");
      assert.equal((await admin.query("SELECT count(*)::text AS count FROM status_analytics_outbox")).rows[0].count, "1");
      await admin.query("UPDATE status_analytics_outbox SET next_attempt_at=now()");
      await deliverStatusAnalyticsOutbox(pool, { environment: { TINYBIRD_API_HOST: "https://api.example.test", TINYBIRD_INGEST_TOKEN: "fixture" }, fetch: async () => Response.json({ successful_rows: 1, quarantined_rows: 0 }) });
      assert.equal((await admin.query("SELECT count(*)::text AS count FROM status_analytics_outbox")).rows[0].count, "0");
      assert.equal(await admitStatusAnalytics(pool, view), false);
    });
    await t.test("ambiguous status delivery and expired leases recover with the same event", async () => {
      const view = { organization_id: "acme", page_id: "page", event_id: randomUUID(), timestamp: at.replace("T", " ").replace("Z", ""), visitor_hash: "a".repeat(64), path: "/", referrer: "", country: "", retention_days: 1 };
      await admitStatusAnalytics(pool, view);
      const bodies: string[] = [];
      const options = { environment: { TINYBIRD_API_HOST: "https://api.example.test", TINYBIRD_INGEST_TOKEN: "fixture" }, fetch: async (_url: unknown, init?: RequestInit) => { bodies.push(String(init?.body)); return Response.json({ successful_rows: 1 }); }, logger: { error() {} } };
      let ambiguous = true;
      await deliverStatusAnalyticsOutbox({ async query(sql, values) {
        if (sql.startsWith("DELETE FROM status_analytics_outbox") && ambiguous) { ambiguous = false; throw new Error("lost database acknowledgement"); }
        return pool.query(sql, values);
      } }, options);
      await admin.query("UPDATE status_analytics_outbox SET next_attempt_at=now(),lease_until=now()-interval '1 second',lease_owner='interrupted-worker'");
      await Promise.all([deliverStatusAnalyticsOutbox(pool, options), deliverStatusAnalyticsOutbox(pool, options)]);
      assert.equal(bodies.length, 2);
      assert.equal(bodies[0], bodies[1], "Tinybird retry must keep its deduplication identity and timestamp");
      assert.equal((await admin.query("SELECT count(*)::text AS count FROM status_analytics_outbox")).rows[0].count, "0");
      assert.equal(await value("uptime.status_views"), "2");
      await admin.query("UPDATE uptime_status_pages SET published=false WHERE id='page'");
      assert.equal(await admitStatusAnalytics(pool, { ...view, event_id: randomUUID() }), false);
      await admin.query("UPDATE uptime_status_pages SET published=true WHERE id='page'");
    });
    await t.test("a backfilled running Agent continues recording after the cutover", async () => {
      const thread = randomUUID(), run = randomUUID();
      await admin.query("INSERT INTO agent_threads VALUES($1,'other')", [thread]);
      await admin.query("INSERT INTO agent_runs VALUES($1,$2,now()-interval '200 days','running',3,0)", [run, thread]);
      await admin.query("BEGIN");
      await admin.query("SELECT id FROM agent_runs WHERE id=$1 FOR UPDATE", [run]);
      const finishing = pool.query("UPDATE agent_runs SET input_tokens=7,status='complete' WHERE id=$1", [run]);
      await admin.query("SELECT record_agent_product_usage('other',$1,now()-interval '200 days','running',3,0,true)", [run]);
      await admin.query("COMMIT");
      await finishing;
      const report = await loadUsageAggregates(pool, { organizationId: "other", product: "agent", range: "7d" });
      assert.equal(report.metrics.find(m => m.key === "agent.input_tokens")?.lifetime, "7");
      assert.equal(report.metrics.find(m => m.key === "agent.input_tokens")?.period, "4");
      assert.equal(report.metrics.find(m => m.key === "agent.runs_started")?.lifetime, "1");
      assert.equal(report.metrics.find(m => m.key === "agent.runs.complete")?.lifetime, "1");
      assert.ok(report.coverage[0].lastProcessedAt);
    });
    await t.test("receipt expiry rejects stale replays without erasing the historical totals", async () => {
      const old = "2020-01-01T00:00:00Z";
      await admin.query("SELECT record_product_usage('acme','tunnel-opens','expired',$1,'{\"tunnels.opens.udp\":2}',true)", [old]);
      await admin.query("UPDATE product_usage_receipts SET created_at=now()-interval '121 days' WHERE event_id='expired'");
      await cleanupProductUsage(pool);
      assert.equal((await admin.query("SELECT 1 FROM product_usage_receipts WHERE event_id='expired'")).rows.length, 0);
      assert.equal(await value("tunnels.opens.udp"), "2");
      await assert.rejects(recordProductUsage(pool, { ...event, id: "expired", timestamp: old, deltas: { "tunnels.opens.udp": 2 } }), /replay window/);
      assert.equal(await value("tunnels.opens.udp"), "2");
    });
    await t.test("reports preserve integer precision, isolation, coverage and unknown history", async () => {
      await recordProductUsage(pool, { organizationId: "other", source: "telemetry", id: "large", timestamp: at, deltas: { "observability.telemetry_bytes": "9007199254740993" } });
      await admin.query("INSERT INTO organization_product_usage_baselines(organization_id,metric,period,value) VALUES('other','observability.telemetry_bytes','2025-01-01',17),('other','observability.telemetry_bytes','retained-unknown-day',3)");
      const scoped = await loadUsageAggregates(pool, { organizationId: "other", product: "observability", range: "all" });
      assert.equal(scoped.metrics.find(m => m.key === "observability.telemetry_bytes")?.lifetime, "9007199254741013");
      assert.equal(scoped.metrics.find(m => m.key === "observability.telemetry_bytes")?.historicalBaseline, "20");
      assert.equal(scoped.points.find(p => p.date === "2025-01-01")?.values["observability.telemetry_bytes"], "17");
      const bounded = await loadUsageAggregates(pool, { organizationId: "other", product: "observability", range: "7d" });
      assert.equal(bounded.metrics.find(m => m.key === "observability.telemetry_bytes")?.period, "9007199254740993");
      assert.equal(bounded.points.some(p => p.date.startsWith("2025")), false);
      assert.equal(scoped.interval, "month");
      assert.ok(scoped.coverage.every(source => source.historicalComplete === false));
      const acme = await loadUsageAggregates(pool, { organizationId: "acme", product: "observability", range: "30d" });
      assert.equal(acme.metrics.find(m => m.key === "observability.telemetry_bytes")?.lifetime, "0");
    });
    await t.test("organization deletion removes attribution but retains anonymous platform totals", async () => {
      const before = await value("tunnels.opens.http", true);
      await admitStatusAnalytics(pool, { organization_id: "acme", page_id: "page", event_id: randomUUID(), timestamp: at.replace("T", " ").replace("Z", ""), visitor_hash: "b".repeat(64), path: "/", referrer: "", country: "", retention_days: 1 });
      await admin.query("DELETE FROM organizations WHERE id='acme'");
      assert.equal(await value("tunnels.opens.http"), "0");
      assert.equal(await value("tunnels.opens.http", true), before);
      assert.equal((await admin.query("SELECT count(*)::text AS count FROM product_usage_receipts WHERE organization_id='acme'")).rows[0].count, "0");
      assert.equal((await admin.query("SELECT count(*)::text AS count FROM status_analytics_outbox WHERE organization_id='acme'")).rows[0].count, "0");
      assert.equal(await recordProductUsage(pool, { ...event, id: "deleted-org-pending" }), false, "pending tunnel envelopes for deleted organizations are discarded");
      assert.equal(await value("tunnels.opens.http", true), before);
    });
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    admin.release(); await pool.end();
  }
});
