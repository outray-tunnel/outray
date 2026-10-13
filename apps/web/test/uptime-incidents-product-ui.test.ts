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
import { IncidentTimeline } from "../src/components/uptime/incident-timeline";
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

function timelineMarkup(html: string): string {
  const start = html.indexOf('id="incident-timeline-title"');
  assert.notEqual(start, -1, "the timeline must have an accessible heading");
  const end = html.indexOf("</section>", start);
  assert.ok(end > start, "the timeline must remain a distinct section");
  return html.slice(start, end);
}

/** Render real detail-route layout; only infrastructure, dialogs and the live editor are stubbed. */
async function detail(overrides: Partial<client.UptimeIncidentDetailResponse> = {}, statusPage: client.UptimePageResponse = page, fixtureEnv: { DEV: boolean; VITE_OUTRAY_STATUS_URL?: string } = { DEV: false }) {
  const resource: client.UptimeIncidentDetailResponse = {
    incident: baseIncident, updates: [update("published update", "investigating", "2026-10-07T08:05:00Z")],
    componentIds: ["api"], canManage: true, monitorAvailable: false, notifications: [], ...overrides,
  };
  const source = await readFile(new URL("../src/routes/$orgSlug/uptime/incidents_.$incidentId.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source.replaceAll("import.meta.env", "fixtureEnv")}\nexport { IncidentDetail, IncidentUpdateEditor };`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const state: any[] = []; let index = 0;
  const requests: Array<{ path: string; method: string | undefined; body: any }> = [];
  const module = { exports: {} as any };
  const Lucide = await import("lucide-react");
  const sheet = (props: { children?: React.ReactNode }) => React.createElement("aside", null, props.children);
  const modules: Record<string, unknown> = {
    react: { ...React, useState(initial: any) { const slot = index++; if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial; return [state[slot], (next: any) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }]; }, useRef: () => ({ current: null }), useEffect() {} },
    "@tanstack/react-query": { useQuery: (options: { queryKey: string[] }) => ({ data: options.queryKey.includes("incident") ? resource : statusPage, isPending: false, isError: false, dataUpdatedAt: Date.parse("2026-10-07T10:00:00Z") }), useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    "@tanstack/react-router": { createFileRoute: () => () => ({ useSearch: () => ({ q: "API", view: "active", source: "manual" }) }), Link: (props: any) => React.createElement("a", { href: props.to, className: props.className }, props.children) },
    "lucide-react": Lucide,
    "@outray/incident-content": incidentContent,
    "@/components/arc/button/button": { Button },
    "@/components/ui/workspace-input": { WorkspaceInput: "input" },
    "@/components/uptime/incident-ui": { IncidentBadge, IncidentStatusSelect, StagePill },
    "@/components/uptime/incident-stages": { incidentStageDescriptions },
    "@/components/uptime/incident-rich-editor": { IncidentRichContent, IncidentRichEditor: bare },
    "@/components/uptime/incident-timeline": { IncidentTimeline },
    "@/components/uptime/uptime-client": { ...client, uptimeRequest: async (_orgSlug: string, path: string, init: RequestInit) => { requests.push({ path, method: init.method, body: JSON.parse(String(init.body)) }); return {}; } },
    "@/components/uptime/uptime-skeleton": { UptimeHeaderSkeleton: bare, UptimeRowsSkeleton: bare, UptimeSkeleton: bare },
    "@/components/uptime/uptime-ui": { labelClass: "label", UptimeError: bare, UptimeCheckbox: "input" },
    "@/components/uptime/uptime-dialog": { UptimeDialog: () => null },
    "@/components/uptime/uptime-side-sheet": { UptimeSideSheet: sheet },
    "@/components/uptime/use-uptime-unsaved-changes": { useUptimeUnsavedChanges: () => ({ status: "idle" }) },
    "@/lib/uptime/incident-display": display,
    "@/lib/uptime/status-url": statusUrl,
  };
  runInNewContext(compiled, { React, module, exports: module.exports, URL, Date, fixtureEnv, require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected detail import ${name}`); return modules[name];
  } });
  return {
    sheet,
    requests,
    render() { index = 0; return module.exports.IncidentDetail({ orgSlug: "acme", incidentId: "incident-one" }) as TreeElement; },
    editor(props: Record<string, unknown>) { index = 0; return module.exports.IncidentUpdateEditor({ orgSlug: "acme", incidentId: "incident-one", incidentTitle: "PRIVATE alert name", defaultStatus: "investigating", automatic: true, observability: true, publicTitleEditable: true, publicTitle: null, linkedComponents: true, firstPublication: true, monitorRecovered: false, pagePublished: true, editable: true, onSaved: async () => {}, onCancel() {}, ...props }) as TreeElement; },
  };
}

test("Observability detections use one shared incident, authenticated evidence, and a separate customer title", async () => {
  const controller = await detail({
    incident: { ...baseIncident, sourceType: "observability_alert", sourceId: "alert-one", uptimePublicationState: "detected", publicTitle: "Checkout is degraded", recoveryConfirmed: false },
    updates: [],
    observabilitySource: { alertId: "alert-one", alertName: "PRIVATE alert name", service: "checkout", environment: "production", alertAvailable: true, publicTitle: "Checkout is degraded", impact: "degraded", recoveryConfirmed: false },
  });
  const html = renderToStaticMarkup(controller.render());
  assert.match(html, /Observability/); assert.match(html, /same private incident/);
  assert.match(html, /Checkout is degraded/); assert.match(html, /Private observability evidence/);
  for (const path of ["alerts/$alertId", "services/$serviceId", "logs", "traces"]) assert.ok(html.includes(`/$orgSlug/observability/${path}`));
  assert.match(html, /Recovery has not been confirmed/); assert.doesNotMatch(html, /Public report/);
  const trigger = elements(controller.render()).find((node) => node.type === Button && React.Children.toArray(node.props.children).includes("Acknowledge & publish"));
  assert.ok(trigger); trigger.props.onClick();
  const composer = elements(controller.render()).find((node) => typeof node.type === "function" && node.type.name === "IncidentUpdateEditor");
  assert.equal(composer?.props.publicTitle, "Checkout is degraded");
  assert.equal(composer?.props.monitorRecovered, false);
});

test("resolved Observability updates require explicit independent confirmation before publication", async () => {
  const controller = await detail();
  const props = { defaultStatus: "resolved", publicTitle: "API recovery", draft: update("Recovery independently verified", "resolved", null) };
  let tree = controller.editor(props);
  const publish = () => elements(tree).flatMap((node) => elements(node.props.footer)).find((node) => node.type === Button && React.Children.toArray(node.props.children).includes("Acknowledge & publish"))!;
  assert.equal(publish().props.disabled, true);
  const checkbox = elements(tree).find((node) => node.props.id === "incident-update-recovery")!;
  assert.ok(checkbox); checkbox.props.onChange({ target: { checked: true } });
  tree = controller.editor(props);
  assert.equal(publish().props.disabled, false);
  publish().props.onClick(); await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(controller.requests[0].body.acknowledgeRecovery, true);
  assert.equal(controller.requests[0].body.status, "resolved");
  assert.equal(controller.requests[0].body.publicTitle, "API recovery");
});

test("Observability publication never falls back to the private alert name", async () => {
  const controller = await detail();
  let tree = controller.editor({});
  assert.equal(elements(tree).find((node) => node.props.id === "incident-update-publicTitle")?.props.value, "");
  const publish = elements(tree).flatMap((node) => elements(node.props.footer)).find((node) => node.type === Button && React.Children.toArray(node.props.children).includes("Acknowledge & publish"))!;
  publish.props.onClick(); await new Promise<void>((resolve) => setImmediate(resolve));
  tree = controller.editor({});
  assert.equal(controller.requests.length, 0);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /private alert name is not used automatically/);
});

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

test("incident history is a semantic vertical timeline with stage markers, continuous connectors and one latest event", () => {
  const props: React.ComponentProps<typeof IncidentTimeline> = { events: [
    { id: "latest", at: "2026-10-07T10:00:00Z", stage: "monitoring", update: { note: "Watching the fix" } },
    { id: "middle", at: "2026-10-07T09:00:00Z", stage: "identified", update: { note: "Cause identified" } },
    { id: "first", at: "2026-10-07T08:00:00Z", stage: "investigating", update: { note: "Investigating impact" } },
  ] };
  const html = renderToStaticMarkup(React.createElement(IncidentTimeline, props));
  assert.match(html, /<ol[^>]*aria-label="Incident timeline, newest first"/);
  assert.match(html, /<ol[^>]*role="list"/, "list semantics must survive Tailwind's list-style reset in Safari");
  const rows = html.match(/<li\b[^>]*data-incident-event[^>]*>/g) || [];
  assert.equal(rows.length, 3);
  for (const [index, [id, stage]] of [["latest", "monitoring"], ["middle", "identified"], ["first", "investigating"]].entries()) {
    assert.ok(rows[index].includes(`data-incident-event="${id}"`));
    assert.ok(rows[index].includes(`data-stage="${stage}"`));
    assert.ok(rows[index].includes('data-event-kind="update"'));
  }
  const markers = html.match(/<[^>]*data-timeline-marker[^>]*>/g) || [];
  const connectors = html.match(/<[^>]*data-timeline-connector[^>]*>/g) || [];
  assert.equal(markers.length, rows.length, "every event needs a visible stage marker on the rail");
  assert.equal(connectors.length, rows.length - 1, "the rail must join adjacent events and stop at the oldest event");
  const hiddenRails = elements(IncidentTimeline(props)).filter((node) => node.props["aria-hidden"] === "true" && elements(node).some((child) => child.props["data-timeline-marker"] !== undefined));
  assert.equal(hiddenRails.length, rows.length, "every decorative rail and marker must be hidden from screen readers, including via their parent");
  assert.equal((html.match(/>Latest</g) || []).length, 1);
  assert.equal((html.match(/<time\b/g) || []).length, rows.length);
  assert.doesNotMatch(html, /divide-y/, "connected timeline events should not fall back to a table-like divider list");

  const single = renderToStaticMarkup(React.createElement(IncidentTimeline, { events: [{ id: "only", at: "2026-10-07T08:00:00Z", stage: "identified", update: { note: "" } }] }));
  assert.equal((single.match(/data-timeline-marker/g) || []).length, 1);
  assert.doesNotMatch(single, /data-timeline-connector/, "a single event must not have a dangling line");
  assert.match(single, /data-stage="identified"/);
  assert.match(single, />Latest</);

  const empty = renderToStaticMarkup(React.createElement(IncidentTimeline, { events: [] }));
  assert.doesNotMatch(empty, /data-timeline-marker|data-timeline-connector|>Latest</, "empty private history must not invent an event");
});

test("the published timeline stays newest-first by publication time with deterministic ties, not draft creation time", async () => {
  const controller = await detail({ updates: [
    { ...update("middle-a", "identified", "2026-10-07T09:00:00Z"), createdAt: "2026-10-07T12:00:00Z" },
    update("earliest", "investigating", "2026-10-07T08:05:00Z"),
    { ...update("newest", "monitoring", "2026-10-07T10:00:00Z"), createdAt: "2026-10-07T07:00:00Z" },
    update("middle-z", "identified", "2026-10-07T09:00:00Z"),
    { ...update("private-future-draft", "resolved", null), createdAt: "2026-10-08T10:00:00Z" },
  ] });
  const timeline = timelineMarkup(renderToStaticMarkup(controller.render()));
  const ids = ["newest", "middle-z", "middle-a", "earliest"];
  for (let index = 1; index < ids.length; index++) assert.ok(timeline.indexOf(ids[index - 1]) < timeline.indexOf(ids[index]), "publication order must not depend on incoming or creation order");
  assert.doesNotMatch(timeline, /private-future-draft|>Resolved</, "a newer private resolution cannot enter the public timeline");
  for (const at of ["2026-10-07T10:00:00Z", "2026-10-07T09:00:00Z", "2026-10-07T08:05:00Z"]) assert.ok(timeline.includes(`dateTime="${new Date(at).toISOString()}"`));
});

test("status-only declarations remain real timestamped timeline events without a fabricated first message", async () => {
  const statusOnly = { ...update("status-only", "identified", "2026-10-07T08:05:00Z"), note: "", bodyJson: null };
  const controller = await detail({ updates: [statusOnly] });
  const timeline = timelineMarkup(renderToStaticMarkup(controller.render()));
  assert.match(timeline, /<ol\b/);
  assert.match(timeline, />Identified</);
  assert.match(timeline, /<time dateTime="2026-10-07T08:05:00\.000Z"/);
  assert.doesNotMatch(timeline, /No published updates yet|fallback|undefined|null/);
});

test("timeline updates retain rich formatting and escape legacy messages without leaking private drafts", async () => {
  const rich = { ...update("rich-public", "monitoring", "2026-10-07T09:00:00Z"), note: "unused fallback", bodyJson: incidentContent.legacyIncidentDocument("Recovery details") };
  rich.bodyJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Recovery details", marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.invalid/report" } }] }] }] };
  const controller = await detail({ updates: [rich, { ...update("legacy-public", "investigating", "2026-10-07T08:05:00Z"), note: "<script>alert(1)</script>" }, { ...update("private", "resolved", null), note: "PRIVATE message" }] });
  const timeline = timelineMarkup(renderToStaticMarkup(controller.render()));
  assert.match(timeline, /<strong>Recovery details<\/strong>/);
  assert.match(timeline, /href="https:\/\/example.invalid\/report"/);
  assert.match(timeline, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(timeline, /<script|unused fallback|PRIVATE message/);
});

test("automatic timelines retain detection, approved updates and only genuinely confirmed recovery", async () => {
  const publishedUpdate = update("approved-message", "monitoring", "2026-10-07T09:00:00Z");
  const automatic = { ...baseIncident, sourceType: "uptime_monitor" as const, status: "resolved" as const, resolvedAt: "2026-10-07T10:00:00Z", uptimePublicationState: "published" as const };
  const monitor = timelineMarkup(renderToStaticMarkup((await detail({ incident: automatic, updates: [publishedUpdate] })).render()));
  assert.match(monitor, /Recovery confirmed/);
  assert.match(monitor, /Downtime detected/);
  assert.ok(monitor.indexOf("Recovery confirmed") < monitor.indexOf("approved-message"));
  assert.ok(monitor.indexOf("approved-message") < monitor.indexOf("Downtime detected"));
  assert.match(monitor, /The monitor confirmed recovery and resolved this issue automatically/);

  const observabilityIncident = { ...automatic, sourceType: "observability_alert" as const, recoveryConfirmed: false };
  const source = { alertId: "alert-one", alertName: "Private alert name", service: "checkout", environment: "production", alertAvailable: true, publicTitle: "Checkout is degraded", impact: "degraded" as const, recoveryConfirmed: false };
  const unconfirmed = timelineMarkup(renderToStaticMarkup((await detail({ incident: observabilityIncident, updates: [publishedUpdate], observabilitySource: source })).render()));
  assert.match(unconfirmed, /Alert issue detected/);
  assert.match(unconfirmed, /approved-message/);
  assert.doesNotMatch(unconfirmed, /Recovery confirmed|released its public component impact|dateTime="2026-10-07T10:00:00\.000Z"/, "a resolved timestamp alone must not fabricate telemetry recovery");

  const recovered = timelineMarkup(renderToStaticMarkup((await detail({ incident: observabilityIncident, updates: [publishedUpdate], observabilitySource: { ...source, recoveryConfirmed: true } })).render()));
  assert.match(recovered, /Recovery confirmed/);
  assert.match(recovered, /Confirmed recovery closed this alert issue and released its public component impact/);
  assert.ok(recovered.indexOf("Recovery confirmed") < recovered.indexOf("approved-message"));
});

test("private automatic detections display their source event but no unpublished draft in the timeline", async () => {
  const controller = await detail({ incident: { ...baseIncident, sourceType: "uptime_monitor", uptimePublicationState: "detected" }, updates: [{ ...update("unpublished-message", "resolved", null), note: "PRIVATE resolution draft" }] });
  const html = renderToStaticMarkup(controller.render());
  const timeline = timelineMarkup(html);
  assert.match(timeline, /Downtime detected/);
  assert.match(timeline, /created a private detected issue/);
  assert.doesNotMatch(timeline, /PRIVATE resolution draft|Recovery confirmed|>Resolved</);
  assert.ok(html.indexOf("PRIVATE resolution draft") > html.indexOf("incident-drafts-title"));
});

test("published manual declarations without linked components have a public report, but private or hidden-only incidents do not", async () => {
  const unlinked = { ...baseIncident, componentIds: [] };
  const statusOnly = { ...update("initial status", "investigating", "2026-10-07T08:05:00Z"), note: "", bodyJson: null };
  const controller = await detail({ incident: unlinked, componentIds: [], updates: [statusOnly] });
  const tree = controller.render();
  const report = elements(tree).find((node) => node.type === "a" && React.Children.toArray(node.props.children).includes("Public report"));
  assert.ok(report, "a deliberately unlinked manual declaration is still public after publication");
  assert.equal(report.props.href, "https://acme.status.outray.app/incidents/incident-one");
  assert.equal(report.props.target, "_blank");
  assert.equal(report.props.rel, "noopener noreferrer");

  const privateDraft = await detail({ incident: unlinked, componentIds: [], updates: [{ ...statusOnly, publishedAt: null }] });
  assert.doesNotMatch(renderToStaticMarkup(privateDraft.render()), /Public report/);
  const hiddenPage = { ...page, standaloneComponents: page.standaloneComponents.map((component) => ({ ...component, visible: false })) };
  const hiddenOnly = await detail({ updates: [statusOnly] }, hiddenPage);
  assert.doesNotMatch(renderToStaticMarkup(hiddenOnly.render()), /Public report/, "hidden linked components must not be treated as a deliberately unlinked manual incident");
  const unpublishedPage = await detail({ incident: unlinked, componentIds: [], updates: [statusOnly] }, { ...page, page: { ...page.page!, published: false } });
  assert.doesNotMatch(renderToStaticMarkup(unpublishedPage.render()), /Public report/);
  for (const sourceType of ["uptime_monitor", "observability_alert"] as const) {
    const automatic = await detail({ incident: { ...unlinked, sourceType, uptimePublicationState: "published" }, componentIds: [], updates: [statusOnly] });
    assert.doesNotMatch(renderToStaticMarkup(automatic.render()), /Public report/, `${sourceType} still needs a public linked component`);
  }
});

test("the Public report button targets the local status app in development and honors explicit origins", async () => {
  for (const [fixtureEnv, expectedHref] of [
    [{ DEV: true }, "http://localhost:4323/acme/incidents/incident-one"],
    [{ DEV: true, VITE_OUTRAY_STATUS_URL: "http://localhost:4999" }, "http://localhost:4999/acme/incidents/incident-one"],
    [{ DEV: true, VITE_OUTRAY_STATUS_URL: "http://127.0.0.1:4323" }, "http://127.0.0.1:4323/acme/incidents/incident-one"],
    [{ DEV: false }, "https://acme.status.outray.app/incidents/incident-one"],
    [{ DEV: true, VITE_OUTRAY_STATUS_URL: "https://status.example.invalid" }, "https://acme.status.example.invalid/incidents/incident-one"],
    [{ DEV: false, VITE_OUTRAY_STATUS_URL: "https://status.example.invalid" }, "https://acme.status.example.invalid/incidents/incident-one"],
  ] as const) {
    const controller = await detail({}, page, fixtureEnv);
    const report = elements(controller.render()).find((node) => node.type === "a" && React.Children.toArray(node.props.children).includes("Public report"));
    assert.ok(report);
    assert.equal(report.props.href, expectedHref);
    assert.equal(report.props.target, "_blank");
    assert.equal(report.props.rel, "noopener noreferrer");
  }
});

test("a blank manual declaration draft can publish its status without inventing a first message", async () => {
  const controller = await detail();
  const emptyBody: incidentContent.IncidentDocument = { type: "doc", content: [{ type: "paragraph" }] };
  const draft = { ...update("blank-first-update", "identified", null), note: "", bodyJson: null };
  const props = { automatic: false, observability: false, publicTitleEditable: false, firstPublication: false, linkedComponents: false, draft };
  let tree = controller.editor(props);
  elements(tree).find((node) => node.props.id === "incident-update-body")!.props.onChange(emptyBody);
  tree = controller.editor(props);
  const publish = elements(tree).flatMap((node) => elements(node.props.footer)).find((node) => node.type === Button && React.Children.toArray(node.props.children).includes("Publish update"));
  assert.ok(publish); assert.equal(publish.props.disabled, false);
  publish.props.onClick(); await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(controller.requests.length, 1);
  assert.equal(controller.requests[0].method, "PATCH");
  assert.equal(controller.requests[0].path, "/incidents/incident-one/updates/blank-first-update");
  assert.equal(controller.requests[0].body.publish, true);
  assert.equal(controller.requests[0].body.status, "identified");
  assert.equal(incidentContent.incidentPlainText(controller.requests[0].body.body), "");
});

test("fresh updates and existing message-bearing drafts still require meaningful text before publication", async () => {
  const emptyBody: incidentContent.IncidentDocument = { type: "doc", content: [{ type: "paragraph" }] };
  const richDraft = { ...update("formatted draft", "investigating", null), note: "", bodyJson: incidentContent.legacyIncidentDocument("We are investigating checkout errors.") };
  for (const draft of [undefined, update("We are investigating checkout errors.", "investigating", null), richDraft]) {
    const controller = await detail();
    const props = { automatic: false, observability: false, publicTitleEditable: false, firstPublication: false, draft };
    let tree = controller.editor(props);
    elements(tree).find((node) => node.props.id === "incident-update-body")!.props.onChange(emptyBody);
    tree = controller.editor(props);
    const publish = elements(tree).flatMap((node) => elements(node.props.footer)).find((node) => node.type === Button && React.Children.toArray(node.props.children).includes("Publish update"))!;
    publish.props.onClick(); await new Promise<void>((resolve) => setImmediate(resolve));
    tree = controller.editor(props);
    assert.equal(controller.requests.length, 0, draft ? "erasing an existing message cannot turn it into a status-only declaration" : "only a stored blank initial draft gets the optional-message exception");
    assert.equal(elements(tree).find((node) => node.props.id === "incident-update-body")?.props.invalid, true);
    assert.match(renderToStaticMarkup(tree), /Write an update using supported formatting before saving/);
  }
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
