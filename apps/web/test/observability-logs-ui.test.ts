import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { LogsContent, type LogsContentProps } from "../src/components/observability/logs-content";
import * as logsData from "../src/components/observability/logs-data";

Object.assign(globalThis, { React });
const log = (id: string, overrides: Partial<logsData.LogEvent> = {}): logsData.LogEvent => ({
  id, timestamp: "2026-10-05 12:00:00.123456", observedTimestamp: "2026-10-05 12:00:01",
  level: "info", severityNumber: 9, severityText: "INFO", message: `Completed operation ${id}`,
  eventName: "operation.complete", traceId: "0123456789abcdef", spanId: "span", flags: 0,
  service: "payments-worker", serviceNamespace: "byteship", serviceVersion: "v2", environment: "production",
  region: "eu-west", scopeName: "@outray/sdk", scopeVersion: "1.0.0", attributes: { attempts: 0 },
  resourceAttributes: {}, scopeAttributes: {}, ...overrides,
});
const events = [log("info"), log("warning", { level: "warn", message: "Payment retry scheduled" }), log("error", { level: "error", message: "Payment failed" })];
const snapshot: logsData.LogsSnapshot = {
  logs: events, services: ["payments-worker", "checkout-api"], range: "1h",
  requestedSearch: { range: "1h" }, receivedAt: Date.parse("2026-10-05T12:01:00Z"),
};
const props: LogsContentProps = {
  orgSlug: "outray-tunnel", data: snapshot, filters: { range: "1h" }, searchInput: "", isLive: true,
  onSearchInputChange: () => {}, onFiltersChange: () => {}, onClearFilters: () => {}, onToggleLive: () => {},
  onRetry: () => {}, onInspect: () => {},
};

function render(overrides: Partial<LogsContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/outray-tunnel/observability/logs"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(LogsContent, { ...props, ...overrides }) }));
}

/** Execute real view callbacks while portal and animation controls remain inert. */
async function loadContent() {
  const source = await readFile(new URL("../src/components/observability/logs-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const stubs = Object.fromEntries(["Button", "SegmentedControl", "SearchField", "Select", "ConnectServiceSheet", "LogLevelBadge"].map((name) => [name, (componentProps: any) => React.createElement("div", { "data-component": name }, componentProps.children)]));
  const states: any[] = [];
  const refs: Array<{ current: any }> = [];
  let index = 0; let refIndex = 0;
  const module = { exports: {} as { LogsContent: (componentProps: LogsContentProps) => React.ReactNode } };
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
      if (specifier === "./logs-data") return logsData;
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@hugeicons-pro/")) return {};
      if (specifier.startsWith("../") || specifier.startsWith("./")) return stubs;
      throw new Error(`Unexpected Logs view dependency: ${specifier}`);
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
    render(overrides: Partial<LogsContentProps> = {}) { index = 0; refIndex = 0; return elements(module.exports.LogsContent({ ...props, ...overrides })); },
  };
}
const text = (element: React.ReactElement<any>) => renderToStaticMarkup(element);
const namedButton = (elements: React.ReactElement<any>[], label: string) => elements.find((element) => (element.type === "button" || typeof element.type === "function") && typeof element.props.onClick === "function" && text(element).includes(label));
const nativeRows = (elements: React.ReactElement<any>[]) => elements.filter((element) => element.type === "button" && element.props["aria-haspopup"] === "dialog");

test("Logs has a compact heading with solid Pause to the left of the shared animated duration control", async () => {
  for (const range of logsData.LOG_RANGES) {
    const html = render({ filters: { range } });
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
    assert.ok(header);
    assert.match(header, /text-\[20px\] font-normal/);
    assert.match(header, /ml-auto flex max-w-full flex-wrap/);
    assert.ok(header.indexOf("Pause") < header.indexOf('aria-label="Log time range"'));
    assert.equal((header.match(/aria-pressed="true"/g) ?? []).length, 1);
    const chosen = header.match(/<button\b[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(chosen?.includes(`>${range}</span>`));
  }
  const source = await readFile(new URL("../src/components/observability/logs-content.tsx", import.meta.url), "utf8");
  assert.match(source, /@hugeicons-pro\/core-solid-rounded\/PauseIcon/);
  assert.match(source, /@hugeicons-pro\/core-solid-rounded\/PlayIcon/);
  const paused = render({ isLive: false });
  assert.match(paused, /Resume automatic refresh/); assert.match(paused, /Refresh paused/);
  assert.doesNotMatch(paused, /Export|Download|⌘ K|text-\[9px\]|uppercase tracking/);
});

test("filters use custom search and menus, including a missing linked service and a real service called all", async () => {
  const html = render({ filters: { range: "7d", service: "legacy-worker", level: "warn" }, searchInput: "payment" });
  assert.match(html, /type="search"/); assert.match(html, /value="payment"/);
  assert.equal((html.match(/role="combobox"/g) ?? []).length, 2);
  assert.match(html, /legacy-worker/); assert.match(html, /Warning/); assert.match(html, /Clear filters/);
  const hiddenSelects = [...html.matchAll(/<select\b[^>]*>/g)];
  assert.ok(hiddenSelects.every(([element]) => element.includes('aria-hidden="true"') && element.includes('tabindex="-1"')), "Radix may keep hidden native controls for form compatibility");
  const ui = await loadContent();
  const elements = ui.render({ data: { ...snapshot, services: ["all", "api"] }, filters: { range: "1h", service: "all" } });
  const select = elements.find((element) => element.type === ui.stubs.Select && element.props.label === "Service")!;
  assert.equal(select.props.value, "service:all");
  assert.ok(select.props.options.some((option: any) => option.value === "all" && option.label === "All services"));
  assert.ok(select.props.options.some((option: any) => option.value === "service:all" && option.label === "all"));
});

test("search, service, severity, range, clear and live controls dispatch their exact callbacks", async () => {
  const ui = await loadContent();
  const changes: Array<Partial<logsData.LogsSearch>> = []; const searches: string[] = [];
  let clears = 0; let toggles = 0;
  const elements = ui.render({ filters: { range: "24h", service: "payments-worker", level: "warn" }, onFiltersChange: (patch) => changes.push(patch), onSearchInputChange: (value) => searches.push(value), onClearFilters: () => clears++, onToggleLive: () => toggles++ });
  assert.equal(elements.find((element) => element.type === ui.stubs.SearchField)!.props.appearance, "workspace");
  elements.find((element) => element.type === ui.stubs.SearchField)!.props.onValueChange("trace /? id");
  assert.deepEqual(searches, ["trace /? id"]);
  elements.find((element) => element.type === ui.stubs.SegmentedControl)!.props.onValueChange("30d");
  assert.deepEqual({ ...changes.at(-1) }, { range: "30d" });
  const service = elements.find((element) => element.type === ui.stubs.Select && element.props.label === "Service")!;
  service.props.onValueChange("service:checkout-api"); assert.deepEqual({ ...changes.at(-1) }, { service: "checkout-api" });
  service.props.onValueChange("all"); assert.deepEqual({ ...changes.at(-1) }, { service: undefined });
  const severity = elements.find((element) => element.type === ui.stubs.Select && element.props.label === "Severity")!;
  severity.props.onValueChange("error"); assert.deepEqual({ ...changes.at(-1) }, { level: "error" });
  severity.props.onValueChange("all"); assert.deepEqual({ ...changes.at(-1) }, { level: undefined });
  namedButton(elements, "Clear filters")!.props.onClick(); assert.equal(clears, 1);
  namedButton(elements, "Pause")!.props.onClick(); assert.equal(toggles, 1);
});

test("each complete row is one native keyboard-accessible inspector trigger with its focus origin", async () => {
  const ui = await loadContent();
  const inspections: Array<{ event: logsData.LogEvent; trigger: HTMLButtonElement }> = [];
  const elements = ui.render({ onInspect: (event, trigger) => inspections.push({ event, trigger }), selectedId: logsData.logIdentity(events[0]) });
  const rows = nativeRows(elements);
  assert.equal(rows.length, events.length);
  for (const row of rows) {
    assert.equal(row.props.type, "button");
    assert.match(row.props.className, /w-full.*focus-visible/);
    assert.equal(row.props.onKeyDown, undefined, "native buttons handle Enter and Space without duplicate handlers");
    assert.doesNotMatch(text(row), /<a\b|<input\b/);
    const trigger = { focus() {} } as HTMLButtonElement;
    row.props.onClick({ currentTarget: trigger });
    assert.equal(inspections.at(-1)?.trigger, trigger);
  }
  assert.equal(inspections.length, events.length);
  assert.deepEqual(inspections.map(({ event }) => event.id).sort(), events.map(({ id }) => id).sort());
  assert.equal(rows.filter((row) => row.props["aria-expanded"] === true).length, 1);
});

test("severity badges are quiet color-coded labels and unknown values do not pretend to be Info", () => {
  const html = render({ data: { ...snapshot, logs: [log("debug", { level: "debug" }), ...events, log("unknown", { level: "critical", severityText: "LEGACY", severityNumber: 0 })] } });
  assert.match(html, /text-zinc-400[^>]*>[\s\S]*?Debug/);
  assert.match(html, /text-sky-300[^>]*>[\s\S]*?Info/);
  assert.match(html, /text-amber-300[^>]*>[\s\S]*?Warn/);
  assert.match(html, /text-rose-300[^>]*>[\s\S]*?Error/);
  const unknown = [...html.matchAll(/<button\b[^>]*aria-haspopup="dialog"[^>]*>[\s\S]*?<\/button>/g)].find(([row]) => row.includes("LEGACY"))?.[0] ?? "";
  assert.ok(unknown); assert.match(unknown, /text-zinc-400/); assert.doesNotMatch(unknown, /text-sky-300/);
  assert.doesNotMatch(html, /text-\[9px\]|uppercase tracking/);
});

test("messages remain escaped readable text without hiding long content or trace context", () => {
  const plain = '<script>alert("secret")</script>\n' + "long message ".repeat(40);
  const json = '{"amount":0,"ok":false,"html":"<img src=x onerror=alert(1)>"}';
  const html = render({ data: { ...snapshot, logs: [log("plain", { message: plain }), log("json", { message: json }), log("empty", { message: "", service: "", traceId: "", timestamp: "invalid" })] } });
  assert.match(html, /&lt;script&gt;alert\(&quot;secret&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&quot;amount&quot;:0,&quot;ok&quot;:false/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /line-clamp-2 whitespace-pre-wrap/);
  assert.match(html, /\[overflow-wrap:anywhere\]/);
  assert.match(html, /Empty log message/); assert.match(html, /Unknown service/); assert.match(html, /Unknown date/);
  assert.match(html, /Open event to view its trace/);
  assert.doesNotMatch(html, /<script\b|<img\b|Invalid Date|NaN/);
});

test("initial skeletons match responsive rows and do not replace retained events during refresh", () => {
  const loading = render({ data: undefined, loading: true });
  assert.match(loading, /role="status" aria-label="Loading logs" aria-busy="true"/);
  assert.match(loading, /motion-reduce:animate-none/); assert.match(loading, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(loading, /xl:grid-cols-\[115px_100px_170px_minmax\(0,1fr\)_100px_16px\]/);
  assert.doesNotMatch(loading, /No logs in this period|Logs unavailable|aria-haspopup="dialog"/);
  const refresh = render({ loading: true, isFetching: true });
  assert.equal((refresh.match(/aria-haspopup="dialog"/g) ?? []).length, events.length);
  assert.match(refresh, /Updating/); assert.doesNotMatch(refresh, /aria-label="Loading logs"/);
});

test("failed initial load, empty history and filtered no-results provide distinct actions", () => {
  const failed = render({ data: undefined, loading: false, error: "Network failed" });
  assert.match(failed, /role="alert"/); assert.match(failed, /Logs unavailable/); assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /Loading logs|No logs in this period/);
  const empty = render({ data: { ...snapshot, logs: [] } });
  assert.match(empty, /No logs in this period/); assert.match(empty, /last 1h/); assert.match(empty, /Connect a service/);
  assert.doesNotMatch(empty, /No matching logs|Logs unavailable/);
  const filtered = render({ data: { ...snapshot, logs: [], requestedSearch: { range: "7d", service: "missing", search: "needle" } }, filters: { range: "7d", service: "missing", search: "needle" }, searchInput: "needle" });
  assert.match(filtered, /No matching logs/); assert.match(filtered, /missing/); assert.match(filtered, /needle/); assert.match(filtered, /Clear filters/);
  assert.doesNotMatch(filtered, /Connect a service|No logs in this period/);
});

test("retained data explains its real service, severity, search and period during pending or failed selection", () => {
  const previous = { ...snapshot, requestedSearch: { range: "1h" as const, service: "old-worker", level: "warn" as const, search: "old message" } };
  const filters: logsData.LogsSearch = { range: "7d", service: "new-worker", level: "error", search: "new message" };
  const pending = render({ data: previous, filters, searchInput: "new message", isFetching: true });
  assert.match(pending, /Loading your selection · Showing logs from old-worker · warning severity · last 1h · matching “old message”/);
  assert.equal((pending.match(/aria-haspopup="dialog"/g) ?? []).length, events.length);
  assert.doesNotMatch(pending, /Loading logs/);
  const failed = render({ data: previous, filters, searchInput: "new message", error: "Unavailable" });
  assert.match(failed, /Could not refresh logs\. Showing the last available events\./);
  assert.match(failed, /The new selection is unavailable · Showing logs from old-worker/);
  assert.match(failed, /Retry/); assert.match(failed, /Refresh failed/);
  assert.equal((failed.match(/aria-haspopup="dialog"/g) ?? []).length, events.length);
});

test("the footer describes only the newest returned events, never an invented full-history total", () => {
  const short = render();
  assert.match(short, /3 events shown · Newest matching logs/); assert.doesNotMatch(short, /total logs|250 total|Limited to 250/);
  const limited = render({ data: { ...snapshot, logs: Array.from({ length: 250 }, (_, index) => log(`event-${index}`)) } });
  assert.match(limited, /250 events shown · Newest matching logs · Limited to 250/);
  assert.doesNotMatch(limited, /total logs|250 total/);
});

test("unknown or out-of-range refresh timestamps render a missing value without crashing or inventing a date", () => {
  for (const receivedAt of [NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE]) {
    const html = render({ data: { ...snapshot, receivedAt } });
    assert.match(html, /Updated —/);
    assert.doesNotMatch(html, /Invalid Date|NaN|Infinity/);
    assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, events.length);
  }
});

test("timestamps preserve UTC Tinybird records while invalid dates remain explicit", () => {
  const original = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      const html = render({ data: { ...snapshot, logs: [log("valid"), log("invalid", { timestamp: "invalid" })] } });
      assert.match(html, /dateTime="2026-10-05T12:00:00\.123Z"/i);
      assert.match(html, /Unknown date/); assert.doesNotMatch(html, /Invalid Date|NaN/);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("the empty-state setup opens an on-demand sheet and wires retry and focus return", async () => {
  const ui = await loadContent();
  const onRetry = () => {};
  const view = () => ui.render({ data: { ...snapshot, logs: [] }, onRetry });
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
