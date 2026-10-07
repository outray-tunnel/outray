import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TrashRestoreContent, type TrashRestoreContentProps } from "../src/components/secrets/trash-restore-dialog";
import { canConfirmTrashRestore } from "../src/components/secrets/trash-data";
import type { SecretTrashItem } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

const item: SecretTrashItem = {
  id: "secret-a", batchId: "batch-a", type: "bulk", name: "Deleted 3 secrets", itemCount: 3, isProduction: false,
  deletedAt: "2026-10-06T08:00:00Z", expiresAt: null,
  metadata: { projectSlug: "api", environmentSlug: "development", reason: "delete" },
};
const defaults: TrashRestoreContentProps = {
  item, confirmation: "", productionConfirmed: false, loading: false, error: null,
  onConfirmationChange: () => {}, onProductionChange: () => {}, onSubmit: () => {}, onClose: () => {},
};
const render = (overrides: Partial<TrashRestoreContentProps> = {}) => renderToStaticMarkup(React.createElement(TrashRestoreContent, { ...defaults, ...overrides }));
const controls = (html: string) => [...html.matchAll(/<input\b[^>]*>/g)].map(([control]) => control);
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);

test("restore requires the exact name and explicit production acknowledgement, without trimming or coercion", () => {
  assert.equal(canConfirmTrashRestore(item, item.name, false, false), true);
  for (const confirmation of ["", `${item.name} `, ` ${item.name}`, item.name.toLowerCase()]) {
    assert.equal(canConfirmTrashRestore(item, confirmation, true, false), false);
  }
  assert.equal(canConfirmTrashRestore({ ...item, isProduction: true }, item.name, false, false), false);
  assert.equal(canConfirmTrashRestore({ ...item, isProduction: true }, item.name, true, false), true);
  assert.equal(canConfirmTrashRestore(item, item.name, true, true), false);
});

test("recovery summary shows metadata only, correct scope, and conflict behaviour", () => {
  const html = render();
  assert.match(html, /Deleted 3 secrets/); assert.match(html, /Secret batch · 3 secrets/);
  assert.match(html, /api \/ development/);
  assert.match(html, /Existing keys won’t be overwritten/);
  assert.match(html, /If names or keys conflict, nothing is restored/);
  assert.match(html, /restore that first/);
  assert.match(html, /Values stay encrypted/);
  assert.doesNotMatch(html, /permanent deletion|>Delete<|Purge|30 days|expires/i);
  const input = controls(html).find((control) => control.includes('type="checkbox"') === false) ?? "";
  assert.match(input, /data-workspace-input="default"/);
  assert.match(input, /required=""/); assert.match(input, /autoComplete="off"/i); assert.match(input, /spellCheck="false"/i);
  assert.match(input, /aria-describedby="[^"]+-confirmation-hint"/);
  assert.match(input, /data-trash-restore-autofocus="true"/);
  assert.match(buttons(html).find((button) => button.includes('type="submit"')) ?? "", /disabled=""/);
});

test("move recovery explains original values and leaves destination changes untouched", () => {
  const html = render({ item: { ...item, metadata: { ...item.metadata, reason: "move" } }, confirmation: item.name });
  assert.match(html, /Moved secrets · 3 secrets/);
  assert.match(html, /Restores original source values\. Destination values stay unchanged/);
  const restore = buttons(html).find((button) => button.includes('type="submit"')) ?? "";
  assert.match(restore, /class="[^"]*primary[^"]*sm/);
  assert.doesNotMatch(restore, /danger|disabled=""/);
});

test("vault and environment summaries describe only records in their own deletion batch", () => {
  const vault = render({ item: { ...item, type: "project", name: "API", itemCount: 7, metadata: { environments: 2, secrets: 4 } } });
  assert.match(vault, /Vault · 2 environments · 4 secrets/);
  assert.match(vault, /deleted with it/); assert.doesNotMatch(vault, /If its vault/);
  const environment = render({ item: { ...item, type: "environment", name: "Development", itemCount: 5, metadata: { secrets: 4 } } });
  assert.match(environment, /Environment · 4 secrets/); assert.match(environment, /If its vault is also in Trash/);
  const single = render({ item: { ...item, type: "secret", itemCount: 1 } });
  assert.match(single, /Secret · 1 secret/); assert.doesNotMatch(single, /1 secrets/);
});

test("production uses a designed real required checkbox and no hidden accessibility substitute", () => {
  const production = { ...item, isProduction: true };
  const html = render({ item: production, confirmation: item.name, productionConfirmed: true });
  const checkbox = controls(html).find((control) => control.includes('type="checkbox"')) ?? "";
  assert.match(checkbox, /required=""/); assert.match(checkbox, /checked=""/);
  assert.match(checkbox, /aria-describedby="[^"]+-production-hint"/);
  assert.doesNotMatch(checkbox, /aria-hidden|role="checkbox"|tabindex="-1"/);
  assert.match(html, /class="checkboxMark" aria-hidden="true"/);
  assert.match(html, /I confirm restoring this production configuration/);
  assert.doesNotMatch(render(), /type="checkbox"|Production recovery/);
});

test("failed restore keeps confirmation and production choice, with errors beside the attempted action", () => {
  const html = render({ item: { ...item, isProduction: true }, confirmation: item.name, productionConfirmed: true, error: "A key now exists in this environment." });
  assert.match(html, /role="alert">A key now exists in this environment/);
  assert.match(controls(html).find((control) => !control.includes('type="checkbox"')) ?? "", /value="Deleted 3 secrets"/);
  assert.match(controls(html).find((control) => control.includes('type="checkbox"')) ?? "", /checked=""/);
  assert.doesNotMatch(buttons(html).find((button) => button.includes('type="submit"')) ?? "", /disabled=""/);
});

test("pending restore disables editing and Cancel while keeping the primary action focusable", () => {
  const html = render({ item: { ...item, isProduction: true }, confirmation: item.name, productionConfirmed: true, loading: true });
  assert.match(html, /<form[^>]*aria-busy="true"/);
  for (const control of controls(html)) assert.match(control, /disabled=""/);
  assert.match(buttons(html).find((button) => button.includes("Cancel")) ?? "", /disabled=""/);
  const submit = buttons(html).find((button) => button.includes('type="submit"')) ?? "";
  assert.match(submit, /aria-disabled="true"/); assert.match(submit, /aria-busy="true"/);
  assert.doesNotMatch(submit, / disabled=""/);
});

test("metadata, confirmation names, and action errors are escaped rather than interpreted as markup", () => {
  const name = "<img src=x onerror=alert(1)>";
  const html = render({ item: { ...item, name, metadata: { projectSlug: "<script>" } }, confirmation: name, error: "<script>error</script>" });
  assert.match(html, /&lt;img/); assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<img/);
});

test("dialog session blocks duplicate submissions, all dismissal paths, and edits while pending; errors preserve text", async () => {
  const source = await readFile(new URL("../src/components/secrets/trash-restore-dialog.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [], effects: unknown[][] = [];
  const Placeholder = () => null;
  const Dialog = () => null, DialogContent = () => null;
  const focused: string[] = [];
  class FocusElement {
    isConnected = true;
    constructor(readonly label: string) {}
    contains(node: unknown) { return node === this; }
    querySelector() { return input; }
    focus() { focused.push(this.label); }
  }
  const input = new FocusElement("confirmation"), opener = new FocusElement("restore trigger"), heading = new FocusElement("trash heading"), container = new FocusElement("dialog");
  const document = { activeElement: opener, body: new FocusElement("body"), querySelector: () => heading };
  const module = { exports: {} as any };
  runInNewContext(compiled, { React, HTMLElement: FocusElement, document, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "react") return {
      useId: () => "trash-restore", useState: (value: unknown) => { const index = stateIndex++; if (!(index in states)) states[index] = value; return [states[index], (next: unknown) => { states[index] = next; }]; },
      useRef: (value: unknown) => { const index = refIndex++; return refs[index] ?? (refs[index] = { current: value }); },
      useEffect: (effect: () => void, dependencies: unknown[]) => { const index = effectIndex++; if (!effects[index] || dependencies.some((value, i) => value !== effects[index][i])) { effects[index] = [...dependencies]; effect(); } },
    };
    if (specifier === "lucide-react") return { Check: Placeholder, Info: Placeholder, LockKeyhole: Placeholder, RotateCcw: Placeholder, ShieldCheck: Placeholder };
    if (specifier === "../arc/button/button") return { Button: Placeholder };
    if (specifier === "../arc/dialog/dialog") return { Dialog, DialogContent };
    if (specifier === "../ui/workspace-input") return { WorkspaceInput: Placeholder };
    if (specifier === "./trash-data") return { canConfirmTrashRestore, trashCountLabel: () => "3 secrets", trashKind: () => "Secret batch", trashLocation: () => null, trashRestoreDescription: () => "Restore secrets." };
    if (specifier.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => key }), __esModule: true };
    if (specifier.endsWith(".css")) return {};
    throw new Error(`Unexpected restore dialog dependency: ${specifier}`);
  } });
  let closes = 0, prevented = 0;
  const confirms: boolean[] = [];
  function renderSession(overrides = {}) {
    stateIndex = 0; refIndex = 0; effectIndex = 0;
    const wrapper = module.exports.TrashRestoreDialog({ item, loading: false, error: null, onClose: () => { closes++; }, onConfirm: (value: boolean) => { confirms.push(value); }, ...overrides });
    const root = wrapper.type(wrapper.props);
    const dialog = root.props.children;
    return { root, dialog, content: dialog.props.children };
  }
  assert.equal(module.exports.TrashRestoreDialog({ item: null }), null);
  let session = renderSession();
  session.dialog.props.onOpenAutoFocus({ target: container, preventDefault: () => {} });
  assert.deepEqual(focused, ["confirmation"]);
  session.content.props.onSubmit({ preventDefault: () => { prevented++; } });
  assert.deepEqual(confirms, []);
  session.content.props.onConfirmationChange(item.name);
  session = renderSession();
  session.content.props.onSubmit({ preventDefault: () => { prevented++; } });
  session.content.props.onSubmit({ preventDefault: () => { prevented++; } });
  assert.deepEqual(confirms, [false]);
  session.root.props.onOpenChange(false); session.content.props.onClose();
  for (const handler of ["onEscapeKeyDown", "onPointerDownOutside", "onInteractOutside"]) session.dialog.props[handler]({ preventDefault: () => { prevented++; } });
  assert.equal(closes, 0); assert.equal(prevented, 6);
  session.content.props.onConfirmationChange("unexpected edit");
  session = renderSession({ loading: true });
  assert.equal(session.dialog.props.closeDisabled, true); assert.equal(session.content.props.confirmation, item.name);
  session = renderSession({ error: "A conflicting key exists." });
  assert.equal(session.content.props.confirmation, item.name); assert.equal(session.content.props.error, "A conflicting key exists.");
  session.content.props.onSubmit({ preventDefault: () => {} });
  assert.deepEqual(confirms, [false, false], "a failed attempt can be retried without losing its form");
  session.dialog.props.onCloseAutoFocus({ preventDefault: () => {} });
  assert.deepEqual(focused, ["confirmation", "restore trigger"], "normal dismissal restores focus to its connected trigger");
  session.dialog.props.onOpenAutoFocus({ target: container, preventDefault: () => {} });
  opener.isConnected = false;
  session.dialog.props.onCloseAutoFocus({ preventDefault: () => {} });
  assert.equal(focused.at(-1), "trash heading", "successful removal cannot return focus to a detached row");
});

test("recovery dialog keeps its footer outside the bounded scrolling body and respects reduced motion", async () => {
  const css = await readFile(new URL("../src/components/secrets/trash-restore-dialog.module.css", import.meta.url), "utf8");
  assert.match(css, /max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(css, /\.fields\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.footer\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(css, /\.checkbox > input\s*\{[^}]*opacity:\s*0/);
  assert.match(css, /input:focus-visible \+ \.checkboxMark\s*\{[^}]*outline:/);
  assert.match(css, /@media \(max-width:\s*540px\)[\s\S]*min-height:\s*40px/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
});
