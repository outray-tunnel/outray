import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  filterServiceInventory,
  parseServiceLastSeen,
  serviceDisplayHealth,
  type ServiceInventoryItem,
} from "../src/components/observability/services-data";
import { observabilityServicesQuery } from "../src/components/observability/services-query";

function service(overrides: Partial<ServiceInventoryItem> = {}): ServiceInventoryItem {
  return {
    id: "api", name: "API", namespace: "checkout", version: "v2.3.0",
    environment: "production", region: "eu-west", lastSeen: "2026-10-05T10:00:00Z",
    operationCount: 10, errorCount: 0, errorRate: 0, p95Duration: 20,
    operationsPerMinute: 1, usesServerSpans: true, health: "healthy", ...overrides,
  };
}

test("only finite positive measured operations can establish service health", () => {
  for (const operationCount of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(serviceDisplayHealth(service({ operationCount, health: "critical" })), "unknown");
  }
  for (const health of ["healthy", "degraded", "critical"] as const) {
    assert.equal(serviceDisplayHealth(service({ health })), health);
  }
});

test("Tinybird service timestamps without a timezone are UTC with millisecond precision", () => {
  const expected = Date.UTC(2026, 9, 5, 12, 34, 56, 123);
  for (const value of [
    "2026-10-05 12:34:56.123456789",
    "2026-10-05T12:34:56.123",
    "  2026-10-05 12:34:56.123456789  ",
    "2026-10-05T12:34:56.123456789Z",
  ]) assert.equal(parseServiceLastSeen(value), expected);
  assert.equal(parseServiceLastSeen("2026-10-05 12:34:56"), Date.UTC(2026, 9, 5, 12, 34, 56));
  assert.equal(parseServiceLastSeen("2026-10-05T12:34:56.1"), Date.UTC(2026, 9, 5, 12, 34, 56, 100));
});

test("service timestamps honor explicit UTC and positive or negative offsets", () => {
  const expected = Date.UTC(2026, 9, 5, 12, 34, 56, 123);
  for (const value of [
    "2026-10-05T12:34:56.123z",
    "2026-10-05 13:34:56.123456789+01:00",
    "2026-10-05T13:34:56.123+0100",
    "2026-10-05T08:04:56.123-04:30",
    "2026-10-05 08:04:56.123-0430",
  ]) assert.equal(parseServiceLastSeen(value), expected);
});

test("invalid service timestamps stay missing rather than becoming plausible dates", () => {
  for (const value of [
    "", "   ", "not a timestamp", "2026-10-05", "2026-02-30 12:34:56",
    "2026-02-29T12:34:56Z", "2026-13-05 12:34:56", "2026-10-05T24:00:00Z",
    "2026-10-05 12:60:00", "2026-10-05 12:34:56+25:00", "2026-10-05 12:34:56+01:60",
    "2026-10-05 12:34:56 trailing text",
  ]) assert.ok(Number.isNaN(parseServiceLastSeen(value)), value);
  assert.equal(parseServiceLastSeen("2024-02-29 12:34:56"), Date.UTC(2024, 1, 29, 12, 34, 56));
});

test("inventory search trims and matches each identity field case-insensitively", () => {
  const item = service();
  for (const query of [" api ", " CHECKOUT ", " V2.3 ", " PRODUCTION ", " EU-WEST ", "   "]) {
    assert.deepEqual(filterServiceInventory([item], query, "all", "all"), [item]);
  }
  assert.deepEqual(filterServiceInventory([item], "missing", "all", "all"), []);
});

test("environment and evidence-aware health filters combine with search", () => {
  const healthy = service();
  const unknown = service({ id: "worker", name: "Worker", environment: "staging", operationCount: 0 });
  assert.deepEqual(filterServiceInventory([healthy, unknown], "work", "staging", "unknown"), [unknown]);
  assert.deepEqual(filterServiceInventory([healthy, unknown], "", "staging", "healthy"), []);
  assert.deepEqual(filterServiceInventory([healthy, unknown], "", "production", "all"), [healthy]);
});

test("inventory sorts by attention, then name and id, without mutating cached data", () => {
  const services = Object.freeze([
    Object.freeze(service({ id: "unknown", name: "A", operationCount: 0, health: "critical" })),
    Object.freeze(service({ id: "healthy", name: "A" })),
    Object.freeze(service({ id: "degraded", name: "Z", health: "degraded" })),
    Object.freeze(service({ id: "b", name: "Alpha", health: "critical" })),
    Object.freeze(service({ id: "z", name: "Zulu", health: "critical" })),
    Object.freeze(service({ id: "a", name: "alpha", health: "critical" })),
  ]);
  const originalIds = services.map((item) => item.id);
  const filtered = filterServiceInventory(services, "", "all", "all");
  assert.deepEqual(filtered.map((item) => item.id), ["a", "b", "z", "degraded", "healthy", "unknown"]);
  assert.deepEqual(services.map((item) => item.id), originalIds);
  assert.notEqual(filtered, services);
  assert.equal(filtered[0], services[5]);
});

test("services query encodes the organization, omits periods, and supports cancellation", async (t) => {
  let requestUrl = "";
  let requestSignal: AbortSignal | undefined;
  const response = { services: [service()] };
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requestUrl = url;
    requestSignal = options.signal as AbortSignal;
    return Response.json(response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    assert.deepEqual(await client.fetchQuery(observabilityServicesQuery("acme/team")), response);
    assert.equal(requestUrl, "/api/acme%2Fteam/observability/services");
    assert.ok(requestSignal instanceof AbortSignal);
    assert.equal(client.getQueryData(["observability", "services", "another-team"]), undefined);
  } finally { client.clear(); }
});

test("failed requests retain a successful inventory instead of replacing it with zeros", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = observabilityServicesQuery("acme");
  const previous = { services: [service()] };
  client.setQueryData(options.queryKey, previous);
  try {
    await assert.rejects(client.fetchQuery(options), /Service telemetry is temporarily unavailable/);
    assert.deepEqual(client.getQueryData(options.queryKey), previous);
    assert.equal(client.getQueryState(options.queryKey)?.status, "error");
  } finally { client.clear(); }
});

test("placeholder inventory belongs only to the same organization", () => {
  const client = new QueryClient();
  const data = { services: [service()] };
  const previousOptions = observabilityServicesQuery("acme");
  client.setQueryData(previousOptions.queryKey, data);
  const previousQuery = client.getQueryCache().find({ queryKey: previousOptions.queryKey });
  const sameOrg = observabilityServicesQuery("acme").placeholderData!;
  const otherOrg = observabilityServicesQuery("other-team").placeholderData!;
  assert.equal(sameOrg(data, previousQuery as any), data);
  assert.equal(otherOrg(data, previousQuery as any), undefined);
  assert.equal(sameOrg(data, undefined), undefined);
  client.clear();
});

test("services refresh every thirty seconds while visible and on window focus", () => {
  const options = observabilityServicesQuery("acme");
  assert.deepEqual(options.queryKey, ["observability", "services", "acme"]);
  assert.equal(options.refetchInterval, 30_000);
  assert.equal(options.refetchIntervalInBackground, false);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(observabilityServicesQuery("").enabled, false);
});
