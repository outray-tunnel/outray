import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { HttpRequestsContent } from "../src/components/observability/http-requests-content";
import * as requestData from "../src/components/observability/http-requests-data";
import * as requestBadges from "../src/components/observability/http-request-badges";
import * as requestUtils from "../src/components/requests/utils";

Object.assign(globalThis, { React });
type ContentProps = React.ComponentProps<typeof HttpRequestsContent>;
type Summary = NonNullable<ContentProps["data"]>["requests"][number];
const request = (id: string, overrides: Partial<Summary> = {}): Summary => ({
  id, requestId: `request-${id}`, timestamp: "2026-10-05T12:00:00Z", method: "POST", route: "/api/checkout", path: "/api/checkout",
  service: "api", environment: "production", region: "eu-west", statusCode: 201, duration: 1250,
  traceId: `trace-${id}`, spanId: `span-${id}`, captureState: "full", requestSize: 256, responseSize: 1024, ...overrides,
});
const requests = [request("one"), request("two", { statusCode: 503, captureState: "redacted", path: "/api/orders" }), request("three", { method: "GET", captureState: "metadata", path: "/health", service: "worker", statusCode: 200 })];
const data: NonNullable<ContentProps["data"]> = {
  requests, statistics: { totalRequests: 125, errorCount: 5, errorRate: 4, p95Duration: 1200, payloadCaptureCount: 80, metadataCount: 45 },
  services: ["api", "worker"], methods: ["GET", "POST"], total: 125, hasMore: true,
  nextCursor: { timestamp: "2026-10-05T12:00:00Z", traceId: "trace-three", spanId: "span-three" }, limit: 50, range: "1h",
};
const baseProps: ContentProps = {
  orgSlug: "acme", data, loading: false, refreshing: false, error: null, lastSuccessAt: null, search: "", service: "", method: "all", status: "all", capture: "all", range: "1h", live: true,
  facets: { services: ["api", "worker"], methods: ["GET", "POST"] }, page: 0, total: 125,
  onSearchChange: () => {}, onServiceChange: () => {}, onMethodChange: () => {}, onStatusChange: () => {}, onCaptureChange: () => {},
  onRangeChange: () => {}, onToggleLive: () => {}, onRetry: () => {}, onResetFilters: () => {}, onNextPage: () => {}, onPreviousPage: () => {}, onInspect: () => {},
};

function render(overrides: Partial<ContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/acme/observability/requests"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(HttpRequestsContent, { ...baseProps, ...overrides }) }));
}

async function loadContent() {
  const source = await readFile(new URL("../src/components/observability/http-requests-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const stubs = Object.fromEntries(["Button", "SearchField", "Select", "SegmentedControl", "ConnectServiceSheet"].map((name) => [name, (props: any) => React.createElement("div", null, props.children)]));
  const values: any[] = [];
  const refs: Array<{ current: any }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  const module = { exports: {} as { HttpRequestsContent: (props: ContentProps) => React.ReactNode } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return {
        useMemo: (callback: () => any) => callback(),
        useRef: (initial: any) => { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useState: (initial: any) => {
          const slot = stateIndex++;
          if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
          return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
        },
      };
      if (specifier === "./http-requests-data") return requestData;
      if (specifier === "./http-request-badges") return requestBadges;
      if (specifier.endsWith("/requests/utils")) return requestUtils;
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@hugeicons-pro/")) return { __esModule: true, default: [] };
      if (specifier.startsWith("../arc/") || specifier === "../ui/segmented-control" || specifier === "./connect-service-sheet" || specifier.endsWith(".css")) return stubs;
      throw new Error(`Unexpected requests UI dependency: ${specifier}`);
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
  return { stubs, render: (overrides: Partial<ContentProps> = {}) => {
    stateIndex = 0; refIndex = 0;
    return elements(module.exports.HttpRequestsContent({ ...baseProps, ...overrides }));
  } };
}

test("instrumented requests use compact native rows and real custom filters without exporting", () => {
  const html = render();
  assert.match(html, /text-\[20px\] font-normal/);
  assert.match(html, /type="search"/);
  for (const label of ["Service", "Method", "Status", "Capture"]) assert.ok(html.includes(label));
  assert.equal((html.match(/role="combobox"/g) ?? []).length, 4);
  for (const detail of ["/api/checkout", "/api/orders", "/health", "production", "Captured", "Redacted", "Metadata only"]) assert.ok(html.includes(detail));
  assert.doesNotMatch(html, /Export|<tr[^>]*tabindex=|<option\b/);
});

test("capture and HTTP status pills keep their intrinsic width in request grid columns", () => {
  for (const [state, label, dot] of [
    ["full", "Captured", "bg-emerald-400"],
    ["redacted", "Redacted", "bg-amber-400"],
    ["metadata", "Metadata only", "bg-zinc-500"],
  ] as const) {
    const html = renderToStaticMarkup(React.createElement(requestBadges.HttpRequestCaptureBadge, { state }));
    const classes = html.match(/^<span class="([^"]*)"/)?.[1].split(" ");
    for (const token of ["w-fit", "justify-self-start", "shrink-0"]) assert.ok(classes?.includes(token), `${label} pill must use ${token}`);
    assert.ok(html.includes(label));
    assert.match(html, /aria-hidden="true"/);
    assert.ok(html.includes(dot));
  }
  for (const code of [101, 201, 302, 404, 503, Number.NaN]) {
    const html = renderToStaticMarkup(React.createElement(requestBadges.HttpRequestStatusBadge, { code }));
    const classes = html.match(/^<span class="([^"]*)"/)?.[1].split(" ");
    for (const token of ["w-fit", "justify-self-start", "shrink-0"]) assert.ok(classes?.includes(token), `${code} status pill must use ${token}`);
    assert.ok(html.includes(Number.isNaN(code) ? "—" : String(code)));
  }
});

test("refresh and shared duration controls stay in the top-right page header, not the inventory", async () => {
  const html = render();
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
  const inventory = html.slice(html.indexOf('aria-label="HTTP request inventory"'));
  assert.ok(header);
  assert.match(header, /Requests|HTTP traffic from your instrumented services/);
  assert.match(header, /ml-auto[^"]*justify-end/);
  const pause = header.indexOf("Pause");
  const duration = header.indexOf('aria-label="Request time range"');
  assert.ok(pause >= 0 && duration > pause);
  assert.equal((html.match(/aria-label="Request time range"/g) ?? []).length, 1);
  assert.doesNotMatch(inventory, /Pause automatic refresh|Resume automatic refresh|aria-label="Request time range"/);
  assert.match(render({ live: false }).match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? "", /Resume/);
  assert.match(render({ data: null, loading: true }).match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? "", /Request time range/);
  const source = await readFile(new URL("../src/components/observability/http-requests-content.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ SegmentedControl \} from "\.\.\/ui\/segmented-control"/);
  assert.doesNotMatch(source, /TimeRangeControl/);
});

test("initial skeletons, initial failure, no activity and no results are distinct", () => {
  const loading = render({ data: null, loading: true });
  assert.match(loading, /Loading requests/);
  assert.match(loading, /motion-reduce:animate-none/);
  assert.doesNotMatch(loading, /\/api\/checkout|No matching requests/);
  const failed = render({ data: null, error: "Request unavailable" });
  assert.match(failed, /Requests unavailable|Could not load requests/);
  assert.match(failed, /Try again|Retry/);
  assert.doesNotMatch(failed, /Loading requests|No matching requests/);
  const empty = render({ data: { ...data, requests: [], total: 0, hasMore: false, nextCursor: null }, total: 0 });
  assert.match(empty, /No requests|Waiting for requests/);
  const noResults = render({ data: { ...data, requests: [], total: 0, hasMore: false, nextCursor: null }, total: 0, search: "missing" });
  assert.match(noResults, /No matching requests/);
  assert.match(noResults, /Clear filters/);
});

test("background refresh retains inspected rows and distinguishes a failed refresh", () => {
  const updating = render({ refreshing: true });
  assert.match(updating, /\/api\/checkout/);
  assert.match(updating, /Updating|Refreshing/);
  assert.doesNotMatch(updating, /Loading requests/);
  const stale = render({ refreshing: true, error: "Refresh failed", lastSuccessAt: Date.parse("2026-10-05T12:00:00Z") });
  assert.match(stale, /\/api\/checkout/);
  assert.match(stale, /previously loaded|last available|last successful/i);
  assert.match(stale, /Retry/);
  assert.doesNotMatch(stale, /Loading requests/);
});

test("filter, range, pause and reset controls call their existing callbacks", async () => {
  const ui = await loadContent();
  const calls: any[] = [];
  const tree = ui.render({ search: "api", onSearchChange: (value) => calls.push(["search", value]), onServiceChange: (value) => calls.push(["service", value]), onMethodChange: (value) => calls.push(["method", value]), onStatusChange: (value) => calls.push(["status", value]), onCaptureChange: (value) => calls.push(["capture", value]), onRangeChange: (value) => calls.push(["range", value]), onToggleLive: () => calls.push(["pause"]), onResetFilters: () => calls.push(["reset"]) });
  assert.equal(tree.find((element) => element.type === ui.stubs.SearchField)?.props.appearance, "workspace");
  tree.find((element) => element.type === ui.stubs.SearchField)?.props.onValueChange("orders");
  for (const [label, value] of [["Service", "service:worker"], ["Method", "GET"], ["Status", "errors"], ["Capture", "redacted"]]) {
    const select = tree.find((element) => element.type === ui.stubs.Select && element.props.label === label);
    assert.ok(select);
    select.props.onValueChange(value);
  }
  tree.find((element) => element.type === ui.stubs.SegmentedControl)?.props.onValueChange("24h");
  const pause = tree.find((element) => element.type === ui.stubs.Button && element.props.title === "Pause automatic refresh");
  assert.ok(pause);
  pause.props.onClick();
  const reset = tree.find((element) => element.type === ui.stubs.Button && element.props.children === "Clear filters");
  assert.ok(reset);
  reset.props.onClick();
  assert.deepEqual(calls, [["search", "orders"], ["service", "worker"], ["method", "GET"], ["status", "errors"], ["capture", "redacted"], ["range", "24h"], ["pause"], ["reset"]]);
});

test("literal service names stay distinct from the All services option", async () => {
  const ui = await loadContent();
  const calls: string[] = [];
  const tree = ui.render({ service: "all", facets: { services: ["all", "api", "service:worker"], methods: ["GET"] }, onServiceChange: (value) => calls.push(value) });
  const select = tree.find((element) => element.type === ui.stubs.Select && element.props.label === "Service");
  assert.ok(select);
  assert.equal(select.props.value, "service:all");
  assert.equal(select.props.options.find((option: any) => option.value === "all").label, "All services");
  assert.equal(select.props.options.find((option: any) => option.value === "service:all").label, "all");
  select.props.onValueChange("all");
  select.props.onValueChange("service:all");
  select.props.onValueChange("service:service:worker");
  assert.deepEqual(calls, ["", "all", "service:worker"]);
  assert.ok(tree.some((element) => element.type === ui.stubs.Button && element.props.children === "Clear filters"));
  assert.doesNotMatch(render(), /Clear filters/);
});

test("a whole native row opens its inspector once and passes its focus-return target", async () => {
  const ui = await loadContent();
  const calls: any[] = [];
  const tree = ui.render({ onInspect: (...args) => calls.push(args) });
  const row = tree.find((element) => element.type === "button" && element.props["aria-label"]?.includes("/api/checkout"));
  assert.ok(row);
  assert.equal(row.props.type, "button");
  assert.equal(row.props["aria-haspopup"], "dialog");
  assert.equal(row.props["aria-expanded"], false);
  const trigger = { focus: () => {} };
  row.props.onClick({ currentTarget: trigger });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], requests[0]);
  assert.equal(calls[0][1], trigger);
  assert.equal(tree.filter((element) => element.type === "button" && element.props["aria-label"]?.includes("/api/checkout")).length, 1);
  const selected = ui.render({ selectedId: requests[0].id }).find((element) => element.type === "button" && element.props["aria-label"]?.includes("/api/checkout"));
  assert.equal(selected?.props["aria-expanded"], true);
});

test("empty history connects inline and error actions retain the supplied retry callback", async () => {
  const ui = await loadContent();
  let retried = 0;
  const retry = () => { retried++; };
  const emptyProps = { data: { ...data, requests: [], total: 0, hasMore: false, nextCursor: null }, total: 0, onRetry: retry };
  let tree = ui.render(emptyProps);
  const trigger = tree.find((element) => element.type === ui.stubs.Button && element.props["aria-haspopup"] === "dialog");
  assert.ok(trigger);
  assert.equal(trigger.props["aria-expanded"], false);
  trigger.props.onClick();
  tree = ui.render(emptyProps);
  const sheet = tree.find((element) => element.type === ui.stubs.ConnectServiceSheet);
  assert.ok(sheet);
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.orgSlug, "acme");
  assert.equal(sheet.props.onRecheck, retry);
  assert.equal(sheet.props.returnFocusRef, trigger.props.ref);
  sheet.props.onClose();
  assert.equal(ui.render(emptyProps).find((element) => element.type === ui.stubs.ConnectServiceSheet)?.props.open, false);
  const failedRetry = ui.render({ data: null, error: "Failed", onRetry: retry }).find((element) => element.type === ui.stubs.Button && element.props.children === "Try again");
  assert.ok(failedRetry);
  failedRetry.props.onClick();
  const staleRetry = ui.render({ error: "Refresh failed", onRetry: retry }).find((element) => element.type === ui.stubs.Button && element.props.children === "Retry");
  assert.ok(staleRetry);
  staleRetry.props.onClick();
  assert.equal(retried, 2);
});

test("pagination reflects the cursor page, available next cursor and loading state", async () => {
  const ui = await loadContent();
  const calls: string[] = [];
  const tree = ui.render({ page: 1, onPreviousPage: () => calls.push("previous"), onNextPage: () => calls.push("next") });
  const previous = tree.find((element) => element.type === ui.stubs.Button && element.props["aria-label"] === "Previous page");
  const next = tree.find((element) => element.type === ui.stubs.Button && element.props["aria-label"] === "Next page");
  assert.ok(previous && next);
  assert.equal(previous.props.disabled, false);
  assert.equal(next.props.disabled, false);
  previous.props.onClick(); next.props.onClick();
  assert.deepEqual(calls, ["previous", "next"]);
  const first = ui.render();
  assert.equal(first.find((element) => element.type === ui.stubs.Button && element.props["aria-label"] === "Previous page")?.props.disabled, true);
  const last = ui.render({ data: { ...data, hasMore: false, nextCursor: null }, page: 2 });
  assert.equal(last.find((element) => element.type === ui.stubs.Button && element.props["aria-label"] === "Next page")?.props.disabled, true);
  assert.match(render({ page: 1 }), /51[–—-]53 of 125/);
});
