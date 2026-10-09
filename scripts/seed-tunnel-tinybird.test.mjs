import assert from "node:assert/strict";
import test from "node:test";
import { buildTunnelTinybirdRecords } from "./seed-development.mjs";

test("tunnel Tinybird seed mapping preserves payloads, scopes and stable dedup identities", () => {
  const options = { requestCount: 20, protocolCount: 12, now: Date.now() - 60_000 };
  const first = buildTunnelTinybirdRecords("synthetic-org", options);
  assert.deepEqual(first, buildTunnelTinybirdRecords("synthetic-org", options));
  assert.equal(first.tunnel_events.length, 20);
  assert.equal(first.tunnel_protocol_events.length, 12);
  for (const rows of Object.values(first)) for (const row of rows) {
    assert.equal(row.organization_id, "synthetic-org");
    assert.equal(row.retention_days, 90);
    assert.match(row.timestamp, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    assert.ok(row.ingested_at);
  }
  assert.equal(new Set(first.tunnel_protocol_events.map((row) => row.event_id)).size, 12);
  const capture = first.tunnel_request_captures[0];
  assert.ok(capture);
  assert.equal(JSON.parse(capture.request_headers).authorization, "[REDACTED]");
  assert.equal(typeof capture.response_headers, "string");
  assert.equal(typeof capture.request_body, "string");
  assert.ok(Buffer.from(capture.request_body, "base64").toString("utf8").length > 0);
});
