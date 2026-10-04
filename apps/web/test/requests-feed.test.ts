import assert from "node:assert/strict";
import test from "node:test";
import {
  createLiveRequestsState,
  filterRequests,
  historicalRequestsReducer,
  liveRequestsReducer,
  mergeRequests,
  normalizeRequests,
  REQUESTS_LIMIT,
  type HistoricalRequestsState,
} from "../src/components/requests/requests-feed-state";
import type { TunnelEvent } from "../src/components/requests/types";

function request(index: number, overrides: Partial<TunnelEvent> = {}): TunnelEvent {
  return {
    request_id: `request-${index}`,
    timestamp: 1_800_000_000_000 + index,
    tunnel_id: "tunnel-a",
    organization_id: "org-a",
    host: "app.outray.dev",
    method: "GET",
    path: `/requests/${index}`,
    status_code: 200,
    request_duration_ms: 12,
    bytes_in: 0,
    bytes_out: 128,
    client_ip: "127.0.0.1",
    user_agent: "test",
    ...overrides,
  };
}

test("wire events normalize ISO and numeric timestamps and numeric database fields", () => {
  const [normalized] = normalizeRequests(
    [{
      ...request(1),
      timestamp: "2026-10-04T10:30:00.000Z",
      status_code: "201",
      request_duration_ms: "12.4",
      bytes_out: "1024",
    }],
    { orgId: "org-a" },
  );
  assert.equal(normalized.timestamp, Date.parse("2026-10-04T10:30:00.000Z"));
  assert.equal(normalized.status_code, 201);
  assert.equal(normalized.request_duration_ms, 12.4);
  assert.equal(normalized.bytes_out, 1024);
  assert.equal(
    normalizeRequests([{ ...request(2), timestamp: "1800000000002" }], {})[0].timestamp,
    1_800_000_000_002,
  );
});

test("live scope filtering excludes other tenants/tunnels and rejects malformed events", () => {
  const events = [
    request(1),
    request(2, { tunnel_id: "tunnel-b" }),
    request(3, { organization_id: "org-b" }),
    { ...request(4), timestamp: "not a date" },
    { ...request(5), timestamp: 1e20 },
    { ...request(6), method: null },
    null,
  ];
  assert.deepEqual(
    normalizeRequests(events, { orgId: "org-a", tunnelId: "tunnel-a" }).map((event) => event.request_id),
    ["request-1"],
  );
  assert.deepEqual(normalizeRequests({ data: events }, {}), []);
});

test("the buffer contains only the newest 100 unique requests", () => {
  const events = Array.from({ length: REQUESTS_LIMIT + 10 }, (_, index) => request(index));
  const merged = mergeRequests(events, [request(109), request(110)]);
  assert.equal(merged.length, REQUESTS_LIMIT);
  assert.equal(merged[0].request_id, "request-110");
  assert.equal(merged.at(-1)?.request_id, "request-11");
});

test("metadata-only concurrent requests preserve distinct and identical occurrences", () => {
  const first = request(1, { request_id: undefined, request_duration_ms: 1, bytes_out: 10 });
  const second = request(1, { request_id: undefined, request_duration_ms: 2, bytes_out: 20 });
  const identical = { ...first };
  const normalized = normalizeRequests([first, second, identical], { orgId: "org-a" });
  assert.equal(normalized.length, 3);
  const logs = mergeRequests([first], [second, identical], "log");
  assert.equal(logs.length, 3);
  // A reconnect snapshot does not duplicate the existing occurrences.
  assert.equal(mergeRequests(logs, normalized, "history").length, 3);
  // An extra identical occurrence in history is not lost either.
  assert.equal(mergeRequests(logs, [...normalized, { ...first }], "history").length, 4);
});

test("paused metadata-only logs count every occurrence, but ID-backed duplicates count once", () => {
  let state = createLiveRequestsState("org-a:tunnel-a");
  state = liveRequestsReducer(state, { type: "pause", scopeKey: state.scopeKey });
  const metadata = request(1, { request_id: undefined });
  for (const event of [{ ...metadata }, { ...metadata }, request(2), request(2)]) {
    state = liveRequestsReducer(state, { type: "receive", scopeKey: state.scopeKey, mode: "log", requests: [event] });
  }
  assert.equal(state.requests.length, 3);
  assert.equal(state.pendingCount, 3);
});

test("live search matches path, method and host without mutating the buffer", () => {
  const events = [request(1), request(2, { method: "POST", path: "/checkout", host: "shop.example.com" })];
  assert.equal(filterRequests(events, " post ")[0].path, "/checkout");
  assert.equal(filterRequests(events, "CHECKOUT").length, 1);
  assert.equal(filterRequests(events, "shop.example").length, 1);
  assert.equal(filterRequests(events, "missing").length, 0);
  assert.deepEqual(filterRequests(events, ""), events);
  assert.equal(events.length, 2);
});

test("pause freezes displayed rows while receiving and counting unique updates", () => {
  let state = createLiveRequestsState("org-a:tunnel-a");
  state = liveRequestsReducer(state, { type: "receive", scopeKey: state.scopeKey, requests: [request(1)] });
  state = liveRequestsReducer(state, { type: "pause", scopeKey: state.scopeKey });
  state = liveRequestsReducer(state, { type: "receive", scopeKey: state.scopeKey, requests: [request(2)] });
  state = liveRequestsReducer(state, { type: "receive", scopeKey: state.scopeKey, requests: [request(2)] });
  assert.equal(state.frozenRequests?.length, 1);
  assert.equal(state.frozenRequests?.[0].request_id, "request-1");
  assert.equal(state.requests.length, 2);
  assert.equal(state.pendingCount, 1);
  state = liveRequestsReducer(state, { type: "resume", scopeKey: state.scopeKey });
  assert.equal(state.frozenRequests, null);
  assert.equal(state.pendingCount, 0);
  assert.equal(state.requests[0].request_id, "request-2");
});

test("tenant changes reset live rows and ignore late socket updates and errors", () => {
  let state = createLiveRequestsState("org-a:tunnel-a");
  state = liveRequestsReducer(state, { type: "receive", scopeKey: state.scopeKey, requests: [request(1)] });
  state = liveRequestsReducer(state, { type: "start", scopeKey: "org-b:tunnel-b" });
  assert.equal(state.requests.length, 0);
  const fresh = state;
  state = liveRequestsReducer(state, { type: "receive", scopeKey: "org-a:tunnel-a", requests: [request(2)] });
  state = liveRequestsReducer(state, { type: "connection", scopeKey: "org-a:tunnel-a", connection: "disconnected", error: "old error" });
  assert.equal(state, fresh);
});

test("reconnect handshakes merge history without dropping previously buffered requests", () => {
  let state = createLiveRequestsState("org-a:tunnel-a");
  state = liveRequestsReducer(state, { type: "receive", scopeKey: state.scopeKey, requests: [request(1), request(2)] });
  state = liveRequestsReducer(state, { type: "start", scopeKey: state.scopeKey });
  state = liveRequestsReducer(state, { type: "receive", scopeKey: state.scopeKey, requests: [request(2), request(3)] });
  assert.deepEqual(state.requests.map((event) => event.request_id), ["request-3", "request-2", "request-1"]);
});

function historicalState(): HistoricalRequestsState {
  return {
    key: "org-a:1h:old-search",
    scopeKey: "org-a:tunnel-a:1h",
    requests: [request(1)],
    loading: false,
    error: null,
  };
}

test("historical search/retry retains same-scope rows while updating", () => {
  const updating = historicalRequestsReducer(historicalState(), {
    type: "start",
    key: "org-a:1h:new-search",
    scopeKey: "org-a:tunnel-a:1h",
  });
  assert.equal(updating.requests[0].request_id, "request-1");
  assert.equal(updating.loading, true);
  const failed = historicalRequestsReducer(updating, {
    type: "error",
    key: updating.key,
    error: "Request failed",
  });
  assert.equal(failed.requests.length, 1);
  assert.equal(failed.loading, false);
  assert.equal(failed.error, "Request failed");
});

test("historical tenant/tunnel/range changes never retain old rows", () => {
  for (const scopeKey of ["org-b:tunnel-a:1h", "org-a:tunnel-b:1h", "org-a:tunnel-a:24h"]) {
    const next = historicalRequestsReducer(historicalState(), { type: "start", key: scopeKey, scopeKey });
    assert.equal(next.requests.length, 0);
    assert.equal(next.loading, true);
  }
});

test("stale historical successes and errors cannot replace the current search", () => {
  const next = historicalRequestsReducer(historicalState(), {
    type: "start",
    key: "org-a:1h:new-search",
    scopeKey: "org-a:tunnel-a:1h",
  });
  assert.equal(historicalRequestsReducer(next, { type: "success", key: "org-a:1h:old-search", requests: [request(2)] }), next);
  assert.equal(historicalRequestsReducer(next, { type: "error", key: "org-a:1h:old-search", error: "old error" }), next);
  const loaded = historicalRequestsReducer(next, { type: "success", key: next.key, requests: [request(3)] });
  assert.equal(loaded.requests[0].request_id, "request-3");
  assert.equal(loaded.loading, false);
});
