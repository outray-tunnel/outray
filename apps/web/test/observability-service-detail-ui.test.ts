import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { ServiceDetailContent } from "../src/components/observability/service-detail-content";
import * as detailData from "../src/components/observability/service-detail-data";
import * as servicesData from "../src/components/observability/services-data";

Object.assign(globalThis, { React });
type ContentProps = React.ComponentProps<typeof ServiceDetailContent>;
type Snapshot = NonNullable<ContentProps["data"]>;
type Service = Snapshot["services"][number];
const now = Date.parse("2026-10-05T12:15:00Z");
const service = (overrides: Partial<Service> = {}): Service => ({
  id: "checkout", name: "Checkout / API", namespace: "byteship", version: "v2.4", environment: "production", region: "eu-west",
  scopeName: "@outray/tanstack", lastSeen: "2026-10-05 12:00:00.123456", operationCount: 1234, errorCount: 3,
  errorRate: 1.25, p95Duration: 1230, operationsPerMinute: 20.5, usesServerSpans: true, health: "degraded", ...overrides,
});
const data: Snapshot = {
  range: "24h", receivedAt: now, services: [service()],
  summary: { serviceCount: 1, totalOperations: 1234, totalErrors: 3, errorRate: 1.25, operationsPerMinute: 20.5, attentionCount: 1 },
  traffic: [
    { timestamp: "2026-10-05 09:00:00", operationCount: 100, errorCount: 2, errorRate: 2, p95Duration: 900, operationsPerMinute: 2 },
    { timestamp: "2026-10-05 10:00:00", operationCount: 20, errorCount: 1, errorRate: 5, p95Duration: 1200, operationsPerMinute: 1 },
    { timestamp: "2026-10-05 11:00:00", operationCount: 0, errorCount: 0, errorRate: 0, p95Duration: null, operationsPerMinute: 0 },
  ],
};
const baseProps: ContentProps = { orgSlug: "acme", serviceId: "checkout", data, range: "24h", onRangeChange: () => {}, onRetry: () => {} };

function render(overrides: Partial<ContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/acme/observability/services/checkout"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(ServiceDetailContent, { ...baseProps, ...overrides }) }));
}

const cards = (html: string) => [...html.matchAll(/<article\b[^>]*data-metric="([^"]+)"[^>]*>[\s\S]*?<\/article>/g)].map(([html, key]) => ({ html, key, value: html.match(/data-usage-value="([^"]+)"/)?.[1] }));

/** Exercise callback dispatch with the real view, without mounting charts or portals. */
async function loadContent() {
  const source = await readFile(new URL("../src/components/observability/service-detail-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const stubs = Object.fromEntries(["Button", "SegmentedControl", "UsageMetricCard", "HealthPill"].map((name) => [name, (props: any) => React.createElement("div", null, props.children)]));
  const module = { exports: {} as { ServiceDetailContent: (props: ContentProps) => React.ReactNode } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useMemo: (callback: () => unknown) => callback() };
      if (specifier === "./service-detail-data") return detailData;
      if (specifier === "./services-data") return servicesData;
      if (specifier === "@tanstack/react-router") return { Link: (props: any) => React.createElement("a", null, props.children) };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier.startsWith("../") || specifier === "./observability-ui") return stubs;
      throw new Error(`Unexpected service detail dependency: ${specifier}`);
    },
  });
  const stubComponents = new Set(Object.values(stubs));
  function elements(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    const rendered = typeof element.type === "function" && !stubComponents.has(element.type as any) ? element.type(element.props) : element.props.children;
    return [element, ...elements(rendered)];
  }
  return { stubs, render: (overrides: Partial<ContentProps> = {}) => elements(module.exports.ServiceDetailContent({ ...baseProps, ...overrides })) };
}

test("individual service analytics use four shared compact inspectable cards, not oversized charts", () => {
  const html = render();
  const metrics = cards(html);
  assert.deepEqual(metrics.map(({ key }) => key), ["operations", "throughput", "errorRate", "p95"]);
  assert.deepEqual(metrics.map(({ value }) => value), ["1,234", "20.5 /min", "1.25%", "1.23s"]);
  for (const { html: card } of metrics) {
    assert.match(card, /h-\[180px\]/);
    assert.match(card, /<number-flow-react/);
    assert.match(card, /role="group" tabindex="0"/);
    assert.match(card, /by interval<\/caption>/);
  }
  assert.match(html, /text-\[20px\] font-normal/);
  assert.match(html, /sm:grid-cols-2|md:grid-cols-2/);
  assert.match(html, /xl:grid-cols-4/);
  assert.doesNotMatch(html, /Operation volume|<h2[^>]*>Latency<|h-80|h-60|Export/);
});

test("the service id chooses its own health, headline totals and resource metadata", () => {
  const html = render({ data: { ...data, services: [service({ id: "other", name: "Other service", operationCount: 99999, health: "critical" }), service()] } });
  assert.match(html, /Checkout \/ API/);
  assert.match(html, /Degraded/);
  assert.doesNotMatch(html, /Other service|99,999/);
  for (const value of ["byteship", "production", "eu-west", "v2.4", "@outray/tanstack"]) assert.ok(html.includes(value));
  assert.match(html, /<dl\b/);
  assert.match(html, /dateTime="2026-10-05T12:00:00\.123Z"/i);
  const policy = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(policy);
  assert.match(policy, /How service health is calculated/);
  assert.match(policy, /<p class="mt-3 flex items-start gap-1\.5 text-\[10px\]/);
  assert.match(policy, /lucide-info/);
  assert.doesNotMatch(policy, /<details[^>]*\bopen(?:[ =>])/);
});

test("Traces and Logs are complete drilldown rows with workspace and selected-service search", () => {
  const html = render();
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  for (const explorer of ["traces", "logs"]) {
    const link = links.find(([, href]) => href.startsWith(`/acme/observability/${explorer}`));
    assert.ok(link, `Missing ${explorer} drilldown`);
    const target = new URL(link[1].replaceAll("&amp;", "&"), "http://localhost");
    assert.equal(target.pathname, `/acme/observability/${explorer}`);
    assert.equal(target.searchParams.get("search"), "checkout");
    assert.match(link[2], explorer === "traces" ? /Traces/ : /Logs/);
    assert.match(link[0], /focus-visible/);
  }
  assert.match(html, /href="\/acme\/observability\/services"/);
  assert.doesNotMatch(html, /Requests filtered to this service|service-filtered requests/);
});

test("Requests links carry the exact service filter and the selected analytics range", () => {
  const serviceId = "payments/worker?region=eu+west & live";
  const html = render({ serviceId, range: "7d", isFetching: true, data: { ...data, services: [service({ id: serviceId, name: "Payments worker" })] } });
  const link = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].find(([, href]) => href.startsWith("/acme/observability/requests"));
  assert.ok(link);
  const target = new URL(link[1].replaceAll("&amp;", "&"), "http://localhost");
  assert.equal(target.pathname, "/acme/observability/requests");
  assert.equal(target.searchParams.get("service"), serviceId);
  assert.equal(target.searchParams.get("range"), "7d");
  assert.match(link[2], /Requests/);
  assert.match(link[2], /View HTTP requests from Payments worker/);
  assert.match(link[0], /focus-visible/);
  assert.match(link[2], /overflow-wrap:anywhere/);
});

test("shared duration controls retain one selected keyboard stop in the top-right header", async () => {
  for (const range of detailData.SERVICE_DETAIL_RANGES) {
    const html = render({ range });
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
    assert.ok(header);
    assert.match(header, /aria-label="Service analytics time range"/);
    assert.match(header, /ml-auto max-w-full/);
    const selected = [...header.matchAll(/<button\b[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
    assert.equal(selected.length, 1);
    assert.match(selected[0], /tabindex="0"/);
    assert.ok(selected[0].includes(`>${range}</span>`));
  }
  const source = await readFile(new URL("../src/components/observability/service-detail-content.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ SegmentedControl \} from "\.\.\/ui\/segmented-control"/);
  assert.match(source, /<UsageMetricCard/);
  assert.doesNotMatch(source, /TimeRangeControl|TrendChart/);
});

test("missing observations mean Unknown and missing rates, while measured zero errors remain inspectable", () => {
  const emptyService = service({ operationCount: 0, errorCount: 0, errorRate: 0, operationsPerMinute: 0, p95Duration: 0, health: "healthy" });
  const empty = render({ data: { ...data, services: [emptyService], traffic: [], summary: { ...data.summary, totalOperations: 0, totalErrors: 0, errorRate: 0, operationsPerMinute: 0 } } });
  const header = empty.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header);
  assert.match(header, /Unknown/);
  assert.doesNotMatch(header, />Healthy</);
  assert.doesNotMatch(empty, /data-usage-value="0ms"|data-usage-value="0%"/);
  assert.equal(cards(empty).find(({ key }) => key === "operations")?.value, "0");
  for (const key of ["throughput", "errorRate", "p95"]) assert.equal(cards(empty).find((card) => card.key === key)?.value, "—");
  const measured = render({ data: { ...data, services: [service({ errorCount: 0, errorRate: 0 })], traffic: data.traffic.map((point) => ({ ...point, errorCount: 0, errorRate: 0 })) } });
  const errorCard = cards(measured).find(({ key }) => key === "errorRate");
  assert.ok(errorCard);
  assert.equal(errorCard.value, "0%");
  assert.match(errorCard.html, /role="group" tabindex="0"/);
});

test("whole-period observations retain their headline values when completed chart intervals are absent", () => {
  const html = render({ data: { ...data, traffic: [] } });
  const metrics = cards(html);
  assert.deepEqual(metrics.map(({ value }) => value), ["1,234", "20.5 /min", "1.25%", "1.23s"]);
  const labels = ["No activity in completed intervals", "No completed throughput observations", "No operations in completed intervals", "No completed latency observations"];
  for (const [index, metric] of metrics.entries()) {
    assert.ok(metric.html.includes(labels[index]));
    assert.doesNotMatch(metric.html, /No (?:activity|operations|latency observations|throughput observations) in this period/);
    assert.doesNotMatch(metric.html, /role="group" tabindex="0"/);
  }
  assert.doesNotMatch(html, /No measured operations in this period/);
});

test("an empty retained result names its loaded range while the new range is still fetching", () => {
  const html = render({ data: { ...data, services: [], traffic: [] }, range: "7d", isFetching: true });
  const message = html.match(/<section\b[^>]*role="status"[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(message);
  assert.match(message, /did not report spans in last 24 hours/);
  assert.match(message, /role="status"[^>]*>Loading 7d · Showing 24h/);
  assert.doesNotMatch(message, /did not report spans in (?:the selected range|last 7 days)/);
  assert.equal(cards(html).length, 0);
});

test("long unbroken service names can wrap inside both explorer descriptions", () => {
  const name = "unbroken-service-name".repeat(30);
  const html = render({ data: { ...data, services: [service({ name })] } });
  const links = [...html.matchAll(/<a\b[^>]*href="\/acme\/observability\/(?:traces|logs)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 2);
  for (const [, content] of links) {
    const description = content.match(/<span\b[^>]*class="([^"]*)"[^>]*>Search (?:traces|log events) for ([^<]+)<\/span>/);
    assert.ok(description);
    assert.ok(description[1].split(" ").includes("[overflow-wrap:anywhere]"));
    assert.equal(description[2], `${name}.`);
    assert.match(content, /min-w-0 flex-1/);
  }
});

test("initial loading, failed requests and a missing service remain distinct and recoverable", () => {
  const loading = render({ data: undefined, loading: true });
  assert.match(loading, /Loading service/);
  assert.match(loading, /motion-reduce:animate-none/);
  assert.equal((loading.match(/h-\[180px\]/g) ?? []).length, 4);
  assert.doesNotMatch(loading, /data-metric=|No service|not found/);
  const failed = render({ data: undefined, error: "Test unavailable" });
  assert.match(failed, /Service telemetry unavailable|Could not load service/);
  assert.match(failed, /Try again|Retry/);
  assert.doesNotMatch(failed, /data-metric=|Loading service/);
  const missing = render({ data: { ...data, services: [], traffic: [] } });
  assert.match(missing, /No service|Service not found|No telemetry|No activity/);
  assert.doesNotMatch(missing, /data-metric=|Could not load service/);
  assert.match(missing, /href="\/acme\/observability\/services"/);
});

test("background refresh preserves cards and resources while displaying their actual data range", () => {
  const updating = render({ isFetching: true, range: "7d" });
  assert.equal(cards(updating).length, 4);
  assert.match(updating, /Loading 7d · Showing 24h/);
  assert.match(updating, /Operations over last 24 hours/);
  assert.match(updating, /@outray\/tanstack/);
  assert.doesNotMatch(updating, /Loading service analytics/);
  const stale = render({ isFetching: true, error: "Test refresh failed" });
  assert.equal(cards(stale).length, 4);
  assert.match(stale, /Showing the last available data/);
  assert.match(stale, /Retry/);
  assert.doesNotMatch(stale, /Service telemetry unavailable|Loading service analytics/);
});

test("range and recovery controls dispatch their callbacks and cards use the loaded snapshot range", async () => {
  const ui = await loadContent();
  const calls: string[] = [];
  const overrides: Partial<ContentProps> = { range: "7d", onRangeChange: (range) => calls.push(range), onRetry: () => calls.push("retry") };
  const tree = ui.render(overrides);
  const range = tree.find((element) => element.type === ui.stubs.SegmentedControl);
  assert.ok(range);
  assert.equal(range.props.value, "7d");
  assert.deepEqual(Array.from(range.props.options, (option: any) => option.value), ["1h", "6h", "24h", "7d", "30d"]);
  range.props.onValueChange("6h");
  assert.deepEqual(calls, ["6h"]);
  const metrics = tree.filter((element) => element.type === ui.stubs.UsageMetricCard);
  assert.equal(metrics.length, 4);
  for (const metric of metrics) {
    assert.equal(metric.props.range, "24h");
    assert.ok(metric.props.bars.length > 0);
  }
  for (const state of [{ data: undefined, error: "failed" }, { error: "stale" }]) {
    const retry = ui.render({ ...overrides, ...state }).find((element) => element.type === ui.stubs.Button && /Try again|Retry/.test(String(element.props.children)));
    assert.ok(retry);
    retry.props.onClick();
  }
  assert.deepEqual(calls, ["6h", "retry", "retry"]);
});
