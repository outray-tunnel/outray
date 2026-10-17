import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { alertStatusPageComponents, alertStatusPagePath, type AlertStatusPageResponse } from "../src/components/observability/alert-status-page-data";
import { IncidentComponentPicker } from "../src/components/uptime/incident-component-picker";

const data: AlertStatusPageResponse = {
  page: { id: "page", name: "Acme", slug: "acme", published: true }, link: null,
  components: [{ id: "checkout", name: "Checkout", visible: true, groupId: "apps", groupName: "Applications" }, { id: "private", name: "Hidden API", visible: false, groupId: null }],
  incidentId: "existing-incident", canManage: true,
};
type Element = React.ReactElement<any>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements((node as Element).props.children)];
}

async function form(initialData = data) {
  const source = await readFile(new URL("../src/components/observability/alert-status-page-tab.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const states: any[] = [], refs: any[] = [];
  let cursor = 0, refCursor = 0, resource = initialData, error: string | null = null;
  const requests: any[] = [];
  const leaf = (props: any) => React.createElement("div", null, props.children);
  const Button = (props: any) => React.createElement("button", { type: props.type, disabled: props.disabled }, props.children);
  const Picker = (props: any) => leaf(props), Select = (props: any) => leaf(props);
  const Link = (props: any) => React.createElement("a", { href: props.to }, props.children);
  const module = { exports: {} as any };
  const modules: Record<string, unknown> = {
    react: { ...React, useId: () => "link", useEffect() {}, useMemo: (callback: any) => callback(), useCallback: (callback: any) => callback, useRef: (value: any) => refs[refCursor++] ??= { current: value }, useState(initial: any) { const id = cursor++; if (!(id in states)) states[id] = typeof initial === "function" ? initial() : initial; return [states[id], (next: any) => { states[id] = typeof next === "function" ? next(states[id]) : next; }]; } },
    "@tanstack/react-query": { useQuery: () => ({}), useQueryClient: () => ({ setQueryData(_key: unknown, next: AlertStatusPageResponse) { resource = next; }, invalidateQueries: async () => {} }) },
    "@tanstack/react-router": { Link }, "lucide-react": { ArrowUpRight: () => null, Info: () => null },
    "@/components/arc/button/button": { Button }, "@/components/arc/select/select": { Select },
    "@/components/ui/workspace-input": { WorkspaceInput: "input" },
    "@/components/uptime/incident-component-picker": { IncidentComponentPicker: Picker },
    "@/components/uptime/uptime-dialog": { UptimeDialog: () => null },
    "@/components/uptime/uptime-skeleton": { UptimeSkeleton: leaf },
    "@/components/uptime/uptime-ui": { labelClass: "label", secondaryButtonMedium: "button", uptimeControlsClassName: "controls", UptimeError: ({ message }: any) => React.createElement("p", { role: "alert" }, message) },
    "@/components/uptime/use-uptime-unsaved-changes": { useUptimeUnsavedChanges: () => ({ status: "idle" }) },
    "./alert-detail-context": { useAlertDetail: () => ({}) },
    "./alert-status-page-data": { alertStatusPageComponents, async requestAlertStatusPage(_org: string, _alert: string, init: RequestInit) { const payload = JSON.parse(String(init.body)); requests.push(payload); if (error) throw new Error(error); return { ...resource, link: payload.componentIds.length ? payload : null }; } },
  };
  runInNewContext(compiled, { React, Error, module, exports: module.exports, requestAnimationFrame: (callback: () => void) => callback(), document: { getElementById: () => ({ focus() {} }) }, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  const render = () => { cursor = refCursor = 0; return module.exports.AlertStatusPageForm({ orgSlug: "org/name", alertId: "alert/one", data: resource, onReload() {} }); };
  return { Button, Picker, Select, requests, render, fail(message: string) { error = message; }, nodes: () => elements(render()), html: () => renderToStaticMarkup(render()) };
}

test("status linking encodes tenant paths and exposes only visible public components", () => {
  assert.equal(alertStatusPagePath("org/name", "alert/one"), "/api/org%2Fname/observability/alerts/alert%2Fone/status-page");
  const page = alertStatusPageComponents(data);
  assert.deepEqual(page.standaloneComponents, []);
  assert.deepEqual(page.groups.map((group) => [group.name, group.components.map((component) => component.id)]), [["Applications", ["checkout"]]]);
});

test("duplicate component names retain group context and standalone components stay separate", () => {
  const page = alertStatusPageComponents({ ...data, components: [
    { id: "public-api", name: "Public API", visible: true, groupId: null },
    { id: "platform-api", name: "Public API", visible: true, groupId: "platform", groupName: "Platform" },
    { id: "payments-api", name: "Public API", visible: true, groupId: "payments", groupName: "Payments" },
    { id: "legacy-api", name: "Public API", visible: true, groupId: "legacy" },
    { id: "hidden-api", name: "Hidden API", visible: false, groupId: "platform", groupName: "Platform" },
  ] });
  assert.deepEqual(page.standaloneComponents.map((component) => component.id), ["public-api"]);
  assert.deepEqual(page.groups.map((group) => [group.name, group.components.map((component) => component.id)]), [["Platform", ["platform-api"]], ["Payments", ["payments-api"]], ["Component group 3", ["legacy-api"]]]);
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(React.createElement(IncidentComponentPicker, { page, selected: [], onToggle() {}, id: "grouped-picker" }));
  for (const group of ["Standalone components", "Platform", "Payments", "Component group 3"]) assert.ok(html.includes(group));
  assert.equal((html.match(/Public API/g) ?? []).length, 4);
  assert.doesNotMatch(html, /Hidden API/);
});

test("linking starts with an empty safe title, degraded impact and canonical existing incident navigation", async () => {
  const runtime = await form();
  const nodes = runtime.nodes();
  assert.equal(nodes.find((node) => node.props.id === "link-publicTitle")?.props.value, "");
  assert.equal(nodes.find((node) => node.type === runtime.Select)?.props.value, "degraded");
  const picker = nodes.find((node) => node.type === runtime.Picker)!;
  assert.deepEqual(Array.from(picker.props.selected), []);
  assert.deepEqual(picker.props.page.groups.map((group: any) => [group.name, group.components.map((component: any) => component.id)]), [["Applications", ["checkout"]]]);
  const html = runtime.html();
  assert.match(html, /Manual approval only/); assert.match(html, /private alert name/);
  assert.match(html, /Review current incident/); assert.match(html, /incidents\/\$incidentId/);
  assert.doesNotMatch(html, /Publish automatically|After confirmation/);
});

test("saving a mapping sends a safe title, explicit impact, and selected components but never publishes", async () => {
  const runtime = await form();
  let nodes = runtime.nodes();
  nodes.find((node) => node.props.id === "link-publicTitle")!.props.onChange({ target: { value: "  Checkout is degraded  " } });
  nodes.find((node) => node.type === runtime.Select)!.props.onValueChange("outage");
  nodes.find((node) => node.type === runtime.Picker)!.props.onToggle("checkout", true);
  nodes = runtime.nodes();
  assert.equal(nodes.find((node) => node.type === runtime.Button && node.props.children === "Save link")?.props.disabled, false, "grouped-only components keep Save link enabled");
  assert.doesNotMatch(runtime.html(), /No visible components are available/);
  nodes.find((node) => node.type === "form")!.props.onSubmit({ preventDefault() {} });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(runtime.requests, [{ publicTitle: "Checkout is degraded", impact: "outage", componentIds: ["checkout"], pageId: "page" }]);
  assert.match(runtime.html(), /Detections stay private until your team publishes/);
});

test("failed mapping saves preserve the customer title and component draft", async () => {
  const runtime = await form(); runtime.fail("Permission denied");
  let nodes = runtime.nodes();
  nodes.find((node) => node.props.id === "link-publicTitle")!.props.onChange({ target: { value: "Draft title" } });
  nodes.find((node) => node.type === runtime.Picker)!.props.onToggle("checkout", true);
  nodes = runtime.nodes(); nodes.find((node) => node.type === "form")!.props.onSubmit({ preventDefault() {} });
  await new Promise<void>((resolve) => setImmediate(resolve));
  nodes = runtime.nodes();
  assert.equal(nodes.find((node) => node.props.id === "link-publicTitle")?.props.value, "Draft title");
  assert.deepEqual(Array.from(nodes.find((node) => node.type === runtime.Picker)?.props.selected), ["checkout"]);
  assert.match(runtime.html(), /Permission denied/);
});

test("members cannot mutate status-page linking and unlink leaves existing publication unchanged", async () => {
  const readonly = await form({ ...data, canManage: false });
  assert.equal(readonly.nodes().find((node) => node.type === "fieldset")?.props.disabled, true);
  assert.doesNotMatch(readonly.html(), /Save link|Remove link/);
  const runtime = await form({ ...data, link: { publicTitle: "Public API outage", impact: "outage", componentIds: ["checkout"] } });
  const remove = runtime.nodes().find((node) => node.type === runtime.Button && node.props.children === "Remove link")!;
  remove.props.onClick(); await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(runtime.requests[0].componentIds, []);
  assert.match(runtime.html(), /Existing public incidents and their component health are unchanged/);
});
