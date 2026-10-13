import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as content from "@outray/incident-content";
import { incidentComponentRows, incidentComponentWindow } from "../src/components/uptime/incident-component-data";
import * as componentData from "../src/components/uptime/incident-component-data";
import { incidentFormatSnapshot } from "../src/components/uptime/incident-editor-state";
import { IncidentComponentPicker } from "../src/components/uptime/incident-component-picker";
import * as display from "../src/lib/uptime/incident-display";
import type { UptimeComponent, UptimePageResponse } from "../src/components/uptime/uptime-client";

Object.assign(globalThis, { React });
type Element = React.ReactElement<any>;
const bare = (props: { children?: React.ReactNode }) => React.createElement("div", null, props.children);

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

/** Exercise hook callbacks/state without browser automation or a live database. */
function hooks() {
  const states: any[] = []; const setters: Array<(next: any) => void> = [];
  const refs: Array<{ current: any }> = [];
  const memos: Array<{ dependencies: unknown[]; value: any }> = [];
  const effects: Array<() => void> = [];
  let stateIndex = 0; let refIndex = 0; let memoIndex = 0; let stateWrites = 0;
  const memoValue = (factory: () => any, dependencies: unknown[]) => {
    const slot = memoIndex++;
    if (!memos[slot] || dependencies.some((value, index) => !Object.is(value, memos[slot].dependencies[index]))) {
      memos[slot] = { dependencies: Array.from(dependencies), value: factory() };
    }
    return memos[slot].value;
  };
  return {
    refs,
    react: {
      ...React, useId: () => "incident-test", useMemo: memoValue,
      useCallback: (callback: any, dependencies: unknown[]) => memoValue(() => callback, dependencies),
      useState(initial: any) {
        const slot = stateIndex++;
        if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
        setters[slot] ??= (next: any) => { stateWrites++; states[slot] = typeof next === "function" ? next(states[slot]) : next; };
        return [states[slot], setters[slot]];
      },
      useRef(initial: any) { const slot = refIndex++; return refs[slot] ??= { current: initial }; },
      useEffect(effect: () => void) { effects.push(effect); },
    },
    get stateWrites() { return stateWrites; },
    render(callback: () => React.ReactNode) { stateIndex = 0; refIndex = 0; memoIndex = 0; return callback(); },
    commit() { effects.splice(0).forEach((effect) => effect()); },
  };
}

async function load(sourcePath: string, modules: Record<string, unknown>) {
  const source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as any };
  runInNewContext(compiled, { React, module, exports: module.exports,
    requestAnimationFrame: (callback: () => void) => callback(), document: { getElementById: () => null },
    require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected incident dependency ${name}`); return modules[name];
  } });
  return module.exports;
}

const component = (index: number): UptimeComponent => ({
  id: `component-${index}`, name: `Service ${index}`, groupId: null, description: null,
  visible: index !== 1, sortOrder: index, monitorIds: [], state: "up",
});
const page: UptimePageResponse = {
  page: { id: "page", name: "Status", description: null, slug: "demo", accentColor: "#8367c7", logoUrl: null, published: true },
  standaloneComponents: Array.from({ length: 30 }, (_, index) => component(index)),
  groups: [{ id: "group", name: "Platform", visible: true, sortOrder: 0, components: Array.from({ length: 9_971 }, (_, index) => component(index + 30)) }],
};

test("component windows bound DOM work and search the whole workspace, preserving grouping", () => {
  const rows = incidentComponentRows(page);
  const first = incidentComponentWindow(rows, "", 0);
  assert.equal(first.total, 10_001); assert.equal(first.end, 50);
  assert.deepEqual(first.groups.map((group) => [group.name, group.components.length]), [["Standalone components", 30], ["Platform", 20]]);
  const next = incidentComponentWindow(rows, "", 1);
  assert.equal(next.start, 50); assert.equal(next.groups[0].components[0].id, "component-50");
  const last = incidentComponentWindow(rows, "  SERVICE 10000  ", 0);
  assert.equal(last.total, 1); assert.equal(last.groups[0].components[0].id, "component-10000");
  assert.equal(incidentComponentWindow(rows, "missing component", 999).currentPage, 0);
  assert.equal(incidentComponentWindow(rows, "", 999).end, 10_001);
});

test("the real picker renders only 50 accessible checkboxes for a 10,001-component workspace", () => {
  const html = renderToStaticMarkup(React.createElement(IncidentComponentPicker, {
    page, id: "component-picker", selected: ["component-1", "component-10000"], onToggle() {}, error: "Pick an affected component.",
  }));
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 50);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  assert.match(html, /2 selected/); assert.match(html, /Standalone components/); assert.match(html, /Platform/);
  assert.match(html, /1–50 of 10001 components/); assert.match(html, /aria-label="Next components"/);
  assert.match(html, /aria-describedby="component-picker-error"/); assert.match(html, /id="component-picker-error" role="alert"/);
});

test("picker pagination and search reach off-page components without clearing existing selections", async () => {
  const runtime = hooks(); const Search = (props: any) => React.createElement("input", props); const Button = bare;
  let selected = ["component-10000"];
  const module = await load("../src/components/uptime/incident-component-picker.tsx", {
    react: runtime.react, "lucide-react": { Check: bare },
    "@/components/arc/button/button": { Button }, "@/components/arc/search-field/search-field": { SearchField: Search },
    "./uptime-ui": { labelClass: "label" }, "./incident-component-data": componentData,
  });
  const render = () => elements(runtime.render(() => module.IncidentComponentPicker.type({
    page, selected, id: "picker", onToggle: (id: string, checked: boolean) => {
      selected = checked ? [...selected, id] : selected.filter((value) => value !== id);
    },
  })));
  let tree = render();
  tree.find((element) => element.type === "input" && element.props.type === "checkbox")!.props.onChange({ target: { checked: true } });
  assert.deepEqual(selected, ["component-10000", "component-0"]);
  tree = render(); tree.find((element) => element.type === Button && element.props["aria-label"] === "Next components")!.props.onClick();
  tree = render();
  assert.equal(tree.filter((element) => element.type === "input" && element.props.type === "checkbox").length, 50);
  tree.find((element) => element.type === Search)!.props.onValueChange("Service 10000");
  tree = render();
  const result = tree.filter((element) => element.type === "input" && element.props.type === "checkbox");
  assert.equal(result.length, 1); assert.equal(result[0].props.checked, true);
  tree.find((element) => element.type === Search)!.props.onValueChange("");
  assert.equal(render().find((element) => element.type === "input" && element.props.type === "checkbox")!.props.checked, true);
  assert.deepEqual(selected, ["component-10000", "component-0"]);
});

test("toolbar snapshots ignore text/caret changes while tracking every supported active format", () => {
  const active = new Set<string>();
  const editor = { isActive: (name: string, attributes?: { level?: number }) => active.has(attributes?.level ? `${name}-${attributes.level}` : name) };
  assert.equal(incidentFormatSnapshot(null), 0);
  const plain = incidentFormatSnapshot(editor);
  for (let index = 0; index < 1000; index++) assert.equal(incidentFormatSnapshot(editor), plain);
  for (const [name, bit] of [["bold", 1], ["italic", 2], ["heading-2", 4], ["heading-3", 8], ["bulletList", 16], ["orderedList", 32], ["blockquote", 64], ["link", 128]] as const) {
    active.clear(); active.add(name); assert.equal(incidentFormatSnapshot(editor), bit);
  }
});

test("editor events save current content without React revision writes, configuration churn or stale callbacks", async () => {
  const runtime = hooks(); const options: any[] = []; let configured = 0;
  let body = content.legacyIncidentDocument("Typed update");
  const attributes = new Map<string, string>();
  const editor = { getJSON: () => body, setEditable() {}, view: { dom: {
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    removeAttribute: (key: string) => attributes.delete(key),
  } } };
  const module = await load("../src/components/uptime/incident-rich-editor.tsx", {
    react: runtime.react,
    "@outray/incident-content": content,
    "@tiptap/react": { EditorContent: bare, useEditor: (next: any) => { options.push(next); return editor; }, useEditorState: () => 0 },
    "@tiptap/starter-kit": { __esModule: true, default: { configure: () => { configured++; return {}; } } },
    "lucide-react": new Proxy({}, { get: () => bare }),
    "@/components/ui/workspace-input": { WorkspaceInput: bare },
    "@/components/arc/button/button": { Button: bare },
    "./uptime-dialog": { UptimeDialog: bare },
    "./incident-editor-state": { incidentFormatSnapshot },
  });
  const first: content.IncidentDocument[] = []; const latest: content.IncidentDocument[] = [];
  const render = (onChange: (value: content.IncidentDocument) => void, invalid = false) => runtime.render(() => module.IncidentRichEditor.type({ id: "body", initialNote: "Original draft", onChange, invalid }));
  render((value) => first.push(value)); runtime.commit();
  const original = options[0];
  assert.equal(original.immediatelyRender, false); assert.equal(original.shouldRerenderOnTransaction, false);
  assert.equal(original.onSelectionUpdate, undefined);
  const beforeWrites = runtime.stateWrites;
  for (let index = 0; index < 1000; index++) original.onUpdate({ editor });
  assert.equal(first.length, 1000); assert.equal(runtime.stateWrites, beforeWrites);
  render((value) => latest.push(value), true); runtime.commit();
  body = content.legacyIncidentDocument("Latest draft"); original.onUpdate({ editor });
  assert.equal(latest[0], body); assert.equal(first.length, 1000);
  assert.equal(configured, 1); assert.equal(options[1].extensions, original.extensions);
  assert.equal(options[1].editorProps, original.editorProps); assert.equal(options[1].content, original.content); assert.equal(options[1].onUpdate, original.onUpdate);
  assert.equal(attributes.get("aria-invalid"), "true"); assert.equal(attributes.get("aria-describedby"), "body-error");
});

test("title and body typing keep memoized picker props stable and do not re-derive the component list", async () => {
  const runtime = hooks(); const Picker = bare; const RichEditor = (props: any) => React.createElement("div", props);
  const Input = (props: any) => React.createElement("input", props);
  let derivations = 0;
  const module = await load("../src/components/uptime/create-incident-dialog.tsx", {
    react: runtime.react,
    "@tanstack/react-router": { Link: bare }, "@outray/incident-content": content,
    "@tanstack/react-query": { useQuery: () => ({ data: page, isPending: false, isError: false }) },
    "lucide-react": { Info: bare },
    "@/lib/uptime/incident-display": { pageComponents: (value: UptimePageResponse) => { derivations++; return display.pageComponents(value); } },
    "@/components/ui/workspace-input": { WorkspaceInput: Input },
    "@/components/arc/button/button": { Button: bare },
    "./incident-ui": { IncidentStatusSelect: bare }, "./incident-rich-editor": { IncidentRichEditor: RichEditor },
    "./incident-component-picker": { IncidentComponentPicker: Picker },
    "./uptime-dialog": { UptimeDialog: bare },
    "./uptime-side-sheet": { UptimeSideSheet: bare },
    "./use-uptime-unsaved-changes": { useUptimeUnsavedChanges: () => ({ status: "idle" }) },
    "./uptime-client": { uptimeRequest: async () => ({}), UptimeRequestError: Error },
    "./uptime-skeleton": { UptimeSkeleton: bare }, "./uptime-ui": { labelClass: "label", UptimeError: bare },
  });
  const render = () => elements(runtime.render(() => module.CreateIncidentDialog({ orgSlug: "demo", onClose() {}, onCreated() {} })));
  const first = render(); const picker = first.find((element) => element.type === Picker && element.props.id === "incident-test-componentIds")!;
  assert.ok(picker);
  first.find((element) => element.type === Input)!.props.onChange({ target: { value: "Outage" } });
  for (let index = 0; index < 100; index++) {
    const tree = render(); tree.find((element) => element.type === RichEditor)!.props.onChange(content.legacyIncidentDocument(`Update ${index}`));
    const next = tree.find((element) => element.type === Picker && element.props.id === picker.props.id)!;
    for (const key of Object.keys(picker.props)) assert.equal(next.props[key], picker.props[key], `Changed picker prop: ${key}`);
  }
  assert.equal(derivations, 1);
});

async function incidentComposer(
  request: (...args: any[]) => Promise<any> = async () => ({ incident: { id: "created-incident" } }),
  pageResponse: UptimePageResponse = page,
) {
  const runtime = hooks();
  const Sheet = (props: any) => React.createElement("aside", props, props.children);
  const Dialog = (props: any) => React.createElement("div", props, props.children);
  const Input = (props: any) => React.createElement("input", props);
  const Picker = (props: any) => React.createElement("div", props);
  const Editor = (props: any) => React.createElement("div", props);
  const Status = (props: any) => React.createElement("select", props);
  const Button = (props: any) => React.createElement("button", props, props.children);
  let closed = 0, resets = 0, proceeds = 0, blocked = false, lastDirty = false;
  const created: string[] = [];
  const module = await load("../src/components/uptime/create-incident-dialog.tsx", {
    react: runtime.react,
    "@tanstack/react-router": { Link: bare }, "@outray/incident-content": content,
    "@tanstack/react-query": { useQuery: () => ({ data: pageResponse, isPending: false, isError: false }) },
    "lucide-react": { Info: bare },
    "@/lib/uptime/incident-display": display,
    "@/components/ui/workspace-input": { WorkspaceInput: Input },
    "@/components/arc/button/button": { Button },
    "./incident-ui": { IncidentStatusSelect: Status }, "./incident-rich-editor": { IncidentRichEditor: Editor },
    "./incident-component-picker": { IncidentComponentPicker: Picker },
    "./uptime-dialog": { UptimeDialog: Dialog }, "./uptime-side-sheet": { UptimeSideSheet: Sheet },
    "./use-uptime-unsaved-changes": { useUptimeUnsavedChanges: (dirty: boolean) => {
      lastDirty = dirty;
      return { status: blocked ? "blocked" : "idle", reset() { resets++; blocked = false; }, proceed() { proceeds++; } };
    } },
    "./uptime-client": { uptimeRequest: request, UptimeRequestError: Error },
    "./uptime-skeleton": { UptimeSkeleton: bare }, "./uptime-ui": { labelClass: "label", UptimeError: bare },
  });
  return {
    Sheet, Dialog, Input, Picker, Editor, Status, Button, created,
    get closed() { return closed; }, get resets() { return resets; }, get proceeds() { return proceeds; }, get dirty() { return lastDirty; },
    blockNavigation() { blocked = true; },
    render() {
      const tree = elements(runtime.render(() => module.CreateIncidentDialog({ orgSlug: "demo", onClose() { closed++; }, onCreated: (id: string) => created.push(id) })));
      runtime.refs[0].current = { reportValidity: () => true };
      return {
        tree,
        sheet: tree.find((element) => element.type === Sheet)!,
        discard: tree.find((element) => element.type === Dialog)!,
      };
    },
  };
}

test("incident declaration uses the large side sheet and retains a focused title plus modal discard confirmation", async () => {
  const ui = await incidentComposer();
  let view = ui.render();
  assert.equal(view.sheet.props.open, true);
  assert.equal(view.sheet.props.size, "lg");
  assert.equal(view.sheet.props.title, "Declear incident");
  assert.equal(view.sheet.props.busy, false);
  assert.equal(view.tree.find((element) => element.type === ui.Input)?.props["data-autofocus"], true);
  assert.equal(view.discard.props.title, "Discard this draft?");
  assert.equal(view.discard.props.layer, 1);
  assert.equal(view.discard.props.open, false);
  assert.equal(ui.dirty, false);
  view.sheet.props.onClose(); assert.equal(ui.closed, 1);

  view.tree.find((element) => element.type === ui.Input)!.props.onChange({ target: { value: "Checkout is degraded" } });
  view = ui.render(); view.sheet.props.onClose(); view = ui.render();
  assert.equal(ui.closed, 1, "closing a dirty sheet must prompt without losing its draft");
  assert.equal(ui.dirty, true);
  assert.equal(view.discard.props.open, true);
  assert.equal(view.tree.find((element) => element.type === ui.Input)?.props.value, "Checkout is degraded");
  elements(view.discard.props.footer).find((element) => element.props.children === "Keep editing")!.props.onClick();
  view = ui.render(); assert.equal(view.discard.props.open, false); assert.equal(ui.resets, 1);

  ui.blockNavigation(); view = ui.render(); assert.equal(view.discard.props.open, true);
  elements(view.discard.props.footer).find((element) => element.props.children === "Discard draft")!.props.onClick();
  assert.equal(ui.proceeds, 1); assert.equal(ui.closed, 2);
});

test("an untouched editor's canonical empty documents and whitespace never trigger a draft-discard prompt", async () => {
  const emptyBodies: content.IncidentDocument[] = [
    { type: "doc", content: [{ type: "paragraph" }] },
    { type: "doc", content: [] },
    { type: "doc", content: [{ type: "paragraph", content: [] }] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " \t\n " }] }] },
  ];
  for (const body of emptyBodies) {
    const ui = await incidentComposer();
    let view = ui.render();
    view.tree.find((element) => element.type === ui.Editor)!.props.onChange(body);
    view = ui.render();
    assert.equal(ui.dirty, false, JSON.stringify(body));
    view.sheet.props.onClose(); view = ui.render();
    assert.equal(ui.closed, 1, "empty editor normalization should not trap an otherwise clean sheet");
    assert.equal(view.discard.props.open, false);
  }
});

test("a nonempty incident update protects its draft even when no other field has changed", async () => {
  const ui = await incidentComposer();
  let view = ui.render();
  view.tree.find((element) => element.type === ui.Editor)!.props.onChange({
    type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Investigating intermittent errors." }] }],
  });
  view = ui.render(); assert.equal(ui.dirty, true);
  assert.equal(view.tree.find((element) => element.type === ui.Input)?.props.value, "");
  view.sheet.props.onClose(); view = ui.render();
  assert.equal(ui.closed, 0);
  assert.equal(view.discard.props.open, true);
});

test("the declaration sheet keeps publish semantics, submitting locks and independent draft form ownership", async () => {
  const requests: any[] = [];
  let finish!: (result: { incident: { id: string } }) => void;
  const pending = new Promise<{ incident: { id: string } }>((resolve) => { finish = resolve; });
  const ui = await incidentComposer(async (orgSlug, path, init) => {
    requests.push({ orgSlug, path, body: JSON.parse(String(init.body)) });
    return pending;
  });
  let view = ui.render();
  view.tree.find((element) => element.type === ui.Input)!.props.onChange({ target: { value: "Checkout is degraded" } });
  view.tree.find((element) => element.type === ui.Picker)!.props.onToggle("component-0", true);
  view.tree.find((element) => element.type === ui.Editor)!.props.onChange(content.legacyIncidentDocument("Investigating checkout errors."));
  view = ui.render();
  const actions = elements(view.sheet.props.footer);
  const publish = actions.find((element) => element.type === ui.Button && element.props.children === "Declear incident")!;
  const draft = actions.find((element) => element.type === ui.Button && element.props.children === "Save draft")!;
  assert.ok(publish);
  assert.equal(draft.props.type, "submit");
  assert.equal(draft.props.form, view.tree.find((element) => element.type === "form")?.props.id);
  publish.props.onClick(); publish.props.onClick();
  assert.equal(requests.length, 1, "duplicate clicks must not create duplicate incidents");
  assert.equal(requests[0].orgSlug, "demo"); assert.equal(requests[0].path, "/incidents");
  assert.equal(requests[0].body.publish, true); assert.equal(requests[0].body.title, "Checkout is degraded");
  assert.deepEqual(requests[0].body.componentIds, ["component-0"]);
  view = ui.render();
  assert.equal(view.sheet.props.busy, true);
  assert.equal(view.tree.find((element) => element.type === "fieldset")?.props.disabled, true);
  assert.equal(view.tree.find((element) => element.type === ui.Editor)?.props.disabled, true);
  assert.equal(elements(view.sheet.props.footer).find((element) => element.props.children === "Save draft")?.props.disabled, true);
  assert.equal(elements(view.sheet.props.footer).find((element) => element.props.children === "Cancel")?.props.disabled, true);
  view.sheet.props.onClose(); assert.equal(ui.closed, 0); assert.equal(ui.render().discard.props.open, false);
  finish({ incident: { id: "new-incident" } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(ui.created, ["new-incident"]);
  view = ui.render(); assert.equal(view.sheet.props.busy, false); assert.equal(ui.dirty, false);
});

test("incident declaration and draft saving require only title and status, not an update or components", async () => {
  for (const publish of [false, true]) {
    const requests: any[] = [];
    const ui = await incidentComposer(async (_orgSlug, _path, init) => {
      requests.push(JSON.parse(String(init.body)));
      return { incident: { id: "minimal-incident" } };
    });
    let view = ui.render();
    assert.equal(view.tree.find((element) => element.type === ui.Picker)!.props.optional, true);
    assert.ok(view.tree.some((element) => element.type === "p" && elements(element).some((child) => child.props.children === "(optional)")));
    view.tree.find((element) => element.type === ui.Input)!.props.onChange({ target: { value: " API outage " } });
    view.tree.find((element) => element.type === ui.Status)!.props.onChange("identified");
    view = ui.render();
    if (publish) elements(view.sheet.props.footer).find((element) => element.props.children === "Declear incident")!.props.onClick();
    else view.tree.find((element) => element.type === "form")!.props.onSubmit({ preventDefault() {} });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(requests, [{ title: "API outage", status: "identified", componentIds: [], publish }]);
    assert.deepEqual(ui.created, ["minimal-incident"]);
  }
});

test("a status page without components still exposes and enables the incident declaration form", async () => {
  const requests: any[] = [];
  const ui = await incidentComposer(async (_orgSlug, _path, init) => {
    requests.push(JSON.parse(String(init.body)));
    return { incident: { id: "unlinked-incident" } };
  }, { ...page, standaloneComponents: [], groups: [] });
  let view = ui.render();
  assert.ok(view.tree.find((element) => element.type === "form"));
  assert.equal(view.tree.some((element) => element.type === ui.Picker), false);
  const actions = elements(view.sheet.props.footer);
  assert.equal(actions.find((element) => element.props.children === "Save draft")!.props.disabled, false);
  assert.equal(actions.find((element) => element.props.children === "Declear incident")!.props.disabled, false);
  view.tree.find((element) => element.type === ui.Input)!.props.onChange({ target: { value: "Service disruption" } });
  view = ui.render();
  elements(view.sheet.props.footer).find((element) => element.props.children === "Declear incident")!.props.onClick();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].componentIds, []);
  assert.equal(requests[0].body, undefined);
});

test("optional first updates accept canonical blank documents but still reject malformed or oversized content", async () => {
  for (const body of [content.legacyIncidentDocument(""), { type: "doc", content: [{ type: "paragraph" }] }, content.legacyIncidentDocument(" \t ")]) {
    const requests: any[] = [];
    const ui = await incidentComposer(async (_orgSlug, _path, init) => {
      requests.push(JSON.parse(String(init.body))); return { incident: { id: "empty-update" } };
    });
    let view = ui.render();
    view.tree.find((element) => element.type === ui.Input)!.props.onChange({ target: { value: "API outage" } });
    view.tree.find((element) => element.type === ui.Editor)!.props.onChange(body);
    view = ui.render();
    elements(view.sheet.props.footer).find((element) => element.props.children === "Declear incident")!.props.onClick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(requests.length, 1); assert.equal(requests[0].body, undefined);
  }
  for (const body of [{ type: "doc", content: [{ type: "image" }] }, content.legacyIncidentDocument("x".repeat(4001))]) {
    let requests = 0;
    const ui = await incidentComposer(async () => { requests++; return { incident: { id: "invalid" } }; });
    let view = ui.render();
    view.tree.find((element) => element.type === ui.Input)!.props.onChange({ target: { value: "API outage" } });
    view.tree.find((element) => element.type === ui.Editor)!.props.onChange(body);
    view = ui.render();
    elements(view.sheet.props.footer).find((element) => element.props.children === "Declear incident")!.props.onClick();
    view = ui.render();
    assert.equal(requests, 0); assert.equal(view.tree.find((element) => element.type === ui.Editor)!.props.invalid, true);
  }
});

test("the incident name remains required and an unpublished page still prevents declaration", async () => {
  let requests = 0;
  const ui = await incidentComposer(async () => { requests++; return { incident: { id: "invalid" } }; });
  let view = ui.render();
  elements(view.sheet.props.footer).find((element) => element.props.children === "Declear incident")!.props.onClick();
  view = ui.render();
  assert.equal(requests, 0); assert.equal(view.tree.find((element) => element.type === ui.Input)!.props["aria-invalid"], true);
  const unpublished = await incidentComposer(undefined, { ...page, page: { ...page.page!, published: false } });
  const actions = elements(unpublished.render().sheet.props.footer);
  assert.equal(actions.find((element) => element.props.children === "Declear incident")!.props.disabled, true);
  assert.equal(actions.find((element) => element.props.children === "Save draft")!.props.disabled, false);
});
