import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { observabilityMetricsQuery } from "../src/components/observability/metrics-query";
import type { MetricsSnapshot } from "../src/components/observability/metrics-data";

const response = { metrics: [], selectedMetric: null, services: [], points: [], breakdown: [], range: "6h" };
const prior: MetricsSnapshot = { ...response, requestedRange: "6h", requestedMetricKey: "duration", requestedService: "api", receivedAt: 100 };

test("metrics query safely encodes filters and records the request provenance with cancellation", async (t) => {
  let requestUrl = "";
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requestUrl = url; requestSignal = options.signal as AbortSignal;
    return Response.json(response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const before = Date.now();
    const data = await client.fetchQuery(observabilityMetricsQuery("acme/team", { metric: "duration?&=type", service: "api/worker + &", range: "6h" }, true));
    const url = new URL(requestUrl, "https://local.test");
    assert.equal(url.pathname, "/api/acme%2Fteam/observability/metrics");
    assert.equal(url.searchParams.get("metric_key"), "duration?&=type");
    assert.equal(url.searchParams.get("service"), "api/worker + &");
    assert.equal(url.searchParams.get("range"), "6h");
    assert.ok(requestSignal instanceof AbortSignal);
    assert.equal(data.requestedMetricKey, "duration?&=type");
    assert.equal(data.requestedService, "api/worker + &");
    assert.equal(data.requestedRange, "6h");
    assert.ok(data.receivedAt >= before && data.receivedAt <= Date.now());
    assert.equal(client.getQueryData(["observability", "metrics", "other", "duration?&=type", "api/worker + &", "6h"]), undefined);
  } finally { client.clear(); }
});

test("default metrics query omits empty metric and all-service parameters", async (t) => {
  let requestUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string) => { requestUrl = url; return Response.json(response); });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const options = observabilityMetricsQuery("acme", { metric: " ", service: "all", range: "1h" }, false);
    const data = await client.fetchQuery(options);
    assert.deepEqual(options.queryKey, ["observability", "metrics", "acme", null, null, "1h"]);
    const url = new URL(requestUrl, "https://local.test");
    assert.equal(url.search, "?range=1h");
    assert.equal(data.requestedMetricKey, undefined);
    assert.equal(data.requestedService, undefined);
  } finally { client.clear(); }
});

test("failed metrics requests are errors, not empty successful data", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const options = observabilityMetricsQuery("acme", { range: "6h" }, true);
    await assert.rejects(client.fetchQuery(options), /Metric data is temporarily unavailable/);
    assert.equal(client.getQueryData(options.queryKey), undefined);
  } finally { client.clear(); }
});

test("failed refresh preserves its last successful metric snapshot", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = observabilityMetricsQuery("acme", { metric: "duration", service: "api", range: "6h" }, true);
  client.setQueryData(options.queryKey, prior);
  try {
    await assert.rejects(client.fetchQuery(options), /Metric data is temporarily unavailable/);
    assert.deepEqual(client.getQueryData(options.queryKey), prior);
    assert.equal(client.getQueryState(options.queryKey)?.status, "error");
  } finally { client.clear(); }
});

test("selection changes keep prior evidence and its original labels only within one tenant", () => {
  const client = new QueryClient();
  const first = observabilityMetricsQuery("acme", { metric: "duration", service: "api", range: "6h" }, true);
  client.setQueryData(first.queryKey, prior);
  const previousQuery = client.getQueryCache().find({ queryKey: first.queryKey });
  const next = observabilityMetricsQuery("acme", { metric: "bytes", service: "worker", range: "7d" }, true);
  const placeholder = next.placeholderData!;
  assert.equal(placeholder(prior, previousQuery as never), prior);
  assert.equal(placeholder(prior, undefined), undefined);
  assert.equal(observabilityMetricsQuery("other-team", { range: "7d" }, true).placeholderData!(prior, previousQuery as never), undefined);
  assert.equal(prior.requestedMetricKey, "duration");
  assert.equal(prior.requestedRange, "6h");
  client.clear();
});

test("metrics polling and focus refresh can be paused and never poll hidden tabs", () => {
  const live = observabilityMetricsQuery("acme", { range: "24h" }, true);
  assert.equal(live.refetchInterval, 4_000);
  assert.equal(live.refetchIntervalInBackground, false);
  assert.equal(live.refetchOnWindowFocus, true);
  assert.equal(live.refetchOnReconnect, true);
  const paused = observabilityMetricsQuery("acme", { range: "24h" }, false);
  assert.equal(paused.refetchInterval, false);
  assert.equal(paused.refetchOnWindowFocus, false);
  assert.equal(paused.refetchOnReconnect, false);
  assert.equal(observabilityMetricsQuery("", { range: "24h" }, true).enabled, false);
});

test("leaving the metric query aborts its in-flight request without exposing stale results", async (t) => {
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, options: RequestInit) => {
    requestSignal = options.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = observabilityMetricsQuery("acme", { range: "1h" }, true);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  assert.ok(requestSignal instanceof AbortSignal);
  unsubscribe();
  assert.equal(requestSignal.aborted, true);
  assert.equal(client.getQueryData(options.queryKey), undefined);
  client.clear();
});
