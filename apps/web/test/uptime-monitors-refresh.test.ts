import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { MonitorForm } from "../src/components/uptime/monitor-form";
import * as helpers from "../src/components/uptime/monitor-data";
import type { UptimeMonitor } from "../src/components/uptime/uptime-client";

Object.assign(globalThis, { React });

const monitor: UptimeMonitor = {
  id: "monitor-a", name: "API", url: "https://api.example.com/health", method: "GET", expectedStatus: 204, responseText: "healthy", hasHeaders: true,
  notificationEmails: ["ada@example.com"], failureThreshold: 4, incidentPublishing: "after_confirmation", publishAfterMinutes: 8,
  enabled: true, state: "up", lastCheckedAt: "2026-10-07T09:00:00Z", createdAt: "2026-10-01T09:00:00Z",
};

test("new monitor defaults preserve failure threshold, manual acknowledgement, range status, and optional encrypted headers", () => {
  const draft = helpers.initialMonitorDraft();
  assert.equal(draft.method, "GET"); assert.equal(draft.failureThreshold, 3);
  assert.equal(draft.incidentPublishing, "manual"); assert.equal(draft.publishAfterMinutes, 5); assert.equal(draft.statusMode, "range");
  const payload = helpers.monitorPayload({ ...draft, name: " API ", url: " https://api.example.com ", headerLines: "Authorization: Bearer token:part" }, false);
  assert.equal(payload.name, "API"); assert.equal(payload.url, "https://api.example.com"); assert.equal(payload.expectedStatus, null);
  assert.deepEqual(payload.headers, { Authorization: "Bearer token:part" });
  assert.equal(payload.responseText, null); assert.deepEqual(payload.notificationEmails, []);
});

test("editing snapshots its fields and recipients without retrieving or accidentally clearing encrypted headers", () => {
  const draft = helpers.initialMonitorDraft(monitor);
  assert.equal(draft.name, monitor.name); assert.equal(draft.expectedStatus, "204"); assert.equal(draft.statusMode, "exact");
  draft.notificationEmails.push("grace@example.com");
  assert.deepEqual(monitor.notificationEmails, ["ada@example.com"]);
  const payload = helpers.monitorPayload(draft, true);
  assert.equal(Object.hasOwn(payload, "headers"), false);
  assert.equal(payload.expectedStatus, 204); assert.equal(payload.responseText, "healthy");
  assert.equal(payload.failureThreshold, 4); assert.equal(payload.incidentPublishing, "after_confirmation"); assert.equal(payload.publishAfterMinutes, 8);
  assert.deepEqual(helpers.monitorPayload({ ...draft, replaceHeaders: true, headerLines: "" }, true).headers, {});
});

test("HEAD never sends response matching, and malformed status or header input cannot submit", () => {
  const draft = helpers.initialMonitorDraft(monitor);
  assert.equal(helpers.monitorPayload({ ...draft, method: "HEAD" }, true).responseText, null);
  for (const expectedStatus of ["", "99", "600", "200.5", "not-a-code"]) assert.throws(() => helpers.monitorPayload({ ...draft, expectedStatus }, true), /between 100 and 599/);
  for (const input of ["HeaderWithoutColon", ": value", "Header:"]) assert.throws(() => helpers.parseMonitorHeaders(input), /header|Header/);
  assert.deepEqual(helpers.parseMonitorHeaders("\n Authorization : Bearer foo:bar \nAccept: application/json\n"), { Authorization: "Bearer foo:bar", Accept: "application/json" });
});

test("monitor search matches endpoint metadata while paused monitors never leak into active-state views", () => {
  const down = { ...monitor, id: "down", name: "Worker", state: "down" as const };
  const paused = { ...monitor, id: "paused", enabled: false };
  const unknown = { ...monitor, id: "unknown", state: "unknown" as const };
  const records = [monitor, down, paused, unknown];
  assert.deepEqual(helpers.filterMonitors(records, " api.example.COM ", "all"), records);
  assert.deepEqual(helpers.filterMonitors(records, "Worker", "down"), [down]);
  assert.deepEqual(helpers.filterMonitors(records, "", "up"), [monitor]);
  assert.deepEqual(helpers.filterMonitors(records, "", "paused"), [paused]);
  assert.deepEqual(helpers.filterMonitors(records, "", "unknown"), [unknown]);
  assert.deepEqual(helpers.filterMonitors(records, "missing", "all"), []);
  assert.equal(helpers.monitorPublishingLabel(monitor), "After 8 min");
  assert.equal(helpers.monitorPublishingLabel({ ...monitor, incidentPublishing: "automatic" }), "Automatic");
  assert.equal(helpers.monitorPublishingLabel({ ...monitor, incidentPublishing: "manual" }), "Manual acknowledgement");
});

test("monitor form uses real Arc method/status menus, stacked shared inputs, recipients, and publishing controls", () => {
  const html = renderToStaticMarkup(React.createElement(MonitorForm, { orgSlug: "workspace", formId: "new-monitor", busy: false, error: null, onSubmit: () => {} }));
  assert.match(html, /<form id="new-monitor"/); assert.match(html, /ph-no-capture/);
  assert.match(html, /Request method/); assert.match(html, /Expected status/); assert.match(html, /role="combobox"/);
  assert.match(html, /data-workspace-input="default"/); assert.match(html, /data-workspace-input="textarea"/);
  assert.match(html, /Email team members/); assert.match(html, /Incident publishing/);
  assert.match(html, /Manual/); assert.match(html, /<details class="headers">/);
  assert.doesNotMatch(html, /<select(?![^>]*aria-hidden="true")/);
  assert.doesNotMatch(html, /Replace or clear existing headers/);
});

test("editing shows a designed header-replacement checkbox and warns that changing URL clears credentials", () => {
  const html = renderToStaticMarkup(React.createElement(MonitorForm, { orgSlug: "workspace", formId: "edit-monitor", monitor, busy: false, error: "Could not save monitor.", onSubmit: () => {} }));
  assert.match(html, /type="checkbox"/); assert.match(html, /Replace or clear existing headers/);
  assert.match(html, /Changing the URL clears them unless you enter replacements/);
  assert.match(html, /role="alert"/); assert.match(html, /Could not save monitor/);
  assert.match(html, /value="API"/); assert.match(html, /value="204"/);
  assert.doesNotMatch(html, /Authorization: Bearer/);
});

async function stubbedForm() {
  const source = await readFile(new URL("../src/components/uptime/monitor-form.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  let index = 0;
  const states: unknown[] = [];
  const Placeholder = () => null, Select = () => null, UptimeError = () => null, UptimeCheckbox = () => null;
  const module = { exports: {} as any };
  runInNewContext(compiled, { React, Error, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "react") return { useId: () => "monitor-form", useState: (initial: unknown) => {
      const current = index++; if (!(current in states)) states[current] = typeof initial === "function" ? initial() : initial;
      return [states[current], (value: unknown) => { states[current] = typeof value === "function" ? value(states[current]) : value; }];
    } };
    if (specifier === "lucide-react") return { KeyRound: Placeholder };
    if (specifier === "../arc/select/select") return { Select };
    if (specifier === "../ui/workspace-input") return { WorkspaceInput: "input", WorkspaceTextarea: "textarea" };
    if (specifier === "./email-recipients") return { UptimeEmailRecipients: Placeholder };
    if (specifier === "./incident-publishing-fields") return { IncidentPublishingFields: Placeholder };
    if (specifier === "./uptime-ui") return { UptimeError, UptimeCheckbox };
    if (specifier === "./monitor-data") return helpers;
    if (specifier.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => key }), __esModule: true };
    throw new Error(`Unexpected monitor form dependency: ${specifier}`);
  } });
  const renders = (props: Record<string, unknown>) => { index = 0; return module.exports.MonitorForm(props); };
  return { renders, Select, UptimeError, UptimeCheckbox };
}

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

test("refreshes cannot overwrite unsaved monitor settings or header choices; failures preserve the draft", async () => {
  const { renders, UptimeCheckbox } = await stubbedForm();
  const submitted: Record<string, unknown>[] = [];
  const props = { orgSlug: "workspace", formId: "edit", monitor, busy: false, error: null, onSubmit: (payload: Record<string, unknown>) => { submitted.push(payload); } };
  let tree = renders(props), nodes = elements(tree);
  nodes.find((node) => node.props.id === "monitor-form-name")?.props.onChange({ target: { value: "Unsaved name" } });
  nodes.find((node) => node.type === UptimeCheckbox)?.props.onChange({ target: { checked: true } });
  tree = renders({ ...props, monitor: { ...monitor, name: "Refreshed name", expectedStatus: 201 }, error: "Request failed." });
  nodes = elements(tree);
  assert.equal(nodes.find((node) => node.props.id === "monitor-form-name")?.props.value, "Unsaved name");
  assert.equal(nodes.find((node) => node.props.id === "monitor-form-status")?.props.value, "204");
  assert.equal(nodes.find((node) => node.type === UptimeCheckbox)?.props.checked, true);
  tree.props.onSubmit({ preventDefault: () => {} });
  assert.equal(submitted[0].name, "Unsaved name"); assert.deepEqual(submitted[0].headers, {});
});

test("busy forms cannot change controls or submit, and header validation errors are visible beside the attempted action", async () => {
  const { renders, UptimeCheckbox, UptimeError } = await stubbedForm();
  let submissions = 0;
  const props = { orgSlug: "workspace", formId: "edit", monitor, busy: false, error: null, onSubmit: () => { submissions++; } };
  let tree = renders(props), nodes = elements(tree);
  nodes.find((node) => node.type === UptimeCheckbox)?.props.onChange({ target: { checked: true } });
  tree = renders(props); nodes = elements(tree);
  nodes.find((node) => node.props.id === "monitor-form-headers")?.props.onChange({ target: { value: "bad header" } });
  tree = renders(props); tree.props.onSubmit({ preventDefault: () => {} });
  assert.equal(submissions, 0);
  nodes = elements(renders(props));
  assert.match(nodes.find((node) => node.type === UptimeError)?.props.message, /name and value separated by a colon/);
  tree = renders({ ...props, busy: true }); nodes = elements(tree);
  nodes.find((node) => node.props.id === "monitor-form-name")?.props.onChange({ target: { value: "Must not change" } });
  tree.props.onSubmit({ preventDefault: () => {} });
  assert.equal(submissions, 0);
  assert.equal(elements(renders(props)).find((node) => node.props.id === "monitor-form-name")?.props.value, "API");
});

test("monitor routes preserve data during refresh, gate management controls, and use compact overlay actions", async () => {
  const [catalog, detail, css] = await Promise.all([
    readFile(new URL("../src/routes/$orgSlug/uptime/monitors.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/$orgSlug/uptime/monitors_.$monitorId.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/uptime/monitors.module.css", import.meta.url), "utf8"),
  ]);
  for (const source of [catalog, detail]) {
    assert.match(source, /resource\.loading && !resource\.data/); assert.match(source, /canManage/);
    assert.match(source, /pending\.current/); assert.match(source, /mounted\.current/);
    assert.match(source, /<UptimeDialog/); assert.match(source, /type="submit" form=\{formId\} size="sm"/);
    assert.doesNotMatch(source, /<select|<textarea|<input|primaryButton|secondaryButton/);
  }
  assert.match(catalog, /MonitorCatalog key=\{orgSlug\}/);
  assert.match(detail, /MonitorDetailSession key=\{JSON\.stringify/);
  assert.match(detail, /<SegmentedControl/); assert.match(detail, /<CopyButton/);
  assert.match(css, /\.fields\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /summary:focus-visible/); assert.match(css, /prefers-reduced-motion/);
});

test("catalog management respects server capability, blocks duplicate creation and closing while pending, and keeps failed creation open", async () => {
  const source = await readFile(new URL("../src/routes/$orgSlug/uptime/monitors.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const Button = () => null, MonitorForm = () => null, UptimeDialog = () => null, UptimePageHeading = () => null, Placeholder = () => null;
  let index = 0, refIndex = 0, requests = 0, rejectRequest: (error: Error) => void = () => {};
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [];
  const resource = { data: { monitors: [] as UptimeMonitor[], limit: 10, canManage: false }, loading: false, error: null, reload: () => {} };
  const module = { exports: {} as any };
  runInNewContext(compiled, { React, Error, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "@tanstack/react-router") return { Link: Placeholder, createFileRoute: () => (definition: object) => ({ ...definition, useParams: () => ({ orgSlug: "workspace" }) }) };
    if (specifier === "react") return {
      useId: () => "monitor-dialog", useEffect: (effect: () => void) => effect(),
      useState: (initial: unknown) => { const current = index++; if (!(current in states)) states[current] = initial; return [states[current], (value: unknown) => { states[current] = typeof value === "function" ? value(states[current]) : value; }]; },
      useRef: (initial: unknown) => { const current = refIndex++; return refs[current] ?? (refs[current] = { current: initial }); },
    };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Placeholder });
    if (specifier === "@/components/arc/button/button") return { Button };
    if (specifier === "@/components/arc/search-field/search-field") return { SearchField: Placeholder };
    if (specifier === "@/components/arc/select/select") return { Select: Placeholder };
    if (specifier === "@/components/uptime/monitor-form") return { MonitorForm };
    if (specifier === "@/components/uptime/monitor-data") return helpers;
    if (specifier === "@/components/uptime/uptime-client") return { useUptimeResource: () => resource, formatTime: () => "Never", uptimeRequest: () => { requests++; return new Promise((_resolve, reject) => { rejectRequest = reject; }); } };
    if (specifier === "@/components/uptime/uptime-dialog") return { UptimeDialog };
    if (specifier === "@/components/uptime/use-uptime-refresh") return { useUptimeRefresh: () => {} };
    if (specifier === "@/components/uptime/uptime-skeleton") return { UptimeRowsSkeleton: Placeholder, UptimeSkeleton: Placeholder };
    if (specifier === "@/components/uptime/uptime-ui") return { StateBadge: Placeholder, UptimeError: Placeholder, UptimePageHeading, UptimePanel: Placeholder };
    throw new Error(`Unexpected catalog dependency: ${specifier}`);
  } });
  const renderCatalog = () => { index = 0; refIndex = 0; const wrapper = module.exports.Route.component(); return wrapper.type(wrapper.props); };
  let nodes = elements(renderCatalog());
  assert.equal(nodes.find((node) => node.type === UptimePageHeading)?.props.action, undefined, "members cannot launch monitor creation");
  assert.equal(nodes.some((node) => node.type === Button && node.props["aria-haspopup"] === "dialog"), false);
  resource.data.canManage = true;
  nodes = elements(renderCatalog());
  nodes.find((node) => node.type === UptimePageHeading)?.props.action.props.onClick();
  nodes = elements(renderCatalog());
  const form = nodes.find((node) => node.type === MonitorForm); assert.ok(form);
  form.props.onSubmit({ name: "API", url: monitor.url });
  form.props.onSubmit({ name: "API", url: monitor.url });
  assert.equal(requests, 1);
  nodes.find((node) => node.type === UptimeDialog)?.props.onClose();
  nodes = elements(renderCatalog());
  assert.ok(nodes.find((node) => node.type === UptimeDialog), "pending creation cannot dismiss its form");
  rejectRequest(new Error("Monitor could not be created."));
  await new Promise((resolve) => setImmediate(resolve));
  nodes = elements(renderCatalog());
  assert.equal(nodes.find((node) => node.type === MonitorForm)?.props.error, "Monitor could not be created.");
  assert.equal(nodes.find((node) => node.type === MonitorForm)?.props.busy, false);
  assert.ok(nodes.find((node) => node.type === UptimeDialog), "a failed request remains open for correction and retry");
});
