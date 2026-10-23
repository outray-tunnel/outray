import assert from "node:assert/strict";
import test from "node:test";
import tunnelUsage from "../../../shared/tunnel-product-usage";
import type { UsageEvent } from "../../../shared/product-usage";
const { TunnelUsageBuffer, tunnelTrafficDeltas } = tunnelUsage;
const at = "2026-10-22T12:00:00Z";

test("traffic accounting projects only protocol counters, never payloads", () => {
  assert.deepEqual(tunnelTrafficDeltas("tunnel_events", { bytes_in: 12, bytes_out: 40, body: "private", url: "https://private.test" }), {
    "tunnels.http_requests": "1", "tunnels.bytes.http.in": "12", "tunnels.bytes.http.out": "40",
  });
  assert.deepEqual(tunnelTrafficDeltas("tunnel_protocol_events", { protocol: "tcp", event_type: "connection" }), { "tunnels.tcp_connections": "1" });
  assert.deepEqual(tunnelTrafficDeltas("tunnel_protocol_events", { protocol: "tcp", event_type: "data", bytes_in: 9, bytes_out: 3 }), { "tunnels.bytes.tcp.in": "9", "tunnels.bytes.tcp.out": "3" });
  assert.deepEqual(tunnelTrafficDeltas("tunnel_protocol_events", { protocol: "tcp", event_type: "close", bytes_in: 9, bytes_out: 3 }), {});
  for (const direction of ["in", "out"]) assert.deepEqual(tunnelTrafficDeltas("tunnel_protocol_events", { protocol: "udp", event_type: "packet", direction, bytes_in: 0, bytes_out: 0 }), { [`tunnels.udp_datagrams.${direction}`]: "1" });
  assert.deepEqual(tunnelTrafficDeltas("request_captures", { payload: "private" }), {});
});

test("ambiguous enqueue retries immutable IDs; newer traffic is a separate batch", async () => {
  const attempts: UsageEvent[][] = [];
  let reject = true;
  const buffer = new TunnelUsageBuffer({ async enqueue(events) { attempts.push(structuredClone(events)); if (reject) throw new Error("lost Redis reply"); } });
  buffer.log("org", at, { "tunnels.http_requests": 2 });
  await assert.rejects(buffer.flush());
  buffer.log("org", at, { "tunnels.http_requests": 3 });
  reject = false;
  await buffer.flush();
  assert.deepEqual(attempts[0], attempts[1]);
  await buffer.flush();
  assert.notEqual(attempts[2][0].id, attempts[0][0].id);
  assert.equal(attempts[2][0].deltas["tunnels.http_requests"], "3");
});

test("concurrent flushing serializes; UTC days and organizations stay separate", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const sent: UsageEvent[][] = [];
  const buffer = new TunnelUsageBuffer({ async enqueue(events) { sent.push(structuredClone(events)); await pending; } });
  buffer.log("org", "2026-10-22T23:59:59Z", { "tunnels.bytes.http.in": "9007199254740993" });
  buffer.log("org", "2026-10-23T00:00:00Z", { "tunnels.bytes.http.in": 1 });
  buffer.log("other", at, { "tunnels.http_requests": 1 });
  const first = buffer.flush(), second = buffer.flush();
  assert.equal(first, second);
  release(); await first;
  assert.equal(sent.length, 1); assert.equal(sent[0].length, 3);
  assert.equal(sent[0][0].timestamp, "2026-10-22T00:00:00.000Z");
  assert.equal(sent[0][0].deltas["tunnels.bytes.http.in"], "9007199254740993");
});

test("buffer exhaustion and counter overflow reject atomically", async () => {
  let sent: UsageEvent[] = [];
  const buffer = new TunnelUsageBuffer({ async enqueue(events) { sent = events; } }, 1);
  buffer.log("org", at, { "tunnels.http_requests": 1, "tunnels.bytes.http.in": "9223372036854775807" });
  assert.throws(() => buffer.log("other", at, { "tunnels.http_requests": 1 }), /full/);
  assert.throws(() => buffer.log("org", at, { "tunnels.http_requests": 1, "tunnels.bytes.http.in": 1 }), /overflow/);
  await buffer.flush();
  assert.equal(sent[0].deltas["tunnels.http_requests"], "1");
});
