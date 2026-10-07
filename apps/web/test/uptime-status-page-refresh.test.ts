import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import { Button } from "../src/components/arc/button/button";
import { Select } from "../src/components/arc/select/select";
import { SearchField } from "../src/components/arc/search-field/search-field";
import { CopyButton } from "../src/components/arc/copy-button/copy-button";
import SegmentedControl from "../src/components/arc/segmented-control/segmented-control";
import { WorkspaceInput, WorkspaceTextarea } from "../src/components/ui/workspace-input";
import * as uptimeUi from "../src/components/uptime/uptime-ui";
import * as skeletons from "../src/components/uptime/uptime-skeleton";
import { appearanceDraftChanged, appearanceEditorReducer, createAppearanceState } from "../src/components/uptime/status-page-data";
import { preferredStatusPageUrl, statusPageUrl } from "../src/lib/uptime/status-url";
import { moveStatusLayout } from "../src/lib/uptime/status-layout";
import type { UptimePage } from "../src/components/uptime/uptime-client";
import type { StatusPageEditorContextValue } from "../src/components/uptime/status-page-editor-context";

Object.assign(globalThis, { React });
const page: UptimePage = { id: "page-1", slug: "acme", name: "Acme status", description: null, accentColor: "#8367c7", logoUrl: null, published: false };
const sourceFile = new URL("../src/routes/$orgSlug/uptime/status-page.tsx", import.meta.url);

test("appearance drafts derive only editable fields and normalize legacy null descriptions", () => {
  const state = createAppearanceState(page);
  assert.deepEqual(state.draft, { name: "Acme status", description: "", accentColor: "#8367c7" });
  assert.equal(appearanceDraftChanged(state.draft, state.baseline), false);
  assert.equal(state.draft, state.baseline);
});

test("appearance edits are immutable and functional edits use the most recent draft", () => {
  const original = createAppearanceState(page);
  const first = appearanceEditorReducer(original, { type: "edit", update: (draft) => ({ ...draft, name: "New name" }) });
  const second = appearanceEditorReducer(first, { type: "edit", update: (draft) => ({ ...draft, description: "A description", accentColor: "#00ff99" }) });
  assert.equal(original.draft.name, "Acme status");
  assert.deepEqual(second.draft, { name: "New name", description: "A description", accentColor: "#00ff99" });
  assert.equal(appearanceDraftChanged(second.draft, second.baseline), true);
});

test("a logo upload or background server refresh never erases an unsaved appearance draft", () => {
  const original = createAppearanceState(page);
  const edited = appearanceEditorReducer(original, { type: "edit", update: { ...original.draft, description: "Unsaved text" } });
  const refreshed = appearanceEditorReducer(edited, { type: "server", page: { ...page, name: "Renamed elsewhere", logoUrl: "https://example.invalid/logo.webp", published: true } });
  assert.equal(refreshed.draft, edited.draft);
  assert.equal(refreshed.baseline, original.baseline);
  assert.equal(refreshed.latest.name, "Renamed elsewhere");
  assert.equal(appearanceDraftChanged(refreshed.draft, refreshed.baseline), true);
});

test("confirmed save commits its snapshot; a clean refresh accepts server normalization", () => {
  const original = createAppearanceState(page);
  const edited = appearanceEditorReducer(original, { type: "edit", update: { ...original.draft, name: "Saved name " } });
  const committed = appearanceEditorReducer(edited, { type: "commit", draft: edited.draft });
  assert.equal(appearanceDraftChanged(committed.draft, committed.baseline), false);
  const refreshed = appearanceEditorReducer(committed, { type: "server", page: { ...page, name: "Saved name" } });
  assert.equal(refreshed.draft.name, "Saved name");
  assert.equal(appearanceDraftChanged(refreshed.draft, refreshed.baseline), false);
});

test("discard restores the latest known server appearance instead of a stale snapshot", () => {
  const original = createAppearanceState(page);
  const edited = appearanceEditorReducer(original, { type: "edit", update: { ...original.draft, name: "Unsaved" } });
  const refreshed = appearanceEditorReducer(edited, { type: "server", page: { ...page, name: "Team edit" } });
  const discarded = appearanceEditorReducer(refreshed, { type: "discard" });
  assert.equal(discarded.draft.name, "Team edit");
  assert.equal(appearanceDraftChanged(discarded.draft, discarded.baseline), false);
});

function element(tag: string) { return ({ children, ...props }: any) => React.createElement(tag, props, children); }
const Dialog = ({ open, children, footer }: any) => open ? React.createElement("div", { role: "dialog" }, children, footer) : null;
const context: StatusPageEditorContextValue = {
  orgSlug: "acme", page, groups: [], standaloneComponents: [], monitors: [], monitorsLoaded: true, canManage: true,
  reload: () => {}, appearanceDraft: createAppearanceState(page).draft, setAppearanceDraft: () => {}, appearanceDirty: false, appearanceSaving: false, setAppearanceSaving: () => {}, commitAppearance: () => {},
};
type Resource = { data: any; loading: boolean; error: string | null; reload: () => void };
async function loadViews(overrides: Partial<typeof context> = {}, resources?: Partial<Record<string, Resource>>, section = "") {
  const source = await readFile(sourceFile, "utf8");
  const fixture = { ...context, ...overrides };
  const copiedAddresses: string[] = [];
  const module = { exports: {} as any };
  const route = { useParams: () => ({ orgSlug: "acme" }), useNavigate: () => () => {}, options: {} as any };
  const Link = ({ to, params, children, ...props }: any) => React.createElement("a", { ...props, href: to.replace("$orgSlug", params.orgSlug) }, children);
  const code = ts.transpileModule(source.replaceAll("import.meta.env", "({})"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  runInNewContext(code, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return React;
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (options: any) => { route.options = options; return route; }, Link, Outlet: () => React.createElement("p", { "data-editor-outlet": "true" }, "Editor content"), useRouterState: ({ select }: any) => select({ location: { pathname: `/acme/uptime/status-page${section}` } }) };
      if (specifier === "@dnd-kit/react") return { DragDropProvider: element("div"), useDroppable: () => ({ ref: () => {}, isDropTarget: false }) };
      if (specifier === "@dnd-kit/react/sortable") return { isSortable: () => false, useSortable: () => ({ ref: () => {}, sourceRef: () => {}, targetRef: () => {}, handleRef: () => {}, isDragging: false, isDropTarget: false }) };
      if (specifier === "@dnd-kit/dom/sortable") return { SortableKeyboardPlugin: class {} };
      if (specifier === "lucide-react") return icons;
      if (specifier.endsWith("/uptime-client")) return { uptimeApiPath: (_: string, path: string) => path, uptimeRequest: async () => { throw new Error("Unexpected mutation in rendering test"); }, useUptimeResource: (_: string, path: string) => resources?.[path] ?? { data: path === "/page" ? { ...fixture, standaloneComponents: fixture.standaloneComponents } : { monitors: fixture.monitors }, loading: false, error: null, reload: () => {} } };
      if (specifier.endsWith("/uptime-ui")) return uptimeUi;
      if (specifier.endsWith("/uptime-skeleton")) return skeletons;
      if (specifier.endsWith("/status-page-editor-context")) return { useStatusPageEditor: () => fixture };
      if (specifier.endsWith("/status-page-editor-provider")) return { StatusPageEditorProvider: ({ children }: any) => children };
      if (specifier.endsWith("/status-url")) return { preferredStatusPageUrl, statusPageUrl };
      if (specifier.endsWith("/status-layout")) return { moveStatusLayout };
      if (specifier.endsWith("/workspace-input")) return { WorkspaceInput, WorkspaceTextarea };
      if (specifier.endsWith("/button/button")) return { Button };
      if (specifier.endsWith("/select/select")) return { Select };
      if (specifier.endsWith("/search-field/search-field")) return { SearchField };
      if (specifier.endsWith("/copy-button/copy-button")) return { CopyButton: (props: React.ComponentProps<typeof CopyButton>) => { copiedAddresses.push(props.value); return React.createElement(CopyButton, props); } };
      if (specifier.endsWith("/segmented-control/segmented-control")) return { __esModule: true, default: SegmentedControl };
      if (specifier.endsWith("/uptime-dialog")) return { UptimeDialog: Dialog };
      if (specifier.endsWith("/status-page-row-menu")) return { StatusPageRowMenu: () => null };
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected status-page dependency: ${specifier}`);
    },
  });
  return { render: (name: string) => renderToStaticMarkup(React.createElement(module.exports[name])), layout: () => renderToStaticMarkup(React.createElement(route.options.component)), copiedAddresses };
}

test("overview explains private visibility, handles standalone components and never invents monitor totals", async () => {
  const views = await loadViews({ monitorsLoaded: false, standaloneComponents: [{ id: "api", groupId: null, name: "Public API", description: null, visible: true, sortOrder: 0, monitorIds: ["monitor-1"], state: "up" }] });
  const html = views.render("StatusPageOverview");
  assert.match(html, /1 standalone/);
  assert.match(html, /Not publicly available/);
  assert.match(html, /Linked to visible components/);
  assert.doesNotMatch(html, /of 0 monitors|Available to visitors/);
  assert.match(html, /aria-label="Copy status page address"/);
  assert.match(html, /https:\/\/acme\.status\.outray\.app\//);
});

test("status overview and View page prioritize the custom domain without changing the reserved OutRay address", async () => {
  const views = await loadViews({ page: { ...page, published: true, customDomain: "status.byteship.dev" } });
  const overview = views.render("StatusPageOverview");
  assert.match(overview, /https:\/\/status\.byteship\.dev\//);
  assert.doesNotMatch(overview, /https:\/\/acme\.status\.outray\.app\//);
  assert.match(overview, /aria-label="Copy status page address"/);
  assert.deepEqual(views.copiedAddresses, ["https://status.byteship.dev/"]);
  assert.match(views.layout(), /href="https:\/\/status\.byteship\.dev\/"[^>]*>View page/);
  const publishing = views.render("StatusPagePublishing");
  assert.match(publishing, /OutRay address/);
  assert.match(publishing, /https:\/\/acme\.status\.outray\.app\//);
});

test("View page falls back to OutRay and verified domains do not make drafts public", async () => {
  const published = await loadViews({ page: { ...page, published: true, customDomain: null } });
  assert.match(published.layout(), /href="https:\/\/acme\.status\.outray\.app\/"[^>]*>View page/);
  const draft = await loadViews({ page: { ...page, customDomain: "status.byteship.dev" } });
  assert.match(draft.render("StatusPageOverview"), /https:\/\/status\.byteship\.dev\//);
  assert.doesNotMatch(draft.layout(), />View page/);
});

test("members can inspect components without drag, mutation, or creation controls", async () => {
  const views = await loadViews({ canManage: false, standaloneComponents: [{ id: "api", groupId: null, name: "Public API", description: "API availability", visible: true, sortOrder: 0, monitorIds: [], state: "operational" }] });
  const html = views.render("StatusPageComponents");
  assert.match(html, /Public API|API availability/);
  assert.match(html, /Operational/);
  assert.doesNotMatch(html, /Add component|Add group|Drag Public API|Edit component|Update status/);
});

test("component empty state explains the model and managers get compact Arc launchers", async () => {
  const views = await loadViews();
  const html = views.render("StatusPageComponents");
  assert.match(html, /Start with the services that matter/);
  assert.match(html, /Add component|Add group/);
  assert.match(html, /aria-expanded="false"/);
});

test("appearance is read-only for members and keeps the full circular accent preview", async () => {
  const views = await loadViews({ canManage: false });
  const html = views.render("StatusPageAppearance");
  assert.match(html, /Only owners and admins/);
  assert.match(html, /rounded-full[^>]+background-color:#8367c7/);
  assert.match(html, /type="color"[^>]+disabled=""/);
  assert.doesNotMatch(html, /Save changes|Upload logo|Remove logo/);
});

test("publishing separates page visibility, incident drafts and queued subscriber email", async () => {
  const views = await loadViews();
  const html = views.render("StatusPagePublishing");
  assert.match(html, /Your page is private/);
  assert.match(html, /does not publish incident drafts/);
  assert.match(html, /Only confirmed subscribers are queued/);
  assert.match(html, /Publish page/);
  const readOnly = await loadViews({ canManage: false, page: { ...page, published: true } });
  const readHtml = readOnly.render("StatusPagePublishing");
  assert.match(readHtml, /Your page is public/);
  assert.doesNotMatch(readHtml, /Unpublish page/);
});

test("resource refresh errors preserve the editor and offer an explicit retry", async () => {
  const resource = { data: { page, groups: [], standaloneComponents: [], canManage: true }, loading: false, error: "Could not refresh settings", reload: () => {} };
  const views = await loadViews({}, { "/page": resource }, "/appearance");
  const html = views.layout();
  assert.match(html, /Could not refresh settings|Try again/);
  assert.match(html, /data-editor-outlet="true"/);
  assert.match(html, /aria-label="Status page section"/);
});

test("an unavailable monitor list does not block appearance, publishing or domain editors", async () => {
  for (const section of ["/appearance", "/publishing", "/domains"]) {
    const views = await loadViews({}, { "/monitors": { data: null, loading: false, error: "Monitors unavailable", reload: () => {} } }, section);
    const html = views.layout();
    assert.match(html, /data-editor-outlet="true"/);
    assert.doesNotMatch(html, /Monitors unavailable|Loading status page details/);
  }
});

test("failed component monitor loading offers retry without rendering a misleading empty picker", async () => {
  const views = await loadViews({}, { "/monitors": { data: null, loading: false, error: "Monitors unavailable", reload: () => {} } }, "/components");
  const html = views.layout();
  assert.match(html, /Monitors unavailable|Retry monitors/);
  assert.doesNotMatch(html, /data-editor-outlet|No monitors yet/);
});

test("status tab and domain actions retain route, ownership, DNS and pending-confirmation safety", async () => {
  const [parent, domains, provider, menu] = await Promise.all([
    readFile(sourceFile, "utf8"),
    readFile(new URL("../src/routes/$orgSlug/uptime/status-page/domains.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/uptime/status-page-editor-provider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/uptime/status-page-row-menu.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(parent, /WorkspaceStatusPage key=\{orgSlug\}/);
  assert.match(parent, /canManage = pageData\.data\?\.canManage === true/);
  assert.match(parent, /moveStatusLayout\(layout, id, from, to, index\)/);
  assert.match(parent, /SortableKeyboardPlugin/);
  assert.match(parent, /<Select label="Placement"/);
  assert.match(parent, /<UptimeCheckbox checked=/);
  assert.doesNotMatch(parent, /<select\b|accent-violet|window\.confirm/);
  assert.match(provider, /enableBeforeUnload: appearanceDirty \|\| appearanceSaving/);
  assert.match(provider, /blocker\.status === "blocked" && !appearanceDirty && !appearanceSaving\) blocker\.proceed\(\)/);
  assert.match(provider, /busy=\{appearanceSaving\}/);
  assert.match(provider, /!next\.pathname\.startsWith\(editorPath \+ "\/"\)/);
  assert.match(domains, /_outray-challenge\./);
  assert.match(domains, /const cnameTarget = "status\.outray\.app"/);
  assert.match(domains, /DNS only/);
  assert.match(domains, /reload: reloadPage/);
  assert.equal(domains.match(/reload\(\); reloadPage\(\);/g)?.length, 3);
  assert.match(domains, /if \(!domain \|\| !canManage \|\| pending\.current\) return/);
  assert.match(domains, /busy=\{working === "remove"\}/);
  assert.match(domains, /error && <div className="mt-3"><UptimeError/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /ArrowDown.*ArrowUp.*Home.*End/);
  assert.match(menu, /event\.key === "Escape"/);
});
