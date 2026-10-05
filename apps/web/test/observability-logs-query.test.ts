import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { observabilityLogsQuery } from "../src/components/observability/logs-query";
import type { LogsSnapshot } from "../src/components/observability/logs-data";

const response = { logs: [], services: ["api"], range: "6h" };
const prior: LogsSnapshot = { ...response, requestedSearch: { search: "payment", service: "api", level: "warn", range: "6h" }, receivedAt: 100 };

test("logs query encodes filters and tenant while passing cancellation and explicit request provenance", async (t) => {
  let requestUrl = "";
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requestUrl = url; requestSignal = options.signal as AbortSignal;
    return Response.json(response);
  });
  const client = new QueryClient();
  try {
    const before = Date.now();
    const data = await client.fetchQuery(observabilityLogsQuery("acme/team", { search: "payment?&=trace", service: "api/worker + &", level: "warn", range: "6h" }, true));
    const url = new URL(requestUrl, "https://local.test");
    assert.equal(url.pathname, "/api/acme%2Fteam/observability/logs");
    assert.equal(url.searchParams.get("search"), "payment?&=trace");
    assert.equal(url.searchParams.get("service"), "api/worker + &");
    assert.equal(url.searchParams.get("level"), "warn");
    assert.equal(url.searchParams.get("range"), "6h");
    assert.equal(url.searchParams.get("limit"), "250");
    assert.ok(requestSignal instanceof AbortSignal);
    assert.deepEqual(data.requestedSearch, { search: "payment?&=trace", service: "api/worker + &", level: "warn", range: "6h" });
    assert.ok(data.receivedAt >= before && data.receivedAt <= Date.now());
    assert.equal(client.getQueryData(["observability", "logs", "other", "payment?&=trace", "api/worker + &", "warn", "6h"]), undefined);
  } finally { client.clear(); }
});

test("default log query omits empty filters but permits a real service named all", async (t) => {
  let requestUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string) => { requestUrl = url; return Response.json(response); });
  const client = new QueryClient();
  try {
    const options = observabilityLogsQuery("acme", { search: " ", service: " ", range: "1h" }, false);
    const data = await client.fetchQuery(options);
    assert.deepEqual(options.queryKey, ["observability", "logs", "acme", null, null, null, "1h"]);
    assert.equal(new URL(requestUrl, "https://local.test").search, "?range=1h&limit=250");
    assert.deepEqual(data.requestedSearch, { range: "1h" });
    await client.fetchQuery(observabilityLogsQuery("acme", { service: "all", range: "1h" }, false));
    assert.equal(new URL(requestUrl, "https://local.test").searchParams.get("service"), "all");
  } finally { client.clear(); }
});

test("failed logs requests are errors, not successful empty data or retries", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => { attempts++; return new Response("unavailable", { status: 503 }); });
  const client = new QueryClient();
  try {
    const options = observabilityLogsQuery("acme", { range: "6h" }, true);
    await assert.rejects(client.fetchQuery(options), /Log data is temporarily unavailable/);
    assert.equal(client.getQueryData(options.queryKey), undefined);
    assert.equal(attempts, 1);
  } finally { client.clear(); }
});

test("failed refresh preserves the last successful logs and original provenance", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const client = new QueryClient();
  const options = observabilityLogsQuery("acme", prior.requestedSearch, true);
  client.setQueryData(options.queryKey, prior);
  try {
    await assert.rejects(client.fetchQuery(options), /Log data is temporarily unavailable/);
    assert.deepEqual(client.getQueryData(options.queryKey), prior);
    assert.equal(client.getQueryState(options.queryKey)?.status, "error");
  } finally { client.clear(); }
});

test("filter changes retain previous evidence only inside the same tenant", () => {
  const client = new QueryClient();
  const first = observabilityLogsQuery("acme", prior.requestedSearch, true);
  client.setQueryData(first.queryKey, prior);
  const previousQuery = client.getQueryCache().find({ queryKey: first.queryKey });
  const next = observabilityLogsQuery("acme", { search: "error", service: "worker", range: "7d" }, true);
  assert.equal(next.placeholderData!(prior, previousQuery as never), prior);
  assert.equal(next.placeholderData!(prior, undefined), undefined);
  assert.equal(observabilityLogsQuery("other-team", { range: "7d" }, true).placeholderData!(prior, previousQuery as never), undefined);
  assert.equal(prior.requestedSearch.search, "payment");
  assert.equal(prior.requestedSearch.range, "6h");
  client.clear();
});

test("live logs poll every four seconds only while visible and all automatic refresh can be paused", () => {
  const live = observabilityLogsQuery("acme", { range: "24h" }, true);
  assert.equal(live.refetchInterval, 4_000);
  assert.equal(live.refetchIntervalInBackground, false);
  assert.equal(live.refetchOnWindowFocus, true);
  assert.equal(live.refetchOnReconnect, true);
  const paused = observabilityLogsQuery("acme", { range: "24h" }, false);
  assert.equal(paused.refetchInterval, false);
  assert.equal(paused.refetchOnWindowFocus, false);
  assert.equal(paused.refetchOnReconnect, false);
  assert.equal(observabilityLogsQuery("", { range: "24h" }, true).enabled, false);
});

test("leaving the log query aborts pending requests without storing late results", async (t) => {
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, options: RequestInit) => {
    requestSignal = options.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const client = new QueryClient();
  const options = observabilityLogsQuery("acme", { range: "1h" }, true);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  assert.ok(requestSignal instanceof AbortSignal);
  unsubscribe();
  assert.equal(requestSignal.aborted, true);
  assert.equal(client.getQueryData(options.queryKey), undefined);
  client.clear();
});
