import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TUNNELS, SUBDOMAINS, DOMAINS, assertDevelopmentTarget,
  assertDevelopmentConfiguration, buildTunnelEvents, buildProtocolEvents, buildTinybirdRecords,
  seedPrimaryDatabase, seedTimescale, seedRedis,
} from "./seed-development.mjs";

const organizationId = "development-fixture-org";

test("address fixtures are unique, plentiful, and exercise every domain state", () => {
  assert.equal(TUNNELS.length, 18);
  assert.equal(SUBDOMAINS.length, 48);
  assert.equal(DOMAINS.length, 18);
  assert.equal(new Set(TUNNELS.map((entry) => entry.id)).size, 18);
  assert.equal(new Set(TUNNELS.map((entry) => entry.url)).size, 18);
  assert.equal(new Set(SUBDOMAINS).size, 48);
  assert.equal(new Set(DOMAINS.map(([domain]) => domain)).size, 18);
  assert.deepEqual(new Set(DOMAINS.map(([, status]) => status)), new Set(["active", "pending", "failed"]));
  assert.equal(TUNNELS.filter((entry) => entry.online).length, 13);
});

test("development guard rejects production and misleading hostname substrings", () => {
  for (const hostname of ["localhost", "127.0.0.1", "postgres-dev.pilot.aeroplane.run", "redis.development.example.test"]) {
    assert.doesNotThrow(() => assertDevelopmentTarget("DATABASE_URL", new URL(`postgresql://${hostname}/db`)));
  }
  for (const hostname of ["postgres-11.pilot.aeroplane.run", "devil.example.com", "mydevelopmentserver.example.com"]) {
    assert.throws(() => assertDevelopmentTarget("DATABASE_URL", new URL(`postgresql://${hostname}/db`)), /Refusing to seed/);
  }
});

test("Tinybird configuration and production mode fail before seed writes", () => {
  const valid = { TINYBIRD_BRANCH: "development", TINYBIRD_API_HOST: "https://example.test", TINYBIRD_INGEST_TOKEN: "test", TINYBIRD_QUERY_TOKEN: "test" };
  assert.doesNotThrow(() => assertDevelopmentConfiguration(valid));
  assert.throws(() => assertDevelopmentConfiguration({ ...valid, NODE_ENV: "production" }), /Refusing/);
  assert.throws(() => assertDevelopmentConfiguration({ ...valid, TINYBIRD_BRANCH: "main" }), /before any seed writes/);
  assert.throws(() => assertDevelopmentConfiguration({ ...valid, TINYBIRD_QUERY_TOKEN: "" }), /before any seed writes/);
});

test("request captures are distributed across all HTTP tunnels and body formats", () => {
  const { events, captures } = buildTunnelEvents(organizationId);
  assert.equal(events.length, 14_400);
  assert.equal(captures.length, 3_600);
  assert.equal(new Set(captures.map((entry) => entry.id)).size, captures.length);
  assert.ok(events.every((entry) => entry.organization_id === organizationId));
  assert.ok(captures.every((entry) => entry.organization_id === organizationId));
  for (const tunnel of TUNNELS.filter((entry) => entry.protocol === "http")) {
    const rows = captures.filter((entry) => entry.tunnel_id === tunnel.id);
    assert.equal(rows.length, 300);
    assert.equal(new Set(rows.map((entry) => entry.request_headers["content-type"])).size, 4);
  }
  for (const capture of captures) {
    assert.equal(capture.request_headers.authorization, "[REDACTED]");
    assert.equal(capture.request_body_size, Buffer.byteLength(capture.request_body));
    assert.equal(capture.response_body_size, Buffer.byteLength(capture.response_body));
  }
  const now = Date.now();
  for (const hours of [1, 24, 168, 720]) {
    assert.ok(events.some((entry) => entry.timestamp.getTime() >= now - hours * 3_600_000));
  }
  assert.ok(events.some((entry) => entry.timestamp.getTime() < now - 28 * 86_400_000));
  assert.ok(events.some((entry) => entry.status_code >= 500));
});

test("protocol fixtures include complete TCP connection cycles and UDP packets", () => {
  const records = buildProtocolEvents(organizationId);
  assert.equal(records.length, 3_200);
  for (const tunnel of TUNNELS.filter((entry) => entry.protocol !== "http")) {
    const rows = records.filter((entry) => entry.tunnel_id === tunnel.id);
    assert.ok(rows.length > 500);
    assert.ok(rows.every((entry) => entry.organization_id === organizationId));
    if (tunnel.protocol === "tcp") {
      const cycle = rows.slice(0, 4);
      assert.deepEqual(cycle.map((entry) => entry.event_type), ["connection", "data", "data", "close"]);
      assert.equal(new Set(cycle.map((entry) => entry.connection_id)).size, 1);
      assert.equal(new Set(cycle.map((entry) => entry.client_ip)).size, 1);
      assert.ok(cycle[0].timestamp < cycle[3].timestamp);
    } else {
      assert.ok(rows.every((entry) => entry.event_type === "packet"));
    }
  }
});

test("observability fixtures cover six services, traces, logs, and consistent histograms", () => {
  const { spans, logs, metrics } = buildTinybirdRecords(organizationId);
  assert.equal(spans.length, 5_760);
  assert.equal(logs.length, 1_440);
  assert.equal(metrics.length, 6_912);
  assert.equal(new Set(spans.map((entry) => entry.service_name)).size, 6);
  assert.ok([...spans, ...logs, ...metrics].every((entry) => entry.organization_id === organizationId));
  for (const service of new Set(spans.map((entry) => entry.service_name))) {
    assert.equal(new Set(spans.filter((entry) => entry.service_name === service && entry.http_method).map((entry) => entry.span_name)).size, 6);
  }
  for (const metric of metrics.filter((entry) => entry.metric_type === "histogram")) {
    assert.equal(metric.bucket_counts.reduce((sum, entry) => sum + Number(entry), 0), Number(metric.count));
    assert.ok(Date.parse(metric.start_timestamp) <= Date.parse(metric.timestamp));
  }
});

test("large request and protocol options keep tenant ownership, unique captures and complete connection cycles", () => {
  const now = Date.now() - 60_000;
  const { events, captures } = buildTunnelEvents(organizationId, { count: 100_000, now });
  assert.equal(events.length, 100_000);
  assert.equal(captures.length, 25_000);
  assert.equal(new Set(captures.map((capture) => capture.id)).size, captures.length);
  assert.equal(new Set(captures.map((capture) => capture.tunnel_id)).size, 12);
  assert.ok(events.every((event) => event.organization_id === organizationId && event.timestamp.getTime() <= now));
  assert.ok(captures.every((capture) => capture.organization_id === organizationId && capture.request_headers.authorization === "[REDACTED]"));

  const protocol = buildProtocolEvents(organizationId, { count: 16_000, now });
  assert.equal(protocol.length, 16_000);
  assert.equal(new Set(protocol.map((event) => event.tunnel_id)).size, 6);
  assert.ok(protocol.every((event) => event.organization_id === organizationId && event.timestamp.getTime() <= now));
  for (let index = 0; index < protocol.length; index += 4) {
    const cycle = protocol.slice(index, index + 4);
    if (cycle[0].protocol !== "tcp") continue;
    assert.deepEqual(cycle.map((event) => event.event_type), ["connection", "data", "data", "close"]);
    assert.equal(new Set(cycle.map((event) => event.connection_id)).size, 1);
    assert.ok(cycle[0].timestamp < cycle[3].timestamp);
  }
});

test("count options are bounded before allocation and single or empty fixtures have valid timestamps", () => {
  for (const count of [-1, 0.5, NaN, Infinity, "100", 250_001]) {
    assert.throws(() => buildTunnelEvents(organizationId, { count }), /integer between/);
  }
  for (const count of [-1, 0.5, NaN, Infinity, "100", 64_001]) {
    assert.throws(() => buildProtocolEvents(organizationId, { count }), /integer between/);
  }
  const now = Date.now() - 60_000;
  assert.deepEqual(buildTunnelEvents(organizationId, { count: 0, now }), { events: [], captures: [] });
  assert.deepEqual(buildProtocolEvents(organizationId, { count: 0, now }), []);
  assert.equal(buildTunnelEvents(organizationId, { count: 1, now }).events[0].timestamp.getTime(), now);
  assert.equal(buildProtocolEvents(organizationId, { count: 1, now })[0].timestamp.getTime(), now - 1_000);
  assert.throws(() => buildTunnelEvents(organizationId, { now: Date.now() + 60_000 }), /at or before/);
});

test("a fixed Tinybird snapshot makes split bulk batches identical to one batch without future timestamps", () => {
  const now = Date.now() - 60_000;
  const base = { now, anchor: now, spanTotal: 12, metricTotal: 5 };
  const full = buildTinybirdRecords(organizationId, { ...base, spanCount: 12, metricPoints: 5 });
  const first = buildTinybirdRecords(organizationId, { ...base, spanCount: 5, metricPoints: 2 });
  const second = buildTinybirdRecords(organizationId, { ...base, spanStart: 5, spanCount: 7, metricStart: 2, metricPoints: 3 });
  for (const type of ["spans", "logs", "metrics"]) {
    assert.deepEqual([...first[type], ...second[type]], full[type]);
    assert.ok(full[type].every((record) => record.ingested_at === new Date(now).toISOString()));
  }
  for (const span of full.spans) {
    assert.ok(Date.parse(span.start_time) <= Date.parse(span.end_time));
    assert.ok(Date.parse(span.end_time) <= now);
    assert.equal((Date.parse(span.end_time) - Date.parse(span.start_time)) * 1_000_000, span.duration_nano);
    assert.ok(span.span_name.length > 0);
  }
  assert.ok(full.logs.every((log) => Date.parse(log.timestamp) <= now && Date.parse(log.observed_timestamp) <= now));
  assert.ok(full.metrics.every((metric) => Date.parse(metric.timestamp) <= now));
  assert.equal(new Set(full.spans.map((span) => span.span_id)).size, full.spans.length);
  assert.equal(new Set(full.logs.map((log) => log.event_id)).size, full.logs.length);
  assert.equal(new Set(full.metrics.map((metric) => metric.event_id)).size, full.metrics.length);
});

test("Tinybird totals of one and empty batch sections do not divide by zero or cross organizations", () => {
  const now = Date.now() - 60_000;
  const options = { now, anchor: now, spanTotal: 1, spanCount: 1, metricTotal: 1, metricPoints: 1 };
  const one = buildTinybirdRecords(organizationId, options);
  const other = buildTinybirdRecords("another-fixture-org", options);
  assert.equal(one.spans.length, 4);
  assert.equal(one.logs.length, 1);
  assert.equal(one.metrics.length, 36);
  assert.ok(one.spans.every((span) => Number.isFinite(Date.parse(span.start_time)) && Date.parse(span.end_time) <= now));
  assert.ok(one.metrics.every((metric) => Date.parse(metric.timestamp) === now));
  assert.notEqual(one.spans[0].trace_id, other.spans[0].trace_id);
  assert.notEqual(one.spans[0].span_id, other.spans[0].span_id);
  assert.notEqual(one.logs[0].event_id, other.logs[0].event_id);
  assert.notEqual(one.metrics[0].event_id, other.metrics[0].event_id);
  assert.deepEqual(buildTinybirdRecords(organizationId, { ...options, spanCount: 0, metricPoints: 0 }), { spans: [], logs: [], metrics: [] });
  for (const invalid of [
    { spanTotal: 0 }, { metricTotal: 0 }, { spanStart: -1 }, { metricStart: 0.5 },
    { spanCount: 100_001 }, { metricPoints: 10_001 },
    { spanStart: 1 }, { metricStart: 1 }, { anchor: now + 1 },
  ]) assert.throws(() => buildTinybirdRecords(organizationId, { ...options, ...invalid }), /integer between|exceed|at or before/);
});

function mockDatabase(action = () => ({ rowCount: 0, rows: [] })) {
  const calls = [];
  return { calls, async query(sql, parameters) {
    calls.push({ sql, parameters });
    return action(sql, parameters);
  } };
}

test("exported primary seeder checks global fixture collisions before writes and keeps all notifications inert", async () => {
  const client = mockDatabase();
  await seedPrimaryDatabase(client, { id: organizationId }, { id: "fixture-owner" });
  assert.equal(client.calls[0].sql, "BEGIN");
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  const firstInsert = client.calls.findIndex(({ sql }) => sql.startsWith("INSERT"));
  const collisionChecks = client.calls.slice(1, firstInsert);
  assert.equal(collisionChecks.length, 10);
  assert.ok(collisionChecks.slice(0, -1).every(({ sql, parameters }) => sql.includes("organization_id IS DISTINCT FROM $2") && parameters[1] === organizationId));
  assert.match(collisionChecks.at(-1).sql, /purpose <> 'tunnel'/);
  const alerts = client.calls.filter(({ sql }) => sql.startsWith("INSERT INTO observability_alerts"));
  assert.equal(alerts.length, 3);
  assert.ok(alerts.every(({ sql, parameters }) => sql.includes("enabled = false") && sql.includes("notification_emails = ARRAY[]::text[]") && parameters[9] === null));
  const notifications = client.calls.filter(({ sql }) => sql.startsWith("INSERT INTO notifications"));
  assert.equal(notifications.length, 2);
  assert.ok(notifications.every(({ sql, parameters }) => sql.includes("'sent', 1, 5") && parameters[5] === "demo@example.invalid"));
  for (const target of ["tunnels", "notifications", "domains"]) {
    const conflict = mockDatabase((sql) => ({ rowCount: sql.startsWith(`SELECT 1 FROM ${target} `) ? 1 : 0, rows: [] }));
    await assert.rejects(seedPrimaryDatabase(conflict, { id: organizationId }, { id: "fixture-owner" }), /another organization/);
    assert.equal(conflict.calls.at(-1).sql, "ROLLBACK");
    assert.ok(conflict.calls.every(({ sql }) => !sql.startsWith("INSERT")));
  }
  const statusPageDomain = mockDatabase((sql) => ({ rowCount: sql.includes("purpose <> 'tunnel'") ? 1 : 0, rows: [] }));
  await assert.rejects(seedPrimaryDatabase(statusPageDomain, { id: organizationId }, { id: "fixture-owner" }), /status page/);
  assert.equal(statusPageDomain.calls.at(-1).sql, "ROLLBACK");
  assert.ok(statusPageDomain.calls.every(({ sql }) => !sql.startsWith("INSERT")));
});

test("exported Timescale seeder forwards counts, scopes fixture deletes and rolls back failures using mocks only", async () => {
  const client = mockDatabase();
  const result = await seedTimescale(client, organizationId, { requestCount: 5, protocolCount: 8, now: Date.now() - 60_000 });
  assert.deepEqual(result, { requests: 5, captures: 2, protocolEvents: 8 });
  assert.equal(client.calls[0].sql, "BEGIN");
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  const deletes = client.calls.filter(({ sql }) => sql.startsWith("DELETE"));
  assert.equal(deletes.length, 3);
  assert.ok(deletes.every(({ sql, parameters }) => sql.includes("organization_id = $2") && parameters[1] === organizationId && parameters[0].length === 18));
  const writes = client.calls.filter(({ sql }) => sql.startsWith("INSERT"));
  assert.deepEqual(writes.map(({ parameters }) => JSON.parse(parameters[0]).length), [5, 2, 8]);
  assert.ok(writes.every(({ parameters }) => JSON.parse(parameters[0]).every((record) => record.organization_id === organizationId)));
  const invalid = mockDatabase();
  await assert.rejects(seedTimescale(invalid, organizationId, { requestCount: 250_001 }), /integer between/);
  assert.equal(invalid.calls.length, 0);
  await assert.rejects(seedTimescale(invalid, organizationId, { batchSize: 0 }), /integer between/);
  await assert.rejects(seedTimescale(invalid, organizationId, { batchSize: 10_001 }), /integer between/);
  assert.equal(invalid.calls.length, 0);
  const split = mockDatabase();
  await seedTimescale(split, organizationId, { requestCount: 5, protocolCount: 8, batchSize: 2 });
  const batches = split.calls.filter(({ sql }) => sql.startsWith("INSERT")).map(({ parameters }) => JSON.parse(parameters[0]));
  assert.ok(batches.every((rows) => rows.length <= 2));
  assert.equal(batches.reduce((total, rows) => total + rows.length, 0), 15);
  const failure = mockDatabase((sql) => { if (sql.startsWith("INSERT")) throw new Error("Mock insertion failed"); return { rowCount: 0, rows: [] }; });
  await assert.rejects(seedTimescale(failure, organizationId, { requestCount: 1, protocolCount: 1 }), /Mock insertion failed/);
  assert.equal(failure.calls.at(-1).sql, "ROLLBACK");
});

test("exported Redis seeder updates only the organization and known fixture online keys using mock pipelines", async () => {
  const batches = [];
  const redis = { pipeline() {
    const commands = [];
    batches.push(commands);
    const pipeline = Object.fromEntries(["srem", "del", "sadd", "set"].map((name) => [name, (...parameters) => { commands.push({ name, parameters }); return pipeline; }]));
    pipeline.exec = async () => commands.map(() => [null, 1]);
    return pipeline;
  } };
  assert.equal(await seedRedis(redis, { id: organizationId }, { id: "fixture-owner" }), 13);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 18 * 3);
  assert.ok(batches[0].filter(({ name }) => name === "srem").every(({ parameters }) => parameters[0] === `org:${organizationId}:online_tunnels`));
  const snapshots = batches[1].filter(({ name, parameters }) => name === "set" && parameters[0].startsWith("tunnel:online:"));
  assert.equal(snapshots.length, 13);
  assert.ok(snapshots.every(({ parameters }) => {
    const payload = JSON.parse(parameters[1]);
    return payload.organizationId === organizationId && payload.userId === "fixture-owner" && payload.serverId === "development-seed" && payload.fullCaptureEnabled === true && parameters[2] === "EX";
  }));
  assert.deepEqual(batches[1].at(-1), { name: "sadd", parameters: ["global:orgs_with_online_tunnels", organizationId] });
});
