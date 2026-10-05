import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { fetchTraceDetails, observabilityTracesQuery } from "../src/components/observability/traces-query";
import type { TraceSpan, TracesResponse, TracesSnapshot } from "../src/components/observability/traces-data";

const response: TracesResponse = {
  traces: [], statistics: { totalTraces: 100, errorTraces: 2, errorRate: 2, p95Duration: 500, longestDuration: 900 },
  distribution: [{ bucket: "100-250", count: 100 }], range: "6h",
};
const prior: TracesSnapshot = { ...response, requestedSearch: { search: "payment", errorsOnly: true, range: "6h" }, receivedAt: 100 };
const span: TraceSpan = {
  id: "span-a", parentId: null, name: "POST /payment", service: "api", startedAt: "2026-10-05 12:30:00",
  duration: 42, offset: 0, status: "error", kind: 2, statusMessage: "Failed",
  attributes: { "http.method": "POST" }, resourceAttributes: { "host.name": "edge" },
  events: [{ name: "exception", timeUnixNano: "123", attributes: { message: "failed" } }], links: [{ traceId: "other" }],
};

test("trace query encodes tenant/search and requests server-side errors with cancellation and provenance", async (t) => {
  let requestUrl = "";
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requestUrl = url; signal = options.signal as AbortSignal;
    return Response.json(response);
  });
  const client = new QueryClient();
  try {
    const options = observabilityTracesQuery("acme/team", { search: "payment?&=trace", errorsOnly: true, range: "6h" }, true);
    const before = Date.now();
    const data = await client.fetchQuery(options);
    const url = new URL(requestUrl, "https://local.test");
    assert.equal(url.pathname, "/api/acme%2Fteam/observability/traces");
    assert.equal(url.searchParams.get("search"), "payment?&=trace");
    assert.equal(url.searchParams.get("errorsOnly"), "true");
    assert.equal(url.searchParams.get("range"), "6h");
    assert.equal(url.searchParams.get("limit"), "100");
    assert.ok(signal instanceof AbortSignal);
    assert.deepEqual(options.queryKey, ["observability", "traces", "acme/team", "payment?&=trace", true, "6h"]);
    assert.deepEqual(data.requestedSearch, { search: "payment?&=trace", errorsOnly: true, range: "6h" });
    assert.ok(data.receivedAt >= before && data.receivedAt <= Date.now());
    // Aggregate counts are retained as the all-traces period values from the API.
    assert.equal(data.statistics.totalTraces, 100);
  } finally { client.clear(); }
});

test("default query normalizes omitted or invalid direct-link filters and never sends errorsOnly=false", async (t) => {
  let requestUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string) => { requestUrl = url; return Response.json(response); });
  const client = new QueryClient();
  try {
    const options = observabilityTracesQuery("acme", { search: " ", errorsOnly: false }, false);
    const data = await client.fetchQuery(options);
    assert.deepEqual(options.queryKey, ["observability", "traces", "acme", null, false, "1h"]);
    assert.equal(new URL(requestUrl, "https://local.test").search, "?range=1h&limit=100");
    assert.deepEqual(data.requestedSearch, { range: "1h" });
  } finally { client.clear(); }
});

test("failures are errors rather than successful empty traces or automatic retries", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => { attempts++; return new Response("unavailable", { status: 503 }); });
  const client = new QueryClient();
  try {
    const options = observabilityTracesQuery("acme", { range: "6h" }, true);
    await assert.rejects(client.fetchQuery(options), /Trace data is temporarily unavailable/);
    assert.equal(client.getQueryData(options.queryKey), undefined);
    assert.equal(attempts, 1);
  } finally { client.clear(); }
});

test("a failed refresh preserves prior successful evidence and original selection", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const client = new QueryClient();
  const options = observabilityTracesQuery("acme", prior.requestedSearch, true);
  client.setQueryData(options.queryKey, prior);
  try {
    await assert.rejects(client.fetchQuery(options), /Trace data is temporarily unavailable/);
    assert.deepEqual(client.getQueryData(options.queryKey), prior);
    assert.equal(client.getQueryState(options.queryKey)?.status, "error");
  } finally { client.clear(); }
});

test("previous trace filters retain evidence only inside the same organization", () => {
  const client = new QueryClient();
  const first = observabilityTracesQuery("acme", prior.requestedSearch, true);
  client.setQueryData(first.queryKey, prior);
  const previousQuery = client.getQueryCache().find({ queryKey: first.queryKey });
  const next = observabilityTracesQuery("acme", { search: "users", range: "7d" }, true);
  assert.equal(next.placeholderData!(prior, previousQuery as never), prior);
  assert.equal(next.placeholderData!(prior, undefined), undefined);
  assert.equal(observabilityTracesQuery("other", { range: "7d" }, true).placeholderData!(prior, previousQuery as never), undefined);
  assert.equal(prior.requestedSearch.search, "payment");
  client.clear();
});

test("live traces poll every four seconds only while visible; pause disables all automatic refresh", () => {
  const live = observabilityTracesQuery("acme", { range: "24h" }, true);
  assert.equal(live.refetchInterval, 4_000);
  assert.equal(live.refetchIntervalInBackground, false);
  assert.equal(live.refetchOnWindowFocus, true);
  assert.equal(live.refetchOnReconnect, true);
  const paused = observabilityTracesQuery("acme", { range: "24h" }, false);
  assert.equal(paused.refetchInterval, false);
  assert.equal(paused.refetchOnWindowFocus, false);
  assert.equal(paused.refetchOnReconnect, false);
  assert.equal(observabilityTracesQuery("", { range: "24h" }, true).enabled, false);
});

test("query unsubscription cancels pending trace requests without caching late results", async (t) => {
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, options: RequestInit) => {
    signal = options.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const client = new QueryClient();
  const options = observabilityTracesQuery("acme", {}, true);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  assert.ok(signal instanceof AbortSignal);
  unsubscribe();
  assert.equal(signal.aborted, true);
  assert.equal(client.getQueryData(options.queryKey), undefined);
  client.clear();
});

test("malformed list response rejects rather than turning a failed endpoint into zero traces", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ traces: [], distribution: [] }));
  const client = new QueryClient();
  try {
    await assert.rejects(client.fetchQuery(observabilityTracesQuery("acme", {}, false)), /Trace data is temporarily unavailable/);
    for (const malformed of [
      { ...response, traces: [null] }, { ...response, traces: [{}] },
      { ...response, statistics: [] }, { ...response, distribution: [null] },
    ]) {
      t.mock.method(globalThis, "fetch", async () => Response.json(malformed));
      await assert.rejects(client.fetchQuery(observabilityTracesQuery("acme", {}, false)), /Trace data is temporarily unavailable/);
    }
    t.mock.method(globalThis, "fetch", async () => new Response("<!DOCTYPE html>"));
    await assert.rejects(client.fetchQuery(observabilityTracesQuery("acme", {}, false)), /Trace data is temporarily unavailable/);
  } finally { client.clear(); }
});

test("detail fetch encodes organization and trace identity, passes cancellation, and preserves complete spans", async (t) => {
  const controller = new AbortController();
  let requestUrl = "";
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requestUrl = url; signal = options.signal as AbortSignal;
    return Response.json({ traceId: "trace/a & b", spans: [span] });
  });
  const data = await fetchTraceDetails("acme/team", "trace/a & b", controller.signal);
  assert.equal(requestUrl, "/api/acme%2Fteam/observability/traces/trace%2Fa%20%26%20b");
  assert.equal(signal, controller.signal);
  assert.deepEqual(data.spans, [span]);
  assert.equal(data.spans[0].statusMessage, "Failed");
  assert.equal(data.spans[0].events.length, 1);
});

test("missing and failed details are explicit errors with no made-up summary span fallback", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  await assert.rejects(fetchTraceDetails("acme", "trace-a"), /This trace is no longer available/);
  t.mock.method(globalThis, "fetch", async () => new Response("failed", { status: 503 }));
  await assert.rejects(fetchTraceDetails("acme", "trace-a"), /Trace details are temporarily unavailable/);
});

test("mismatched trace identity, malformed detail shape, and HTML responses cannot replace the selected trace", async (t) => {
  for (const data of [
    { traceId: "wrong-trace", spans: [span] }, { traceId: "trace-a", spans: {} }, null,
    ...[null, "span", {}, { ...span, id: null }, { ...span, duration: "42" }, { ...span, events: {} }, { ...span, resourceAttributes: [] }]
      .map((item) => ({ traceId: "trace-a", spans: [item] })),
  ]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(data));
    await assert.rejects(fetchTraceDetails("acme", "trace-a"), /Trace details are temporarily unavailable/);
  }
  t.mock.method(globalThis, "fetch", async () => new Response("<!DOCTYPE html>"));
  await assert.rejects(fetchTraceDetails("acme", "trace-a"), /Trace details are temporarily unavailable/);
});

test("detail cancellation rejects even when the network or JSON decoder resolves late", async (t) => {
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return Response.json({ traceId: "trace-a", spans: [span] }); });
  await assert.rejects(fetchTraceDetails("acme", "trace-a", alreadyAborted.signal), { name: "AbortError" });
  assert.equal(requests, 0);

  const networkAbort = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    networkAbort.abort();
    return Response.json({ traceId: "trace-a", spans: [span] });
  });
  await assert.rejects(fetchTraceDetails("acme", "trace-a", networkAbort.signal), { name: "AbortError" });

  const jsonAbort = new AbortController();
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, json: async () => {
    jsonAbort.abort(); return { traceId: "trace-a", spans: [span] };
  } }));
  await assert.rejects(fetchTraceDetails("acme", "trace-a", jsonAbort.signal), { name: "AbortError" });
});
