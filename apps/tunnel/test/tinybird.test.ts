import assert from "node:assert/strict";
import { test } from "node:test";
import { BufferedAnalyticsLogger, type AnalyticsQueue } from "../src/lib/buffered-logger";
import {
  normalizeRetentionDays, tinybirdTimestamp, tunnelEventRecord, requestCaptureRecord,
  protocolEventRecord, TunnelTinybirdClient, captureRecordIsCurrent, type TunnelEvent,
} from "../src/lib/tinybird-records";

const event: TunnelEvent = {
  request_id: "request-123", timestamp: Date.UTC(2026, 9, 9, 10, 15, 20, 123),
  tunnel_id: "tunnel", organization_id: "org", retention_days: 999_999_999,
  host: "example.test", method: "GET", path: "/health", status_code: 200,
  request_duration_ms: 15, bytes_in: 10, bytes_out: 20, client_ip: "127.0.0.1", user_agent: "test",
};

test("records preserve millisecond timestamps, stable ids, and bounded retention", () => {
  const row = tunnelEventRecord(event);
  assert.equal(row.timestamp, "2026-10-09 10:15:20.123");
  assert.equal(row.event_id, event.request_id);
  assert.equal(row.request_id, event.request_id);
  assert.equal(row.retention_days, 90);
  assert.match(String(row.ingested_at), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  const missing = tunnelEventRecord({ ...event, request_id: undefined });
  assert.equal(missing.request_id, "");
  assert.match(String(missing.event_id), /^[0-9a-f-]{36}$/);
  assert.equal(normalizeRetentionDays(Infinity), 3);
  assert.equal(normalizeRetentionDays(-5), 1);
  assert.equal(normalizeRetentionDays(4.9), 4);
  assert.equal(tinybirdTimestamp(new Date(event.timestamp)), row.timestamp);
});

test("captures preserve JSON headers and nullable bodies", () => {
  const record = requestCaptureRecord({
    id: "capture", timestamp: event.timestamp, tunnel_id: "tunnel", organization_id: "org",
    retention_days: 7, request_headers: { accept: ["a", "b"] }, request_body: null,
    request_body_size: 0, response_headers: { "content-type": "application/json" },
    response_body: '{"ok":true}', response_body_size: 11,
  });
  assert.equal(record.id, "capture");
  assert.deepEqual(JSON.parse(String(record.request_headers)), { accept: ["a", "b"] });
  assert.equal(record.request_body, null);
  assert.equal(record.response_body, '{"ok":true}');
});

test("separate protocol events get distinct deduplication ids", () => {
  const protocol = {
    timestamp: event.timestamp, tunnel_id: "tunnel", organization_id: "org", retention_days: 7,
    protocol: "tcp" as const, event_type: "data" as const, connection_id: "connection",
    client_ip: "127.0.0.1", client_port: 1234, bytes_in: 20, bytes_out: 30, duration_ms: 10,
  };
  assert.notEqual(protocolEventRecord(protocol).event_id, protocolEventRecord(protocol).event_id);
});

test("Tinybird waits for acknowledged ingestion and never exposes response payloads", async (context) => {
  let request: { url: string; init?: RequestInit } | undefined;
  const fetchMock = context.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    request = { url: String(url), init };
    return Response.json({ successful_rows: 1, quarantined_rows: 0 });
  });
  const client = new TunnelTinybirdClient("https://api.example.test", "write-token");
  const row = tunnelEventRecord(event);
  await client.append("tunnel_events", [row]);
  assert.equal(request?.url, "https://api.example.test/v0/events?name=tunnel_events&wait=true");
  assert.equal((request?.init?.headers as Record<string, string>).Authorization, "Bearer write-token");
  assert.deepEqual(JSON.parse(String(request?.init?.body)), row);
  fetchMock.mock.mockImplementation(async () => new Response("secret contents", { status: 500 }));
  await assert.rejects(client.append("tunnel_events", [row]), (error: Error) => {
    assert.match(error.message, /failed \(500\)/);
    assert.doesNotMatch(error.message, /secret contents|write-token/);
    return true;
  });
  for (const result of [{ successful_rows: 0, quarantined_rows: 0 }, { successful_rows: 1, quarantined_rows: 1 }, null]) {
    fetchMock.mock.mockImplementation(async () => Response.json(result));
    await assert.rejects(client.append("tunnel_events", [row]));
  }
});

test("Tinybird configuration fails closed without credentials or with insecure remote origins", () => {
  assert.equal(new TunnelTinybirdClient("", "").configured, false);
  assert.equal(new TunnelTinybirdClient("http://remote.test", "token").configured, false);
  assert.equal(new TunnelTinybirdClient("https://user:pass@remote.test", "token").configured, false);
  assert.equal(new TunnelTinybirdClient("http://localhost:7181", "token").configured, true);
});

test("large captures are split into bounded requests and retries keep ids/version", async (context) => {
  const records = [0, 1, 2].map((index) => ({
    id: `capture-${index}`, ingested_at: "2026-10-09 10:15:35.123", body: "x".repeat(2 * 1024 * 1024),
    timestamp: tinybirdTimestamp(Date.now()), retention_days: 3,
  }));
  const requests: string[] = [];
  let failSecond = true;
  context.mock.method(globalThis, "fetch", async (_url: string | URL, init?: RequestInit) => {
    const body = String(init?.body);
    requests.push(body);
    assert.ok(Buffer.byteLength(body) < 4 * 1024 * 1024);
    if (requests.length === 2 && failSecond) {
      failSecond = false;
      return new Response("private contents", { status: 503 });
    }
    return Response.json({ successful_rows: body.split("\n").length, quarantined_rows: 0 });
  });
  const client = new TunnelTinybirdClient("https://api.example.test", "write-token");
  await assert.rejects(client.append("tunnel_request_captures", records));
  await client.append("tunnel_request_captures", records);
  assert.equal(requests.length, 5);
  assert.equal(requests[0], requests[2]);
  assert.equal(requests[1], requests[3]);
  assert.deepEqual(JSON.parse(requests[4]), records[2]);
});

test("captures expire by their own event timestamp and plan retention", () => {
  const now = Date.now();
  assert.equal(captureRecordIsCurrent({ timestamp: tinybirdTimestamp(now - 4 * 86_400_000), retention_days: 3 }, now), false);
  assert.equal(captureRecordIsCurrent({ timestamp: tinybirdTimestamp(now - 4 * 86_400_000), retention_days: 7 }, now), true);
  assert.equal(captureRecordIsCurrent({ timestamp: "malformed", retention_days: 7 }, now), false);
});

test("an expired or oversized capture cannot block neighboring valid captures", async (context) => {
  const errors: string[] = [];
  context.mock.method(console, "error", (message: string) => { errors.push(message); });
  const delivered: object[] = [];
  context.mock.method(globalThis, "fetch", async (_url: string | URL, init?: RequestInit) => {
    const rows = String(init?.body).split("\n").map((line) => JSON.parse(line));
    delivered.push(...rows);
    return Response.json({ successful_rows: rows.length, quarantined_rows: 0 });
  });
  const current = { id: "current", timestamp: tinybirdTimestamp(Date.now()), retention_days: 3 };
  const expired = { ...current, id: "expired", timestamp: tinybirdTimestamp(Date.now() - 4 * 86_400_000) };
  const oversized = { ...current, id: "oversized", body: "private".repeat(500_000) };
  await new TunnelTinybirdClient("https://api.example.test", "token").append("tunnel_request_captures", [expired, oversized, current]);
  assert.deepEqual(delivered, [current]);
  assert.match(errors[0], /1 oversized records/);
  assert.doesNotMatch(errors[0], /private/);
});

test("writer record limits discard only the oversized capture", async (context) => {
  context.mock.method(console, "error", () => undefined);
  const batches: string[][] = [];
  const logger = new BufferedAnalyticsLogger(testQueue<string>(async (records) => { batches.push(records); }), "captures", 20, 5_000, 1_000, 10);
  logger.log("oversized capture");
  logger.log("small");
  await logger.flush();
  assert.deepEqual(batches, [["small"]]);
  await logger.shutdown();
});

test("large buffered captures flush by bytes before the row threshold", async () => {
  const batches: string[][] = [];
  const logger = new BufferedAnalyticsLogger(testQueue<string>(async (records) => { batches.push(records); }), "captures", 20, 5_000);
  logger.log("x".repeat(2 * 1024 * 1024));
  logger.log("y".repeat(2 * 1024 * 1024));
  await logger.flush();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  await logger.shutdown();
});

function testQueue<T>(enqueue: (records: T[]) => Promise<void>): AnalyticsQueue<T> {
  return { enqueue, start() {}, async close() {} };
}

test("failed Redis writes are retained and retried with unchanged ids/version", async () => {
  const batches: object[][] = [];
  let failed = false;
  const queue = testQueue<object>(async (records) => {
    batches.push(records);
    if (!failed) { failed = true; throw new Error("redis unavailable"); }
  });
  const logger = new BufferedAnalyticsLogger(queue, "events", 10, 5_000);
  const row = tunnelEventRecord(event);
  logger.log(row);
  await assert.rejects(logger.flush());
  await logger.flush();
  assert.deepEqual(batches, [[row], [row]]);
  await logger.shutdown();
});

test("flushes serialize while newly added events remain queued", async () => {
  let release: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const batches: number[][] = [];
  const queue = testQueue<number>(async (records) => {
    batches.push(records);
    if (batches.length === 1) await waiting;
  });
  const logger = new BufferedAnalyticsLogger(queue, "events", 10, 5_000);
  logger.log(1);
  const flushing = logger.flush();
  logger.log(2);
  assert.equal(logger.flush(), flushing);
  release();
  await flushing;
  assert.deepEqual(batches, [[1], [2]]);
  await logger.shutdown();
});

test("buffer overload is explicit and excludes capture content from its error", async (context) => {
  const errors: string[] = [];
  context.mock.method(console, "error", (message: string) => { errors.push(message); });
  const batches: string[][] = [];
  const logger = new BufferedAnalyticsLogger(testQueue<string>(async (records) => { batches.push(records); }), "capture", 10, 5_000, 8);
  logger.log("hidden secret");
  await logger.flush();
  assert.equal(batches.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /buffer is full/);
  assert.doesNotMatch(errors[0], /hidden secret/);
  await logger.shutdown();
});
