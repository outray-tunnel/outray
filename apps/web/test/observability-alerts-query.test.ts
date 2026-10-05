import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { observabilityAlertsQuery } from "../src/components/observability/alerts-query";
import { alertsSnapshot } from "./fixtures/observability-alert";

test("alerts query encodes org, requests all rules and supplies abort cancellation", async (t) => {
  let url = ""; let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => { url = input; signal = init.signal as AbortSignal; return Response.json(alertsSnapshot); });
  const client = new QueryClient();
  try {
    const options = observabilityAlertsQuery("acme/team");
    const data = await client.fetchQuery(options);
    assert.equal(url, "/api/acme%2Fteam/observability/alerts"); assert.ok(signal instanceof AbortSignal);
    assert.deepEqual(options.queryKey, ["observability", "alerts", "acme/team"]);
    assert.deepEqual(data.alerts, alertsSnapshot.alerts); assert.ok(data.receivedAt > 0);
  } finally { client.clear(); }
});

test("alerts poll every 10 seconds only while visible and on focus/reconnect without cross-org placeholders", () => {
  const options = observabilityAlertsQuery("acme");
  assert.equal(options.refetchInterval, 10_000); assert.equal(options.refetchIntervalInBackground, false);
  assert.equal(options.refetchOnWindowFocus, true); assert.equal(options.refetchOnReconnect, true);
  assert.equal(options.retry, false); assert.equal(observabilityAlertsQuery("").enabled, false);
  assert.notDeepEqual(options.queryKey, observabilityAlertsQuery("other").queryKey);
  assert.equal((options as unknown as Record<string, unknown>).placeholderData, undefined);
});

test("a failed background refresh retains last successful rule data and reports error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("failed", { status: 503 }));
  const client = new QueryClient(); const options = observabilityAlertsQuery("acme");
  client.setQueryData(options.queryKey, alertsSnapshot);
  try {
    await assert.rejects(client.fetchQuery(options), /Alert rules are temporarily unavailable/);
    assert.deepEqual(client.getQueryData(options.queryKey), alertsSnapshot); assert.equal(client.getQueryState(options.queryKey)?.status, "error");
  } finally { client.clear(); }
});

test("HTML and malformed responses never become successful empty rules", async (t) => {
  const client = new QueryClient();
  try {
    for (const data of [null, {}, { ...alertsSnapshot, alerts: [null] }, { ...alertsSnapshot, alerts: [{}] }, { ...alertsSnapshot, summary: {} }, { ...alertsSnapshot, services: [false] }, { ...alertsSnapshot, integrationAvailability: {} }]) {
      t.mock.method(globalThis, "fetch", async () => Response.json(data));
      await assert.rejects(client.fetchQuery(observabilityAlertsQuery("acme")), /Alert rules are temporarily unavailable/);
    }
    t.mock.method(globalThis, "fetch", async () => new Response("<!DOCTYPE html>"));
    await assert.rejects(client.fetchQuery(observabilityAlertsQuery("acme")), /Alert rules are temporarily unavailable/);
  } finally { client.clear(); }
});

test("unsubscribing an old workspace request aborts it and rejects late JSON", async (t) => {
  let signal: AbortSignal | undefined; let finish!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", (_input: string, init: RequestInit) => { signal = init.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; }); });
  const client = new QueryClient(); const options = observabilityAlertsQuery("acme"); const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  assert.ok(signal instanceof AbortSignal); unsubscribe(); assert.equal(signal.aborted, true);
  finish(Response.json(alertsSnapshot)); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(client.getQueryData(options.queryKey), undefined); client.clear();
});
