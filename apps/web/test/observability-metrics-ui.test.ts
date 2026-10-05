import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { MetricsContent } from "../src/components/observability/metrics-content";
import * as metricData from "../src/components/observability/metrics-data";

Object.assign(globalThis, { React });
type ContentProps = React.ComponentProps<typeof MetricsContent>;
type Snapshot = NonNullable<ContentProps["data"]>;
type Metadata = NonNullable<Snapshot["selectedMetric"]>;
const metric = (overrides: Partial<Metadata> = {}): Metadata => ({
  key: "temperature:gauge:Cel", name: "process.temperature", description: "Temperature observed in the worker.",
  type: "gauge", unit: "Cel", aggregationTemporality: "unspecified", isMonotonic: false,
  firstSeen: "2026-10-05 08:00:00", lastSeen: "2026-10-05 12:00:00", dataPointCount: 32,
  serviceCount: 2, dimensions: ["environment", "region"], ...overrides,
});
const selected = metric();
const duplicate = metric({ key: "temperature:histogram:Cel", type: "histogram", description: "A histogram of temperatures.", aggregationTemporality: "delta" });
const data: Snapshot = {
  metrics: [selected, duplicate], selectedMetric: selected, services: ["payments-worker", "checkout-api"],
  points: [
    { timestamp: "2026-10-05 11:00:00", type: "gauge", value: -3.5, sampleCount: 8, aggregation: "latest" },
    { timestamp: "2026-10-05 12:00:00", type: "gauge", value: 0, sampleCount: 4, aggregation: "latest" },
  ],
  breakdown: [
    { service: "payments-worker", type: "gauge", value: 0, sampleCount: 12, lastSeen: "2026-10-05 12:00:00", aggregation: "latest" },
    { service: "checkout-api", type: "gauge", value: -3.5, sampleCount: 20, lastSeen: "2026-10-05 11:30:00", aggregation: "latest" },
  ],
  range: "1h", requestedRange: "1h", receivedAt: Date.parse("2026-10-05T12:01:00Z"),
};
const props: ContentProps = {
  orgSlug: "outray-tunnel", data, search: { range: "1h" }, isLive: true,
  onSearchChange: () => {}, onToggleLive: () => {}, onRetry: () => {},
};

function render(overrides: Partial<ContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/outray-tunnel/observability/metrics"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(MetricsContent, { ...props, ...overrides }) }));
}

/** Execute real view callback dispatch without mounting portals or resizing charts. */
async function loadContent() {
  const source = await readFile(new URL("../src/components/observability/metrics-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const stubs = Object.fromEntries(["Button", "SegmentedControl", "SearchField", "Select", "MetricsChart", "ConnectServiceSheet"].map((name) => [name, (componentProps: any) => React.createElement("div", null, componentProps.children)]));
  const states: any[] = [];
  const refs: Array<{ current: any }> = [];
  let index = 0;
  let refIndex = 0;
  const module = { exports: {} as { MetricsContent: (componentProps: ContentProps) => React.ReactNode } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return {
        useMemo: (callback: () => unknown) => callback(),
        useRef: (initial: unknown) => { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useState: (initial: unknown) => {
          const slot = index++;
          if (!(slot in states)) states[slot] = initial;
          return [states[slot], (value: unknown) => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }];
        },
      };
      if (specifier === "./metrics-data") return metricData;
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@hugeicons-pro/")) return {};
      if (specifier.startsWith("../") || specifier.startsWith("./")) return stubs;
      throw new Error(`Unexpected metrics view dependency: ${specifier}`);
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
  return { stubs, render(overrides: Partial<ContentProps> = {}) { index = 0; refIndex = 0; return elements(module.exports.MetricsContent({ ...props, ...overrides })); } };
}

const text = (element: React.ReactElement<any>): string => renderToStaticMarkup(element);
const namedButton = (elements: React.ReactElement<any>[], label: string) => elements.find((element) => (element.type === "button" || typeof element.type === "function") && typeof element.props.onClick === "function" && text(element).includes(label));

test("Metrics uses a compact heading, shared duration control and Pause to its left", () => {
  for (const range of metricData.METRICS_RANGES) {
    const html = render({ search: { range } });
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
    assert.ok(header);
    assert.match(header, /text-\[20px\] font-normal/);
    assert.match(header, /ml-auto flex max-w-full flex-wrap/);
    assert.ok(header.indexOf("Pause") < header.indexOf('aria-label="Metric time range"'));
    assert.equal((header.match(/aria-pressed="true"/g) ?? []).length, 1);
    const chosen = header.match(/<button\b[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(chosen?.includes(`>${range}</span>`));
    assert.match(chosen, /tabindex="0"/);
  }
  const paused = render({ isLive: false });
  assert.match(paused, /Resume automatic refresh/);
  assert.match(paused, /Refresh paused/);
  assert.doesNotMatch(paused, /Export|Download/);
});

test("the instrument library distinguishes duplicate names and exposes one focused explorer", () => {
  const html = render();
  const library = html.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)?.[0];
  assert.ok(library);
  assert.match(library, /aria-label="Search metrics"|>Search metrics</);
  assert.match(library, /process.temperature · Gauge · Cel · Unspecified · non-monotonic/);
  assert.match(library, /process.temperature · Histogram · Cel · Delta · non-monotonic/);
  assert.equal((library.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(library, /2 of 2 instruments · Last 1h/);
  assert.match(html, /lg:grid-cols-\[260px_minmax\(0,1fr\)\]/);
  assert.match(html, /aria-label="process.temperature metric history"/);
  assert.match(html, /aria-label="Metric service breakdown"/);
  assert.doesNotMatch(html, /Instrument catalog|h-80|h-96/);
});

test("catalog search is local, covers description and unit, and can clear a no-results state", async () => {
  const ui = await loadContent();
  const searchField = () => ui.render().find((element) => element.type === ui.stubs.SearchField)!;
  searchField().props.onValueChange("histogram of temperatures");
  const filtered = ui.render();
  assert.equal(filtered.filter((element) => element.type === "button" && element.props.title).length, 1);
  assert.match(text(filtered.find((element) => element.type === "aside")!), /Histogram/);
  searchField().props.onValueChange(" Cel ");
  assert.equal(ui.render().filter((element) => element.type === "button" && element.props.title).length, 2);
  searchField().props.onValueChange("missing instrument");
  const empty = ui.render();
  assert.match(text(empty.find((element) => element.type === "aside")!), /No matching instruments/);
  namedButton(empty, "Clear search")!.props.onClick();
  assert.equal(searchField().props.value, "");
});

test("metric, service, duration and live controls dispatch normalized selection callbacks", async () => {
  const ui = await loadContent();
  const selections: metricData.MetricsSearch[] = [];
  let toggles = 0;
  const search: metricData.MetricsSearch = { range: "7d", metric: selected.key, service: "payments-worker" };
  const elements = ui.render({ search, onSearchChange: (next) => selections.push(next), onToggleLive: () => toggles++ });
  elements.find((element) => element.type === ui.stubs.SegmentedControl)!.props.onValueChange("30d");
  assert.deepEqual({ ...selections.at(-1) }, { ...search, range: "30d" });
  const options = elements.filter((element) => element.type === "button" && element.props.title);
  options[1].props.onClick();
  assert.deepEqual({ ...selections.at(-1) }, { range: "7d", metric: duplicate.key });
  const serviceSelect = elements.find((element) => element.type === ui.stubs.Select)!;
  assert.equal(serviceSelect.props.value, "service:payments-worker");
  serviceSelect.props.onValueChange("service:checkout-api");
  assert.deepEqual({ ...selections.at(-1) }, { ...search, service: "checkout-api" });
  serviceSelect.props.onValueChange("all");
  assert.deepEqual({ ...selections.at(-1) }, { ...search, service: undefined });
  namedButton(elements, "checkout-api")!.props.onClick();
  assert.deepEqual({ ...selections.at(-1) }, { ...search, metric: selected.key, service: "checkout-api" });
  namedButton(elements, "Pause")!.props.onClick();
  assert.equal(toggles, 1);
});

test("retained readings keep their actual metric, service and range during selection changes", async () => {
  const snapshot: Snapshot = { ...data, requestedMetricKey: selected.key, requestedService: "payments-worker" };
  const search: metricData.MetricsSearch = { range: "7d", metric: duplicate.key, service: "checkout-api" };
  const html = render({ data: snapshot, search, isFetching: true });
  assert.match(html, /Loading your selection · Showing process.temperature for payments-worker, last 1h/);
  assert.match(html, /Reporting services/);
  assert.match(html, /Across all services · Last 1h/);
  assert.match(html, /All reporting services · Last 1h/);
  assert.doesNotMatch(html, /Across all services · Last 7d|All reporting services · Last 7d/);
  const ui = await loadContent();
  const chart = ui.render({ data: snapshot, search, isFetching: true }).find((element) => element.type === ui.stubs.MetricsChart)!;
  assert.equal(chart.props.metricName, selected.name);
  assert.equal(chart.props.range, "1h");
  assert.equal(chart.props.points.length, 2);
  assert.match(chart.key!, /payments-worker:1h/);
  const failed = render({ data: snapshot, search, error: "Request failed" });
  assert.match(failed, /Showing the last available data/);
  assert.match(failed, /The new selection is unavailable · Showing process.temperature for payments-worker, last 1h/);
  assert.match(failed, /Retry/);
  assert.doesNotMatch(failed, /Loading metrics|Metrics unavailable/);
});

test("a missing linked instrument explains the fallback without pretending it was selected", () => {
  const html = render({ data: { ...data, requestedMetricKey: "removed-instrument" }, search: { range: "1h", metric: "removed-instrument" } });
  assert.match(html, /The linked instrument has no reports in this period/);
  assert.match(html, /Showing process.temperature instead/);
  assert.match(html, /process.temperature metric history/);
  const library = html.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)?.[0];
  assert.ok(library);
  assert.doesNotMatch(library, /aria-pressed="true"/);
});

test("unknown counts stay unknown while zero and negative gauges are genuine readings", () => {
  const html = render({ data: { ...data, selectedMetric: metric({ serviceCount: null as any, dataPointCount: null as any }), points: data.points.map((point) => ({ ...point, sampleCount: null as any })), breakdown: data.breakdown.map((row) => ({ ...row, sampleCount: null as any })) } });
  assert.match(html, /Latest reading/);
  assert.match(html, />0 Cel</);
  assert.match(html, />-3.5 Cel</);
  for (const label of ["Reported data points", "Reporting services", "Catalog data points"]) {
    const stat = html.match(new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>([^<]*)</dd>`));
    assert.equal(stat?.[1], "—", label);
  }
  assert.match(html, /Inspect process.temperature values/);
});

test("histogram count fallbacks use observations and never the instrument unit", () => {
  const histogram = metric({ unit: "ms", type: "histogram" });
  const html = render({ data: { ...data, selectedMetric: histogram, points: data.points.map((point) => ({ ...point, value: 13, aggregation: "count" })), breakdown: data.breakdown.map((row) => ({ ...row, value: 5, aggregation: "count" })) } });
  assert.match(html, />13 observations</);
  assert.match(html, />5 observations</);
  assert.match(html, /Observations · observations/);
  assert.doesNotMatch(html, />13 ms<|>5 ms</);
});

test("service-filtered exploration keeps the breakdown explicitly scoped to all services", () => {
  const snapshot = { ...data, requestedService: "payments-worker" };
  const html = render({ data: snapshot, search: { range: "1h", service: "payments-worker" } });
  const breakdown = html.match(/<section\b[^>]*aria-label="Metric service breakdown"[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(breakdown);
  assert.match(breakdown, /All reporting services · Last 1h/);
  assert.match(breakdown, /checkout-api/);
  assert.match(breakdown, /payments-worker/);
  assert.match(breakdown, /Clear service/);
  assert.equal((breakdown.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /Catalog metadata covers all services in the last 1h/);
});

test("initial loading, request failure, empty library and empty service selection are distinct", () => {
  const loading = render({ data: undefined, loading: true });
  assert.match(loading, /aria-label="Loading metrics"/);
  assert.match(loading, /motion-reduce:animate-none/);
  assert.match(loading, /h-\[220px\]/);
  assert.doesNotMatch(loading, /No metrics in this period|Metrics unavailable/);
  const failure = render({ data: undefined, error: "Network unavailable" });
  assert.match(failure, /role="alert"/);
  assert.match(failure, /Metrics unavailable/);
  assert.match(failure, /Try again/);
  assert.doesNotMatch(failure, /Loading metrics|No metrics in this period/);
  const empty = render({ data: { ...data, metrics: [], selectedMetric: null, services: [], points: [], breakdown: [] } });
  assert.match(empty, /No instruments reported in this period/);
  assert.match(empty, /No metrics in the last 1h/);
  assert.match(empty, /Connect a service/);
  const serviceEmpty = render({ data: { ...data, requestedService: "absent-worker", points: [] }, search: { range: "1h", service: "absent-worker" } });
  assert.match(serviceEmpty, /No measurements in this selection/);
  assert.match(serviceEmpty, /absent-worker has not reported this instrument/);
  assert.match(serviceEmpty, /Show all services/);
  assert.match(serviceEmpty, /checkout-api/);
  assert.doesNotMatch(serviceEmpty, /Loading metrics|Metrics unavailable/);
});

test("a retained empty library names its actual range while a new selection is loading", () => {
  const emptyData: Snapshot = { ...data, metrics: [], selectedMetric: null, points: [], breakdown: [], services: [] };
  const html = render({ data: emptyData, search: { range: "7d", service: "api" }, isFetching: true });
  assert.match(html, /No metrics in the last 1h/);
  assert.match(html, /Loading 7d · Showing the last available 1h period/);
  assert.doesNotMatch(html, /No metrics in the last 7d|Loading metrics/);
});

test("catalog ordering is deterministic during refresh and never mutates API data", async () => {
  const ui = await loadContent();
  const last = metric({ key: "z-last", name: "z.metric" });
  const first = metric({ key: "a-first", name: "a.metric" });
  const second = metric({ key: "b-second", name: "a.metric" });
  const original = [last, second, first];
  const refreshed = [first, last, second];
  const catalogKeys = (metrics: Metadata[]) => ui.render({ data: { ...data, metrics } })
    .filter((element) => element.type === "li" && typeof element.props.children?.props?.title === "string")
    .map((element) => element.key);
  assert.deepEqual(catalogKeys(original), ["a-first", "b-second", "z-last"]);
  assert.deepEqual(catalogKeys(refreshed), ["a-first", "b-second", "z-last"]);
  assert.deepEqual(original.map((instrument) => instrument.key), ["z-last", "b-second", "a-first"]);
  assert.deepEqual(refreshed.map((instrument) => instrument.key), ["a-first", "z-last", "b-second"]);
});

test("mobile browsing opens a compact library and selection closes it with focus restoration", async () => {
  const html = render();
  assert.match(html, /aria-label="Browse instruments" aria-expanded="false" aria-controls="metric-instrument-library"/);
  assert.match(html, /id="metric-instrument-library" class="hidden lg:block"/);
  assert.match(html, /id="metric-instrument-library" class="hidden lg:block"><div class="outray-arc-requests-search/);
  assert.match(html, /lg:!hidden/);
  const ui = await loadContent();
  const selections: metricData.MetricsSearch[] = [];
  const overrides = { onSearchChange: (next: metricData.MetricsSearch) => selections.push(next) };
  const browse = () => ui.render(overrides).find((element) => element.props["aria-label"] === "Browse instruments")!;
  let focused = 0;
  browse().props.ref.current = { offsetParent: {}, focus: () => focused++ };
  browse().props.onClick();
  assert.equal(browse().props["aria-expanded"], true);
  assert.equal(ui.render(overrides).find((element) => element.props.id === "metric-instrument-library")!.props.className, "block");
  ui.render(overrides).find((element) => element.type === "button" && element.props.title)!.props.onClick();
  assert.equal(browse().props["aria-expanded"], false);
  assert.equal(focused, 1);
  assert.ok(selections[0].metric);
  browse().props.ref.current = { offsetParent: null, focus: () => focused++ };
  ui.render(overrides).find((element) => element.type === "button" && element.props.title)!.props.onClick();
  assert.equal(focused, 1, "desktop selection must not focus the hidden mobile browse trigger");
});

test("instrument details use a native collapsed disclosure and readable mobile metadata", () => {
  const html = render();
  const details = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(details);
  assert.doesNotMatch(details, /<details[^>]*\bopen(?:[ =>])/);
  assert.match(details, /<summary[^>]*focus-visible/);
  assert.match(details, /Instrument details/);
  assert.match(details, /<dl[^>]*grid-cols-2/);
  for (const field of ["Unit", "Temporality", "Monotonic", "First report", "Last report", "Dimensions"]) assert.ok(details.includes(field));
  assert.match(html, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(html, /sm:col-span-1/);
  assert.match(html, /motion-reduce:transition-none/);
  assert.match(html, /role="group" tabindex="0"/);
});

test("a retry and connect action stay actionable without replacing the loaded snapshot", async () => {
  const ui = await loadContent();
  let retries = 0;
  const failed = ui.render({ data: undefined, error: "Unavailable", onRetry: () => retries++ });
  namedButton(failed, "Try again")!.props.onClick();
  assert.equal(retries, 1);
  const emptyData: Snapshot = { ...data, metrics: [], selectedMetric: null, points: [], breakdown: [], services: [] };
  const empty = ui.render({ data: emptyData });
  namedButton(empty, "Connect a service")!.props.onClick();
  const sheet = ui.render({ data: emptyData }).find((element) => element.type === ui.stubs.ConnectServiceSheet)!;
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.orgSlug, "outray-tunnel");
  sheet.props.onClose();
  assert.equal(ui.render({ data: emptyData }).find((element) => element.type === ui.stubs.ConnectServiceSheet)!.props.open, false);
});
