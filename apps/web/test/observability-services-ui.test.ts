import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { ServicesContent } from "../src/components/observability/services-content";
import * as servicesData from "../src/components/observability/services-data";

Object.assign(globalThis, { React });
type ServicesProps = React.ComponentProps<typeof ServicesContent>;
type InventoryItem = NonNullable<ServicesProps["services"]>[number];
const service = (id: string, overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id, name: `Service ${id}`, namespace: "byteship", version: "v2", environment: "production", region: "eu-west",
  lastSeen: "2026-10-05T12:00:00Z", operationCount: 1200, errorCount: 3, errorRate: 0.25,
  p95Duration: 120, operationsPerMinute: 10, usesServerSpans: true, health: "healthy", ...overrides,
});
const inventory = [service("api"), service("checkout", { name: "Checkout", health: "critical", errorRate: 6 }), service("worker", { name: "Worker", health: "degraded", environment: "staging", region: "us-east" })];

function render(overrides: Partial<ServicesProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/acme/observability/services"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(ServicesContent, {
    orgSlug: "acme", services: inventory, onRetry: () => {}, ...overrides,
  }) }));
}

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

/** Test list interactions without mounting portals, auth or network dependencies. */
async function loadContent() {
  const source = await readFile(new URL("../src/components/observability/services-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const values: any[] = [];
  const refs: Array<{ current: any }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  const stubs = Object.fromEntries(["SearchField", "Select", "Button", "ConnectServiceSheet", "HealthPill"].map((name) => [name, (props: any) => React.createElement("div", { "data-component": name }, props.children)]));
  const module = { exports: {} as { ServicesContent: (props: ServicesProps) => React.ReactNode } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState: (initial: any) => {
          const slot = stateIndex++;
          if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
          return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
        },
        useMemo: (callback: () => any) => callback(),
        useRef: (initial: any) => { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
      };
      if (specifier === "@tanstack/react-router") return { Link: (props: any) => React.createElement("a", { href: `/${props.params.orgSlug}/observability/services/${props.params.serviceId}` }, props.children) };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "./services-data") return servicesData;
      if (specifier.startsWith("..") || specifier === "./connect-service-sheet" || specifier === "./observability-ui") return stubs;
      throw new Error(`Unexpected Services dependency: ${specifier}`);
    },
  });
  return {
    stubs, values,
    render(overrides: Partial<ServicesProps> = {}) {
      stateIndex = 0; refIndex = 0;
      return module.exports.ServicesContent({ orgSlug: "acme", services: inventory, onRetry: () => {}, ...overrides });
    },
  };
}

const servicesSource = () => readFile(new URL("../src/routes/$orgSlug/observability/services.tsx", import.meta.url), "utf8");

test("the Services inventory has no period control and uses the workspace-scoped shared query", async () => {
  const source = await servicesSource();
  assert.doesNotMatch(source, /TimeRangeControl|timeRange|changeTimeRange|\?range=/);
  assert.match(source, /observabilityServicesQuery\(orgSlug\)/);
  assert.match(source, /<ServicesContent/);
  assert.match(source, /key=\{orgSlug\}/);
});

test("Services server-renders a compact inventory with custom filters and whole-row detail links", () => {
  const html = render();
  assert.match(html, /text-\[20px\] font-normal/);
  assert.match(html, /type="search"/);
  assert.match(html, /Environment/);
  assert.match(html, /Health/);
  assert.equal((html.match(/role="combobox"/g) ?? []).length, 2);
  const links = [...html.matchAll(/<a\b[^>]*href="\/acme\/observability\/services\/([^"]+)"[^>]*>[\s\S]*?<\/a>/g)];
  assert.equal(links.length, 3);
  assert.deepEqual(links.map(([, id]) => id).sort(), ["api", "checkout", "worker"]);
  for (const [row] of links) assert.match(row, /Service api|Checkout|Worker/);
  assert.match(links.find(([, id]) => id === "api")?.[0] ?? "", /text-emerald-400[\s\S]*?Healthy/);
  assert.match(links.find(([, id]) => id === "checkout")?.[0] ?? "", /text-rose-400[\s\S]*?Critical/);
  assert.match(links.find(([, id]) => id === "worker")?.[0] ?? "", /text-amber-400[\s\S]*?Degraded/);
  assert.match(html, /production/);
  assert.match(html, /eu-west/);
  assert.doesNotMatch(html, /Time range|Last 24 hours|<option\b|24h<|7d</);
});

test("the closed connect sheet does not mount SDK setup or make a request during SSR", () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("SSR must not load connection setup"); };
  try {
    const html = render();
    assert.match(html, /Connect a service/);
    assert.match(html, /aria-haspopup="dialog" aria-expanded="false"/);
    assert.doesNotMatch(html, /Create ingest token|npm install @outray/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("initial loading, first failure, stale refresh and empty inventory remain distinct", () => {
  const loading = render({ services: undefined, loading: true });
  assert.match(loading, /role="status" aria-label="Loading services"/);
  assert.match(loading, /motion-reduce:animate-none/);
  assert.doesNotMatch(loading, /href="\/acme\/observability\/services\//);
  const failed = render({ services: undefined, error: "Test request failed" });
  assert.match(failed, /Could not load services/);
  assert.match(failed, /Try again|Retry/);
  assert.doesNotMatch(failed, /href="\/acme\/observability\/services\//);
  const stale = render({ error: "Test refresh failed", isFetching: true });
  assert.match(stale, /Could not refresh services\. Showing the last available data\./);
  assert.equal((stale.match(/href="\/acme\/observability\/services\//g) ?? []).length, 3);
  assert.doesNotMatch(stale, /aria-label="Loading services"/);
  const empty = render({ services: [] });
  assert.match(empty, /No reporting services|No services yet|No services connected/);
  assert.match(empty, /Connect a service/);
  assert.doesNotMatch(empty, /Test request failed|No services match/);
});

test("a catalog service without observations renders Unknown and missing metrics, not healthy zeros", () => {
  const html = render({ services: [service("unmeasured", { operationCount: 0, errorCount: 0, errorRate: 0, p95Duration: 0, operationsPerMinute: 0 })] });
  const row = html.match(/<a\b[^>]*href="\/acme\/observability\/services\/unmeasured"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(row);
  assert.match(row, /Unknown/);
  assert.match(row, /—/);
  assert.doesNotMatch(row, /Healthy|>0%<|>0ms</);
});

test("Tinybird last-seen timestamps render as UTC consistently, while invalid timestamps remain Unknown", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      const html = render({
        services: [service("tinybird", { lastSeen: "2026-10-05 12:00:00.123456" }), service("invalid", { lastSeen: "not a timestamp" })],
        updatedAt: Date.parse("2026-10-05T12:13:00.123Z"),
      });
      const valid = html.match(/<a\b[^>]*href="\/acme\/observability\/services\/tinybird"[^>]*>[\s\S]*?<\/a>/)?.[0];
      const invalid = html.match(/<a\b[^>]*href="\/acme\/observability\/services\/invalid"[^>]*>[\s\S]*?<\/a>/)?.[0];
      assert.ok(valid);
      assert.ok(invalid);
      assert.match(valid, /dateTime="2026-10-05T12:00:00\.123Z"/i, `${timezone} must not reinterpret the source timestamp as local time`);
      assert.match(valid, />13m ago<\/time>/);
      assert.match(invalid, /Unknown/);
      assert.doesNotMatch(invalid, /<time\b/);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("search, environment and health controls filter locally, with one action to clear them", async () => {
  const ui = await loadContent();
  const select = (label: string) => elements(ui.render()).find((element) => element.type === ui.stubs.Select && element.props.label === label);
  const search = () => elements(ui.render()).find((element) => element.type === ui.stubs.SearchField);
  assert.equal(search()?.props.appearance, "workspace");
  const visibleIds = () => [...renderToStaticMarkup(ui.render()).matchAll(/href="\/acme\/observability\/services\/([^"]+)"/g)].map(([, id]) => id).sort();
  assert.deepEqual(visibleIds(), ["api", "checkout", "worker"]);
  search()?.props.onValueChange("check");
  assert.deepEqual(visibleIds(), ["checkout"]);
  search()?.props.onValueChange("");
  select("Environment")?.props.onValueChange("staging");
  assert.deepEqual(visibleIds(), ["worker"]);
  select("Health")?.props.onValueChange("critical");
  assert.deepEqual(visibleIds(), []);
  assert.match(renderToStaticMarkup(ui.render()), /No services match these filters/);
  const tree = elements(ui.render());
  const clear = tree.find((element) => element.type === ui.stubs.Button && element.props.children === "Clear filters");
  assert.ok(clear);
  clear.props.onClick();
  assert.equal(search()?.props.value, "");
  assert.equal(select("Environment")?.props.value, "all");
  assert.equal(select("Health")?.props.value, "all");
  assert.deepEqual(visibleIds(), ["api", "checkout", "worker"]);
});

test("Connect a service stays on the inventory and returns retry and focus handlers to the sheet", async () => {
  const ui = await loadContent();
  const retry = () => {};
  const renderTree = () => elements(ui.render({ onRetry: retry }));
  const trigger = renderTree().find((element) => element.type === ui.stubs.Button && element.props["aria-haspopup"] === "dialog");
  assert.ok(trigger);
  assert.equal(trigger.props["aria-expanded"], false);
  assert.equal(trigger.props.href, undefined);
  trigger.props.onClick();
  const sheet = renderTree().find((element) => element.type === ui.stubs.ConnectServiceSheet);
  assert.ok(sheet);
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.orgSlug, "acme");
  assert.equal(sheet.props.onRecheck, retry);
  assert.equal(sheet.props.returnFocusRef, trigger.props.ref);
  sheet.props.onClose();
  assert.equal(renderTree().find((element) => element.type === ui.stubs.ConnectServiceSheet)?.props.open, false);
});

test("removing inventory periods leaves Overview and individual service analytics ranges intact", async () => {
  const overview = await readFile(new URL("../src/components/observability/overview-content.tsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../src/routes/$orgSlug/observability/services_.$serviceId.tsx", import.meta.url), "utf8");
  const detailContent = await readFile(new URL("../src/components/observability/service-detail-content.tsx", import.meta.url), "utf8");
  assert.match(overview, /<SegmentedControl/);
  assert.match(overview, /onValueChange=\{onRangeChange\}/);
  assert.match(overview, /\["1h", "24h", "7d", "30d"\]/);
  assert.match(detailContent, /<SegmentedControl label="Service analytics time range"/);
  assert.match(detailContent, /onValueChange=\{onRangeChange\}/);
  assert.match(detail, /observabilityServiceDetailQuery\(orgSlug, serviceId, range\)/);
  assert.match(detail, /range: normalizeServiceDetailRange\(search.range\)/);
});
