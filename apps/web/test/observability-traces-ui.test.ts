import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { TracesContent, type TracesContentProps } from "../src/components/observability/traces-content";
import * as tracesData from "../src/components/observability/traces-data";

Object.assign(globalThis, { React });
const trace = (id: string, overrides: Partial<tracesData.TraceSummary> = {}): tracesData.TraceSummary => ({
  id, name: `POST /payments/${id}`, rootService: "payments-worker", startedAt: "2026-10-05 12:00:00.123456",
  duration: 152, spanCount: 3, status: "ok", method: "POST", spans: [], ...overrides,
});
const traces = [trace("success"), trace("error", { status: "error", duration: 1200 })];
const snapshot: tracesData.TracesSnapshot = {
  traces, statistics: { totalTraces: 240, errorTraces: 12, errorRate: 5, p95Duration: 400, longestDuration: 1700 },
  distribution: [{ bucket: "100-250", count: 180 }, { bucket: "1-2s", count: 60 }], range: "1h",
  requestedSearch: { range: "1h" }, receivedAt: Date.parse("2026-10-05T12:01:00Z"),
};
const props: TracesContentProps = {
  orgSlug: "outray-tunnel", data: snapshot, filters: { range: "1h" }, searchInput: "", isLive: true,
  onSearchInputChange: () => {}, onFiltersChange: () => {}, onClearFilters: () => {}, onToggleLive: () => {},
  onRetry: () => {}, onInspect: () => {},
};

function render(overrides: Partial<TracesContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/outray-tunnel/observability/traces"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(TracesContent, { ...props, ...overrides }) }));
}

/** Execute real view callbacks while portal and animated controls remain inert. */
async function loadContent() {
  const source = await readFile(new URL("../src/components/observability/traces-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const stubs = Object.fromEntries(["Button", "SegmentedControl", "SearchField", "Select", "ConnectServiceSheet", "TraceStatusBadge"].map((name) => [name, (componentProps: any) => React.createElement("div", { "data-component": name }, componentProps.children)]));
  const states: any[] = [];
  const refs: Array<{ current: any }> = [];
  let index = 0; let refIndex = 0;
  const module = { exports: {} as { TracesContent: (componentProps: TracesContentProps) => React.ReactNode } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return {
        useMemo: (callback: () => unknown) => callback(),
        useRef: (initial: unknown) => { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useState: (initial: any) => {
          const slot = index++;
          if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
          return [states[slot], (value: any) => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }];
        },
      };
      if (specifier === "./traces-data") return tracesData;
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@outray/icons/")) return {};
      if (specifier.startsWith("../") || specifier.startsWith("./")) return stubs;
      throw new Error(`Unexpected Traces view dependency: ${specifier}`);
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
  return {
    stubs,
    render(overrides: Partial<TracesContentProps> = {}) { index = 0; refIndex = 0; return elements(module.exports.TracesContent({ ...props, ...overrides })); },
  };
}
const text = (element: React.ReactElement<any>) => renderToStaticMarkup(element);
const namedButton = (elements: React.ReactElement<any>[], label: string) => elements.find((element) => (element.type === "button" || typeof element.type === "function") && typeof element.props.onClick === "function" && text(element).includes(label));
const nativeRows = (elements: React.ReactElement<any>[]) => elements.filter((element) => element.type === "button" && element.props["aria-haspopup"] === "dialog");

test("Traces uses the compact heading and solid Pause left of the shared animated duration control", async () => {
  for (const range of tracesData.TRACE_RANGES) {
    const html = render({ filters: { range } });
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
    assert.ok(header); assert.match(header, /text-\[20px\] font-normal/);
    assert.match(header, /ml-auto flex max-w-full flex-wrap/);
    assert.ok(header.indexOf("Pause") < header.indexOf('aria-label="Trace time range"'));
    assert.equal((header.match(/aria-pressed="true"/g) ?? []).length, 1);
    const selected = header.match(/<button\b[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(selected?.includes(`>${range}</span>`));
  }
  const source = await readFile(new URL("../src/components/observability/traces-content.tsx", import.meta.url), "utf8");
  assert.match(source, /@outray\/icons\/solid\/PauseIcon/);
  assert.match(source, /@outray\/icons\/solid\/PlayIcon/);
  const paused = render({ isLive: false });
  assert.match(paused, /Resume automatic refresh/); assert.match(paused, /Refresh paused/);
  assert.doesNotMatch(paused, /Export|Download|⌘ K|text-\[9px\]|uppercase tracking|bg-violet/);
});

test("search and error status use shared controls, not visible browser selects or checkboxes", () => {
  const html = render({ filters: { range: "7d", errorsOnly: true, search: "payment" }, searchInput: "payment" });
  assert.match(html, /type="search"/); assert.match(html, /value="payment"/);
  assert.match(html, /role="combobox"/); assert.match(html, /Errors only/); assert.match(html, /Clear filters/);
  const nativeSelects = [...html.matchAll(/<select\b[^>]*>/g)];
  assert.ok(nativeSelects.every(([element]) => element.includes('aria-hidden="true"') && element.includes('tabindex="-1"')));
  assert.doesNotMatch(html, /type="checkbox"/);
});

test("search, status, range, clear and live controls dispatch their exact callbacks", async () => {
  const ui = await loadContent();
  const changes: Array<Partial<tracesData.TracesSearch>> = []; const searches: string[] = [];
  let clears = 0; let toggles = 0;
  const elements = ui.render({ filters: { range: "24h", errorsOnly: true, search: "payment" }, onFiltersChange: (patch) => changes.push(patch), onSearchInputChange: (value) => searches.push(value), onClearFilters: () => clears++, onToggleLive: () => toggles++ });
  assert.equal(elements.find((element) => element.type === ui.stubs.SearchField)!.props.appearance, "workspace");
  elements.find((element) => element.type === ui.stubs.SearchField)!.props.onValueChange("trace /? id");
  assert.deepEqual(searches, ["trace /? id"]);
  elements.find((element) => element.type === ui.stubs.SegmentedControl)!.props.onValueChange("30d");
  assert.deepEqual({ ...changes.at(-1) }, { range: "30d" });
  const status = elements.find((element) => element.type === ui.stubs.Select && element.props.label === "Status")!;
  assert.equal(status.props.value, "errors");
  status.props.onValueChange("errors"); assert.deepEqual({ ...changes.at(-1) }, { errorsOnly: true });
  status.props.onValueChange("all"); assert.deepEqual({ ...changes.at(-1) }, { errorsOnly: undefined });
  namedButton(elements, "Clear filters")!.props.onClick(); assert.equal(clears, 1);
  namedButton(elements, "Pause")!.props.onClick(); assert.equal(toggles, 1);
});

test("each complete trace row is one native keyboard-accessible inspection trigger carrying its focus origin", async () => {
  const ui = await loadContent();
  const inspections: Array<{ trace: tracesData.TraceSummary; trigger: HTMLButtonElement }> = [];
  const elements = ui.render({ onInspect: (summary, trigger) => inspections.push({ trace: summary, trigger }), selectedId: tracesData.traceIdentity(traces[0]) });
  const rows = nativeRows(elements);
  assert.equal(rows.length, traces.length);
  for (const row of rows) {
    assert.equal(row.props.type, "button"); assert.match(row.props.className, /w-full.*focus-visible/);
    assert.match(row.props.className, /motion-reduce:transition-none/);
    assert.equal(row.props.onKeyDown, undefined, "Enter and Space should use native button behavior without duplicate handling");
    assert.doesNotMatch(text(row), /<a\b|<input\b|<button\b[\s\S]*<button\b/);
    const trigger = { focus() {} } as HTMLButtonElement;
    row.props.onClick({ currentTarget: trigger }); assert.equal(inspections.at(-1)?.trigger, trigger);
  }
  assert.deepEqual(inspections.map(({ trace: summary }) => summary.id).sort(), traces.map(({ id }) => id).sort());
  assert.equal(rows.filter((row) => row.props["aria-expanded"] === true).length, 1);
});

test("recorded statuses have quiet labeled colors and unknown data never appears successful", () => {
  const html = render({ data: { ...snapshot, traces: [...traces, trace("unknown", { status: "unset" })] } });
  const rows = [...html.matchAll(/<button\b[^>]*aria-haspopup="dialog"[^>]*>[\s\S]*?<\/button>/g)].map(([row]) => row);
  const success = rows.find((row) => row.includes("payments/success"))!;
  const failed = rows.find((row) => row.includes("payments/error"))!;
  const unknown = rows.find((row) => row.includes("payments/unknown"))!;
  assert.match(success, /text-emerald-300[^>]*>[\s\S]*?OK/);
  assert.match(failed, /text-rose-300[^>]*>[\s\S]*?Error/);
  assert.match(unknown, /text-zinc-400[^>]*>[\s\S]*?Unknown/);
  assert.doesNotMatch(unknown, /text-emerald-300/);
});

test("statistics and duration distribution explicitly cover all traces, not the filtered returned list", () => {
  const filtered = { ...snapshot, traces: [traces[1]], requestedSearch: { range: "1h" as const, search: "failed-route", errorsOnly: true as const } };
  const html = render({ data: filtered, filters: filtered.requestedSearch, searchInput: "failed-route" });
  const stats = html.match(/<section\b[^>]*aria-label="Trace statistics"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(stats, /Across all traces/); assert.match(stats, /Last 1h/);
  assert.match(stats, /Total traces[\s\S]*?>240</); assert.match(stats, /Error traces[\s\S]*?>12</);
  assert.match(stats, /5% of all traces/); assert.match(stats, /400 ms/); assert.match(stats, /1\.7 s/);
  assert.match(html, /1 trace shown · Newest matching traces/);
  const details = stats.match(/<details\b[^>]*>/)?.[0];
  assert.ok(details); assert.doesNotMatch(details, /\bopen\b/);
  assert.match(stats, /<summary\b/); assert.match(stats, /Duration distribution/);
  assert.match(stats, /All traces · Last 1h/); assert.match(stats, /aria-label="Trace counts by duration"/);
  assert.match(stats, /180/); assert.match(stats, /60/); assert.doesNotMatch(stats, /bg-violet|bg-purple/);
});

test("measurements retain real zeroes and invalid data is never shown as NaN or fabricated success", () => {
  const emptyStats = { totalTraces: 0, errorTraces: 0, errorRate: 0, p95Duration: 0, longestDuration: 0 };
  const html = render({ data: { ...snapshot, statistics: emptyStats, distribution: [], traces: [trace("zero", { duration: 0, spanCount: 0 }), trace("invalid", { name: "", rootService: "", startedAt: "bad date", duration: NaN, spanCount: Infinity, status: "unknown" })] } });
  assert.match(html, /No measured traces/); assert.match(html, /No measured duration distribution in this period/);
  assert.match(html, /0 ms/); assert.match(html, /Unnamed operation/); assert.match(html, /Unknown service/); assert.match(html, /Unknown date/);
  assert.doesNotMatch(html, /NaN|Infinity|Invalid Date/);
});

test("operation and service names remain escaped text with readable long content", () => {
  const html = render({ data: { ...snapshot, traces: [trace("unsafe", { name: '<script>alert("secret")</script> ' + "long operation ".repeat(35), rootService: "<img src=x onerror=alert(1)>" })] } });
  assert.match(html, /&lt;script&gt;alert\(&quot;secret&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /line-clamp-2/); assert.match(html, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(html, /<script\b|<img\b/);
});

test("initial statistics and row skeletons match the responsive layout without replacing retained traces", () => {
  const html = render({ data: undefined, loading: true });
  assert.match(html, /role="status" aria-label="Loading trace statistics" aria-busy="true"/);
  assert.match(html, /role="status" aria-label="Loading traces" aria-busy="true"/);
  assert.match(html, /motion-reduce:animate-none/); assert.match(html, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(html, /xl:grid-cols-\[minmax\(0,1fr\)_90px_165px_115px_95px_55px_16px\]/);
  assert.doesNotMatch(html, /No traces in this period|Traces unavailable|aria-haspopup="dialog"/);
  const refreshing = render({ loading: true, isFetching: true });
  assert.equal((refreshing.match(/aria-haspopup="dialog"/g) ?? []).length, traces.length);
  assert.match(refreshing, /Updating/); assert.doesNotMatch(refreshing, /aria-label="Loading traces"|aria-label="Loading trace statistics"/);
});

test("initial failure, no activity and filtered no-results provide distinct recovery actions", () => {
  const failure = render({ data: undefined, loading: false, error: "Network failed" });
  assert.match(failure, /role="alert"/); assert.match(failure, /Traces unavailable/); assert.match(failure, /Try again/);
  assert.doesNotMatch(failure, /Loading traces|No traces in this period|Trace statistics/);
  const empty = render({ data: { ...snapshot, traces: [] } });
  assert.match(empty, /No traces in this period/); assert.match(empty, /last 1h/); assert.match(empty, /Connect a service/);
  assert.doesNotMatch(empty, /No matching traces|Traces unavailable/);
  const filters = { range: "7d" as const, search: "needle", errorsOnly: true as const };
  const filtered = render({ data: { ...snapshot, traces: [], requestedSearch: filters, range: "7d" }, filters, searchInput: "needle" });
  assert.match(filtered, /No matching traces/); assert.match(filtered, /error traces/); assert.match(filtered, /needle/); assert.match(filtered, /Clear filters/);
  assert.doesNotMatch(filtered, /Connect a service|No traces in this period/);
});

test("retained evidence explains its real period and filters while a new selection is loading or failed", () => {
  const oldFilters = { range: "1h" as const, search: "old operation", errorsOnly: true as const };
  const previous = { ...snapshot, requestedSearch: oldFilters };
  const filters = { range: "7d" as const, search: "new operation" };
  const pending = render({ data: previous, filters, searchInput: "new operation", isFetching: true });
  assert.match(pending, /Loading your selection · Showing error traces · last 1h · matching “old operation”/);
  assert.match(pending, /Across all traces[\s\S]*?Last 1h/);
  assert.equal((pending.match(/aria-haspopup="dialog"/g) ?? []).length, traces.length, "retained rows must not be silently re-filtered by the pending URL selection");
  assert.doesNotMatch(pending, /Loading traces/);
  const failed = render({ data: previous, filters, searchInput: "new operation", error: "Unavailable" });
  assert.match(failed, /Could not refresh traces\. Showing the last available data\./);
  assert.match(failed, /The new selection is unavailable · Showing error traces/);
  assert.match(failed, /Retry/); assert.match(failed, /Refresh failed/);
  assert.equal((failed.match(/aria-haspopup="dialog"/g) ?? []).length, traces.length);
});

test("the footer counts returned newest matches, never substitutes aggregate totals or invents pagination", () => {
  const short = render();
  assert.match(short, /2 traces shown · Newest matching traces/); assert.doesNotMatch(short, /240 traces shown|Limited to 100|Load more/);
  const limited = render({ data: { ...snapshot, traces: Array.from({ length: 100 }, (_, index) => trace(`trace-${index}`)) } });
  assert.match(limited, /100 traces shown · Newest matching traces · Limited to 100/);
  assert.doesNotMatch(limited, /100 total|Load more/);
});

test("refresh dates and Tinybird UTC timestamps do not invent values across local timezones", () => {
  for (const receivedAt of [NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE]) {
    const html = render({ data: { ...snapshot, receivedAt } });
    assert.match(html, /Updated —/); assert.doesNotMatch(html, /Invalid Date|NaN|Infinity/);
  }
  const original = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      const html = render();
      assert.match(html, /dateTime="2026-10-05T12:00:00\.123Z"/i);
      assert.doesNotMatch(html, /Invalid Date|NaN/);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("no-activity setup opens an on-demand service sheet with retry and focus restoration", async () => {
  const ui = await loadContent();
  const onRetry = () => {};
  const view = () => ui.render({ data: { ...snapshot, traces: [] }, onRetry });
  const trigger = namedButton(view(), "Connect a service")!;
  assert.equal(trigger.props.size, "md");
  assert.equal(trigger.props["aria-haspopup"], "dialog"); assert.equal(trigger.props["aria-expanded"], false);
  assert.equal(view().find((element) => element.type === ui.stubs.ConnectServiceSheet)?.props.open, false);
  trigger.props.onClick();
  const sheet = view().find((element) => element.type === ui.stubs.ConnectServiceSheet)!;
  assert.equal(sheet.props.open, true); assert.equal(sheet.props.orgSlug, "outray-tunnel");
  assert.equal(sheet.props.returnFocusRef, trigger.props.ref); assert.equal(sheet.props.onRecheck, onRetry);
  sheet.props.onClose(); assert.equal(view().find((element) => element.type === ui.stubs.ConnectServiceSheet)?.props.open, false);
});
