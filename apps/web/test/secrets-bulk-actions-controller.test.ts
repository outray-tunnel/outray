import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import type { SecretEnvironment, SecretMetadata } from "../src/lib/secrets-client";

type Props = { [key: string]: any; children?: React.ReactNode };
type Action = "move" | "delete" | "share";
type DialogProps = {
  action: Action | null; onClose: () => void; onDone: (message?: string) => void;
  orgSlug: string; projectSlug: string; environment: SecretEnvironment;
  environments: SecretEnvironment[]; secrets: SecretMetadata[]; revision: number;
};
type Effect = { slot: number; callback: () => void | (() => void); deps: unknown[] };
const staging: SecretEnvironment = {
  id: "env-staging", name: "Staging", slug: "staging", description: "Preview", color: "violet",
  isProduction: false, revision: 7, secretCount: 3, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const production: SecretEnvironment = { ...staging, id: "env-production", name: "Production", slug: "production", isProduction: true, revision: 12 };
const development: SecretEnvironment = { ...staging, id: "env-development", name: "Development", slug: "development", revision: 3 };
const secrets: SecretMetadata[] = [
  { id: "secret-z", key: "ZETA", version: 2, revision: 7, createdAt: staging.createdAt, updatedAt: staging.updatedAt },
  { id: "secret-a", key: "ALPHA", version: 1, revision: 7, createdAt: staging.createdAt, updatedAt: staging.updatedAt },
];
const snapshot = { secrets: [
  { id: "secret-a", key: "ALPHA", value: "snapshot-alpha", version: 1 },
  { id: "secret-z", key: "ZETA", value: "snapshot-zeta", version: 2 },
] };
const encrypted = { ciphertext: "encrypted-content", iv: "encrypted-iv", verifier: "proof-verifier", key: "fragment-key" };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
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
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

/** Exercise the actual modal hooks, async boundaries, and adapters without a DOM or database. */
async function controller(initial: Partial<DialogProps> = {}, origin: string | undefined = "https://secrets.outray.dev", globals: Props = {}) {
  const source = (await readFile(new URL("../src/components/secrets/bulk-actions-dialog.tsx", import.meta.url), "utf8"))
    .replaceAll("import.meta.env.VITE_SHARE_PUBLIC_ORIGIN", origin === undefined ? "undefined" : JSON.stringify(origin));
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const values: any[] = [], committed = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let index = 0, dirty = false, disposed = false, lateWrites = 0, effects: Effect[] = [], closes = 0;
  const completions: Array<string | undefined> = [];
  let props: DialogProps = { action: "move", onClose: () => { closes++; }, onDone: (message) => completions.push(message),
    orgSlug: "acme", projectSlug: "api", environment: staging,
    environments: [staging, development, production], secrets, revision: 7, ...initial };
  const calls: Array<{ action: string; orgSlug?: string; projectSlug?: string; environmentSlug?: string; input?: Props; ids?: string[]; confirmProduction?: boolean }> = [];
  let bulkOutcome: () => Promise<Props> = async () => ({ moved: 1, skipped: ["ZETA"] });
  let revisionOutcome: () => Promise<{ revision: number }> = async () => ({ revision: 3 });
  let snapshotOutcome: () => Promise<typeof snapshot> = async () => clone(snapshot);
  let encryptionOutcome: () => Promise<typeof encrypted> = async () => ({ ...encrypted });
  let creationOutcome: () => Promise<{ id: string }> = async () => ({ id: "share-id" });
  const client = {
    revision(orgSlug: string, projectSlug: string, environmentSlug: string) {
      calls.push({ action: "revision", orgSlug, projectSlug, environmentSlug }); return revisionOutcome();
    },
    bulkAction(orgSlug: string, projectSlug: string, environmentSlug: string, input: Props) {
      calls.push({ action: "bulk", orgSlug, projectSlug, environmentSlug, input: clone(input) }); return bulkOutcome();
    },
    snapshotForShare(orgSlug: string, projectSlug: string, environmentSlug: string, ids: string[], confirmProduction: boolean) {
      calls.push({ action: "snapshot", orgSlug, projectSlug, environmentSlug, ids: clone(ids), confirmProduction }); return snapshotOutcome();
    },
    createShare(orgSlug: string, input: Props) {
      calls.push({ action: "createShare", orgSlug, input: clone(input) }); return creationOutcome();
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
    useMemo(factory: () => unknown, deps: unknown[]) {
      const slot = index++; const previous = values[slot];
      if (!previous || !same(previous.deps, deps)) values[slot] = { value: factory(), deps: [...deps] };
      return values[slot].value;
    },
    useCallback(callback: (...args: any[]) => unknown, deps: unknown[]) { return hooks.useMemo(() => callback, deps); },
  };
  const Dialog = (_props: Props) => null, DialogContent = (_props: Props) => null, Content = (_props: Props) => null;
  const module = { exports: {} as { BulkActionsDialog: (props: DialogProps) => React.ReactNode } };
  runInNewContext(compiled, { React, Error, URL, module, exports: module.exports, ...globals,
    require: (specifier: string) => {
      if (specifier === "react") return hooks;
      if (specifier === "../arc/dialog/dialog") return { Dialog, DialogContent };
      if (specifier === "./bulk-action-content") return { BulkActionContent: Content };
      if (specifier === "@/lib/secrets-client") return { secretsClient: client };
      if (specifier === "@outray/share-crypto") return {
        encryptShare(input: Props) { calls.push({ action: "encrypt", input: clone(input) }); return encryptionOutcome(); },
        completeShareUrl(publicOrigin: string, id: string, key: string) { const url = new URL(`/${id}`, publicOrigin); url.hash = key; return url.toString(); },
      };
      if (specifier.endsWith(".css")) return { dialog: "bulk-dialog" };
      throw new Error(`Unexpected bulk dialog dependency: ${specifier}`);
    } });
  function render() {
    for (let pass = 0; pass < 20; pass++) {
      index = 0; dirty = false; effects = [];
      const tree = elements(module.exports.BulkActionsDialog(props));
      if (dirty) continue;
      for (const effect of effects) {
        const previous = committed.get(effect.slot);
        if (previous && same(previous.deps, effect.deps)) continue;
        previous?.cleanup?.(); committed.set(effect.slot, { deps: [...effect.deps], cleanup: effect.callback() ?? undefined });
      }
      if (dirty) continue;
      const content = tree.find((element) => element.type === Content), shell = tree.find((element) => element.type === DialogContent), root = tree.find((element) => element.type === Dialog);
      return { form: content?.props, shell: shell?.props, root: root?.props };
    }
    throw new Error("The actual bulk controller did not settle");
  }
  function show() { const view = render(); assert.ok(view.form); assert.ok(view.shell); assert.ok(view.root); return { form: view.form, shell: view.shell, root: view.root }; }
  return {
    calls, completions, render, show,
    get closes() { return closes; }, get lateWrites() { return lateWrites; },
    setProps(next: Partial<DialogProps>) { props = { ...props, ...next }; },
    bulkWith(next: typeof bulkOutcome) { bulkOutcome = next; }, revisionWith(next: typeof revisionOutcome) { revisionOutcome = next; },
    snapshotWith(next: typeof snapshotOutcome) { snapshotOutcome = next; }, encryptWith(next: typeof encryptionOutcome) { encryptionOutcome = next; }, createWith(next: typeof creationOutcome) { creationOutcome = next; },
    dispose() { for (const effect of committed.values()) effect.cleanup?.(); disposed = true; },
  };
}

test("move captures source, selected keys, destination metadata and revision while preserving duplicate policy during refresh", async () => {
  const view = await controller(); let form = view.show().form;
  assert.deepEqual(clone(form.selectedKeys), ["ALPHA", "ZETA"]);
  assert.equal(form.targetSlug, "development"); assert.equal(form.conflictMode, "skip");
  form.onConflictChange("overwrite");
  view.setProps({ environment: { ...staging, slug: "renamed-source", name: "New server name", isProduction: true },
    revision: 99, secrets: [secrets[0]], environments: [staging, { ...development, name: "Renamed target", slug: "new-target" }] });
  form = view.show().form;
  assert.equal(form.environment.slug, "staging"); assert.deepEqual(clone(form.selectedKeys), ["ALPHA", "ZETA"]);
  assert.equal(form.targetSlug, "development"); assert.equal(form.conflictMode, "overwrite"); assert.equal(form.needsProduction, false);
  form.onSubmit(event()); await settle();
  assert.deepEqual(view.calls, [
    { action: "revision", orgSlug: "acme", projectSlug: "api", environmentSlug: "development" },
    { action: "bulk", orgSlug: "acme", projectSlug: "api", environmentSlug: "staging", input: {
      action: "move", secretIds: ["secret-a", "secret-z"], expectedSourceRevision: 7, expectedTargetRevision: 3,
      targetEnvironmentSlug: "development", conflictMode: "overwrite", confirmProduction: false,
    } },
  ]);
  assert.match(view.completions[0]!, /1 secret.*Development.*1 duplicate/); view.dispose();
});

test("production requires explicit acknowledgment for source or destination and changing destination resets consent", async () => {
  const view = await controller(); let form = view.show().form;
  form.onTargetChange("production"); form = view.show().form;
  assert.equal(form.needsProduction, true); assert.equal(form.canSubmit, false);
  form.onSubmit(event()); assert.equal(view.calls.length, 0);
  form.onProductionChange(true); form = view.show().form; assert.equal(form.canSubmit, true);
  form.onTargetChange("development"); form = view.show().form; assert.equal(form.productionConfirmed, false);
  form.onTargetChange("production"); form = view.show().form; assert.equal(form.canSubmit, false);
  form.onProductionChange(true); form = view.show().form; form.onSubmit(event()); await settle();
  assert.equal(view.calls.at(-1)?.input?.confirmProduction, true); view.dispose();
  for (const action of ["move", "share", "delete"] as const) {
    const source = await controller({ action, environment: production, environments: [production, development] });
    form = source.show().form; assert.equal(form.needsProduction, true); assert.equal(form.canSubmit, false);
    form.onSubmit(event()); form.onDeleteConfirmed(); assert.equal(source.calls.length, 0); source.dispose();
  }
});

test("delete ordinary form submission cannot mutate; held completion sends existing API confirmation and one recoverable batch message", async () => {
  const view = await controller({ action: "delete" }); let form = view.show().form;
  const ordinary = event(); form.onSubmit(ordinary); assert.equal(ordinary.prevented, true); assert.equal(view.calls.length, 0);
  view.bulkWith(async () => ({ deleted: 2 })); form.onDeleteConfirmed(); await settle();
  assert.deepEqual(view.calls, [{ action: "bulk", orgSlug: "acme", projectSlug: "api", environmentSlug: "staging", input: {
    action: "delete", secretIds: ["secret-a", "secret-z"], expectedRevision: 7, confirmation: "DELETE 2", confirmProduction: false,
  } }]);
  assert.match(view.completions[0]!, /2 secrets.*Trash.*one batch/);
  view.setProps({ action: null }); view.render(); view.setProps({ action: "delete", secrets: [secrets[0]], revision: 8 });
  form = view.show().form; assert.deepEqual(clone(form.selectedKeys), ["ZETA"]); assert.equal(form.error, null); view.dispose();
});

test("pending operations lock duplicate handlers, form changes and every close path synchronously; errors preserve retry", async () => {
  const view = await controller({ action: "delete" }); const pending = deferred<Props>(); view.bulkWith(() => pending.promise);
  const before = view.show(); before.form.onDeleteConfirmed(); before.form.onDeleteConfirmed(); before.form.onSubmit(event());
  before.form.onClose(); before.root.onOpenChange(false); before.form.onProductionChange(true);
  for (const handler of ["onEscapeKeyDown", "onPointerDownOutside", "onInteractOutside"]) {
    const outside = event(); before.shell[handler](outside); assert.equal(outside.prevented, true);
  }
  let rendered = view.show(); assert.equal(view.calls.length, 1); assert.equal(view.closes, 0);
  assert.equal(rendered.form.busy, true); assert.equal(rendered.form.canSubmit, false); assert.equal(rendered.form.productionConfirmed, false);
  assert.equal(rendered.shell.closeDisabled, true); assert.equal(rendered.shell["aria-busy"], true);
  pending.reject(new Error("Environment changed; refresh and try again")); await settle(); rendered = view.show();
  assert.equal(rendered.form.busy, false); assert.equal(rendered.form.canSubmit, true); assert.match(rendered.form.error, /Environment changed/);
  assert.deepEqual(clone(rendered.form.selectedKeys), ["ALPHA", "ZETA"]); assert.equal(rendered.shell.closeDisabled, false);
  const outside = event(); rendered.shell.onEscapeKeyDown(outside); assert.equal(outside.prevented, false);
  view.bulkWith(async () => ({ deleted: 2 })); rendered.form.onDeleteConfirmed(); await settle();
  assert.equal(view.calls.length, 2); assert.equal(view.completions.length, 1); view.dispose();
});

test("share encrypts the authorized snapshot, sends ciphertext and sorted versions without the key, then keeps complete link only in the success view", async () => {
  const view = await controller({ action: "share" }); let form = view.show().form;
  assert.equal(form.expiry, "7d"); assert.equal(form.maxViews, "10");
  form.onSubmit(event()); await settle(); form = view.show().form;
  assert.deepEqual(view.calls, [
    { action: "snapshot", orgSlug: "acme", projectSlug: "api", environmentSlug: "staging", ids: ["secret-a", "secret-z"], confirmProduction: false },
    { action: "encrypt", input: { type: "bundle", entries: [{ key: "ALPHA", value: "snapshot-alpha" }, { key: "ZETA", value: "snapshot-zeta" }] } },
    { action: "createShare", orgSlug: "acme", input: { projectSlug: "api", environmentSlug: "staging", secretIds: ["secret-a", "secret-z"], versions: [1, 2],
      ciphertext: encrypted.ciphertext, iv: encrypted.iv, verifier: encrypted.verifier, durationValue: 7, durationUnit: "days", maxViews: 10, confirmProduction: false } },
  ]);
  assert.equal(form.link, "https://secrets.outray.dev/share-id#fragment-key"); assert.equal(form.busy, false); assert.equal(form.canSubmit, false);
  assert.equal(view.completions.length, 0); assert.equal(view.closes, 0);
  const payload = JSON.stringify(view.calls.find((call) => call.action === "createShare"));
  assert.doesNotMatch(payload, /fragment-key|snapshot-alpha|snapshot-zeta/);
  form.onSubmit(event()); assert.equal(view.calls.length, 3);
  form.onCopyError("Copy failed. Select the link and copy it manually."); form = view.show().form; assert.match(form.error, /copy/i); assert.equal(form.link, "https://secrets.outray.dev/share-id#fragment-key");
  view.setProps({ action: null }); view.render(); view.setProps({ action: "share" }); form = view.show().form;
  assert.equal(form.link, null); assert.equal(form.error, null); assert.equal(form.maxViews, "10"); view.dispose();
});

test("share limits and valid presets are checked locally before revealing a snapshot", async () => {
  const view = await controller({ action: "share" }); let form = view.show().form;
  for (const maxViews of ["", "0", "101", "1.5", "not-a-number"]) {
    form.onMaxViewsChange(maxViews); form = view.show().form; assert.equal(form.canSubmit, false);
    form.onSubmit(event()); assert.equal(view.calls.length, 0); assert.ok(view.show().form.fieldErrors.maxViews);
  }
  form.onMaxViewsChange("100"); form.onExpiryChange("3m"); form = view.show().form;
  assert.equal(form.canSubmit, true); form.onSubmit(event()); await settle();
  const input = view.calls.at(-1)?.input; assert.equal(input?.durationValue, 3); assert.equal(input?.durationUnit, "months"); assert.equal(input?.maxViews, 100);
  view.dispose();
  const tooMany = Array.from({ length: 51 }, (_, index) => ({ ...secrets[0], id: `secret-${index}`, key: `KEY_${index}` }));
  for (const selected of [[], tooMany]) {
    const invalid = await controller({ action: "share", secrets: selected }); const content = invalid.show().form;
    assert.equal(content.canSubmit, false); content.onSubmit(event()); assert.equal(invalid.calls.length, 0); invalid.dispose();
  }
});

test("invalid public origins fail before plaintext snapshot transport, while configured HTTP localhost works", async () => {
  for (const origin of ["", "https://secrets.outray.dev/path", "https://user:pass@secrets.outray.dev", "https://secrets.outray.dev#key", "https://secrets.outray.dev?x=1", "http://secrets.outray.dev", "ftp://localhost", "not an origin"]) {
    const view = await controller({ action: "share" }, origin); view.show().form.onSubmit(event()); await settle();
    assert.equal(view.calls.length, 0); assert.match(view.show().form.error, /origin|configur|URL/i); assert.equal(view.show().form.busy, false); view.dispose();
  }
  const local = await controller({ action: "share" }, "http://localhost:4545"); local.show().form.onSubmit(event()); await settle();
  assert.equal(local.show().form.link, "http://localhost:4545/share-id#fragment-key"); local.dispose();
});

test("stale snapshot, encryption and target-revision waits cannot continue a dismissed or changed-scope action", async () => {
  for (const phase of ["snapshot", "encrypt", "revision"] as const) {
    const view = await controller({ action: phase === "revision" ? "move" : "share" });
    const wait = deferred<any>();
    if (phase === "snapshot") view.snapshotWith(() => wait.promise);
    if (phase === "encrypt") view.encryptWith(() => wait.promise);
    if (phase === "revision") view.revisionWith(() => wait.promise);
    const old = view.show().form; old.onSubmit(event()); await settle();
    const before = view.calls.length; view.setProps({ orgSlug: "other-team" }); let current = view.show().form;
    assert.equal(current.busy, false); assert.equal(current.error, null); assert.equal(current.link, null);
    old.onSubmit(event()); old.onDeleteConfirmed(); old.onClose(); old.onMaxViewsChange("1");
    assert.equal(view.closes, 0); assert.equal(view.calls.length, before); assert.equal(view.show().form.maxViews, "10");
    wait.resolve(phase === "snapshot" ? snapshot : phase === "encrypt" ? encrypted : { revision: 3 }); await settle(); current = view.show().form;
    assert.equal(view.calls.length, before, "the stale phase cannot issue the next transport"); assert.equal(view.completions.length, 0);
    assert.equal(current.error, null); assert.equal(current.busy, false); assert.equal(current.link, null); view.dispose();
  }
});

test("late success/failure does not write into newer sessions or unmounted modals, and old finally cannot unlock a newer request", async () => {
  const view = await controller({ action: "delete" }); const old = deferred<Props>(); view.bulkWith(() => old.promise);
  const oldForm = view.show().form; oldForm.onDeleteConfirmed();
  view.setProps({ projectSlug: "new-vault" }); assert.equal(view.show().form.busy, false);
  const current = deferred<Props>(); view.bulkWith(() => current.promise); view.show().form.onDeleteConfirmed();
  old.reject(new Error("Old request failed")); await settle(); const form = view.show().form;
  assert.equal(form.busy, true); assert.equal(form.error, null); form.onDeleteConfirmed(); assert.equal(view.calls.length, 2);
  current.resolve({ deleted: 2 }); await settle(); assert.equal(view.completions.length, 1); assert.equal(view.calls[1].projectSlug, "new-vault"); view.dispose();
  for (const failure of [false, true]) {
    const mounted = await controller({ action: "share" }); const request = deferred<{ id: string }>(); mounted.createWith(() => request.promise);
    const stale = mounted.show().form; stale.onSubmit(event()); await settle(); assert.equal(mounted.calls.length, 3); mounted.dispose();
    if (failure) request.reject(new Error("Late create failure")); else request.resolve({ id: "late-id" }); await settle();
    stale.onClose(); stale.onCopyError(); stale.onProductionChange(true); stale.onSubmit(event()); stale.onDeleteConfirmed();
    assert.equal(mounted.lateWrites, 0); assert.equal(mounted.completions.length, 0); assert.equal(mounted.closes, 0); assert.equal(mounted.calls.length, 3);
  }
});

test("same-scope share refresh preserves option drafts and errors; action, environment, and tenant transitions reset them", async () => {
  const view = await controller({ action: "share" }); let form = view.show().form;
  form.onExpiryChange("30d"); form.onMaxViewsChange("25"); view.createWith(async () => { throw new Error("Selection changed"); });
  view.show().form.onSubmit(event()); await settle();
  view.setProps({ secrets: [secrets[0]], revision: 9, environment: { ...staging, name: "Fresh name", revision: 9 } }); form = view.show().form;
  assert.equal(form.expiry, "30d"); assert.equal(form.maxViews, "25"); assert.equal(form.error, "Selection changed");
  assert.equal(form.environment.name, "Staging"); assert.deepEqual(clone(form.selectedKeys), ["ALPHA", "ZETA"]);
  for (const next of [{ action: "delete" as const }, { action: "share" as const, environment: development }, { orgSlug: "new-team" }]) {
    view.setProps(next); form = view.show().form;
    assert.equal(form.expiry, "7d"); assert.equal(form.maxViews, "10"); assert.equal(form.error, null); assert.equal(form.link, null); assert.equal(form.productionConfirmed, false);
  }
  view.dispose();
});

test("missing move destinations, duplicate IDs, and invalid bulk counts never issue a mutation", async () => {
  const noTarget = await controller({ environments: [staging] }); let form = noTarget.show().form;
  assert.equal(form.canSubmit, false); assert.ok(form.fieldErrors.target); form.onSubmit(event()); assert.equal(noTarget.calls.length, 0); noTarget.dispose();
  const unknownTarget = await controller(); unknownTarget.show().form.onTargetChange("not-an-environment"); form = unknownTarget.show().form;
  assert.equal(form.canSubmit, false); form.onSubmit(event()); assert.equal(unknownTarget.calls.length, 0); unknownTarget.dispose();
  const tooMany = Array.from({ length: 101 }, (_, index) => ({ ...secrets[0], id: `secret-${index}`, key: `KEY_${index}` }));
  for (const action of ["move", "delete", "share"] as const) {
    for (const selected of [[], [secrets[0], secrets[0]], tooMany]) {
      const invalid = await controller({ action, secrets: selected }); form = invalid.show().form;
      assert.equal(form.canSubmit, false); assert.match(form.error, /Select between/); form.onSubmit(event()); form.onDeleteConfirmed();
      assert.equal(invalid.calls.length, 0); invalid.dispose();
    }
  }
});

test("completed actions cannot be repeated by an old form handler while the modal finishes closing", async () => {
  for (const action of ["move", "delete", "share"] as const) {
    const view = await controller({ action }); const before = view.show().form;
    if (action === "delete") before.onDeleteConfirmed(); else before.onSubmit(event());
    await settle(); const calls = view.calls.length;
    before.onSubmit(event()); before.onDeleteConfirmed(); before.onMaxViewsChange("5");
    await settle(); assert.equal(view.calls.length, calls);
    assert.equal(view.show().form.canSubmit, false);
    if (action === "share") assert.equal(view.show().form.maxViews, "10");
    view.dispose();
  }
});

test("portaled bulk modals retain private theme scope and restore a connected opener without focusing outside the dialog", async () => {
  const document = { activeElement: null as FakeElement | null, body: null as FakeElement | null };
  class FakeElement {
    isConnected = true;
    focuses = 0;
    queried: string[] = [];
    first: FakeElement | null = null;
    focus() { this.focuses++; document.activeElement = this; }
    contains(element: FakeElement) { return element === this.first; }
    querySelector(selector: string) { this.queried.push(selector); return this.first; }
  }
  document.body = new FakeElement(); const trigger = new FakeElement(), panel = new FakeElement(), first = new FakeElement(); panel.first = first;
  document.activeElement = trigger;
  const view = await controller({}, "https://secrets.outray.dev", { document, HTMLElement: FakeElement }); const shell = view.show().shell;
  assert.match(shell.className, /workspace-ui outray-arc ph-no-capture/); assert.equal(shell["data-private-product"], "secrets");
  const opened = Object.assign(event(), { target: panel }); shell.onOpenAutoFocus(opened);
  assert.equal(opened.prevented, true); assert.equal(first.focuses, 1); assert.deepEqual(panel.queried, ["[data-bulk-autofocus]"]);
  const closed = event(); shell.onCloseAutoFocus(closed); assert.equal(closed.prevented, true); assert.equal(trigger.focuses, 1);
  document.activeElement = trigger; shell.onOpenAutoFocus(Object.assign(event(), { target: panel })); trigger.isConnected = false;
  shell.onCloseAutoFocus(event()); assert.equal(trigger.focuses, 1); view.dispose();
  const server = await controller(); const noDOM = Object.assign(event(), { target: null }); server.show().shell.onOpenAutoFocus(noDOM);
  assert.equal(noDOM.prevented, true); server.dispose();
});
