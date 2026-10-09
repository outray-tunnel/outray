import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as alertsData from "../src/components/observability/alerts-data";

const alert = {
  id: "alert/1", name: "Checkout errors", description: null, signal: "request_error_rate", service: "checkout", environment: "production",
  enabled: true, state: "healthy", underlyingState: "healthy", threshold: 5, operator: "gt", windowMinutes: 5,
  currentValue: 1, evaluationIntervalSeconds: 60, consecutiveFailures: 3, consecutiveRecoveries: 2, minimumSamples: 10, noDataState: "no_data", metricUnit: null,
  lastEvaluatedAt: "2026-10-05T12:00:00Z", nextEvaluationAt: "2026-10-05T12:01:00Z", openIncidentId: null,
  notificationEmails: ["owner@example.com"], notificationEmail: null, notificationSlackConfigured: true, notificationDiscordConfigured: false,
  notificationSlackTarget: { workspaceName: "OutRay", channelName: "#alerts" }, notificationDiscordTarget: null,
};
const data = { alert, evaluations: [], incidents: [], notifications: [], integrationAvailability: { slack: true, discord: false } };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function load() {
  const source = await readFile(new URL("../src/routes/$orgSlug/observability/alerts_.$alertId.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { AlertDetailWorkspace, DeleteAlertModal, AlertDetailsEditModal };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const states: any[] = [], refs: any[] = [];
  let cursor = 0, refCursor = 0;
  const fetches: Array<{ url: string; options: RequestInit }> = [];
  let response = new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 });
  let deleted = 0;
  const searches = { search: "checkout", state: "healthy" };
  const stub = (tag: string) => (props: any) => React.createElement(tag, { "data-variant": props.variant, "data-loading": props.loading || undefined }, typeof props.children === "function" ? props.children({ isActive: false }) : props.children);
  const stubs = {
    Button: stub("button"), Dialog: stub("section"), DialogContent: stub("section"), AlertEmailRecipients: stub("div"),
    AlertFormModal: stub("div"), AlertIcon: stub("span"), AlertStatePill: stub("span"), AlertStateBadge: (props: any) => React.createElement("span", null, props.state),
    Link: (props: any) => React.createElement("a", null, typeof props.children === "function" ? props.children({ isActive: true }) : props.children),
  };
  const module = { exports: {} as Record<string, (props?: any) => React.ReactNode> };
  runInNewContext(compiled, {
    React, module, exports: module.exports, URLSearchParams,
    window: { location: { search: "" }, sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, setTimeout: () => 1, clearTimeout: () => {} },
    fetch: async (url: string, options: RequestInit) => { fetches.push({ url, options }); return response.clone(); },
    require(specifier: string) {
      if (specifier === "react") return {
        useEffect: () => {}, useMemo: (callback: () => unknown) => callback(), useId: () => "detail-tabs",
        useRef: (value: unknown) => { const id = refCursor++; return refs[id] ??= { current: value }; },
        useState: (initial: unknown) => { const id = cursor++; if (!(id in states)) states[id] = typeof initial === "function" ? (initial as () => unknown)() : initial; return [states[id], (value: unknown) => { states[id] = typeof value === "function" ? (value as (old: unknown) => unknown)(states[id]) : value; }]; },
      };
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => () => ({ useNavigate: () => () => { deleted++; } }), Link: stubs.Link, Outlet: stub("div"), useSearch: () => searches };
      if (specifier === "motion/react") return { LayoutGroup: stub("div"), motion: { span: ({ className, children }: any) => React.createElement("span", { className }, children) }, useReducedMotion: () => true };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@outray/icons/")) return {};
      if (specifier === "recharts") return new Proxy({}, { get: () => stub("div") });
      if (specifier.endsWith("alerts-data")) return alertsData;
      if (specifier.endsWith("alert-detail-polling")) return { startAlertDetailPolling: () => () => {} };
      if (specifier.endsWith("alert-detail-context")) return { useAlertDetail: () => ({ data, refreshing: false, orgSlug: "org/name", onEditDetails: () => {}, onEditCondition: () => {}, onReload: () => {} }), AlertDetailContext: { Provider: stub("div") } };
      if (specifier.endsWith("button/button")) return { Button: stubs.Button };
      if (specifier.endsWith("dialog/dialog")) return { Dialog: stubs.Dialog, DialogContent: stubs.DialogContent };
      if (specifier.endsWith("ui/workspace-input")) return { WorkspaceInput: "input", WorkspaceTextarea: "textarea" };
      if (specifier.endsWith("alert-email-recipients")) return { AlertEmailRecipients: stubs.AlertEmailRecipients };
      if (specifier.endsWith("alert-status-badge")) return { AlertStateBadge: stubs.AlertStateBadge };
      if (specifier === "./alerts") return stubs;
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected detail dependency ${specifier}`);
    },
  });
  const leaves = new Set(Object.values(stubs));
  function elements(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    const children = typeof element.type === "function" && !leaves.has(element.type as any) ? element.type(element.props) : element.props.children;
    return [element, ...(typeof children === "function" ? [] : elements(children))];
  }
  return {
    stubs, states, fetches, deleted: () => deleted,
    response: (next: Response) => { response = next; },
    reset: (initial: any[] = []) => { states.length = 0; refs.length = 0; initial.forEach((value, index) => { states[index] = value; }); },
    render(name: string, props: any = {}) { cursor = refCursor = 0; return elements(module.exports[name](props)); },
    html(name: string) { cursor = refCursor = 0; return renderToStaticMarkup(module.exports[name]()); },
    button(nodes: React.ReactElement<any>[], text: string) { return nodes.find((node) => node.type === stubs.Button && React.Children.toArray(node.props.children).some((child) => child === text))!; },
  };
}

test("alert overview uses compact metrics and useful incident/delivery drilldowns", async () => {
  const harness = await load();
  const html = harness.html("AlertOverviewTab");
  assert.match(html, /At a glance/);
  assert.match(html, /text-\[22px\] font-normal/);
  assert.match(html, /Latest incident/);
  assert.match(html, /Latest notification/);
  assert.match(html, /No notification attempts yet/);
  assert.doesNotMatch(html, /text-2xl font-semibold|h-72|text-zinc-700/);
  const links = harness.render("AlertOverviewTab").filter((node) => node.type === harness.stubs.Link);
  assert.equal(links.length, 2);
  assert.ok(links.every((link) => link.props.params.orgSlug === "org/name" && link.props.params.alertId === alert.id));
  assert.ok(links.every((link) => link.props.search.search === "checkout"));
});

test("detail has five preserved route tabs with a reduced-motion neutral animated underline", async () => {
  const harness = await load();
  harness.reset([data, false]);
  const nodes = harness.render("AlertDetailWorkspace", { orgSlug: "org/name", alertId: alert.id });
  const links = nodes.filter((node) => node.type === harness.stubs.Link);
  const tabs = links.filter((node) => typeof node.props.children === "function");
  assert.equal(tabs.length, 5);
  for (const tab of tabs) {
    assert.equal(tab.props.search.search, "checkout");
    assert.doesNotMatch(tab.props.activeProps.className, /violet|purple/);
    const child = tab.props.children({ isActive: true });
    const html = renderToStaticMarkup(child);
    assert.match(html, /h-0\.5 rounded-full bg-zinc-100/);
  }
  assert.equal(links.find((node) => node.props.to === "/$orgSlug/observability/alerts")?.props.search.state, "healthy");
  assert.equal(harness.button(nodes, "Delete").props.variant, "danger");
  assert.equal(harness.button(nodes, "Delete").props.size, "md");
  assert.ok(harness.button(nodes, "Run now"));
  assert.equal(harness.button(nodes, "Run now").props.size, "sm");
});

test("alert page modal triggers are medium while dialog actions remain small", async () => {
  const harness = await load();
  assert.equal(harness.button(harness.render("AlertOverviewTab"), "Edit details").props.size, "md");
  assert.equal(harness.button(harness.render("AlertConditionTab"), "Edit condition").props.size, "md");
  harness.reset();
  const edit = harness.render("AlertDetailsEditModal", { isOpen: true, alert, orgSlug: "acme", onClose: () => {}, onSaved: () => {} });
  assert.equal(harness.button(edit, "Cancel").props.size, "sm");
  assert.equal(harness.button(edit, "Save details").props.size, "sm");
});

test("pausing uses encoded workspace paths and disables evaluation until resumed", async () => {
  const harness = await load();
  harness.reset([data, false]);
  harness.response(Response.json({ alert: { ...alert, enabled: false } }));
  let nodes = harness.render("AlertDetailWorkspace", { orgSlug: "org/name", alertId: alert.id });
  await harness.button(nodes, "Pause").props.onClick();
  await settle();
  assert.equal(harness.fetches[0].url, "/api/org%2Fname/observability/alerts/alert%2F1");
  assert.deepEqual(JSON.parse(String(harness.fetches[0].options.body)), { enabled: false });
  nodes = harness.render("AlertDetailWorkspace", { orgSlug: "org/name", alertId: alert.id });
  assert.ok(harness.button(nodes, "Resume"));
  assert.equal(harness.button(nodes, "Run now").props.disabled, true);
});

test("mute keeps evaluations enabled and sends a one-hour mute window", async () => {
  const harness = await load();
  harness.reset([data, false]);
  harness.response(Response.json({ alert: { ...alert, state: "muted", mutedUntil: new Date(Date.now() + 3_600_000).toISOString() } }));
  let nodes = harness.render("AlertDetailWorkspace", { orgSlug: "org/name", alertId: alert.id });
  harness.button(nodes, "Mute 1h").props.onClick(); await settle();
  const payload = JSON.parse(String(harness.fetches[0].options.body));
  assert.ok(Math.abs(new Date(payload.mutedUntil).getTime() - Date.now() - 3_600_000) < 2_000);
  nodes = harness.render("AlertDetailWorkspace", { orgSlug: "org/name", alertId: alert.id });
  assert.ok(harness.button(nodes, "Unmute"));
  assert.equal(harness.button(nodes, "Run now").props.disabled, false);
});

test("manual evaluation reports queued work rather than claiming the rule ran", async () => {
  const harness = await load();
  harness.reset([data, false]);
  harness.response(Response.json({}, { status: 202 }));
  let nodes = harness.render("AlertDetailWorkspace", { orgSlug: "org/name", alertId: alert.id });
  harness.button(nodes, "Run now").props.onClick(); await settle();
  assert.equal(harness.fetches[0].url, "/api/org%2Fname/observability/alerts/alert%2F1/evaluate");
  assert.equal(harness.fetches[0].options.method, "POST");
  nodes = harness.render("AlertDetailWorkspace", { orgSlug: "org/name", alertId: alert.id });
  assert.ok(nodes.find((node) => node.props.role === "status" && node.props.children === "Evaluation queued. Results will appear shortly."));
});

test("failed delete retains confirmation, exposes action error and uses Arc danger", async () => {
  const harness = await load();
  const props = { isOpen: true, alert, orgSlug: "org/name", onClose: () => {}, onDeleted: () => { throw new Error("Should not navigate after failure"); } };
  let nodes = harness.render("DeleteAlertModal", props);
  const button = harness.button(nodes, "Delete alert");
  assert.equal(button.props.variant, "danger");
  button.props.onClick();
  await settle();
  nodes = harness.render("DeleteAlertModal", props);
  assert.equal(nodes.find((node) => node.type === harness.stubs.Dialog)?.props.open, true);
  assert.ok(nodes.find((node) => node.props.role === "alert" && node.props.children === "Permission denied"));
  assert.equal(harness.deleted(), 0);
});

test("open detail drafts survive refreshed alert props and retain inline save errors", async () => {
  const harness = await load();
  const props = { isOpen: true, alert, orgSlug: "org/name", onClose: () => {}, onSaved: () => {} };
  let nodes = harness.render("AlertDetailsEditModal", props);
  const input = nodes.find((node) => node.type === "input")!;
  assert.equal(input.props.maxLength, 120);
  assert.equal(input.props.required, true);
  assert.equal(input.props.disabled, false);
  assert.equal(input.props.className, "mt-2", "field geometry comes from the shared input");
  const description = nodes.find((node) => node.type === "textarea")!;
  assert.equal(description.props.maxLength, 1000);
  assert.equal(description.props.rows, 3);
  assert.equal(description.props.disabled, false);
  input.props.onChange({ target: { value: "Unsaved new title" } });
  nodes = harness.render("AlertDetailsEditModal", { ...props, alert: { ...alert, name: "Refreshed server title" } });
  assert.equal(nodes.find((node) => node.type === "input")?.props.value, "Unsaved new title");
  nodes.find((node) => node.type === "form")!.props.onSubmit({ preventDefault: () => {} });
  nodes = harness.render("AlertDetailsEditModal", props);
  assert.equal(nodes.find((node) => node.type === "input")?.props.disabled, true);
  assert.equal(nodes.find((node) => node.type === "textarea")?.props.disabled, true);
  await settle();
  nodes = harness.render("AlertDetailsEditModal", props);
  assert.ok(nodes.find((node) => node.props.role === "alert" && node.props.children === "Permission denied"));
  assert.equal(nodes.find((node) => node.type === "input")?.props.value, "Unsaved new title");
});

test("notification connections keep provider metadata, configured states and compact pills", async () => {
  const harness = await load();
  const html = harness.html("AlertNotificationsTab");
  assert.match(html, /OutRay · #alerts/);
  assert.match(html, /OAuth app not configured/);
  assert.match(html, /No notifications have been sent/);
  assert.doesNotMatch(html, /size-11|text-zinc-700/);
});
