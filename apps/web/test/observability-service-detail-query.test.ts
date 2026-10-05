import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { observabilityServiceDetailQuery } from "../src/components/observability/service-detail-query";

const response = { services: [], traffic: [], range: "6h" };

test("service detail query encodes its organization and service filter with cancellation", async (t) => {
  let requestUrl = "";
  let requestSignal: AbortSignal | undefined;
  const serviceId = "payments/worker ? + &";
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requestUrl = url;
    requestSignal = options.signal as AbortSignal;
    return Response.json(response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const before = Date.now();
    const data = await client.fetchQuery(observabilityServiceDetailQuery("acme/team", serviceId, "6h"));
    const url = new URL(requestUrl, "https://local.test");
    assert.equal(url.pathname, "/api/acme%2Fteam/observability/services");
    assert.equal(url.searchParams.get("service"), serviceId);
    assert.equal(url.searchParams.get("range"), "6h");
    assert.ok(requestSignal instanceof AbortSignal);
    assert.deepEqual(data.services, []);
    assert.ok(data.receivedAt >= before && data.receivedAt <= Date.now());
    assert.equal(client.getQueryData(["observability", "service-detail", "other-team", serviceId, "6h"]), undefined);
  } finally { client.clear(); }
});

test("failed service detail cannot become an empty successful response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const options = observabilityServiceDetailQuery("acme", "payments-worker", "24h");
    await assert.rejects(client.fetchQuery(options), /Service telemetry is temporarily unavailable/);
    assert.equal(client.getQueryData(options.queryKey), undefined);
  } finally { client.clear(); }
});

test("failed refetch retains the last successful service snapshot", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = observabilityServiceDetailQuery("acme", "payments-worker", "6h");
  const previous = { ...response, receivedAt: 1234 };
  client.setQueryData(options.queryKey, previous);
  try {
    await assert.rejects(client.fetchQuery(options), /Service telemetry is temporarily unavailable/);
    assert.deepEqual(client.getQueryData(options.queryKey), previous);
    assert.equal(client.getQueryState(options.queryKey)?.status, "error");
  } finally { client.clear(); }
});

test("range transitions retain prior evidence only for the same organization and service", () => {
  const client = new QueryClient();
  const data = { ...response, receivedAt: 1234 };
  const previous = observabilityServiceDetailQuery("acme", "payments-worker", "6h");
  client.setQueryData(previous.queryKey, data);
  const previousQuery = client.getQueryCache().find({ queryKey: previous.queryKey });
  const placeholder = observabilityServiceDetailQuery("acme", "payments-worker", "7d").placeholderData!;
  assert.equal(placeholder(data, previousQuery as any), data);
  assert.equal(placeholder(data, undefined), undefined);
  assert.equal(observabilityServiceDetailQuery("other-team", "payments-worker", "7d").placeholderData!(data, previousQuery as any), undefined);
  assert.equal(observabilityServiceDetailQuery("acme", "other-worker", "7d").placeholderData!(data, previousQuery as any), undefined);
  client.clear();
});

test("service detail refreshes every thirty visible seconds and on focus with a scoped key", () => {
  const options = observabilityServiceDetailQuery("acme", "payments-worker", "24h");
  assert.deepEqual(options.queryKey, ["observability", "service-detail", "acme", "payments-worker", "24h"]);
  assert.equal(options.refetchInterval, 30_000);
  assert.equal(options.refetchIntervalInBackground, false);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(observabilityServiceDetailQuery("", "payments-worker", "24h").enabled, false);
  assert.equal(observabilityServiceDetailQuery("acme", "", "24h").enabled, false);
});
