import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as incidentContent from "@outray/incident-content";
import { Select } from "../src/components/arc/select/select";
import { Button } from "../src/components/arc/button/button";
import { IncidentBadge, IncidentStatusSelect, StagePill } from "../src/components/uptime/incident-ui";
import { IncidentRichContent, IncidentRichEditor } from "../src/components/uptime/incident-rich-editor";
import * as client from "../src/components/uptime/uptime-client";
import * as display from "../src/lib/uptime/incident-display";
import * as statusUrl from "../src/lib/uptime/status-url";
import { incidentStageDescriptions } from "../src/components/uptime/incident-stages";

Object.assign(globalThis, { React });
const baseIncident: client.UptimeIncident = {
  id: "incident-one", title: "API availability", sourceType: "uptime_manual", status: "open",
  startedAt: "2026-10-07T08:00:00Z", componentIds: ["api"],
};
const update = (id: string, status: client.UptimeIncidentStatus, publishedAt: string | null): client.UptimeIncidentUpdate => ({
  id, status, publishedAt, note: id, createdAt: "2026-10-07T08:00:00Z",
});
const page: client.UptimePageResponse = {
  page: { slug: "acme", published: true } as client.UptimePage, groups: [],
  standaloneComponents: [{ id: "api", name: "Standalone API", visible: true, groupId: null, monitorIds: [], state: "up", sortOrder: 0, description: null }],
};

test("incident stages use compact semantic icons, text labels, and fit-content badges", () => {
  for (const [stage, color, label] of [
    ["investigating", "rose", "Investigating"], ["identified", "amber", "Identified"],
    ["monitoring", "blue", "Monitoring"], ["resolved", "emerald", "Resolved"],
    ["draft", "zinc", "Draft"], ["detected", "amber", "Detected issue"], ["ignored", "zinc", "Ignored"],
  ] as const) {
    const html = renderToStaticMarkup(React.createElement(StagePill, { stage }));
    assert.match(html, new RegExp(`text-${color}`)); assert.ok(html.includes(label));
    assert.match(html, /w-fit max-w-full/); assert.match(html, /text-\[10px\]/); assert.match(html, /<svg[^>]*aria-hidden="true"/);
  }
});

test("a newer private draft does not replace the latest published public stage or lifecycle", () => {
  const updates = [update("old", "investigating", "2026-10-07T08:00:00Z"), update("public", "identified", "2026-10-07T09:00:00Z"), update("private", "resolved", null)];
  const html = renderToStaticMarkup(React.createElement(IncidentBadge, { incident: baseIncident, updates }));
  assert.match(html, /Identified/); assert.match(html, /Active/); assert.doesNotMatch(html, />Resolved<|>Draft</);
  const draft = renderToStaticMarkup(React.createElement(IncidentBadge, { incident: baseIncident, updates: [updates[2]] }));
  assert.match(draft, />Draft</); assert.doesNotMatch(draft, />Active<|>Resolved</);
});

test("incident status uses the installed Arc Select with colored icons and field-linked errors", () => {
  const changed: string[] = [];
  const tree = IncidentStatusSelect({ value: "identified", onChange: (next) => changed.push(next), ariaLabel: "Update status", id: "status-field", invalid: true, describedBy: "status-error", allowResolved: false });
  const select = tree.props.children as React.ReactElement<React.ComponentProps<typeof Select>>;
  assert.equal(select.type, Select); assert.equal(select.props.id, "status-field"); assert.equal(select.props.label, "Update status");
  assert.equal(select.props["aria-invalid"], true); assert.equal(select.props["aria-describedby"], "status-error");
  assert.deepEqual(select.props.options.map((item) => item.value), ["investigating", "identified", "monitoring"]);
  assert.ok(select.props.options.every((item) => item.icon && item.description));
  select.props.onValueChange!("monitoring"); assert.deepEqual(changed, ["monitoring"]);
});

test("rich updates retain formatted content, escaped legacy notes, and safe links", () => {
  const body: incidentContent.IncidentDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Recovery", marks: [{ type: "bold" }] }, { type: "text", text: " details", marks: [{ type: "link", attrs: { href: "https://example.invalid/report" } }] }] }] };
  const html = renderToStaticMarkup(React.createElement(IncidentRichContent, { body, note: "fallback" }));
  assert.match(html, /<strong>Recovery<\/strong>/); assert.match(html, /https:\/\/example.invalid\/report/); assert.doesNotMatch(html, /fallback/);
  const legacy = renderToStaticMarkup(React.createElement(IncidentRichContent, { note: "<script>bad</script>\nLegacy update" }));
  assert.match(legacy, /&lt;script&gt;/); assert.doesNotMatch(legacy, /<script>/); assert.match(legacy, /Legacy update/);
});

test("the server-safe editor uses actual Arc toolbar buttons, retains its formatting, and renders no native text-only composer", () => {
  const html = renderToStaticMarkup(React.createElement(IncidentRichEditor, { id: "test-editor", onChange() {} }));
  assert.match(html, /role="toolbar" aria-label="Format incident update"/);
  for (const tool of ["Bold", "Italic", "Heading", "Small heading", "Bulleted list", "Numbered list", "Quote", "Link", "Clear formatting"]) assert.ok(html.includes(`aria-label="${tool}"`));
  assert.match(html, /aria-pressed="false"/); assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /<textarea|focus-within:border-violet/);
});

type TreeElement = React.ReactElement<{ children?: React.ReactNode; [key: string]: any }>;
function elements(node: React.ReactNode): TreeElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as TreeElement;
  return [element, ...elements(element.props.children)];
}
const bare = (props: { children?: React.ReactNode }) => React.createElement("div", null, props.children);

/** Render real detail-route layout; only infrastructure, dialogs and the live editor are stubbed. */
async function detail(overrides: Partial<client.UptimeIncidentDetailResponse> = {}) {
  const resource: client.UptimeIncidentDetailResponse = {
    incident: baseIncident, updates: [update("published update", "investigating", "2026-10-07T08:05:00Z")],
    componentIds: ["api"], canManage: true, monitorAvailable: false, notifications: [], ...overrides,
  };
  const source = await readFile(new URL("../src/routes/$orgSlug/uptime/incidents_.$incidentId.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source.replace("import.meta.env.VITE_OUTRAY_STATUS_URL", "undefined")}\nexport { IncidentDetail, IncidentUpdateEditor };`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const state: any[] = []; let index = 0;
  const module = { exports: {} as any };
  const Lucide = await import("lucide-react");
  const sheet = (props: { children?: React.ReactNode }) => React.createElement("aside", null, props.children);
  const modules: Record<string, unknown> = {
    react: { ...React, useState(initial: any) { const slot = index++; if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial; return [state[slot], (next: any) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }]; }, useRef: () => ({ current: null }), useEffect() {} },
    "@tanstack/react-query": { useQuery: (options: { queryKey: string[] }) => ({ data: options.queryKey.includes("incident") ? resource : page, isPending: false, isError: false, dataUpdatedAt: Date.parse("2026-10-07T10:00:00Z") }), useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    "@tanstack/react-router": { createFileRoute: () => () => ({ useSearch: () => ({ q: "API", view: "active", source: "manual" }) }), Link: (props: any) => React.createElement("a", { href: props.to, className: props.className }, props.children) },
    "lucide-react": Lucide,
    "@outray/incident-content": incidentContent,
    "@/components/arc/button/button": { Button },
    "@/components/arc/button/button.module.css": { default: { button: "button", secondary: "secondary", md: "md" }, __esModule: true },
    "@/components/outray-arc-theme.css": {},
    "@/components/uptime/incident-ui": { IncidentBadge, IncidentStatusSelect, StagePill },
    "@/components/uptime/incident-stages": { incidentStageDescriptions },
    "@/components/uptime/incident-rich-editor": { IncidentRichContent, IncidentRichEditor: bare },
    "@/components/uptime/uptime-client": { ...client, uptimeRequest: async () => ({}) },
    "@/components/uptime/uptime-skeleton": { UptimeHeaderSkeleton: bare, UptimeRowsSkeleton: bare, UptimeSkeleton: bare },
    "@/components/uptime/uptime-ui": { labelClass: "label", UptimeError: bare },
    "@/components/uptime/uptime-dialog": { UptimeDialog: () => null },
    "@/components/uptime/uptime-side-sheet": { UptimeSideSheet: sheet },
    "@/components/uptime/use-uptime-unsaved-changes": { useUptimeUnsavedChanges: () => ({ status: "idle" }) },
    "@/lib/uptime/incident-display": display,
    "@/lib/uptime/status-url": statusUrl,
  };
  runInNewContext(compiled, { React, module, exports: module.exports, URL, Date, require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected detail import ${name}`); return modules[name];
  } });
  return {
    sheet,
    render() { index = 0; return module.exports.IncidentDetail({ orgSlug: "acme", incidentId: "incident-one" }) as TreeElement; },
  };
}

test("detail keeps public-stage chronology, standalone labels, quiet timeline rows, and private drafts separate", async () => {
  const controller = await detail({ updates: [update("earlier-public", "investigating", "2026-10-07T08:05:00Z"), update("latest-public", "monitoring", "2026-10-07T09:00:00Z"), update("private draft", "resolved", null)] });
  const html = renderToStaticMarkup(controller.render());
  assert.match(html, /text-\[20px\] font-normal/); assert.match(html, /rounded-xl[^>]*bg-\[#111112\]/);
  assert.match(html, /Standalone API/); assert.match(html, /Public report/);
  assert.ok(html.indexOf("latest-public") < html.indexOf("earlier-public"));
  assert.ok(html.indexOf("private draft") > html.indexOf("incident-drafts-title"));
  assert.match(html, /border-dashed/); assert.match(html, /Drafts do not change public status or send email/);
  assert.match(html, /<details[^>]*>[\s\S]*Recent delivery attempts/);
});

test("manual resolved details preserve read-only updates and non-managers receive no mutation controls", async () => {
  for (const overrides of [{ incident: { ...baseIncident, status: "resolved" as const } }, { canManage: false }]) {
    const controller = await detail(overrides);
    const html = renderToStaticMarkup(controller.render());
    assert.doesNotMatch(html, />Add update<|>Edit draft</);
    assert.match(html, overrides.canManage === false ? /Only organization owners and admins/ : /updates and drafts are read-only/);
  }
});

test("active private detections show acknowledgement and ignore, but ignored or recovered private issues do not", async () => {
  for (const [publication, status, actions] of [["detected", "open", true], ["ignored", "open", false], ["detected", "resolved", false]] as const) {
    const controller = await detail({ incident: { ...baseIncident, sourceType: "uptime_monitor", uptimePublicationState: publication, status, sourceId: "monitor-one" }, updates: [] });
    const html = renderToStaticMarkup(controller.render());
    assert.match(html, /No public incident report or subscriber email was created/); assert.doesNotMatch(html, /Public report/);
    assert.equal(html.includes("Acknowledge &amp; publish"), actions); assert.equal(html.includes(">Ignore detection<"), actions);
    assert.match(html, /Downtime detected/);
    if (status === "resolved") assert.match(html, /Recovered without a public incident/);
  }
});

test("opening Add update keeps the rich-status composer in a side sheet rather than inline in the timeline", async () => {
  const controller = await detail();
  const tree = controller.render();
  const add = elements(tree).find((node) => node.type === Button && React.Children.toArray(node.props.children).includes("Add update"));
  assert.ok(add); add.props.onClick();
  const composer = elements(controller.render()).find((node) => typeof node.type === "function" && node.type.name === "IncidentUpdateEditor");
  assert.ok(composer); assert.equal(composer.props.editable, true); assert.equal(composer.props.defaultStatus, "investigating");
  const source = await readFile(new URL("../src/routes/$orgSlug/uptime/incidents_.$incidentId.tsx", import.meta.url), "utf8");
  assert.match(source, /<UptimeSideSheet open/); assert.match(source, /<IncidentStatusSelect id="incident-update-status"/);
  assert.match(source, /<IncidentRichEditor id="incident-update-body"/); assert.match(source, /loading=\{saving === "publish"\}/);
});

test("list and notifications retain their public contracts while using installed compact controls", async () => {
  const list = await readFile(new URL("../src/routes/$orgSlug/uptime/incidents.tsx", import.meta.url), "utf8");
  assert.match(list, /components\/arc\/segmented-control\/segmented-control/); assert.match(list, /<SearchField appearance="workspace"/); assert.match(list, /<Select label="Incident source"/);
  assert.match(list, /validateSearch: incidentSearch/); assert.match(list, /limit: "25"/); assert.match(list, /search=\{search\}/); assert.match(list, /refetchIntervalInBackground: false/);
  assert.doesNotMatch(list, /components\/ui\/select|bg-\[#0d0d0f\]/);
  const notifications = await readFile(new URL("../src/routes/$orgSlug/uptime/notifications.tsx", import.meta.url), "utf8");
  assert.match(notifications, /xl:grid-cols-\[minmax\(0,1fr\)_320px\]/); assert.match(notifications, /Notification channel connected/); assert.match(notifications, /Connection cancelled/); assert.match(notifications, /Could not connect/);
  assert.match(notifications, /cancelQueries\(\{ queryKey \}\)/); assert.match(notifications, /integrations\/\$\{provider\}/); assert.match(notifications, /method: "DELETE"/);
  assert.match(notifications, /variant="danger" size="sm" loading=\{removing !== null\}/);
});
