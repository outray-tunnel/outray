import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import {
  TraceContext,
  TraceDetailsError,
  TraceInspectorSummary,
  TraceSpanContent,
  TraceWaterfall,
  TraceWaterfallSkeleton,
} from "../src/components/observability/trace-inspector";
import { orderedTraceSpans, traceTimelineDuration } from "../src/components/observability/trace-waterfall-data";
import * as waterfallData from "../src/components/observability/trace-waterfall-data";
import * as traceData from "../src/components/observability/traces-data";
import * as logData from "../src/components/observability/logs-data";

Object.assign(globalThis, { React });
const trace: traceData.TraceSummary = { id: "trace /with?characters", name: "POST /v1/payments", rootService: "payments worker", startedAt: "2026-10-05 12:00:00.123", duration: 300, spanCount: 3, status: "error", method: "POST", spans: [] };
const rootSpan: traceData.TraceSpan = { id: "root", parentId: null, name: "POST /v1/payments", service: "payments worker", startedAt: trace.startedAt, duration: 300, offset: 0, status: "ok", kind: 2, statusMessage: "", attributes: { "http.status_code": 200 }, resourceAttributes: { "service.version": "2.4" }, events: [], links: [] };
const childSpan: traceData.TraceSpan = { ...rootSpan, id: "child", parentId: "root", name: "<script>database</script>", offset: 50, duration: 150, status: "error", statusMessage: "Connection refused\nRetry limit reached.", kind: 3, attributes: { "db.operation": "SELECT", attempt: 0, retry: false, nested: { key: "value" }, empty: "" }, events: [{ name: "exception", attributes: { "exception.message": "<b>failed</b>" } }], links: [{ traceId: "linked-trace", spanId: "linked-span" }] };
const grandchild: traceData.TraceSpan = { ...rootSpan, id: "grandchild", parentId: "child", name: "Cache lookup", offset: 70, duration: 0 };

function markup(component: React.ReactElement) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/acme/observability/traces"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: component }));
}

test("trace summary uses readable metadata, shared copy, service and range-scoped log links", () => {
  const html = markup(React.createElement(TraceInspectorSummary, { trace, orgSlug: "acme", range: "24h" }));
  assert.match(html, /href="\/acme\/observability\/services\/payments%20worker"/);
  const href = html.match(/href="(\/acme\/observability\/logs[^"]*)"/)?.[1];
  assert.ok(href);
  const url = new URL(href.replaceAll("&amp;", "&"), "https://outray.co");
  assert.equal(url.searchParams.get("search"), trace.id);
  assert.equal(url.searchParams.get("range"), "24h");
  assert.match(html, /dateTime="2026-10-05T12:00:00\.123Z"/i);
  assert.match(html, /aria-label="Copy trace ID"/);
  assert.match(html, /text-rose-300|text-rose-400/);
  assert.match(html, /Recorded spans|300 ms|POST \/v1\/payments/);
  assert.doesNotMatch(html, /localhost|text-\[9px\]|uppercase/);
});

test("missing trace measurements do not fabricate success, times, links, or zeros", () => {
  const html = markup(React.createElement(TraceInspectorSummary, { trace: { ...trace, id: "", name: "", rootService: "", startedAt: "invalid", duration: NaN, spanCount: -1, status: "unknown" }, orgSlug: "acme" }));
  assert.match(html, /Unknown|Unnamed operation|No trace ID/);
  assert.doesNotMatch(html, /href=|dateTime=|Invalid Date|0 ms|Copy trace ID/);
});

test("waterfall hierarchy is parent-first even when spans arrive out of order", () => {
  const spans = [grandchild, childSpan, rootSpan];
  const before = [...spans];
  const rows = orderedTraceSpans(spans);
  assert.deepEqual(rows.map((row) => [row.span.id, row.depth]), [["root", 0], ["child", 1], ["grandchild", 2]]);
  assert.deepEqual(spans, before);
  assert.equal(new Set(rows.map((row) => row.key)).size, spans.length);
});

test("orphan, self-parent, repeated ID and cyclic spans remain visible once", () => {
  const spans = [
    { ...rootSpan, id: "a", parentId: "b" },
    { ...rootSpan, id: "b", parentId: "a" },
    { ...rootSpan, id: "orphan", parentId: "missing" },
    { ...rootSpan, id: "self", parentId: "self" },
    { ...rootSpan, id: "a", parentId: null },
  ];
  const rows = orderedTraceSpans(spans);
  assert.equal(rows.length, spans.length);
  assert.equal(new Set(rows.map((row) => row.index)).size, spans.length);
  assert.equal(new Set(rows.map((row) => row.key)).size, spans.length);
});

test("very deep traces do not overflow the stack or lose spans", () => {
  const spans = Array.from({ length: 12_000 }, (_, index) => ({ ...rootSpan, id: String(index), parentId: index ? String(index - 1) : null, offset: index }));
  const rows = orderedTraceSpans(spans);
  assert.equal(rows.length, spans.length);
  assert.equal(rows.at(-1)?.depth, 11_999);
});

test("timeline extent only uses finite measured durations and actual span endings", () => {
  assert.equal(traceTimelineDuration({ duration: 300 }, [childSpan]), 300);
  assert.equal(traceTimelineDuration({ duration: 10 }, [childSpan]), 200);
  assert.equal(traceTimelineDuration({ duration: NaN }, [{ ...rootSpan, duration: NaN }, { ...rootSpan, duration: -1 }, { ...rootSpan, offset: Infinity }]), 0);
  assert.equal(traceTimelineDuration({ duration: 0 }, [{ ...rootSpan, duration: 0, offset: 0 }]), 0);
  assert.equal(traceTimelineDuration({ duration: 300 }, [{ ...rootSpan, offset: Number.MAX_VALUE, duration: Number.MAX_VALUE }]), 300);
});

test("waterfall rows are whole native buttons, unselected by default, neutral and responsive", () => {
  const html = markup(React.createElement(TraceWaterfall, { trace, spans: [grandchild, childSpan, rootSpan], onSelect: () => {} }));
  assert.equal((html.match(/<button /g) ?? []).length, 3);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 3);
  assert.match(html, /Select an operation/);
  assert.match(html, /bg-zinc-400\/50|bg-rose-400\/65/);
  assert.match(html, /Nested span, level 3/);
  assert.match(html, /&lt;script&gt;database&lt;\/script&gt;/);
  assert.match(html, /md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_64px\]/);
  assert.match(html, /focus-visible:outline|motion-reduce:transition-none/);
  assert.match(html, /max-h-\[320px\].*overflow-y-auto.*overscroll-contain/);
  assert.match(html, /Instant span/);
  assert.doesNotMatch(html, /bg-violet|bg-purple|170px|220px|NaN%|Infinity%|<script>/);
  const key = orderedTraceSpans([rootSpan])[0].key;
  const selected = markup(React.createElement(TraceWaterfall, { trace, spans: [rootSpan], selectedKey: key, selectedPanelId: "selected-span", onSelect: () => {} }));
  assert.match(selected, /aria-pressed="true"/);
  assert.match(selected, /aria-controls="selected-span"/);
});

test("empty spans are a completed state and invalid timing renders no invented bar", () => {
  const empty = markup(React.createElement(TraceWaterfall, { trace, spans: [], onSelect: () => {} }));
  assert.match(empty, /No spans recorded/);
  assert.doesNotMatch(empty, /Loading|<button /);
  const invalid = markup(React.createElement(TraceWaterfall, { trace: { ...trace, duration: 0 }, spans: [{ ...rootSpan, duration: NaN, offset: Infinity }], onSelect: () => {} }));
  assert.match(invalid, /Timing unavailable/);
  assert.doesNotMatch(invalid, /NaN|Infinity|style="(?:width|left):/);
});

test("selected span exposes IDs, measured context, escaped attributes, events and links", () => {
  const html = markup(React.createElement(TraceSpanContent, { span: childSpan }));
  assert.match(html, /Selected operation|Client|Connection refused\nRetry limit reached\./);
  assert.match(html, /Copy Span ID|Copy Parent span/);
  assert.match(html, /db\.operation|SELECT|Resource attributes|service\.version|2\.4/);
  assert.match(html, /attempt.*>0</s);
  assert.match(html, /retry.*false/s);
  assert.match(html, /&lt;script&gt;database&lt;\/script&gt;|&lt;b&gt;failed&lt;\/b&gt;/);
  assert.match(html, /exception|linked-trace|linked-span/);
  assert.match(html, /<details class="group/);
  assert.doesNotMatch(html, /<script>|<b>failed<\/b>|text-\[9px\]/);
});

test("legacy missing attributes and unknown kind remain readable without fake data", () => {
  const html = markup(React.createElement(TraceSpanContent, { span: { ...rootSpan, kind: 999, parentId: null, attributes: null, resourceAttributes: null, events: [], links: [] } }));
  assert.match(html, /Unknown|No attributes recorded|No events recorded|No links recorded/);
  assert.doesNotMatch(html, /Copy Parent span|undefined is not|\[object Object\]/);
  const context = markup(React.createElement(TraceContext, { trace }));
  assert.match(context, /HTTP method|POST|Root service|payments worker/);
});

test("span loading is a layout-matched reduced-motion skeleton and failure keeps summary available", () => {
  const skeleton = markup(React.createElement(TraceWaterfallSkeleton));
  assert.match(skeleton, /role="status"|aria-busy="true"|Loading trace spans/);
  assert.match(skeleton, /motion-reduce:animate-none/);
  assert.equal((skeleton.match(/min-h-\[72px\]/g) ?? []).length, 5);
  const failure = markup(React.createElement(TraceDetailsError, { error: "This trace is no longer available.", onRetry: () => {} }));
  assert.match(failure, /role="alert"|trace summary is still available|Try again/);
});

interface ElementProps { [key: string]: any }
type Element = React.ReactElement<ElementProps>;
async function loadInspector(fetchDetails: (...args: any[]) => Promise<traceData.TraceDetailsResponse>, hooks?: Record<string, unknown>) {
  const source = await readFile(new URL("../src/components/observability/trace-inspector.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { useTraceDetails };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const components = { SideSheet: () => null, CopyButton: () => null, Tabs: () => null, TabsList: () => null, TabsTrigger: () => null, TabsContent: () => null, Button: () => null, JsonViewer: () => null, TraceStatusBadge: () => null };
  const module = { exports: {} as Record<string, (...args: any[]) => any> };
  runInNewContext(compiled, {
    React, AbortController, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useId: () => "span-panel", ...(hooks ?? { useState: (initial: unknown) => [initial, () => {}], useEffect: () => {} }) };
      if (specifier === "./traces-data") return traceData;
      if (specifier === "./trace-waterfall-data") return waterfallData;
      if (specifier === "./logs-data") return logData;
      if (specifier === "./traces-query") return { fetchTraceDetails: fetchDetails };
      if (specifier === "@tanstack/react-router") return { Link: () => null };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      return components;
    },
  });
  return { components, exports: module.exports, source };
}

test("shared modal restores focus, keys org and trace, and uses the neutral Arc tab hooks", async () => {
  const writes: unknown[] = [];
  let copyError = false;
  const { exports, components, source } = await loadInspector(async () => ({ traceId: trace.id, spans: [] }), { useState: (initial: unknown) => [typeof initial === "boolean" ? copyError : initial, (next: unknown) => writes.push(next)], useEffect: () => {} });
  const ref = { current: null };
  const close = () => {};
  const sheet = exports.TraceInspector({ trace, orgSlug: "acme", onClose: close, returnFocusRef: ref, range: "24h" }) as Element;
  assert.equal(sheet.type, components.SideSheet);
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.onClose, close);
  assert.equal(sheet.props.returnFocusRef, ref);
  const session = sheet.props.children as Element;
  assert.equal(session.key, JSON.stringify(["acme", trace.id, trace.startedAt]));
  const other = exports.TraceInspector({ trace, orgSlug: "other", onClose: close }).props.children as Element;
  assert.notEqual(session.key, other.key);
  assert.equal(exports.TraceInspector({ trace: null, orgSlug: "acme", onClose: close }).props.open, false);
  const tree = (session.type as (props: ElementProps) => Element)(session.props);
  const summary = tree.props.children[0] as Element;
  assert.equal(summary.props.range, "24h");
  summary.props.onCopyError(); summary.props.onCopied();
  assert.deepEqual(writes, [true, false]);
  const tabs = tree.props.children[2] as Element;
  assert.equal(tabs.type, components.Tabs);
  assert.match(tabs.props.className, /outray-arc-tunnel-tabs/);
  const list = tabs.props.children[0] as Element;
  assert.equal(list.props["data-outray-tabs-list"], true);
  assert.deepEqual(list.props.children.map((trigger: Element) => [trigger.props.value, trigger.props["data-outray-tabs-trigger"]]), [["waterfall", true], ["context", true], ["raw", true]]);
  tabs.props.onValueChange("context");
  assert.equal(writes.at(-1), "context");
  copyError = true;
  const failed = (session.type as (props: ElementProps) => Element)(session.props);
  assert.equal(failed.props.children[1].props.role, "alert");
  assert.doesNotMatch(source, /document\.body|addEventListener|AnimatePresence|bg-purple|bg-violet|navigator\.clipboard/);
});

test("span row callbacks choose the clicked real span; no first-row auto selection", async () => {
  const picked: string[] = [];
  const { exports } = await loadInspector(async () => ({ traceId: trace.id, spans: [] }));
  const tree = exports.TraceWaterfall({ trace, spans: [rootSpan, childSpan], onSelect: (key: string) => picked.push(key) }) as Element;
  const buttons: Element[] = [];
  function visit(node: unknown) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!React.isValidElement(node)) return;
    const element = node as Element;
    if (element.type === "button") buttons.push(element);
    visit(element.props.children);
  }
  visit(tree);
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].props["aria-pressed"], false);
  assert.equal(buttons[1].props["aria-pressed"], false);
  buttons[1].props.onClick();
  assert.deepEqual(picked, [orderedTraceSpans([rootSpan, childSpan])[1].key]);
});

test("detail controller aborts switch/unmount, ignores late cross-org responses and retries failures", async () => {
  const states: unknown[] = [];
  let cursor = 0;
  let previousDeps: unknown[] | undefined;
  let pendingEffect: (() => (() => void)) | undefined;
  let cleanup: (() => void) | undefined;
  const requests: Array<{ orgSlug: string; id: string; signal: AbortSignal; resolve: (data: traceData.TraceDetailsResponse) => void; reject: (error: Error) => void }> = [];
  const hooks = {
    useState: (initial: unknown) => {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (next: unknown) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
    },
    useEffect: (effect: () => (() => void), deps: unknown[]) => {
      if (!previousDeps || deps.some((value, index) => previousDeps?.[index] !== value)) pendingEffect = effect;
      previousDeps = deps;
    },
  };
  const { exports } = await loadInspector((orgSlug, id, signal) => new Promise((resolve, reject) => requests.push({ orgSlug, id, signal, resolve, reject })), hooks);
  const render = (orgSlug: string, id: string | null) => { cursor = 0; return exports.useTraceDetails(orgSlug, id); };
  const effects = () => { if (pendingEffect) { cleanup?.(); cleanup = pendingEffect(); pendingEffect = undefined; } };
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  assert.equal(render("acme", "shared-id").loading, true);
  effects();
  assert.equal(requests.length, 1);
  render("other", "shared-id"); effects();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve({ traceId: "shared-id", spans: [rootSpan] });
  await settle();
  assert.equal(render("other", "shared-id").data, null);
  requests[1].reject(new Error("Trace details are temporarily unavailable."));
  await settle();
  const failed = render("other", "shared-id");
  assert.equal(failed.loading, false);
  assert.match(failed.error, /temporarily unavailable/);
  failed.retry(); render("other", "shared-id"); effects();
  assert.equal(requests.length, 3);
  assert.equal(render("other", "shared-id").loading, true);
  requests[2].resolve({ traceId: "shared-id", spans: [] }); await settle();
  const empty = render("other", "shared-id");
  assert.equal(empty.loading, false);
  assert.deepEqual(empty.data.spans, []);
  empty.retry(); render("other", "shared-id"); effects();
  assert.equal(render("other", null).loading, false);
  effects();
  assert.equal(requests[3].signal.aborted, true);
  assert.equal(requests.length, 4);
  const before = states[0];
  requests[3].resolve({ traceId: "shared-id", spans: [childSpan] }); await settle();
  assert.equal(states[0], before);
});
