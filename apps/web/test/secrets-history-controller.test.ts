import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import type { SecretEnvironment, SecretMetadata, SecretVersion } from "../src/lib/secrets-client";

type Props = { [key: string]: any; children?: React.ReactNode };
type Effect = { slot: number; callback: () => void | (() => void); deps: unknown[] };
type SessionProps = {
  orgSlug: string; projectSlug: string; environment: SecretEnvironment; secret: SecretMetadata;
  revision: number; onRolledBack: () => void; onClose: () => void;
  onInteractionChange: (state: { confirming: boolean; restoring: boolean }) => void;
};
const staging: SecretEnvironment = {
  id: "env-staging", name: "Staging", slug: "staging", description: "Preview", color: "violet",
  isProduction: false, revision: 7, secretCount: 3,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const production: SecretEnvironment = { ...staging, id: "env-production", name: "Production", slug: "production", isProduction: true };
const secret: SecretMetadata = {
  id: "secret-a", key: "API_KEY", version: 2, revision: 7,
  createdAt: staging.createdAt, updatedAt: staging.updatedAt,
};
const versions: SecretVersion[] = [
  { id: "version-1", version: 1, createdAt: "2026-10-01T00:00:00Z", action: "created", createdBy: "Alice", isCurrent: false },
  { id: "version-3", version: 3, createdAt: "2026-10-05T00:00:00Z", action: "updated", createdBy: "Bob", isCurrent: true },
  { id: "version-2", version: 2, createdAt: "2026-10-03T00:00:00Z", action: "updated", createdBy: "Alice", isCurrent: false },
];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

/** Run the actual session hooks and asynchronous fences, replacing only presentation and transport. */
async function controller(initial: Partial<SessionProps> = {}) {
  const source = await readFile(new URL("../src/components/secrets/secret-history-sheet.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const values: any[] = [], committed = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let index = 0, dirty = false, disposed = false, lateWrites = 0, effects: Effect[] = [], closes = 0, mutations = 0;
  let now = Date.parse("2026-10-07T00:00:00Z"), timerId = 0;
  const timers = new Map<number, { callback: () => void; due: number; interval?: number }>();
  const interactions: Array<{ confirming: boolean; restoring: boolean }> = [];
  let props: SessionProps = {
    orgSlug: "acme", projectSlug: "api", environment: staging, secret, revision: 7,
    onClose: () => { closes++; }, onRolledBack: () => { mutations++; },
    onInteractionChange: (state) => interactions.push({ ...state }), ...initial,
  };
  const calls: Array<{ action: string; orgSlug: string; projectSlug: string; environmentSlug: string; secretId: string; input?: Props; signal?: AbortSignal }> = [];
  const clipboard: string[] = [];
  let versionsOutcome: () => Promise<SecretVersion[]> = async () => clone(versions);
  let revealOutcome: (input: Props) => Promise<{ value: string; expiresIn: number }> = async (input) => ({ value: `fixture-v${input.version}`, expiresIn: 30 });
  let rollbackOutcome: () => Promise<Props> = async () => ({ secret: { ...secret, version: 4 } });
  let clipboardOutcome: () => Promise<void> = async () => undefined;
  const client = {
    versions(orgSlug: string, projectSlug: string, environmentSlug: string, secretId: string, signal?: AbortSignal) {
      calls.push({ action: "versions", orgSlug, projectSlug, environmentSlug, secretId, signal }); return versionsOutcome();
    },
    revealSecret(orgSlug: string, projectSlug: string, environmentSlug: string, secretId: string, input: Props, signal?: AbortSignal) {
      calls.push({ action: "reveal", orgSlug, projectSlug, environmentSlug, secretId, input: clone(input), signal }); return revealOutcome(input);
    },
    rollback(orgSlug: string, projectSlug: string, environmentSlug: string, secretId: string, input: Props, signal?: AbortSignal) {
      calls.push({ action: "rollback", orgSlug, projectSlug, environmentSlug, secretId, input: clone(input), signal }); return rollbackOutcome();
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
      const slot = index++, previous = values[slot];
      if (!previous || !same(previous.deps, deps)) values[slot] = { value: factory(), deps: [...deps] };
      return values[slot].value;
    },
    useCallback(callback: (...args: any[]) => unknown, deps: unknown[]) { return hooks.useMemo(() => callback, deps); },
  };
  function schedule(callback: () => void, duration: number, interval?: number) {
    const id = ++timerId; timers.set(id, { callback, due: now + duration, interval }); return id;
  }
  const Content = (_props: Props) => null, RestoreDialog = (_props: Props) => null, Sheet = (_props: Props) => null;
  const module = { exports: {} as {
    SecretHistorySession: (props: SessionProps) => React.ReactNode;
    SecretHistorySheet: (props: Props) => React.ReactNode;
  } };
  class ClockDate extends Date { static now() { return now; } }
  const browser = {
    setTimeout: (callback: () => void, duration: number) => schedule(callback, duration),
    clearTimeout: (id: number) => timers.delete(id),
    setInterval: (callback: () => void, duration: number) => schedule(callback, duration, duration),
    clearInterval: (id: number) => timers.delete(id),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  runInNewContext(compiled, {
    React, Error, AbortController, Date: ClockDate, module, exports: module.exports, window: browser,
    setTimeout: browser.setTimeout, clearTimeout: browser.clearTimeout,
    document: { addEventListener: () => undefined, removeEventListener: () => undefined },
    navigator: { clipboard: { writeText(value: string) { clipboard.push(value); return clipboardOutcome(); } } },
    require: (specifier: string) => {
      if (specifier === "react") return hooks;
      if (specifier === "lucide-react") return { LockKeyhole: (_props: Props) => null };
      if (specifier === "@/components/ui/side-sheet") return { SideSheet: Sheet };
      if (specifier === "@/lib/secrets-client") return { secretsClient: client };
      if (specifier === "./secret-history-content") return { SecretHistoryContent: Content, SecretHistoryRestoreDialog: RestoreDialog };
      if (specifier === "./secret-history-restore-dialog") return { SecretHistoryRestoreDialog: RestoreDialog };
      if (specifier === "./secrets-ui") return { SecretsSheet: Sheet };
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected secret history dependency: ${specifier}`);
    },
  });
  function render(component = module.exports.SecretHistorySession, componentProps: Props = props) {
    for (let pass = 0; pass < 20; pass++) {
      index = 0; dirty = false; effects = [];
      const tree = elements(component(componentProps as SessionProps));
      if (dirty) continue;
      for (const effect of effects) {
        const previous = committed.get(effect.slot);
        if (previous && same(previous.deps, effect.deps)) continue;
        previous?.cleanup?.(); committed.set(effect.slot, { deps: [...effect.deps], cleanup: effect.callback() ?? undefined });
      }
      if (dirty) continue;
      return { tree, content: tree.find((element) => element.type === Content)?.props, dialog: tree.find((element) => element.type === RestoreDialog)?.props };
    }
    throw new Error("The actual history controller did not settle");
  }
  function show() { const view = render(); assert.ok(view.content); assert.ok(view.dialog); return { content: view.content, dialog: view.dialog }; }
  return {
    calls, clipboard, interactions, render, show,
    get closes() { return closes; }, get mutations() { return mutations; },
    get lateWrites() { return lateWrites; }, get timerCount() { return timers.size; },
    setProps(next: Partial<SessionProps>) { props = { ...props, ...next }; },
    versionsWith(next: typeof versionsOutcome) { versionsOutcome = next; },
    revealWith(next: typeof revealOutcome) { revealOutcome = next; },
    rollbackWith(next: typeof rollbackOutcome) { rollbackOutcome = next; },
    clipboardWith(next: typeof clipboardOutcome) { clipboardOutcome = next; },
    sheet(next: Props) { return render(module.exports.SecretHistorySheet as any, { open: true, ...props, ...next }).tree; },
    advance(duration: number) {
      const end = now + duration;
      for (let count = 0; count < 1000; count++) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((left, right) => left[1].due - right[1].due)[0];
        if (!next) { now = end; return; }
        const [id, timer] = next; now = timer.due;
        if (timer.interval) timer.due += timer.interval; else timers.delete(id);
        timer.callback();
      }
      throw new Error("Secret history timer did not settle");
    },
    dispose() { for (const effect of committed.values()) effect.cleanup?.(); disposed = true; },
  };
}

test("history fetches metadata with an abort signal, sorts versions, and respects the server-marked current version", async () => {
  const view = await controller(); assert.equal(view.show().content.loading, true);
  assert.equal(view.calls.length, 1); assert.equal(view.calls[0].signal?.aborted, false);
  assert.deepEqual({ ...view.calls[0], signal: undefined }, {
    action: "versions", orgSlug: "acme", projectSlug: "api", environmentSlug: "staging", secretId: "secret-a", signal: undefined,
  });
  await settle(); const content = view.show().content;
  assert.equal(content.loading, false); assert.equal(content.error, null);
  assert.deepEqual(clone(content.versions).map((version: SecretVersion) => version.version), [3, 2, 1]);
  assert.equal(content.versions.find((version: SecretVersion) => version.isCurrent).version, 3);
  assert.equal(content.revealed, null); assert.equal(view.clipboard.length, 0);
  view.dispose(); assert.equal(view.calls[0].signal?.aborted, true);
});

test("history failures stay distinct from empty history and retry without losing the session", async () => {
  const view = await controller(); view.versionsWith(async () => { throw new Error("History unavailable"); });
  view.show(); await settle(); let content = view.show().content;
  assert.equal(content.loading, false); assert.match(content.error, /History unavailable/); assert.equal(content.versions.length, 0);
  view.versionsWith(async () => []); content.onRetry(); assert.equal(view.show().content.loading, true); await settle();
  content = view.show().content; assert.equal(content.error, null); assert.deepEqual(clone(content.versions), []);
  assert.equal(view.calls.length, 2); view.dispose();
});

test("metadata refresh does not reload history and cannot change the revision or current version of an open restore confirmation", async () => {
  const view = await controller(); view.show(); await settle();
  view.show().content.onRestore(1);
  assert.equal(view.show().dialog.currentVersion, 3, "the marked server current beats stale parent metadata");
  view.setProps({ revision: 99, secret: { ...secret, key: "RENAMED_KEY", version: 99 }, environment: { ...staging, name: "Renamed", revision: 99 } });
  assert.equal(view.calls.length, 1); const dialog = view.show().dialog;
  assert.equal(dialog.open, true); assert.equal(dialog.currentVersion, 3); dialog.onConfirm(); await settle();
  const restored = view.calls.find((call) => call.action === "rollback"); assert.ok(restored);
  assert.equal(restored.input?.expectedRevision, 7); assert.equal(restored.input?.expectedVersion, 3); view.dispose();
});

test("reveal holds a single version in memory, clears on hide, and expires with a deterministic countdown", async () => {
  const view = await controller(); view.show(); await settle();
  view.show().content.onReveal(1); await settle(); let content = view.show().content;
  assert.deepEqual(clone(content.revealed), { version: 1, value: "fixture-v1", expiresAt: Date.parse("2026-10-07T00:00:30Z") });
  assert.equal(content.secondsRemaining, 30);
  view.advance(1_000); content = view.show().content; assert.equal(content.secondsRemaining, 29);
  content.onHide(); content = view.show().content; assert.equal(content.revealed, null); assert.equal(content.secondsRemaining, 0);
  assert.equal(view.timerCount, 0);
  content.onReveal(2); await settle(); assert.equal(view.show().content.revealed.version, 2);
  view.advance(30_000); content = view.show().content; assert.equal(content.revealed, null); assert.equal(content.secondsRemaining, 0);
  assert.equal(view.timerCount, 0); view.dispose();
});

test("one in-flight action blocks duplicate reveal, copy, and restore synchronously; errors stay on the attempted row", async () => {
  const view = await controller(); view.show(); await settle();
  const wait = deferred<{ value: string; expiresIn: number }>(); view.revealWith(() => wait.promise);
  const old = view.show().content; old.onReveal(1); old.onReveal(1); old.onCopy(2); old.onRestore(2);
  let content = view.show().content; assert.deepEqual(clone(content.pending), { type: "reveal", version: 1 });
  assert.equal(view.calls.filter((call) => call.action === "reveal").length, 1); assert.equal(view.show().dialog.open, false);
  wait.reject(new Error("Access denied for version")); await settle(); content = view.show().content;
  assert.equal(content.pending, null); assert.equal(content.revealed, null); assert.equal(content.error, null);
  assert.deepEqual(clone(content.actionError), { version: 1, message: "Access denied for version" });
  view.revealWith(async () => ({ value: "retry-fixture", expiresIn: 30 })); content.onReveal(1); await settle();
  content = view.show().content; assert.equal(content.actionError, null); assert.equal(content.revealed.value, "retry-fixture"); view.dispose();
});

test("copy performs a fresh audited copy request without rendering plaintext and resets its feedback", async () => {
  const view = await controller(); view.show(); await settle(); view.show().content.onCopy(1); await settle();
  let content = view.show().content; assert.equal(content.revealed, null); assert.equal(content.copiedVersion, 1);
  assert.deepEqual(view.clipboard, ["fixture-v1"]); assert.deepEqual(view.calls.at(-1)?.input, { intent: "copy", version: 1 });
  assert.equal(view.calls.at(-1)?.signal?.aborted, false);
  view.advance(2_000); content = view.show().content; assert.equal(content.copiedVersion, null); view.dispose();
});

test("copy errors remain local and never advertise success or reveal the fetched plaintext", async () => {
  const view = await controller(); view.clipboardWith(async () => { throw new Error("Clipboard blocked"); });
  view.show(); await settle(); view.show().content.onCopy(2); await settle();
  const content = view.show().content; assert.equal(content.copiedVersion, null); assert.equal(content.revealed, null); assert.equal(content.pending, null);
  assert.deepEqual(clone(content.actionError), { version: 2, message: "Clipboard blocked" }); view.dispose();
});

test("unmount aborts metadata and plaintext transports, ignores late results, and prevents stale clipboard writes", async () => {
  for (const action of ["load", "reveal", "copy"] as const) {
    const view = await controller(), wait = deferred<any>();
    if (action === "load") { view.versionsWith(() => wait.promise); view.show(); }
    else {
      view.show(); await settle(); view.revealWith(() => wait.promise);
      const content = view.show().content; if (action === "reveal") content.onReveal(1); else content.onCopy(1);
    }
    const request = view.calls.at(-1); assert.equal(request?.signal?.aborted, false); view.dispose();
    assert.equal(request?.signal?.aborted, true); wait.resolve(action === "load" ? versions : { value: "late-fixture", expiresIn: 30 }); await settle();
    assert.equal(view.lateWrites, 0); assert.deepEqual(view.clipboard, []); assert.equal(view.closes, 0); assert.equal(view.mutations, 0); assert.equal(view.timerCount, 0);
  }
});

test("a pending clipboard completion cannot update a closed session and cleanup clears existing plaintext and timers", async () => {
  const view = await controller(); view.show(); await settle(); view.show().content.onReveal(1); await settle();
  assert.ok(view.show().content.revealed); assert.ok(view.timerCount > 0);
  const wait = deferred<void>(); view.clipboardWith(() => wait.promise);
  view.show().content.onCopy(2); await settle(); assert.deepEqual(view.clipboard, ["fixture-v2"]);
  view.dispose(); assert.equal(view.timerCount, 0); wait.resolve(); await settle(); assert.equal(view.lateWrites, 0);
});

test("production restore requires explicit consent, freezes server current and revision, and closes once only after success", async () => {
  const view = await controller({ environment: production }); view.show(); await settle();
  view.show().content.onRestore(1); let dialog = view.show().dialog;
  assert.equal(dialog.open, true); assert.equal(dialog.production, true); assert.equal(dialog.productionConfirmed, false); assert.equal(dialog.version, 1); assert.equal(dialog.currentVersion, 3);
  dialog.onConfirm(); assert.equal(view.calls.filter((call) => call.action === "rollback").length, 0);
  dialog.onProductionChange(true); dialog = view.show().dialog;
  const wait = deferred<Props>(); view.rollbackWith(() => wait.promise); dialog.onConfirm(); dialog.onConfirm(); dialog.onClose(); dialog.onProductionChange(false);
  dialog = view.show().dialog; assert.equal(dialog.pending, true); assert.equal(dialog.open, true); assert.equal(dialog.productionConfirmed, true);
  assert.equal(view.closes, 0); assert.equal(view.mutations, 0);
  const call = view.calls.find((entry) => entry.action === "rollback"); assert.ok(call);
  assert.deepEqual(call.input, { version: 1, expectedRevision: 7, expectedVersion: 3, confirmProduction: true });
  wait.resolve({}); await settle(); assert.equal(view.closes, 1); assert.equal(view.mutations, 1);
  dialog.onConfirm(); await settle(); assert.equal(view.calls.filter((entry) => entry.action === "rollback").length, 1);
  assert.equal(view.closes, 1); assert.equal(view.mutations, 1); view.dispose();
});

test("restore errors stay in the confirmation, preserve consent and retry, and do not clear or close the history", async () => {
  const view = await controller({ environment: production }); view.show(); await settle(); view.show().content.onRestore(1);
  view.show().dialog.onProductionChange(true); view.rollbackWith(async () => { throw new Error("Revision changed; refresh first"); });
  view.show().dialog.onConfirm(); await settle(); let dialog = view.show().dialog;
  assert.equal(dialog.open, true); assert.equal(dialog.pending, false); assert.equal(dialog.productionConfirmed, true); assert.match(dialog.error, /Revision changed/);
  assert.equal(view.show().content.error, null); assert.equal(view.show().content.actionError, null); assert.equal(view.closes, 0); assert.equal(view.mutations, 0);
  dialog.onClose(); dialog = view.show().dialog; assert.equal(dialog.open, false); assert.equal(dialog.error, null); assert.equal(dialog.productionConfirmed, false);
  view.show().content.onRestore(2); dialog = view.show().dialog; assert.equal(dialog.version, 2); assert.equal(dialog.productionConfirmed, false); view.dispose();
});

test("only known historical versions can be revealed, copied or restored; the current version cannot be restored", async () => {
  const view = await controller(); view.show(); await settle(); const content = view.show().content;
  for (const version of [-1, 0, 1.5, 99, Number.NaN]) { content.onReveal(version); content.onCopy(version); content.onRestore(version); }
  content.onRestore(3); assert.equal(view.calls.length, 1); assert.equal(view.show().dialog.open, false); view.dispose();
});

test("the sheet unmounts private sessions on close and scopes their keys to organization, vault, environment and secret", async () => {
  const view = await controller();
  const findSession = (tree: React.ReactElement<Props>[]) => tree.find((element) => typeof element.type === "function" && element.type.name === "SecretHistorySession");
  const initial = findSession(view.sheet({})); assert.ok(initial); assert.equal(view.calls.length, 0, "the shell itself does not fetch secret history");
  assert.equal(initial.key, JSON.stringify(["acme", "api", staging.id, staging.slug, secret.id]));
  const unchanged = findSession(view.sheet({ revision: 99, secret: { ...secret, version: 99 }, environment: { ...staging, revision: 99 } }));
  assert.equal(unchanged?.key, initial.key, "ordinary background metadata changes preserve the open session");
  initial.props.onInteractionChange({ confirming: true, restoring: false });
  assert.equal(view.sheet({}).find((element) => element.props.title === "Version history")?.props.closeDisabled, true);
  for (const next of [
    { orgSlug: "other-org" }, { projectSlug: "other-vault" },
    { environment: { ...staging, id: "other-environment" } }, { environment: { ...staging, slug: "renamed-environment" } },
    { secret: { ...secret, id: "other-secret" } },
  ]) {
    const tree = view.sheet(next); assert.notEqual(findSession(tree)?.key, initial.key);
    assert.equal(Boolean(tree.find((element) => element.props.title === "Version history")?.props.closeDisabled), false, "old-session interactions cannot block a new scope");
  }
  assert.equal(findSession(view.sheet({ open: false })), undefined);
  assert.equal(findSession(view.sheet({ secret: null })), undefined); view.dispose();
});

test("a newer history retry aborts the prior fetch and old completion cannot replace the fresh versions", async () => {
  const view = await controller(), first = deferred<SecretVersion[]>(), second = deferred<SecretVersion[]>();
  view.versionsWith(() => first.promise); view.show(); const old = view.calls[0];
  view.versionsWith(() => second.promise); view.show().content.onRetry(); view.show();
  assert.equal(old.signal?.aborted, true); assert.equal(view.calls[1].signal?.aborted, false);
  second.resolve([versions[1]]); await settle(); assert.deepEqual(clone(view.show().content.versions).map((version: SecretVersion) => version.version), [3]);
  first.resolve([versions[0]]); await settle(); assert.deepEqual(clone(view.show().content.versions).map((version: SecretVersion) => version.version), [3]);
  assert.equal(view.show().content.loading, false); assert.equal(view.show().content.error, null); view.dispose();
});

test("legacy history without an explicit server-current flag uses parent metadata rather than assuming the newest row", async () => {
  const view = await controller(); view.versionsWith(async () => versions.map((version) => ({ ...version, isCurrent: undefined })));
  view.show(); await settle(); const content = view.show().content;
  content.onRestore(2); assert.equal(view.show().dialog.open, false);
  content.onRestore(1); assert.equal(view.show().dialog.currentVersion, 2); view.show().dialog.onClose();
  content.onRestore(3); assert.equal(view.show().dialog.open, true, "unmarked newest row is not silently treated as current");
  view.dispose();
});

test("late restore success or failure after unmount cannot close, refresh or update a dismissed session", async () => {
  for (const result of ["success", "failure"] as const) {
    const view = await controller(), wait = deferred<Props>(); view.rollbackWith(() => wait.promise);
    view.show(); await settle(); view.show().content.onRestore(1); view.show().dialog.onConfirm();
    assert.equal(view.calls.filter((call) => call.action === "rollback").length, 1); view.dispose();
    if (result === "success") wait.resolve({}); else wait.reject(new Error("Late restore failure"));
    await settle(); assert.equal(view.mutations, 0); assert.equal(view.closes, 0); assert.equal(view.lateWrites, 0);
  }
});

test("plaintext expiry is bounded to 30 seconds even when a server sends an excessive or invalid TTL", async () => {
  for (const [expiresIn, expected] of [[999, 30], [0, 1], [Number.NaN, 30]]) {
    const view = await controller(); view.revealWith(async () => ({ value: "ttl-fixture", expiresIn }));
    view.show(); await settle(); view.show().content.onReveal(1); await settle();
    assert.equal(view.show().content.secondsRemaining, expected);
    view.advance(expected * 1_000); assert.equal(view.show().content.revealed, null); assert.equal(view.timerCount, 0); view.dispose();
  }
});
