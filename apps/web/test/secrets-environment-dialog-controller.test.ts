import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import type { SecretEnvironment } from "../src/lib/secrets-client";
import type { EnvironmentFormContentProps } from "../src/components/secrets/environment-form-content";

const staging: SecretEnvironment = {
  id: "env-staging", name: "Staging", slug: "staging", description: "Preview values", color: "violet",
  isProduction: false, revision: 7, secretCount: 3,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const production: SecretEnvironment = { ...staging, id: "env-production", name: "Production", slug: "production", isProduction: true };
type Props = { [key: string]: any; children?: React.ReactNode };
type DialogProps = {
  open: boolean; orgSlug: string; projectSlug: string; environment: SecretEnvironment | null;
  onSaved: (environment: SecretEnvironment) => void; onClose: () => void;
};
type Effect = { slot: number; callback: () => void | (() => void); deps: unknown[] };
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function event() {
  let prevented = false;
  return { preventDefault() { prevented = true; }, get prevented() { return prevented; } };
}

/** Keep the real controller hooks and async fences; replace only transport and presentation. */
async function controller(initial: Partial<DialogProps> = {}, globals: Props = {}) {
  const source = await readFile(new URL("../src/components/secrets/environment-dialog.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const values: any[] = [], committed = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let index = 0, dirty = false, disposed = false, lateWrites = 0, effects: Effect[] = [];
  const saves: SecretEnvironment[] = [];
  let closes = 0;
  let props: DialogProps = { open: true, orgSlug: "acme", projectSlug: "api", environment: null,
    onSaved: (environment) => saves.push(environment), onClose: () => { closes++; }, ...initial };
  const mutations: Array<{ action: "create" | "update"; orgSlug: string; projectSlug: string; slug?: string; input: Props }> = [];
  let outcome: () => Promise<SecretEnvironment> = async () => staging;
  const client = {
    createEnvironment(orgSlug: string, projectSlug: string, input: Props) {
      mutations.push({ action: "create", orgSlug, projectSlug, input: { ...input } }); return outcome();
    },
    updateEnvironment(orgSlug: string, projectSlug: string, slug: string, input: Props) {
      mutations.push({ action: "update", orgSlug, projectSlug, slug, input: { ...input } }); return outcome();
    },
  };
  const same = (left: unknown[], right: unknown[]) => left.length === right.length && left.every((value, slot) => Object.is(value, right[slot]));
  const hooks = {
    ...React,
    useState(initial: any) {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (next: any) => {
        if (disposed) lateWrites++;
        const value = typeof next === "function" ? next(values[slot]) : next;
        if (!Object.is(value, values[slot])) { values[slot] = value; dirty = true; }
      }];
    },
    useRef(initial: any) { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
    useEffect(callback: Effect["callback"], deps: unknown[]) { effects.push({ slot: index++, callback, deps }); },
  };
  const Dialog = (_props: Props) => null, DialogContent = (_props: Props) => null, Content = (_props: Props) => null;
  const module = { exports: {} as { EnvironmentDialog: (props: DialogProps) => React.ReactNode } };
  runInNewContext(compiled, { React, Error, module, exports: module.exports, ...globals,
    require: (specifier: string) => {
      if (specifier === "react") return hooks;
      if (specifier === "../arc/dialog/dialog") return { Dialog, DialogContent };
      if (specifier === "./environment-form-content") return { EnvironmentFormContent: Content };
      if (specifier === "@/lib/secrets-client") return { secretsClient: client };
      if (specifier.endsWith(".css")) return { dialog: "environment-dialog" };
      throw new Error(`Unexpected environment dialog dependency: ${specifier}`);
    } });
  function render() {
    for (let pass = 0; pass < 20; pass++) {
      index = 0; dirty = false; effects = [];
      const tree = elements(module.exports.EnvironmentDialog(props));
      if (dirty) continue;
      for (const effect of effects) {
        const previous = committed.get(effect.slot);
        if (previous && same(previous.deps, effect.deps)) continue;
        previous?.cleanup?.(); committed.set(effect.slot, { deps: [...effect.deps], cleanup: effect.callback() ?? undefined });
      }
      if (dirty) continue;
      const content = tree.find((element) => element.type === Content), shell = tree.find((element) => element.type === DialogContent), root = tree.find((element) => element.type === Dialog);
      assert.ok(content); assert.ok(shell); assert.ok(root);
      return { form: content.props as unknown as EnvironmentFormContentProps, shell: shell.props, root: root.props };
    }
    throw new Error("The actual environment controller did not settle");
  }
  return {
    mutations, saves, render,
    get closes() { return closes; }, get lateWrites() { return lateWrites; },
    setProps(next: Partial<DialogProps>) { props = { ...props, ...next }; },
    saveWith(next: typeof outcome) { outcome = next; },
    dispose() { for (const effect of committed.values()) effect.cleanup?.(); disposed = true; },
  };
}

test("creation auto-suggests backend-style slugs until manually changed and validates all local field bounds", async () => {
  const view = await controller();
  let form = view.render().form;
  assert.equal(form.canSubmit, false); assert.deepEqual(Object.keys(form.errors), []);
  form.onSubmit(event() as any); form = view.render().form;
  assert.deepEqual(Object.keys(form.errors).sort(), ["name", "slug"]);
  form.onNameChange(" Café / Preview "); form = view.render().form;
  assert.equal(form.slug, "cafe-preview"); assert.equal(form.canSubmit, true);
  form.onSlugChange(" CUSTOM--VALUE "); form = view.render().form;
  assert.equal(form.slug, " custom--value "); assert.match(form.errors.slug!, /single hyphens/);
  form.onNameChange("Renamed"); form = view.render().form;
  assert.equal(form.slug, " custom--value ", "manual slug drafts must survive later name edits");
  form.onSlugChange("a".repeat(64)); form = view.render().form;
  assert.match(form.errors.slug!, /63/);
  form.onSlugChange("a".repeat(63)); form.onNameChange("n".repeat(101)); form = view.render().form;
  assert.match(form.errors.name!, /100/);
  form.onNameChange("n".repeat(100)); form.onDescriptionChange("d".repeat(501)); form = view.render().form;
  assert.match(form.errors.description!, /500/); form.onSubmit(event() as any);
  assert.equal(view.mutations.length, 0);
  form.onDescriptionChange("d".repeat(500)); form = view.render().form;
  assert.equal(form.canSubmit, true); assert.deepEqual(Object.keys(form.errors), []);
  for (const slug of ["-preview", "preview-", "preview / beta", "preview_beta", ""]) {
    form.onSlugChange(slug); form = view.render().form;
    assert.ok(form.errors.slug, `reject invalid slug ${JSON.stringify(slug)}`); assert.equal(form.canSubmit, false);
  }
  view.dispose();
  const auto = await controller(); auto.render().form.onNameChange("x".repeat(62) + " / tail");
  assert.equal(auto.render().form.slug, "x".repeat(62), "auto-slug truncation cannot leave a trailing hyphen"); auto.dispose();
});

test("create protection matches exact prod, production and live names or slugs and sends only supported fields", async () => {
  for (const name of [" prod ", "PRODUCTION", " Live "]) {
    const view = await controller(); view.render().form.onNameChange(name);
    let form = view.render().form;
    assert.equal(form.isProduction, true); assert.equal(form.canSubmit, false);
    form.onSubmit(event() as any); assert.equal(view.mutations.length, 0);
    form.onProductionChange(true); form = view.render().form; assert.equal(form.canSubmit, true);
    form.onDescriptionChange(" values "); view.render().form.onSubmit(event() as any); await settle();
    assert.deepEqual(view.mutations[0], { action: "create", orgSlug: "acme", projectSlug: "api", input: {
      name: name.trim(), slug: name.trim().toLowerCase(), description: "values", confirmation: name.trim(), confirmProduction: true,
    } });
    assert.deepEqual(view.saves, [staging]); assert.equal(view.closes, 1); view.dispose();
  }
  const view = await controller(); view.render().form.onNameChange("Preview"); view.render().form.onSlugChange(" LIVE ");
  let form = view.render().form; assert.equal(form.isProduction, true); assert.equal(form.canSubmit, false);
  form.onSlugChange("live-preview"); form = view.render().form;
  assert.equal(form.isProduction, false); assert.equal(form.canSubmit, true); view.dispose();
});

test("edits retain the captured current name, original slug, revision and persisted production protection", async () => {
  const view = await controller({ environment: production });
  let form = view.render().form;
  form.onNameChange("Primary"); form.onSlugChange("primary"); form.onDescriptionChange(" Updated values ");
  form.onConfirmationChange("Primary"); form.onProductionChange(true); form = view.render().form;
  assert.equal(form.isProduction, true); assert.match(form.errors.confirmation!, /Production exactly/); assert.equal(form.canSubmit, false);
  view.setProps({ environment: { ...production, name: "Fresh server name", slug: "fresh-production", revision: 99, isProduction: false } });
  form = view.render().form;
  assert.equal(form.environment, production); assert.equal(form.name, "Primary"); assert.equal(form.isProduction, true);
  form.onConfirmationChange("Production"); form = view.render().form; assert.equal(form.canSubmit, true);
  form.onSubmit(event() as any); await settle();
  assert.deepEqual(view.mutations[0], { action: "update", orgSlug: "acme", projectSlug: "api", slug: "production", input: {
    name: "Primary", slug: "primary", description: "Updated values", confirmation: "Production", confirmProduction: true, expectedRevision: 7,
  } }); view.dispose();
  const nonProduction = await controller({ environment: staging });
  nonProduction.render().form.onNameChange("Production"); nonProduction.render().form.onConfirmationChange("Staging");
  form = nonProduction.render().form;
  assert.equal(form.isProduction, false, "editing a name cannot silently change persisted production protection");
  assert.equal(form.canSubmit, true); nonProduction.dispose();
});

test("refreshes retain unsaved inputs and server errors, while close/reopen takes a fresh environment snapshot", async () => {
  const view = await controller({ environment: staging });
  view.render().form.onNameChange("Draft"); view.render().form.onSlugChange("draft-slug");
  view.render().form.onDescriptionChange("Draft details"); view.render().form.onConfirmationChange("Staging");
  view.saveWith(async () => { throw new Error("Revision conflict"); }); view.render().form.onSubmit(event() as any); await settle();
  const fresh = { ...staging, name: "Updated staging", slug: "updated-staging", revision: 8, description: "New server details" };
  view.setProps({ environment: fresh });
  let form = view.render().form;
  assert.equal(form.environment, staging); assert.equal(form.name, "Draft"); assert.equal(form.slug, "draft-slug");
  assert.equal(form.description, "Draft details"); assert.equal(form.confirmation, "Staging"); assert.equal(form.error, "Revision conflict");
  view.setProps({ open: false }); view.render(); view.setProps({ open: true }); form = view.render().form;
  assert.equal(form.environment, fresh); assert.equal(form.name, "Updated staging"); assert.equal(form.slug, "updated-staging");
  assert.equal(form.description, "New server details"); assert.equal(form.confirmation, ""); assert.equal(form.error, null);
  assert.equal(form.productionConfirmed, false); assert.equal(form.canSubmit, false); view.dispose();
});

test("pending submits are synchronously locked against duplicates, input changes and every dismissal path; failures retain drafts for retry", async () => {
  const view = await controller(); view.render().form.onNameChange("Preview");
  const request = deferred<SecretEnvironment>(); view.saveWith(() => request.promise);
  const before = view.render(); before.form.onSubmit(event() as any); before.form.onSubmit(event() as any);
  before.form.onNameChange("Ignored while pending"); before.form.onClose(); before.root.onOpenChange(false);
  for (const handler of ["onEscapeKeyDown", "onPointerDownOutside", "onInteractOutside"]) {
    const outside = event(); before.shell[handler](outside); assert.equal(outside.prevented, true, "ref lock closes the pre-render event gap");
  }
  let rendered = view.render();
  assert.equal(view.mutations.length, 1); assert.equal(view.closes, 0); assert.equal(rendered.form.name, "Preview");
  assert.equal(rendered.form.saving, true); assert.equal(rendered.form.canSubmit, false); assert.equal(rendered.shell.closeDisabled, true);
  assert.equal(rendered.shell["aria-busy"], true);
  request.reject("unknown transport failure"); await settle(); rendered = view.render();
  assert.equal(rendered.form.name, "Preview"); assert.equal(rendered.form.error, "Could not save environment.");
  assert.equal(rendered.form.saving, false); assert.equal(rendered.form.canSubmit, true); assert.equal(rendered.shell.closeDisabled, false);
  const outside = event(); rendered.shell.onEscapeKeyDown(outside); assert.equal(outside.prevented, false);
  view.saveWith(async () => staging); rendered.form.onSubmit(event() as any); await settle();
  assert.equal(view.mutations.length, 2); assert.equal(view.saves.length, 1); assert.equal(view.closes, 1); view.dispose();
});

test("org, vault and environment switches discard old sessions and late requests cannot unlock or report into a newer pending session", async () => {
  for (const next of [{ orgSlug: "other-team" }, { projectSlug: "other-vault" }, { environment: staging }]) {
    const view = await controller(); view.render().form.onNameChange("Old preview");
    const old = deferred<SecretEnvironment>(); view.saveWith(() => old.promise);
    const oldForm = view.render().form; oldForm.onSubmit(event() as any);
    view.setProps(next); let form = view.render().form;
    assert.equal(form.saving, false); assert.equal(form.error, null); assert.equal(form.name, next.environment ? "Staging" : "");
    oldForm.onNameChange("Stale draft"); oldForm.onClose(); assert.equal(view.closes, 0);
    form.onNameChange("New preview"); if (next.environment) view.render().form.onConfirmationChange("Staging");
    const current = deferred<SecretEnvironment>(); view.saveWith(() => current.promise); view.render().form.onSubmit(event() as any);
    old.resolve(production); await settle(); form = view.render().form;
    assert.equal(form.name, "New preview"); assert.equal(form.saving, true); assert.equal(form.error, null);
    assert.equal(view.saves.length, 0); assert.equal(view.closes, 0);
    form.onSubmit(event() as any); assert.equal(view.mutations.length, 2, "old finally must not remove the new request's duplicate lock");
    current.resolve(staging); await settle(); assert.deepEqual(view.saves, [staging]); assert.equal(view.closes, 1);
    const mutation = view.mutations[1]; assert.equal(mutation.orgSlug, next.orgSlug ?? "acme"); assert.equal(mutation.projectSlug, next.projectSlug ?? "api");
    view.dispose();
  }
});

test("close/reopen and unmount suppress both late successes and failures, including old callbacks and state writes", async () => {
  const view = await controller(); view.render().form.onNameChange("Preview");
  const old = deferred<SecretEnvironment>(); view.saveWith(() => old.promise); view.render().form.onSubmit(event() as any);
  view.setProps({ open: false }); view.render(); view.setProps({ open: true });
  assert.equal(view.render().form.name, ""); old.reject(new Error("Old error")); await settle();
  assert.equal(view.render().form.error, null); assert.equal(view.saves.length, 0); assert.equal(view.closes, 0); view.dispose();
  for (const reject of [false, true]) {
    const mounted = await controller(); mounted.render().form.onNameChange("Preview");
    const request = deferred<SecretEnvironment>(); mounted.saveWith(() => request.promise);
    const form = mounted.render().form; form.onSubmit(event() as any); mounted.dispose();
    if (reject) request.reject(new Error("Late failure")); else request.resolve(staging);
    await settle(); form.onNameChange("After unmount"); form.onClose(); form.onSubmit(event() as any);
    assert.equal(mounted.lateWrites, 0); assert.equal(mounted.saves.length, 0); assert.equal(mounted.closes, 0); assert.equal(mounted.mutations.length, 1);
  }
});

test("the Arc portaled content retains theme/privacy scope and focuses only its own name field, restoring a connected opener", async () => {
  const document = { activeElement: null as FakeElement | null, body: null as FakeElement | null };
  class FakeElement {
    isConnected = true;
    focuses = 0;
    children: FakeElement[] = [];
    queried: string[] = [];
    input: FakeElement | null = null;
    focus() { this.focuses++; document.activeElement = this; }
    contains(element: FakeElement) { return this.children.includes(element); }
    querySelector(selector: string) { this.queried.push(selector); return this.input; }
  }
  document.body = new FakeElement();
  const trigger = new FakeElement(), panel = new FakeElement(), name = new FakeElement(); panel.input = name;
  document.activeElement = trigger;
  const view = await controller({}, { document, HTMLElement: FakeElement }); let shell = view.render().shell;
  assert.match(shell.className, /workspace-ui outray-arc ph-no-capture/); assert.match(shell.className, /environment-dialog/);
  assert.equal(shell["data-private-product"], "secrets"); assert.equal(shell.title, "Add environment");
  assert.equal(shell.description, "Keep a separate set of secret values in this vault.");
  const opened = Object.assign(event(), { target: panel }); shell.onOpenAutoFocus(opened);
  assert.equal(opened.prevented, true); assert.equal(name.focuses, 1); assert.deepEqual(panel.queried, ["[data-environment-name]"]); assert.equal(trigger.focuses, 0);
  const closed = event(); shell.onCloseAutoFocus(closed); assert.equal(closed.prevented, true); assert.equal(trigger.focuses, 1);
  document.activeElement = trigger; shell.onOpenAutoFocus({ ...event(), target: panel }); trigger.isConnected = false;
  shell.onCloseAutoFocus(event()); assert.equal(trigger.focuses, 1, "do not focus a removed row's trigger");
  view.setProps({ environment: staging }); shell = view.render().shell;
  assert.equal(shell.title, "Edit environment"); assert.equal(shell.description, "Update this environment’s name and description."); view.dispose();
  const server = await controller(); const autofocus = Object.assign(event(), { target: null }); server.render().shell.onOpenAutoFocus(autofocus);
  assert.equal(autofocus.prevented, true); server.dispose();
});
