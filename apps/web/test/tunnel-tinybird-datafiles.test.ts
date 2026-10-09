import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

// Tunnel is a CommonJS workspace, while the dashboard tests are ESM.
const { tunnelEventRecord, requestCaptureRecord, protocolEventRecord } = createRequire(import.meta.url)("../../tunnel/src/lib/tinybird-records.ts") as typeof import("../../tunnel/src/lib/tinybird-records");

const project = new URL("../../../tinybird/", import.meta.url);
const organizationEndpoints = [
  "tunnel_http_stats", "tunnel_http_chart", "tunnel_requests",
  "tunnel_protocol_stats", "tunnel_protocol_chart", "tunnel_protocol_recent",
  "tunnel_capture", "tunnel_overview_stats", "tunnel_overview_chart",
];
const adminEndpoints = [
  "tunnel_admin_active_series", "tunnel_admin_http_chart",
  "tunnel_admin_active_chart", "tunnel_admin_usage",
];
const dataSources = [
  "tunnel_events", "tunnel_protocol_events", "tunnel_request_captures",
  "tunnel_active_snapshots",
];

async function endpoint(name: string) {
  return readFile(new URL(`endpoints/${name}.pipe`, project), "utf8");
}

for (const name of organizationEndpoints) {
  test(`${name} keeps tenant and retention checks on every source read`, async () => {
    const source = await endpoint(name);
    assert.match(source, /TOKEN OUTRAY_QUERY_TOKEN READ/);
    assert.match(source, /TYPE endpoint/);
    const sourceNodes = source.split(/\nNODE /).filter((node) => /FROM tunnel_/.test(node));
    assert.ok(sourceNodes.length > 0);
    for (const node of sourceNodes) {
      assert.match(node, /FROM tunnel_\w+ FINAL/);
      assert.match(node, /organization_id = \{\{String\(organization_id\)\}\}/);
      assert.match(node, /timestamp >= now64\(3, 'UTC'\) - toIntervalDay\(least\(greatest\(retention_days, 1\), 90\)\)/);
    }
  });
}

for (const name of adminEndpoints) {
  test(`${name} deduplicates retry batches and rejects logically expired evidence`, async () => {
    const source = await endpoint(name);
    const sourceNodes = source.split(/\nNODE /).filter((node) => /FROM tunnel_/.test(node));
    for (const node of sourceNodes) {
      assert.match(node, /FROM tunnel_\w+ FINAL/);
      assert.match(node, /(?:timestamp|ts) >= now64\(3, 'UTC'\) - (?:toIntervalDay\(least\(greatest\(retention_days, 1\), 90\)\)|INTERVAL 90 DAY)/);
    }
  });
}

for (const name of dataSources) {
  test(`${name} supports millisecond timestamps, retry deduplication and bounded TTL`, async () => {
    const source = await readFile(new URL(`datasources/${name}.datasource`, project), "utf8");
    assert.match(source, /TOKEN OUTRAY_INGEST_TOKEN APPEND/);
    assert.match(source, /DateTime64\(3, 'UTC'\)/);
    assert.match(source, /ENGINE "ReplacingMergeTree"/);
    assert.match(source, /ENGINE_VER ingested_at/);
    assert.match(source, /ENGINE_TTL .*90/);
    if (name === "tunnel_events" || name === "tunnel_protocol_events") {
      assert.match(source, /ENGINE_SORTING_KEY "organization_id, tunnel_id, timestamp, event_id"/);
    }
  });
}

test("capture bodies preserve null and headers are serialized JSON", async () => {
  const source = await readFile(new URL("datasources/tunnel_request_captures.datasource", project), "utf8");
  assert.match(source, /`request_headers` String .*DEFAULT '\{\}'/);
  assert.match(source, /`response_headers` String .*DEFAULT '\{\}'/);
  assert.match(source, /`request_body` Nullable\(String\)/);
  assert.match(source, /`response_body` Nullable\(String\)/);
});

test("capture exact IDs cannot bypass organization, tunnel or retention checks", async () => {
  const source = await endpoint("tunnel_capture");
  const globalScope = source.slice(0, source.indexOf("{% if defined(request_id) %}"));
  assert.match(globalScope, /organization_id = \{\{String\(organization_id\)\}\}/);
  assert.match(globalScope, /has\(JSONExtract\(\{\{String\(tunnel_ids\)\}\}, 'Array\(String\)'\), tunnel_id\)/);
  assert.match(globalScope, /toIntervalDay\(least\(greatest\(retention_days, 1\), 90\)\)/);
  assert.match(source, /ORDER BY abs\(dateDiff\('millisecond'/);
  assert.match(source, /LIMIT 1/);
});

test("request search is literal substring matching with stable time/ID ordering", async () => {
  const source = await endpoint("tunnel_requests");
  assert.match(source, /positionCaseInsensitive\(path, \{\{String\(search\)\}\}\)/);
  assert.doesNotMatch(source, /\bI?LIKE\b/i);
  assert.match(source, /ORDER BY timestamp DESC, event_id DESC/);
  assert.match(source, /LIMIT least\(greatest\(\{\{UInt32\(limit, 50\)\}\}, 1\), 501\)/);
});

test("comparison windows share one captured start/end boundary", async () => {
  const source = await endpoint("tunnel_overview_stats");
  assert.equal((source.match(/timestamp >= parseDateTime64BestEffort\(\{\{String\(previous_start\)\}\}/g) || []).length, 2);
  assert.equal((source.match(/timestamp < parseDateTime64BestEffort\(\{\{String\(end\)\}\}/g) || []).length, 2);
  assert.match(source, /http_errors/);
  assert.match(source, /previous_http_errors/);
  assert.doesNotMatch(source, /event_type .*http_errors/);
});

test("administrator request chart counts HTTP requests rather than active tunnels", async () => {
  const source = await endpoint("tunnel_admin_http_chart");
  assert.match(source, /count\(\) AS requests/);
  assert.match(source, /FROM tunnel_events FINAL/);
  assert.doesNotMatch(source, /active_tunnels/);
});

test("real tunnel writer records match every datasource ingestion field", async () => {
  const timestamp = Date.UTC(2026, 9, 9, 10, 23, 45, 678);
  const common = { timestamp, tunnel_id: "tunnel-fixture", organization_id: "tenant-fixture", retention_days: 30 };
  const records = [
    ["tunnel_events", tunnelEventRecord({ ...common, request_id: "request-fixture", host: "demo.example.test", method: "GET", path: "/health", status_code: 200, request_duration_ms: 32, bytes_in: 42, bytes_out: 123, client_ip: "203.0.113.1", user_agent: "fixture" })],
    ["tunnel_protocol_events", protocolEventRecord({ ...common, protocol: "tcp", event_type: "data", connection_id: "connection-fixture", client_ip: "203.0.113.1", client_port: 54321, bytes_in: 10, bytes_out: 20, duration_ms: 50 })],
    ["tunnel_request_captures", requestCaptureRecord({ ...common, id: "request-fixture", request_headers: { accept: "text/plain" }, request_body: null, request_body_size: 0, response_headers: { "content-type": "text/plain" }, response_body: "b2s=", response_body_size: 2 })],
  ] as const;
  for (const [name, record] of records) {
    const source = await readFile(new URL(`datasources/${name}.datasource`, project), "utf8");
    const jsonFields = [...source.matchAll(/`json:\$\.([^`]+)`/g)].map((match) => match[1]);
    assert.deepEqual(Object.keys(record).sort(), jsonFields.sort(), `${name}: writer fields equal the ingestion schema`);
    assert.equal(record.timestamp, "2026-10-09 10:23:45.678");
    assert.match(String(record.ingested_at), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  }
  assert.equal(records[0][1].event_id, records[2][1].id);
  assert.equal(records[2][1].request_body, null);
  assert.deepEqual(JSON.parse(String(records[2][1].request_headers)), { accept: "text/plain" });
});
