import assert from "node:assert/strict";
import test from "node:test";
import { loadRouteHandlers } from "./helpers/load-route";
import { getTunnelEventIdentifiers } from "../src/lib/tunnel-event-identifiers";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../src/lib/tunnel-stats-range";
import { fillTunnelBuckets, normalizeTunnelRequest, serializeTunnelCapture, tunnelBucketSeconds, tunnelEventTime, type TunnelCaptureRow } from "../src/lib/tunnel-tinybird";

type Handler = (context: { request: Request; params: { orgSlug: string } }) => Promise<Response>;
type QueryParameters = Record<string, string | number | undefined>;
const boundary = new Date("2026-10-09T12:34:56.789Z");
const ownTunnel = { id: "tunnel-a", organizationId: "org-a", name: "preview", url: "https://preview.example.com" };
const capture: TunnelCaptureRow = {
  id: "not-a-uuid", timestamp: "2026-10-09 12:00:00.000", tunnel_id: "tunnel-a", organization_id: "org-a",
  request_headers: '{"content-type":"text/plain"}', response_headers: '{"set-cookie":["one","two"]}',
  request_body: Buffer.from("Hello 🚀").toString("base64"), response_body: Buffer.from("OK").toString("base64"), request_body_size: 10, response_body_size: 2,
};

async function fixture(kind: "requests" | "capture", options: { unauthorized?: boolean; rows?: Record<string, unknown>[]; tunnels?: typeof ownTunnel[]; failure?: boolean } = {}) {
  const calls: { endpoint: string; parameters: QueryParameters; options: unknown }[] = [];
  const predicates: unknown[] = [];
  const builder = { from: () => builder, where: (predicate: unknown) => { predicates.push(predicate); return Promise.resolve(options.tunnels ?? [ownTunnel]); } };
  const level = kind === "capture" ? "../../../../" : "../../../";
  const modules = {
    "drizzle-orm": { eq: (column: unknown, value: unknown) => ({ column, value }), and: (...parts: unknown[]) => ({ and: parts }), or: (...parts: unknown[]) => ({ or: parts }) },
    [`${level}db`]: { db: { select: () => builder } },
    [`${level}db/app-schema`]: { tunnels: { id: "id", name: "name", url: "url", organizationId: "organization_id" } },
    [`${level}lib/org`]: { requireOrgFromSlug: async () => options.unauthorized ? { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } : { organization: { id: "org-a" } } },
    [`${level}lib/tinybird`]: { queryTinybird: async (endpoint: string, parameters: QueryParameters, queryOptions: unknown) => {
      calls.push({ endpoint, parameters, options: queryOptions });
      if (options.failure) throw new Error("Synthetic provider details must stay private");
      return options.rows ?? (kind === "capture" ? [capture] : [{ timestamp: "2026-10-09 12:00:00.000", request_id: "request-a", tunnel_id: "tunnel-a", path: "/a" }]);
    } },
    [`${level}lib/tunnel-event-identifiers`]: { getTunnelEventIdentifiers },
    [`${level}lib/tunnel-tinybird`]: { serializeTunnelCapture, normalizeTunnelRequest, tunnelEventTime },
    [`${level}lib/tunnel-stats-range`]: { parseTunnelStatsRange, tunnelStatsWindow: (range: Parameters<typeof tunnelStatsWindow>[0]) => tunnelStatsWindow(range, boundary) },
    [`${level}lib/dashboard-cache`]: { cachedDashboardRead: (_key: string, read: () => Promise<unknown>) => read(), dashboardCacheKey: () => "synthetic" },
  };
  const handlers = await loadRouteHandlers<{ GET?: Handler; POST?: Handler }>({ path: new URL(`../src/routes/api/$orgSlug/${kind === "capture" ? "requests/capture" : "requests"}.ts`, import.meta.url), modules, logger: { error() {}, log() {}, warn() {} } });
  const execute = (input: string | Record<string, unknown> = {}) => (kind === "capture" ? handlers.POST! : handlers.GET!)({
    request: kind === "capture" ? new Request("https://app.test/api/org-a/requests/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }) : new Request(`https://app.test/api/org-a/requests?${typeof input === "string" ? input : ""}`), params: { orgSlug: "org-a" },
  });
  return { execute, calls, predicates };
}

test("tunnel request history and captures authorize before any reads", async () => {
  for (const kind of ["requests", "capture"] as const) {
    const f = await fixture(kind, { unauthorized: true });
    assert.equal((await f.execute()).status, 401);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.predicates, []);
  }
});

test("request history uses a bounded window, literal search and tenant-scoped legacy identifiers", async () => {
  const f = await fixture("requests");
  const response = await f.execute("tunnelId=tunnel-a&range=7d&limit=50&search=%25checkout%25");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.count, 1);
  assert.equal(data.timeRange, "7d");
  assert.equal(data.requests[0].timestamp, "2026-10-09T12:00:00.000Z");
  assert.equal(f.calls[0].endpoint, "tunnel_requests");
  assert.deepEqual({ ...f.calls[0].parameters }, { organization_id: "org-a", start: "2026-10-02T12:34:56.789Z", end: boundary.toISOString(), tunnel_ids: JSON.stringify(["tunnel-a", "preview", "preview.example.com"]), search: "%checkout%", limit: 50 });
});

test("request history rejects another organization's tunnel and invalid ranges or limits", async () => {
  const other = await fixture("requests", { tunnels: [{ ...ownTunnel, organizationId: "org-b" }] });
  assert.equal((await other.execute("tunnelId=tunnel-a")).status, 404);
  assert.deepEqual(other.calls, []);
  for (const input of ["range=90d", "range=bogus", "limit=0", "limit=501", "limit=-1", "limit=1.5", "limit=bad"]) {
    const f = await fixture("requests");
    assert.equal((await f.execute(input)).status, 400);
    assert.deepEqual(f.calls, []);
  }
});

test("exact captures allow non-UUID IDs, decode JSON headers/base64 bodies, and bypass analytics cache", async () => {
  const f = await fixture("capture");
  const response = await f.execute({ tunnelId: "preview.example.com", timestamp: Date.parse("2026-10-09T12:00:00.000Z"), requestId: "not-a-uuid" });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.capture.request, { headers: { "content-type": "text/plain" }, body: "Hello 🚀", bodySize: 10 });
  assert.deepEqual(data.capture.response.headers, { "set-cookie": ["one", "two"] });
  assert.equal(f.calls[0].parameters.organization_id, "org-a");
  assert.equal(f.calls[0].parameters.request_id, "not-a-uuid");
  assert.equal(f.calls[0].parameters.timestamp, "2026-10-09T12:00:00.000Z");
  assert.deepEqual({ ...(f.calls[0].options as object) }, { cache: "no-store", maximumResponseBytes: 4_194_304 });
  assert.deepEqual(JSON.parse(JSON.stringify(f.predicates[0])), { and: [ { column: "organization_id", value: "org-a" }, { or: [{ column: "id", value: "preview.example.com" }, { column: "name", value: "preview.example.com" }, { column: "url", value: "https://preview.example.com" }, { column: "url", value: "http://preview.example.com" }] }] });
});

test("legacy capture fallback is within 30 seconds and retained captures survive tunnel removal", async () => {
  const f = await fixture("capture", { tunnels: [] });
  assert.equal((await f.execute({ tunnelId: "old-name", timestamp: "2026-10-09T12:00:00.000Z" })).status, 200);
  assert.equal(f.calls[0].parameters.start, "2026-10-09T11:59:30.000Z");
  assert.equal(f.calls[0].parameters.end, "2026-10-09T12:00:30.000Z");
  assert.equal(f.calls[0].parameters.request_id, undefined);
  assert.equal(f.calls[0].parameters.tunnel_ids, '["old-name"]');
});

test("capture missing data and malformed inputs are distinct from provider failure", async () => {
  const empty = await fixture("capture", { rows: [] });
  assert.equal((await empty.execute({ tunnelId: "tunnel-a", timestamp: boundary.toISOString() })).status, 404);
  for (const input of [{}, { tunnelId: "a", timestamp: "invalid" }, { tunnelId: "a", timestamp: [] }, { tunnelId: "a", timestamp: boundary.toISOString(), requestId: {} }]) {
    const f = await fixture("capture");
    assert.equal((await f.execute(input)).status, 400);
    assert.deepEqual(f.calls, []);
  }
  const broken = await fixture("capture", { failure: true });
  const response = await broken.execute({ tunnelId: "tunnel-a", timestamp: boundary.toISOString() });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Failed to fetch request capture" });
});

test("sparse chart filling uses UTC buckets and preserves counts, averages and the partial first/last buckets", () => {
  const start = new Date("2026-10-09T12:34:56.000Z");
  const end = new Date("2026-10-09T14:34:56.000Z");
  assert.equal(tunnelBucketSeconds("1 hour"), 3_600);
  assert.throws(() => tunnelBucketSeconds("bogus"));
  assert.deepEqual(fillTunnelBuckets([{ time: "2026-10-09 13:00:00.000", requests: 2, duration: 13 }], start, end, 3_600, (time) => ({ time, requests: 0, duration: 0 })), [
    { time: "2026-10-09T12:00:00.000Z", requests: 0, duration: 0 },
    { time: "2026-10-09T13:00:00.000Z", requests: 2, duration: 13 },
    { time: "2026-10-09T14:00:00.000Z", requests: 0, duration: 0 },
  ]);
});

test("captured headers reject malformed or unexpected shapes rather than breaking the inspector", () => {
  for (const request_headers of ["{broken", "null", "[]", '{"header":{}}', '{"header":["ok",1]}']) {
    assert.throws(() => serializeTunnelCapture({ ...capture, request_headers }));
  }
  assert.deepEqual(serializeTunnelCapture({ ...capture, request_headers: {}, response_headers: {} }).request.headers, {});
});

test("UInt64 request measurements and capture sizes are JSON numbers, while invalid measurements become zero", async () => {
  const f = await fixture("requests", { rows: [{ timestamp: "2026-10-09 12:00:00.000", status_code: "200", request_duration_ms: "12.5", bytes_in: "100", bytes_out: "200", size: "300" }] });
  const response = await f.execute();
  const { requests } = await response.json();
  assert.deepEqual(requests[0], { timestamp: "2026-10-09T12:00:00.000Z", status_code: 200, request_duration_ms: 12.5, bytes_in: 100, bytes_out: 200, size: 300 });
  const sized = await fixture("capture", { rows: [{ ...capture, request_body_size: "10", response_body_size: "2" }] });
  const captured = await (await sized.execute({ tunnelId: "tunnel-a", timestamp: boundary.toISOString() })).json();
  assert.equal(captured.capture.request.bodySize, 10);
  assert.equal(captured.capture.response.bodySize, 2);
  const bad = normalizeTunnelRequest({ timestamp: boundary.toISOString(), status_code: "invalid", request_duration_ms: Infinity, bytes_in: "NaN", bytes_out: undefined, size: "bad" });
  for (const value of [bad.status_code, bad.request_duration_ms, bad.bytes_in, bad.bytes_out, bad.size]) assert.equal(value, 0);
  assert.equal(normalizeTunnelRequest({ timestamp: boundary.toISOString(), bytes_in: "10", bytes_out: "2" }).size, 12);
  const badSizes = serializeTunnelCapture({ ...capture, request_body_size: "invalid", response_body_size: Infinity });
  assert.equal(badSizes.request.bodySize, 0);
  assert.equal(badSizes.response.bodySize, 0);
});
