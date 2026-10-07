import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { BulkActionContent, type BulkActionContentProps } from "../src/components/secrets/bulk-action-content";
import type { SecretEnvironment } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

const environment: SecretEnvironment = { id: "dev-env", name: "Development", slug: "development", secretCount: 2, revision: 3, isProduction: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const production = { ...environment, id: "prod-env", name: "Production", slug: "production", isProduction: true };
const defaults: BulkActionContentProps = {
  action: "move", selectedKeys: ["API_KEY", "DATABASE_URL"], environment, targets: [production], targetSlug: "production", conflictMode: "skip", expiry: "7d", maxViews: "10", productionConfirmed: false, needsProduction: false, busy: false, error: null, link: null, canSubmit: true,
  onTargetChange: () => {}, onConflictChange: () => {}, onExpiryChange: () => {}, onMaxViewsChange: () => {}, onProductionChange: () => {}, onCopyError: () => {}, onSubmit: () => {}, onDeleteConfirmed: () => {}, onClose: () => {},
};
const render = (overrides: Partial<BulkActionContentProps> = {}) => renderToStaticMarkup(React.createElement(BulkActionContent, { ...defaults, ...overrides }));
const controls = (html: string) => [...html.matchAll(/<input\b[^>]*>/g)].map(([control]) => control);
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);

test("move view uses an accessible custom destination picker and native designed duplicate choices with selection metadata only", () => {
  const html = render({ selectedKeys: ["<PRIVATE_NAME>", "API_KEY"] });
  assert.match(html, /role="combobox"/);
  assert.match(html, /<select aria-hidden="true" tabindex="-1"/, "Radix's native form bridge is hidden; the visible picker is a custom combobox");
  assert.match(html, /Move to/); assert.match(html, /Production/); assert.doesNotMatch(html, /Production · Production/);
  const radios = controls(html).filter((control) => control.includes('type="radio"'));
  assert.equal(radios.length, 2);
  assert.match(radios[0], /value="skip"/); assert.match(radios[0], /checked=""/);
  assert.match(radios[1], /value="overwrite"/); assert.doesNotMatch(radios[1], /checked=""/);
  assert.match(html, /If a key already exists/);
  assert.match(html, /Leave the duplicate in Development/);
  assert.match(html, /Review selection/); assert.match(html, /aria-label="Selected secret keys"/);
  assert.match(html, /&lt;PRIVATE_NAME&gt;/); assert.doesNotMatch(html, /<PRIVATE_NAME>/);
  assert.match(html, /Move 2 secrets/); assert.match(html, /<footer/);
  assert.equal(buttons(html).filter((button) => button.includes("Cancel")).length, 1);
});

test("move provides an explicit no-destination state and can prevent submission", () => {
  const html = render({ targets: [], targetSlug: "", canSubmit: false });
  assert.match(html, /Create another environment in this vault before moving secrets/);
  assert.doesNotMatch(html, /role="combobox"/);
  const submit = buttons(html).find((button) => button.includes('type="submit"')) ?? "";
  assert.match(submit, /disabled=""/);
});

test("sharing presents custom expiry presets, required bounded reveal count, and frozen snapshot guidance", () => {
  const html = render({ action: "share", selectedKeys: ["API_KEY"] });
  assert.match(html, /1 secret selected/); assert.doesNotMatch(html, /1 secrets/);
  assert.match(html, /Expires in/); assert.match(html, /role="combobox"/); assert.match(html, /<select aria-hidden="true" tabindex="-1"/);
  const views = controls(html).find((control) => control.includes('type="number"')) ?? "";
  assert.match(views, /min="1"/); assert.match(views, /max="100"/); assert.match(views, /step="1"/); assert.match(views, /required=""/); assert.match(views, /value="10"/);
  assert.match(views, /aria-describedby="[^"]+-views-hint"/);
  assert.match(html, /Later edits, moves, or deletions won’t change this snapshot/);
  assert.match(html, /Anyone with the complete link/);
  assert.match(html, /Create share link/);
  assert.equal(buttons(html).filter((button) => button.includes("Cancel")).length, 1);
  assert.doesNotMatch(html, /type="radio"|Type DELETE|durationValue/);
});

test("reveal-count errors are associated with their control and action errors remain inline", () => {
  const html = render({ action: "share", maxViews: "", canSubmit: false, fieldErrors: { maxViews: "Choose between 1 and 100." }, error: "Could not create the share." });
  const views = controls(html).find((control) => control.includes('type="number"')) ?? "";
  assert.match(views, /aria-invalid="true"/);
  const ids = views.match(/aria-describedby="([^"]+)"/)?.[1].split(" ") ?? [];
  assert.equal(ids.length, 2);
  for (const id of ids) assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /role="alert">Could not create the share/);
  assert.match(buttons(html).find((button) => button.includes('type="submit"')) ?? "", /disabled=""/);
});

test("bulk deletion offers hold-to-delete rather than a typed confirmation or submit button and explains recoverable batching", () => {
  const html = render({ action: "delete" });
  assert.match(html, /Hold to delete/);
  assert.match(html, /Move to Trash, not permanent deletion/);
  assert.match(html, /restore them together as one batch from Trash/);
  assert.match(html, /Hold for 5 seconds/);
  assert.doesNotMatch(html, /Type DELETE|type="text"|type="submit"/);
  assert.equal(buttons(html).filter((button) => button.includes("Cancel")).length, 0);
  assert.equal(buttons(html).length, 1, "the full-width hold action is the delete modal’s only footer button");
  assert.match(html, /class="actions deleteActions"/);
});

test("delete omits Cancel in both idle and pending states while retaining the production safeguard", () => {
  for (const busy of [false, true]) {
    const html = render({ action: "delete", busy, needsProduction: true, productionConfirmed: false, canSubmit: false });
    const actions = buttons(html);
    assert.equal(actions.length, 1);
    assert.doesNotMatch(actions[0], /Cancel/);
    assert.match(actions[0], /Hold to delete/);
    assert.match(controls(html).find((control) => control.includes('type="checkbox"')) ?? "", /required=""/);
    assert.match(html, /I confirm this production change/);
    assert.match(actions[0], busy ? /aria-busy="true"/ : /disabled=""/);
  }
});

test("production uses a real required checkbox and action-specific acknowledgement without hiding it from assistive technology", () => {
  for (const action of ["move", "share", "delete"] as const) {
    const html = render({ action, needsProduction: true, productionConfirmed: true });
    const checkbox = controls(html).find((control) => control.includes('type="checkbox"')) ?? "";
    assert.match(checkbox, /required=""/); assert.match(checkbox, /checked=""/);
    assert.match(checkbox, /aria-describedby="[^"]+-production-hint"/);
    assert.doesNotMatch(checkbox, /aria-hidden|role="checkbox"|tabindex="-1"/);
    assert.match(html, /class="checkboxMark" aria-hidden="true"/);
    assert.match(html, action === "share" ? /I confirm sharing these production secrets/ : /I confirm this production change/);
  }
  assert.doesNotMatch(render({ environment: production, needsProduction: false }), /type="checkbox"/, "the controller determines protection from both source and destination");
});

test("busy mutation keeps Cancel and inputs disabled and maintains one focused action", () => {
  const html = render({ action: "share", busy: true, needsProduction: true, canSubmit: false });
  assert.match(html, /aria-busy="true"/);
  for (const control of controls(html)) assert.match(control, /disabled=""/);
  assert.match(buttons(html).find((button) => button.includes("Cancel")) ?? "", /disabled=""/);
  const submit = buttons(html).find((button) => button.includes('type="submit"')) ?? "";
  assert.match(submit, /aria-disabled="true"/); assert.match(submit, /aria-busy="true"/);
});

test("success exposes the one-time fragment-bearing URL with copy feedback, no form, and a recovery warning", () => {
  const link = "https://secrets.example/share-id#fragment-key";
  const html = render({ action: "share", link });
  assert.match(html, /Your share link is ready/);
  const input = controls(html)[0];
  assert.match(input, /readOnly=""/); assert.match(input, /value="https:\/\/secrets.example\/share-id#fragment-key"/);
  assert.match(input, /autofocus=""/); assert.match(input, /data-bulk-autofocus="true"/);
  assert.match(input, /dir="ltr"/);
  assert.match(html, /aria-label="Copy link"/); assert.match(html, /complete link cannot be recovered later/);
  const copy = buttons(html).find((button) => button.includes('aria-label="Copy link"')) ?? "";
  assert.match(copy, /iconOnly/); assert.match(copy, /plain/);
  assert.doesNotMatch(copy, /class="label"|>Copy link</, "the copy action has no visible label");
  assert.match(html, /including the part after #/); assert.match(html, /Done/);
  assert.doesNotMatch(html, /<form|Create share link|Expires in|Maximum reveals/);
});

test("native and custom control adapters forward exact values, while deleting only invokes hold completion", async () => {
  const source = await readFile(new URL("../src/components/secrets/bulk-action-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const Button = () => null, Select = () => null, CopyButton = () => null, HoldToDelete = () => null, Placeholder = () => null;
  const module = { exports: {} as any };
  runInNewContext(compiled, { React, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "react") return { useId: () => "bulk-view" };
    if (specifier === "lucide-react") return { ArrowRight: Placeholder, Check: Placeholder, CheckCheck: Placeholder, KeyRound: Placeholder, Link2: Placeholder, LockKeyhole: Placeholder, ShieldCheck: Placeholder, Trash2: Placeholder };
    if (specifier === "../arc/button/button") return { Button };
    if (specifier === "../arc/select/select") return { Select };
    if (specifier === "../arc/copy-button/copy-button") return { CopyButton };
    if (specifier === "../ui/workspace-input") return { WorkspaceInput: "input" };
    if (specifier === "./hold-to-delete") return { HoldToDelete };
    if (specifier.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => key }), __esModule: true };
    throw new Error(`Unexpected bulk content dependency: ${specifier}`);
  } });
  function elements(node: React.ReactNode): React.ReactElement<any>[] { if (Array.isArray(node)) return node.flatMap(elements); if (!React.isValidElement(node)) return []; const element = node as React.ReactElement<any>; return [element, ...elements(element.props.children)]; }
  const changes: Array<[string, string | boolean]> = []; let submits = 0, deletions = 0, prevented = 0;
  const props: BulkActionContentProps = { ...defaults, needsProduction: true, onTargetChange: (value) => changes.push(["target", value]), onConflictChange: (value) => changes.push(["duplicates", value]), onExpiryChange: (value) => changes.push(["expiry", value]), onMaxViewsChange: (value) => changes.push(["views", value]), onProductionChange: (value) => changes.push(["production", value]), onSubmit: () => { submits++; }, onDeleteConfirmed: () => { deletions++; } };
  const getNodes = (overrides: Partial<BulkActionContentProps> = {}) => elements(module.exports.BulkActionContent({ ...props, ...overrides }));
  const move = getNodes();
  move.find((node) => node.type === Select)?.props.onValueChange("prod /?β");
  move.find((node) => node.props.value === "overwrite")?.props.onChange();
  move.find((node) => node.props.type === "checkbox")?.props.onChange({ target: { checked: true } });
  const share = getNodes({ action: "share" });
  const expiry = share.find((node) => node.type === Select); assert.ok(expiry);
  assert.deepEqual([...expiry.props.options].map((option) => option.value), ["1d", "7d", "30d", "1m", "3m"]);
  expiry.props.onValueChange("3m");
  share.find((node) => node.props.type === "number")?.props.onChange({ target: { value: "" } });
  move.find((node) => node.type === "form")?.props.onSubmit({ preventDefault: () => { prevented++; } });
  const deleted = getNodes({ action: "delete", canSubmit: false });
  deleted.find((node) => node.type === "form")?.props.onSubmit({ preventDefault: () => { prevented++; } });
  const hold = deleted.find((node) => node.type === HoldToDelete); assert.ok(hold); assert.equal(hold.props.disabled, true); assert.equal(hold.props.onConfirm, props.onDeleteConfirmed);
  assert.equal(deleted.filter((node) => node.type === Button).length, 0, "delete has no secondary cancel action");
  hold.props.onConfirm();
  assert.deepEqual(changes, [["target", "prod /?β"], ["duplicates", "overwrite"], ["production", true], ["expiry", "3m"], ["views", ""]]);
  assert.equal(submits, 1); assert.equal(deletions, 1); assert.equal(prevented, 1);

  const link = `https://secrets.example/share-id#${"synthetic-key".repeat(12)}`;
  const success = getNodes({ action: "share", link });
  const input = success.find((node) => node.type === "input" && node.props.value === link); assert.ok(input);
  const selection: unknown[] = [];
  const field = { value: link, scrollLeft: 500, setSelectionRange: (...args: unknown[]) => selection.push(...args) };
  input.props.onFocus({ currentTarget: field });
  assert.deepEqual(selection, [0, link.length, "backward"], "selection stays complete with its active end at the beginning");
  assert.equal(field.scrollLeft, 0, "focus must show the link origin, not the fragment tail");
  const copy = success.find((node) => node.type === CopyButton); assert.ok(copy);
  assert.equal(copy.props.iconOnly, true); assert.equal(copy.props.variant, "plain");
  assert.equal(copy.props.label, "Copy link"); assert.equal(copy.props.value, link, "copy retains the entire fragment-bearing link");
});

test("modal CSS bounds and scrolls content while preserving compact mobile actions and quiet semantic control focus", async () => {
  const css = await readFile(new URL("../src/components/secrets/bulk-actions.module.css", import.meta.url), "utf8");
  assert.match(css, /max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(css, /\.fields\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.footer\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(css, /\.deleteActions\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.deleteActions\s*\{[^}]*margin(?:-left)?:\s*0/);
  assert.match(css, /\.copyButton\.copyButton\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*flex:\s*0 0 44px/);
  assert.doesNotMatch(css, /\.linkRow\s*\{[^}]*flex-direction:\s*column/, "the compact icon stays beside the URL on mobile");
  assert.match(css, /\.checkbox > input\s*\{[^}]*opacity:\s*0/);
  assert.match(css, /\.radio > input\s*\{[^}]*opacity:\s*0/);
  assert.match(css, /input:focus-visible \+ \.checkboxMark\s*\{[^}]*outline:/);
  assert.match(css, /input:focus-visible \+ \.radioMark\s*\{[^}]*outline:/);
  assert.match(css, /@media \(max-width:\s*540px\)[\s\S]*flex-direction:\s*column/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none/);
});
