import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TUNNELS, SUBDOMAINS, DOMAINS, assertDevelopmentTarget,
  assertDevelopmentConfiguration, buildTunnelEvents, buildProtocolEvents, buildTinybirdRecords,
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
