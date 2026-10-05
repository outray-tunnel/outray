import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { LogInspectorContent, LogInspectorSummary } from "../src/components/observability/log-inspector";
import { LogLevelBadge } from "../src/components/observability/log-level-badge";
import * as logData from "../src/components/observability/logs-data";
import { formatBody } from "../src/components/requests/json-viewer";

Object.assign(globalThis, { React });
const event: logData.LogEvent = {
  id: "log-1", timestamp: "2026-10-05T12:00:00.123Z", observedTimestamp: "2026-10-05 12:00:00.456",
  level: "error", severityNumber: 21, severityText: "FATAL", message: "Payment refused\nRetry after checking credentials.",
  eventName: "payment.refused", traceId: "trace / with?characters", spanId: "span-1", flags: 0,
  service: "payments worker", serviceNamespace: "payments", serviceVersion: "2.3.1", environment: "production", region: "fra1",
  scopeName: "@outray/sdk", scopeVersion: "1.0.0", attributes: { attempt: 0, retryable: false, message: "<script>alert(1)</script>", nested: { status: "declined" } },
  resourceAttributes: { "service.name": "payments worker", "service.namespace": "payments" }, scopeAttributes: { "instrumentation.library": "outray", empty: "" },
};

function markup(component: React.ReactElement) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/acme/observability/logs"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: component }));
}

test("severity badges share compact icons, human labels and consistent colors", () => {
  for (const [level, label, tone] of [["debug", "Debug", "zinc"], ["info", "Info", "sky"], ["warn", "Warning", "amber"], ["error", "Error", "rose"]]) {
    const html = renderToStaticMarkup(React.createElement(LogLevelBadge, { event: { ...event, level } }));
    assert.match(html, new RegExp(`>${label}<`));
    assert.match(html, new RegExp(`text-${tone}-`));
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
    assert.match(html, /min-h-6 w-fit/);
    assert.doesNotMatch(html, />FATAL</);
  }
  const unknown = renderToStaticMarkup(React.createElement(LogLevelBadge, { event: { ...event, level: "", severityText: "" } }));
  assert.match(unknown, />Unknown</);
  assert.match(unknown, /text-zinc-400/);
});

test("SDK severity text is optionally preserved without changing level color", () => {
  const html = renderToStaticMarkup(React.createElement(LogLevelBadge, { event, preserveSeverityText: true }));
  assert.match(html, />FATAL</);
  assert.match(html, /text-rose-300/);
});

test("summary has org-scoped service and trace links, native timestamp and shared ID copy", () => {
  const html = markup(React.createElement(LogInspectorSummary, { event, orgSlug: "acme" }));
  assert.match(html, /href="\/acme\/observability\/services\/payments%20worker"/);
  const traceHref = html.match(/href="(\/acme\/observability\/traces[^"]*)"/)?.[1];
  assert.ok(traceHref);
  assert.equal(new URL(traceHref, "https://outray.co").searchParams.get("search"), event.traceId);
  assert.match(html, /dateTime="2026-10-05T12:00:00\.123Z"/i);
  assert.match(html, /aria-label="Copy event ID"/);
  assert.match(html, /payment\.refused|production|fra1/);
  assert.match(html, /grid-cols-2/);
  assert.doesNotMatch(html, /localhost|text-\[9px\]|uppercase/);
});

test("missing context never generates a broken link or fabricated timestamp", () => {
  const html = markup(React.createElement(LogInspectorSummary, { event: { ...event, id: "", timestamp: "bad", traceId: "", service: "", environment: "", eventName: "" }, orgSlug: "acme" }));
  assert.doesNotMatch(html, /href=|dateTime=|Copy event ID|View trace|Invalid Date/);
  assert.match(html, /No event ID/);
});

test("plain multiline messages remain readable and HTML-looking text is escaped", () => {
  const html = markup(React.createElement(LogInspectorContent, { event: { ...event, message: "<script>boom</script>\nsecond line\n    indented" } }));
  assert.match(html, /&lt;script&gt;boom&lt;\/script&gt;\nsecond line\n {4}indented/);
  assert.match(html, /whitespace-pre-wrap/);
  assert.match(html, /aria-label="Copy message"/);
  assert.doesNotMatch(html, /<script>|Message format|Pretty|No message/);
});

test("empty message is distinct from available structured primitive messages", () => {
  const empty = markup(React.createElement(LogInspectorContent, { event: { ...event, message: "" } }));
  assert.match(empty, /No message recorded/);
  assert.match(empty, /aria-label="Copy message"[^>]*disabled=""/);
  for (const message of ["0", "false", "null", "[]", "{}", '"a string"']) {
    const html = markup(React.createElement(LogInspectorContent, { event: { ...event, message } }));
    assert.match(html, /Message format/);
    assert.doesNotMatch(html, /No message recorded/);
    assert.match(html, /aria-label="Copy message"/);
  }
});

test("structured objects have accessible Pretty and Raw controls and expandable JSON", () => {
  const html = markup(React.createElement(LogInspectorContent, { event: { ...event, message: '{"message":"<b>safe</b>","items":[0,false]}' } }));
  assert.match(html, /aria-label="Message format"/);
  assert.match(html, /aria-pressed="true"[^>]*>.*Pretty/s);
  assert.match(html, /Expand all JSON fields/);
  assert.match(html, /aria-label="Collapse object at root"/);
  assert.match(html, /&lt;b&gt;safe&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>safe<\/b>/);
});

test("context includes timing, raw severity, correlation and all three attribute families", () => {
  const html = markup(React.createElement(LogInspectorContent, { event, tab: "context" }));
  assert.match(html, /Severity text.*FATAL/s);
  assert.match(html, /Severity number.*21/s);
  assert.match(html, /Trace flags.*>0</s);
  assert.match(html, /2026-10-05T12:00:00\.456Z/);
  assert.match(html, /Copy Trace ID|Copy Span ID/);
  assert.match(html, /aria-label="Log attributes"/);
  assert.match(html, /aria-label="Resource attributes"/);
  assert.match(html, /aria-label="Scope attributes"/);
  assert.match(html, /instrumentation\.library|@outray\/sdk|2\.3\.1/);
  assert.match(html, /<details class="group/);
  assert.match(html, /retryable.*false/s);
  assert.match(html, /attempt.*>0</s);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|text-zinc-700|uppercase/);
});

test("null or malformed legacy attributes remain inspectable and long keys wrap", () => {
  const html = markup(React.createElement(LogInspectorContent, { event: { ...event, attributes: null, resourceAttributes: [] as unknown as Record<string, unknown>, scopeAttributes: { ["verylong.".repeat(30)]: "x".repeat(1000) } }, tab: "context" }));
  assert.match(html, /No attributes recorded/);
  assert.match(html, /verylong\./);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.doesNotMatch(html, /undefined is not|\[object Object\]/);
});

test("raw event JSON preserves the complete record, stays on demand and is safely escaped", () => {
  const html = markup(React.createElement(LogInspectorContent, { event, tab: "raw" }));
  assert.match(html, /Copy event JSON/);
  assert.match(html, /observedTimestamp|scopeAttributes|resourceAttributes|serviceNamespace|severityNumber|flags/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  const messageHtml = markup(React.createElement(LogInspectorContent, { event }));
  assert.doesNotMatch(messageHtml, /scopeAttributes|Copy event JSON/);
});

test("shared sidesheet is controlled, restores the opener and keys all local state by org and event", async () => {
  const source = await readFile(new URL("../src/components/observability/log-inspector.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const components = { SideSheet: () => null, CopyButton: () => null, Tabs: () => null, TabsList: () => null, TabsTrigger: () => null, TabsContent: () => null, SegmentedControl: () => null, JsonViewer: () => null, LogLevelBadge: () => null };
  const states: unknown[] = [];
  const writes: unknown[] = [];
  let raw = false;
  let copyError = false;
  const module = { exports: {} as { LogInspector: (props: Record<string, unknown>) => React.ReactElement<any>; LogInspectorContent: (props: Record<string, unknown>) => React.ReactElement<any> } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useState: (value: unknown) => { states.push(value); return [raw && value === "pretty" ? "raw" : value === false ? copyError : value, (next: unknown) => writes.push(next)]; } };
      if (specifier === "./logs-data") return logData;
      if (specifier === "@/components/requests/json-viewer") return { ...components, formatBody };
      if (specifier === "@tanstack/react-router") return { Link: () => null };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      return components;
    },
  });
  const ref = { current: null };
  const close = () => {};
  const props = { event, orgSlug: "acme", onClose: close, returnFocusRef: ref };
  const sheet = module.exports.LogInspector(props);
  assert.equal(sheet.type, components.SideSheet);
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.onClose, close);
  assert.equal(sheet.props.returnFocusRef, ref);
  const session = sheet.props.children as React.ReactElement<any>;
  assert.equal(session.key, `acme:${logData.logIdentity(event)}`);
  const sessionTree = (session.type as (props: any) => React.ReactElement<any>)(session.props);
  assert.deepEqual(states, ["message", false]);
  const summary = sessionTree.props.children[0] as React.ReactElement<any>;
  summary.props.onCopyError();
  summary.props.onCopied();
  assert.deepEqual(writes, [true, false]);
  const tabs = sessionTree.props.children[2] as React.ReactElement<any>;
  assert.equal(tabs.type, components.Tabs);
  assert.match(tabs.props.className, /outray-arc-tunnel-tabs/);
  const tabList = tabs.props.children[0] as React.ReactElement<any>;
  assert.equal(tabList.type, components.TabsList);
  assert.equal(tabList.props["data-outray-tabs-list"], true);
  assert.deepEqual(tabList.props.children.map((trigger: React.ReactElement<any>) => ({
    value: trigger.props.value,
    themed: trigger.props["data-outray-tabs-trigger"],
  })), [
    { value: "message", themed: true },
    { value: "context", themed: true },
    { value: "raw", themed: true },
  ]);
  tabs.props.onValueChange("context");
  assert.deepEqual(writes, [true, false, "context"]);
  copyError = true;
  const failureTree = (session.type as (props: any) => React.ReactElement<any>)(session.props);
  assert.equal(failureTree.props.children[1].props.role, "alert");
  assert.match(failureTree.props.children[1].props.children, /Could not copy/);
  const other = module.exports.LogInspector({ ...props, orgSlug: "other" }).props.children as React.ReactElement<any>;
  assert.notEqual(other.key, session.key);
  const later = module.exports.LogInspector({ ...props, event: { ...event, timestamp: "2026-10-05T13:00:00Z" } }).props.children as React.ReactElement<any>;
  assert.notEqual(later.key, session.key);
  assert.equal(module.exports.LogInspector({ ...props, event: null }).props.open, false);
  assert.doesNotMatch(source, /fetch\(|navigator\.clipboard|AnimatePresence|motion\.div/);

  const content = module.exports.LogInspectorContent({ event: { ...event, message: "{\"key\":0}" } });
  const message = (content.type as (props: any) => React.ReactElement<any>)(content.props);
  const heading = message.props.children[0] as React.ReactElement<any>;
  const actions = heading.props.accessory as React.ReactElement<any>;
  const selector = actions.props.children[0] as React.ReactElement<any>;
  assert.equal(selector.type, components.SegmentedControl);
  selector.props.onValueChange("raw");
  assert.equal(writes.at(-1), "raw");
  raw = true;
  const rawMessage = (content.type as (props: any) => React.ReactElement<any>)(content.props);
  assert.equal(rawMessage.props.children[1].type, "pre");
  assert.equal(rawMessage.props.children[1].props.children, "{\"key\":0}");
});
