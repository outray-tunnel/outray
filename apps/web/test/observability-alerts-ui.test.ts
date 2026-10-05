import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { AlertsListContent, type AlertsListContentProps } from "../src/components/observability/alerts-list-content";
import { AlertStatePill } from "../src/components/observability/alert-status-badge";
import * as alertsData from "../src/components/observability/alerts-data";
import { alertFixture, alertsSnapshot } from "./fixtures/observability-alert";

Object.assign(globalThis, { React });
const props: AlertsListContentProps = {
  orgSlug: "outray-tunnel", data: alertsSnapshot, filters: {}, searchInput: "", onSearchInputChange: () => {}, onFiltersChange: () => {},
  onClearFilters: () => {}, onCreate: () => {}, onRetry: () => {},
};
function render(overrides: Partial<AlertsListContentProps> = {}) {
  const root = createRootRoute(); const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/outray-tunnel/observability/alerts"] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(AlertsListContent, { ...props, ...overrides }) }));
}

test("Alerts shares compact typography, Arc controls, fitted status badges and full clickable rows", () => {
  const html = render();
  assert.match(html, /text-\[20px\] font-normal/); assert.match(html, /type="search"/); assert.match(html, /role="combobox"/);
  assert.match(html, /New alert/); assert.match(html, /aria-haspopup="dialog"/);
  const rows = [...html.matchAll(/<a\b[^>]*href="[^"]*alerts\/rule-[^"]*"[\s\S]*?<\/a>/g)].map(([row]) => row);
  assert.equal(rows.length, 2); assert.match(rows[0], /API error rate/); assert.match(rows[0], /payments-worker/);
  assert.match(rows[0], /5xx error rate &gt; 5% for 5m/); assert.match(rows[0], /8.25%/); assert.match(rows[0], /Firing/);
  assert.doesNotMatch(html, /Export|text-\[9px\]|uppercase tracking|bg-violet/);
  const nativeSelects = [...html.matchAll(/<select\b[^>]*>/g)];
  assert.ok(nativeSelects.every(([element]) => element.includes('aria-hidden="true"') && element.includes('tabindex="-1"')));
});

test("detail links retain validated list filters and selected missing services stay selectable", () => {
  const html = render({ filters: { search: "Queue", service: "queue", state: "healthy", signal: "metric_value" }, searchInput: "Queue" });
  const href = html.match(/href="([^"]*alerts\/rule-b[^"]*)"/)?.[1]; assert.ok(href);
  const url = new URL(href.replaceAll("&amp;", "&"), "https://local.test");
  assert.equal(url.searchParams.get("search"), "Queue"); assert.equal(url.searchParams.get("service"), "queue");
  assert.equal(url.searchParams.get("signal"), "metric_value"); assert.equal(url.searchParams.get("state"), "healthy");
  assert.doesNotMatch(html, /alerts\/rule-a/); assert.match(html, /1 rule of 2/);
  assert.match(render({ filters: { service: "archived" } }), /archived/);
});

test("all seven states use semantic, fitted color-coded icons and labels", () => {
  for (const state of alertsData.ALERT_STATES) {
    const html = renderToStaticMarkup(React.createElement(AlertStatePill, { alert: alertFixture({ state, enabled: state !== "paused" }) }));
    assert.match(html, /w-fit shrink-0/); assert.match(html, /aria-hidden="true"/);
    assert.match(html, new RegExp(state === "no_data" ? "No data" : state[0].toUpperCase() + state.slice(1)));
    assert.match(html, state === "firing" || state === "error" ? /text-rose/ : state === "healthy" ? /text-emerald/ : state === "pending" ? /text-amber/ : /text-zinc/);
  }
});

test("initial loading, failed requests, empty configuration and no matches are distinct", () => {
  const skeleton = render({ data: undefined, loading: true });
  assert.match(skeleton, /aria-label="Loading alert rules"/); assert.match(skeleton, /aria-busy="true"/); assert.match(skeleton, /motion-reduce:animate-none/);
  assert.doesNotMatch(skeleton, /Create your first alert|No matching alerts|0 rules/);
  const failed = render({ data: undefined, loading: false, error: "Unavailable" });
  assert.match(failed, /role="alert"/); assert.match(failed, /Alerts unavailable/); assert.match(failed, /Try again/); assert.doesNotMatch(failed, /Create your first alert/);
  const empty = render({ data: { ...alertsSnapshot, alerts: [], summary: alertsData.summarizeAlerts([]) } });
  assert.match(empty, /Create your first alert/); assert.match(empty, /Create alert/); assert.doesNotMatch(empty, /No matching alerts/);
  const filtered = render({ filters: { search: "no such rule" } });
  assert.match(filtered, /No matching alerts/); assert.match(filtered, /Clear filters/); assert.doesNotMatch(filtered, /Create your first alert/);
});

test("background refresh keeps rules visible and failures retain readable stale feedback", () => {
  const refreshing = render({ isFetching: true });
  assert.match(refreshing, /API error rate/); assert.match(refreshing, /Updating/); assert.doesNotMatch(refreshing, /Loading alert rules/);
  const stale = render({ error: "Unavailable" });
  assert.match(stale, /Could not refresh alerts/); assert.match(stale, /last available rules/); assert.match(stale, /API error rate/); assert.match(stale, /Retry/);
  assert.match(stale, /Refresh failed/); assert.doesNotMatch(stale, /Alerts unavailable/);
});

test("missing evaluation values stay unknown rather than implying a healthy zero", () => {
  const data = { ...alertsSnapshot, alerts: [alertFixture({ currentValue: null, lastEvaluatedAt: null, state: "no_data" })] };
  const html = render({ data }); assert.match(html, /Never/); assert.match(html, /No data/); assert.match(html, /—/); assert.match(html, /Not evaluated yet/);
});

test("state count navigation uses the existing filters and native buttons with keyboard focus", async () => {
  const source = await readFile(new URL("../src/components/observability/alerts-list-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any }; const patches: alertsData.AlertsSearch[] = [];
  const stubs = new Proxy({}, { get: (_target, name) => (componentProps: any) => React.createElement("div", { "data-component": String(name) }, componentProps.children) });
  runInNewContext(compiled, { React, module, exports: module.exports, require: (name: string) => {
    if (name === "react") return { useMemo: (callback: () => unknown) => callback() };
    if (name === "./alerts-data") return alertsData;
    if (name === "./alert-status-badge") return { ALERT_STATUS: Object.fromEntries(alertsData.ALERT_STATES.map((state) => [state, { label: state, icon: () => null, tone: "text-zinc-400" }])) };
    return stubs;
  } });
  function elements(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>; return [element, ...elements(element.props.children)];
  }
  const view = module.exports.AlertsListContent({ ...props, filters: { state: "firing" }, onFiltersChange: (patch: alertsData.AlertsSearch) => patches.push(patch) });
  const buttons = elements(view).filter((element) => element.type === "button");
  assert.equal(buttons.length, 8); assert.equal(buttons.filter((element) => element.props["aria-pressed"]).length, 1);
  buttons[0].props.onClick(); buttons[1].props.onClick();
  assert.equal(patches.length, 2); assert.equal(patches[0].state, undefined); assert.equal(patches[1].state, "firing");
  assert.ok(buttons.every((element) => element.props.className.includes("focus-visible:outline")));
});
