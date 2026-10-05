import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  RequestInspectorContent, RequestInspectorSkeleton, RequestInspectorSummary,
} from "../src/components/requests/request-inspector-drawer";
import * as inspectorData from "../src/components/requests/request-inspector-data";
import type { RequestCapture, TunnelEvent } from "../src/components/requests/types";

Object.assign(globalThis, { React });
const request: TunnelEvent = {
  request_id: "request-1", timestamp: 1_800_000_000_000, tunnel_id: "tunnel-a", organization_id: "org-a",
  host: "api.example.com", method: "POST", path: "/api/checkout?tag=first&tag=second", status_code: 201,
  request_duration_ms: 1250, bytes_in: 0, bytes_out: 1024, client_ip: "127.0.0.1", user_agent: "Test client",
};
const capture: RequestCapture = {
  id: "request-1", timestamp: new Date(request.timestamp).toISOString(), tunnelId: "tunnel-a",
  request: { headers: { Authorization: "[REDACTED]", "Content-Type": "application/json" }, body: "0", bodySize: 1 },
  response: { headers: { "Content-Type": "application/json" }, body: "false", bodySize: 5 },
};

test("the sidesheet summary has meaningful status, real units, native timestamp and shared copy control", () => {
  const html = renderToStaticMarkup(React.createElement(RequestInspectorSummary, { request }));
  assert.match(html, /aria-label="Request summary"/);
  assert.match(html, /201 Created/);
  assert.match(html, /text-emerald-300/);
  assert.match(html, /1\.3 s/);
  assert.match(html, /0 B/);
  assert.match(html, /1 KB/);
  assert.match(html, /dateTime="2027-01-15T08:00:00\.000Z"/i);
  assert.match(html, /127\.0\.0\.1|Test client/);
  assert.match(html, /aria-label="Copy request URL"/);
  assert.match(html, /grid-cols-2[^"]*sm:grid-cols-3/);
  assert.doesNotMatch(html, /uppercase|text-\[9px\]|text-zinc-700|text-zinc-800/);
});

test("unknown status, invalid units and unsafe-looking long URLs are shown without pretending success or executing HTML", () => {
  const html = renderToStaticMarkup(React.createElement(RequestInspectorSummary, {
    request: { ...request, status_code: 0, timestamp: NaN, request_duration_ms: NaN, bytes_in: -1, path: "/<script>alert(1)</script>" + "x".repeat(500) },
  }));
  assert.match(html, /Unknown status|Unknown time/);
  assert.doesNotMatch(html, /text-emerald-300|<script>|NaN ms/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /break-all/);
});

test("request and response payloads use actual captures and preserve primitive bodies, redaction text and duplicate queries", () => {
  const render = (tab: "request" | "response") => renderToStaticMarkup(React.createElement(RequestInspectorContent, { request, capture, tab }));
  const incoming = render("request");
  assert.match(incoming, /\[REDACTED\]/);
  assert.match(incoming, /Query parameters/);
  assert.match(incoming, />first</);
  assert.match(incoming, />second</);
  assert.match(incoming, /aria-label="Copy request headers"/);
  assert.match(incoming, />0</);
  const outgoing = render("response");
  assert.match(outgoing, /aria-label="Copy response body"/);
  assert.match(outgoing, />false</);
  assert.doesNotMatch(outgoing, /\[REDACTED\]|Query parameters/);
});

test("missing capture keeps known query metadata without fabricating captured headers or a response body", () => {
  const render = (tab: "request" | "response") => renderToStaticMarkup(React.createElement(RequestInspectorContent, { request, capture: null, tab }));
  const incoming = render("request");
  assert.match(incoming, />first</);
  assert.match(incoming, /Headers unavailable|Body unavailable/);
  assert.doesNotMatch(incoming, /User-Agent|X-Forwarded-For|Copy request headers|Copy request body|No headers|Empty body/);
  const outgoing = render("response");
  assert.match(outgoing, /Headers unavailable|Body unavailable/);
  assert.doesNotMatch(outgoing, /Copy response|Empty body|No headers/);
});

test("nullable legacy headers are unavailable, not an empty set, and do not hide an available body", () => {
  for (const tab of ["request", "response"] as const) {
    const html = renderToStaticMarkup(React.createElement(RequestInspectorContent, {
      request, capture: { ...capture, request: { ...capture.request, headers: null }, response: { ...capture.response, headers: null } }, tab,
    }));
    assert.match(html, /Headers unavailable/);
    assert.doesNotMatch(html, /No headers|Copy (?:request|response) headers/);
    assert.match(html, /Copy (?:request|response) body/);
  }
});

test("loading skeleton replaces only payload content, respects reduced motion and never displays mock data", () => {
  const html = renderToStaticMarkup(React.createElement(RequestInspectorContent, { request, capture, tab: "request", loading: true }));
  assert.match(html, /aria-label="Loading captured payload"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.doesNotMatch(html, /\[REDACTED\]|Sample|Request capture not found/);
  assert.equal(html, renderToStaticMarkup(React.createElement(RequestInspectorSkeleton)));
});

test("drawer uses the shared accessible sheet, stable request sessions and scoped capture without fetching in metadata mode", async () => {
  const source = await readFile(new URL("../src/components/requests/request-inspector-drawer.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const stub = () => null;
  const components = { SideSheet: stub, CopyButton: () => null, Button: () => null, Tabs: () => null, TabsList: () => null, TabsTrigger: () => null, TabsContent: () => null, ReplayModal: () => null, FullCaptureDisabledContent: () => null };
  const hookCalls: Array<[string, TunnelEvent | null]> = [];
  const module = { exports: {} as { RequestInspectorDrawer: (props: Record<string, unknown>) => React.ReactElement<any> } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useState: (value: unknown) => [value, () => {}], useRef: () => ({ current: null }) };
      if (specifier === "@tanstack/react-router") return { Link: () => null };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "./request-inspector-data") return inspectorData;
      if (specifier === "./utils") return { formatBytes: () => "0 B" };
      if (specifier === "./use-request-capture") return { useRequestCapture: (org: string, selected: TunnelEvent | null) => { hookCalls.push([org, selected]); return { capture: null, loading: !!selected, error: null, notFound: false, retry: () => {} }; } };
      if (specifier.endsWith(".css")) return {};
      return components;
    },
  });
  const focus = { current: null };
  const props = { request, orgSlug: "acme", fullCaptureEnabled: false, onClose: () => {}, returnFocusRef: focus };
  const sheet = module.exports.RequestInspectorDrawer(props);
  assert.equal(sheet.type, components.SideSheet);
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.returnFocusRef, focus);
  assert.equal(sheet.props.title, "Request details");
  const session = sheet.props.children as React.ReactElement<any>;
  assert.equal(session.key, inspectorData.requestInspectorIdentity("acme", request));
  (session.type as (props: any) => unknown)(session.props);
  assert.deepEqual(hookCalls, [["acme", null]]);
  const other = module.exports.RequestInspectorDrawer({ ...props, request: { ...request, request_id: "next" }, fullCaptureEnabled: true }).props.children as React.ReactElement<any>;
  assert.notEqual(other.key, session.key);
  (other.type as (props: any) => unknown)(other.props);
  assert.equal(hookCalls.at(-1)?.[1]?.request_id, "next");
  assert.equal(module.exports.RequestInspectorDrawer({ ...props, request: null }).props.open, false);
  assert.match(source, /TabsList aria-label="Request detail sections"/);
  assert.doesNotMatch(source, /navigator\.clipboard|AnimatePresence|motion\.div|getMock/);
});
