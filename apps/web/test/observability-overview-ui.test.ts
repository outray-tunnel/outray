import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { ObservabilityOverviewContent, type ObservabilityOverviewContentProps } from "../src/components/observability/overview-content";
import type { ServiceOverviewResponse, ServiceSummary } from "../src/components/observability/overview-data";

Object.assign(globalThis, { React });
const now = Date.parse("2026-10-05T12:15:00Z");
const service = (id: string, health: ServiceSummary["health"] = "healthy"): ServiceSummary => ({
  id, name: `Service ${id}`, environment: "production", region: "eu-west", operationCount: 1234,
  errorRate: 1.25, p95Duration: 120, operationsPerMinute: 10, usesServerSpans: true, health,
});
const data: ServiceOverviewResponse = {
  range: "24h", services: [service("one"), service("two", "critical"), service("three", "degraded")],
  summary: { serviceCount: 3, totalOperations: 1234, totalErrors: 3, errorRate: 1.25, operationsPerMinute: 10, attentionCount: 2 },
  traffic: [
    { timestamp: "2026-10-05T09:00:00Z", operationCount: 100, errorCount: 2, errorRate: 2, p95Duration: 900, operationsPerMinute: 2 },
    { timestamp: "2026-10-05T10:00:00Z", operationCount: 20, errorCount: 1, errorRate: 5, p95Duration: 1230, operationsPerMinute: 1 },
    { timestamp: "2026-10-05T11:00:00Z", operationCount: 0, errorCount: 0, errorRate: 0, p95Duration: null, operationsPerMinute: 0 },
  ],
};

function render(overrides: Partial<ObservabilityOverviewContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/acme/observability"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(ObservabilityOverviewContent, {
    orgSlug: "acme", range: "24h", onRangeChange: () => {}, onRetry: () => {}, referenceTime: now, data, ...overrides,
  }) }));
}

test("Observability uses the same three compact metric cards and small charts as Tunnels", () => {
  const html = render();
  const cards = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(([card]) => card);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((card) => card.match(/data-metric="([^"]+)"/)?.[1]), ["operations", "errorRate", "p95"]);
  assert.deepEqual(cards.map((card) => card.match(/data-usage-value="([^"]+)"/)?.[1]), ["1,234", "1.25%", "1.23s"]);
  for (const card of cards) {
    assert.match(card, /h-\[180px\]/);
    assert.match(card, /<number-flow-react/);
    assert.match(card, /role="group" tabindex="0"/);
    assert.match(card, /by interval<\/caption>/);
  }
  assert.match(html, /grid-cols-1 gap-3 md:grid-cols-3/);
  assert.match(html, /text-\[20px\] font-normal/);
  assert.doesNotMatch(html, /Operation volume|Needs attention<\/h2>|Reporting services<\/h3>|h-80|h-60|Export/);
});

test("services are one compact, clickable list with attention first and mobile labels", () => {
  const html = render();
  const serviceLinks = [...html.matchAll(/<a\b[^>]*href="\/acme\/observability\/services\/([^"]+)"[^>]*>[\s\S]*?<\/a>/g)];
  assert.equal(serviceLinks.length, 3);
  assert.deepEqual(serviceLinks.map(([, id]) => id), ["two", "three", "one"]);
  assert.match(html, /2 need attention/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /lg:sr-only">Operations/);
  assert.match(html, /production · eu-west/);
  assert.match(html, /href="\/acme\/setup\?product=observability"/);
  assert.match(html, /View all/);
});

test("service preview stays compact even for a large inventory", () => {
  const html = render({ data: { ...data, services: Array.from({ length: 20 }, (_, index) => service(String(index))) } });
  assert.equal((html.match(/href="\/acme\/observability\/services\//g) ?? []).length, 5);
});

test("background refresh and range changes preserve old cards without disguising the displayed range", () => {
  const html = render({ range: "7d", isFetching: true });
  assert.match(html, /Loading last 7 days/);
  assert.equal((html.match(/data-metric=/g) ?? []).length, 3);
  assert.match(html, /Operations over last 24 hours/);
  assert.doesNotMatch(html, /Loading service analytics|data-observability-skeleton/);
});

test("all four shared ranges expose one selected keyboard stop", () => {
  for (const range of ["1h", "24h", "7d", "30d"] as const) {
    const html = render({ range });
    const buttons = [...html.matchAll(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
    const selected = buttons.filter((button) => button.includes('aria-pressed="true"'));
    assert.equal(selected.length, 1);
    assert.match(selected[0], /tabindex="0"/);
    assert.ok(selected[0].includes(`>${range}</span>`));
  }
});

test("initial skeleton matches the cards and service rows, not a large chart", () => {
  const html = render({ data: undefined, loading: true });
  assert.equal((html.match(/data-observability-skeleton-metric=/g) ?? []).length, 3);
  assert.equal((html.match(/data-observability-skeleton-chart=/g) ?? []).length, 3);
  assert.match(html, /aria-label="Loading services"/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.doesNotMatch(html, /data-metric=|h-80|h-60/);
});

test("missing observations are not zero latency or a healthy claim", () => {
  const html = render({ data: { ...data, services: [], traffic: [], summary: { ...data.summary, serviceCount: 0, totalOperations: 0, totalErrors: 0, errorRate: 0, attentionCount: 0 } } });
  assert.match(html, /No services reported in this range/);
  assert.match(html, /No latency observations/);
  assert.match(html, /data-metric="p95"[\s\S]*?data-usage-value="—"/);
  assert.match(html, /data-metric="errorRate"[\s\S]*?data-usage-value="—"/);
  assert.doesNotMatch(html, /All reporting services are within|data-usage-value="0ms"/);
});

test("initial failures and stale failures have distinct recoverable states", () => {
  const failed = render({ data: undefined, error: "unavailable" });
  assert.match(failed, /Telemetry unavailable/);
  assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /data-metric=|No services reported/);
  const stale = render({ error: "unavailable" });
  assert.match(stale, /Showing the last available data/);
  assert.match(stale, /Retry/);
  assert.equal((stale.match(/data-metric=/g) ?? []).length, 3);
});

test("a measured zero error rate remains inspectable", () => {
  const html = render({ data: { ...data, summary: { ...data.summary, errorRate: 0, totalErrors: 0 }, traffic: data.traffic.map((point) => ({ ...point, errorCount: 0, errorRate: 0 })) } });
  const errorCard = html.match(/<article[^>]*data-metric="errorRate"[\s\S]*?<\/article>/)?.[0] ?? "";
  assert.match(errorCard, /data-usage-value="0%"/);
  assert.match(errorCard, /role="group" tabindex="0"/);
  assert.doesNotMatch(errorCard, /No operations in this period/);
});
