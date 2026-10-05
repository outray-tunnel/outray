import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { observabilityOverviewQuery } from "../src/components/observability/overview-query";

const response = {
  services: [], traffic: [], range: "24h",
  summary: { serviceCount: 0, totalOperations: 0, totalErrors: 0, errorRate: 0, operationsPerMinute: 0, attentionCount: 0 },
};

test("overview query requests the selected organization and range with cancellation", async (t) => {
  let requestUrl = "";
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requestUrl = url;
    requestSignal = options.signal as AbortSignal;
    return Response.json(response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const before = Date.now();
    const data = await client.fetchQuery(observabilityOverviewQuery("acme", "7d"));
    assert.equal(requestUrl, "/api/acme/observability/services?range=7d");
    assert.ok(requestSignal instanceof AbortSignal);
    assert.deepEqual(data.services, []);
    assert.ok(data.receivedAt >= before && data.receivedAt <= Date.now());
    assert.equal(client.getQueryData(["observability", "overview", "other-team", "7d"]), undefined);
  } finally { client.clear(); }
});

test("failed telemetry cannot be confused with an empty successful response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("upstream unavailable", { status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await assert.rejects(client.fetchQuery(observabilityOverviewQuery("acme", "24h")), /Service telemetry is temporarily unavailable/);
    assert.equal(client.getQueryData(["observability", "overview", "acme", "24h"]), undefined);
  } finally { client.clear(); }
});

test("range changes retain only the same organization's snapshot", () => {
  const client = new QueryClient();
  const data = { ...response, receivedAt: 1234 };
  const previous = observabilityOverviewQuery("acme", "24h");
  client.setQueryData(previous.queryKey, data);
  const previousQuery = client.getQueryCache().find({ queryKey: previous.queryKey });
  const sameTeam = observabilityOverviewQuery("acme", "7d").placeholderData!;
  const otherTeam = observabilityOverviewQuery("other-team", "7d").placeholderData!;
  assert.equal(sameTeam(data, previousQuery as any), data);
  assert.equal(otherTeam(data, previousQuery as any), undefined);
  assert.equal(sameTeam(data, undefined), undefined);
  client.clear();
});

test("overview refreshes quietly while visible and on focus, not every five seconds", () => {
  const options = observabilityOverviewQuery("acme", "24h");
  assert.equal(options.refetchInterval, 30_000);
  assert.equal(options.refetchIntervalInBackground, false);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.deepEqual(options.queryKey, ["observability", "overview", "acme", "24h"]);
  assert.equal(observabilityOverviewQuery("", "24h").enabled, false);
});
