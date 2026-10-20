import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { SecretAuditEvent, SecretAuditPage, SecretEnvironment, SecretMetadata } from "../src/lib/secrets-client";
import { SecretAccessHistoryContent, type SecretAccessHistoryContentProps } from "../src/components/secrets/secret-access-history-content";

Object.assign(globalThis, { React });

const environment: SecretEnvironment = { id: "env-dev", name: "Development", slug: "development", isProduction: false, revision: 3, secretCount: 2, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
const secret: SecretMetadata = { id: "secret-1", key: "API_KEY", version: 3, revision: 3, createdAt: environment.createdAt, updatedAt: environment.updatedAt };
const event = (id: string, overrides: Partial<SecretAuditEvent> = {}): SecretAuditEvent => ({ id, action: "secret.revealed", resourceType: "secret", resourceId: secret.id, actorType: "user", actorName: "Ada", actorCredential: "session", createdAt: "2026-10-20T08:00:00Z", result: "success", ...overrides });
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Props = { [key: string]: any };
type Effect = { slot: number; callback: () => void | (() => void); deps: unknown[] };

async function controller() {
  const source = await readFile(new URL("../src/components/secrets/secret-access-history.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const values: any[] = [], committed = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let index = 0, dirty = false, disposed = false, lateWrites = 0, effects: Effect[] = [];
  const calls: Array<{ org: string; project: string; environment: string; secret: string; cursor: string | null; signal: AbortSignal }> = [];
  let outcome: () => Promise<SecretAuditPage> = async () => ({ events: [event("first")], nextCursor: "page-2" });
  const same = (left: unknown[], right: unknown[]) => left.length === right.length && left.every((value, slot) => Object.is(value, right[slot]));
  const hooks = {
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
    useCallback(callback: (...args: any[]) => unknown, deps: unknown[]) {
      const slot = index++, previous = values[slot];
      if (!previous || !same(previous.deps, deps)) values[slot] = { value: callback, deps: [...deps] };
      return values[slot].value;
    },
  };
  const Content = (_props: Props) => null;
  const module = { exports: {} as { SecretAccessHistorySession: (props: Props) => React.ReactElement<SecretAccessHistoryContentProps>; SecretAccessHistory: (props: Props) => React.ReactElement } };
  runInNewContext(compiled, { React, Error, AbortController, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "react") return hooks;
    if (specifier === "./secret-access-history-content") return { SecretAccessHistoryContent: Content };
    if (specifier === "@/lib/secrets-client") return { secretsClient: { secretAccessHistory(org: string, project: string, environment: string, secret: string, cursor: string | null, signal: AbortSignal) {
      calls.push({ org, project, environment, secret, cursor, signal }); return outcome();
    } } };
    throw new Error(`Unexpected access history dependency: ${specifier}`);
  } });
  const props = { orgSlug: "acme", projectSlug: "app", environment, secret };
  function show() {
    for (let pass = 0; pass < 20; pass++) {
      index = 0; dirty = false; effects = [];
      const view = module.exports.SecretAccessHistorySession(props).props;
      if (dirty) continue;
      for (const effect of effects) {
        const previous = committed.get(effect.slot);
        if (previous && same(previous.deps, effect.deps)) continue;
        previous?.cleanup?.(); committed.set(effect.slot, { deps: [...effect.deps], cleanup: effect.callback() ?? undefined });
      }
      if (!dirty) return view;
    }
    throw new Error("Access history controller did not settle");
  }
  return { calls, show, wrapper: (next: Props = {}) => module.exports.SecretAccessHistory({ ...props, ...next }), withOutcome(next: typeof outcome) { outcome = next; }, get lateWrites() { return lateWrites; }, dispose() { for (const effect of committed.values()) effect.cleanup?.(); disposed = true; } };
}

test("access history fetches only the selected scope with an abort signal and does not reveal values", async () => {
  const view = await controller();
  assert.equal(view.show().loading, true);
  assert.equal(view.calls.length, 1);
  const call = view.calls[0];
  assert.deepEqual([call.org, call.project, call.environment, call.secret, call.cursor], ["acme", "app", "development", "secret-1", null]);
  assert.equal(call.signal.aborted, false);
  await settle();
  assert.deepEqual(Array.from(view.show().events, (event) => event.id), ["first"]);
  assert.equal(view.show().loading, false); assert.equal(view.show().hasMore, true);
  view.dispose();
});

test("pagination blocks duplicate requests, merges overlapping IDs, and stops repeated cursors", async () => {
  const view = await controller(); view.show(); await settle();
  const page = deferred<SecretAuditPage>(); view.withOutcome(() => page.promise);
  const state = view.show(); state.onLoadMore(); state.onLoadMore();
  assert.equal(view.calls.length, 2); assert.equal(view.calls[1].cursor, "page-2");
  page.resolve({ events: [event("first"), event("second"), event("second")], nextCursor: "page-2" }); await settle();
  const loaded = view.show();
  assert.deepEqual(Array.from(loaded.events, (event) => event.id), ["first", "second"]);
  assert.equal(loaded.hasMore, false); assert.equal(loaded.loading, false);
  view.dispose();
});

test("a later cursor cannot cycle back to an already loaded page", async () => {
  const view = await controller(); view.show(); await settle();
  view.withOutcome(async () => ({ events: [event("second")], nextCursor: "page-3" })); view.show().onLoadMore(); await settle();
  view.withOutcome(async () => ({ events: [event("third")], nextCursor: "page-2" })); view.show().onLoadMore(); await settle();
  assert.equal(view.show().hasMore, false); assert.equal(view.show().events.length, 3);
  view.dispose();
});

test("a failed extra page preserves existing rows and retries the same cursor", async () => {
  const view = await controller(); view.show(); await settle();
  view.withOutcome(async () => { throw new Error("Connection interrupted."); }); view.show().onLoadMore(); await settle();
  const failed = view.show(); assert.equal(failed.events.length, 1); assert.equal(failed.error, "Connection interrupted."); assert.equal(failed.hasMore, true);
  view.withOutcome(async () => ({ events: [event("second")], nextCursor: null })); failed.onRetry(); await settle();
  assert.equal(view.calls[2].cursor, "page-2"); assert.equal(view.show().events.length, 2); assert.equal(view.show().error, null);
  view.dispose();
});

test("initial failures retry cleanly while access denial stays distinct from an empty result", async () => {
  const view = await controller(); view.withOutcome(async () => { throw new Error("Unavailable."); }); view.show(); await settle();
  assert.equal(view.show().error, "Unavailable."); assert.equal(view.show().events.length, 0);
  view.withOutcome(async () => ({ events: [], nextCursor: null })); view.show().onRetry(); await settle();
  assert.equal(view.show().error, null); assert.equal(view.show().loading, false); view.dispose();
  const denied = await controller(); denied.withOutcome(async () => { throw Object.assign(new Error("Forbidden"), { status: 403 }); }); denied.show(); await settle();
  assert.equal(denied.show().denied, true); assert.match(denied.show().error ?? "", /permission/); denied.dispose();
});

test("unmount aborts pending reads and ignores success and failure replies after disposal", async () => {
  for (const fail of [false, true]) {
    const view = await controller(), request = deferred<SecretAuditPage>(); view.withOutcome(() => request.promise); view.show(); view.dispose();
    assert.equal(view.calls[0].signal.aborted, true);
    if (fail) request.reject(new Error("late failure")); else request.resolve({ events: [event("late")], nextCursor: null });
    await settle(); assert.equal(view.lateWrites, 0);
  }
});

test("org, vault, environment and secret changes remount the history session before prior rows can render", async () => {
  const view = await controller(), original = view.wrapper().key;
  for (const change of [{ orgSlug: "other" }, { projectSlug: "other" }, { environment: { ...environment, id: "other" } }, { environment: { ...environment, slug: "other" } }, { secret: { ...secret, id: "other" } }]) assert.notEqual(view.wrapper(change).key, original);
  assert.equal(view.wrapper({ secret: { ...secret, version: 5 } }).key, original);
});

const defaults: SecretAccessHistoryContentProps = { events: [event("read", { metadata: { version: 3 }, ipAddress: "2001:db8::1" })], loading: false, error: null, denied: false, hasMore: false, onRetry: () => {}, onLoadMore: () => {} };
const render = (overrides: Partial<SecretAccessHistoryContentProps> = {}) => renderToStaticMarkup(React.createElement(SecretAccessHistoryContent, { ...defaults, ...overrides }));

test("access timeline renders recorded actor, channel, result, timestamp, version, and IP without value controls", () => {
  const html = render();
  assert.match(html, /aria-label="Secret access events"/); assert.match(html, /Secret revealed/); assert.match(html, /Ada/); assert.match(html, /Session/);
  assert.match(html, /Success/); assert.match(html, /Version 3/); assert.match(html, /2001:db8::1/); assert.match(html, /dateTime="2026-10-20T08:00:00Z"/);
  assert.match(html, /ph-no-capture/); assert.doesNotMatch(html, /<input|<pre|>Copy<|>Reveal<|>Restore</);
});

test("access timeline whitelists metadata and never fabricates a success or version", () => {
  const html = render({ events: [event("private", { actorType: "machine", actorName: null, actorCredential: "machine", result: "denied", metadata: { machineTokenName: "Deploy bot", machineTokenPrefix: "omt_public", version: "arbitrary-value", value: "never-render-secret", ciphertext: "never-render-ciphertext", authToken: "never-render-token", nested: { version: 9 } } }), event("legacy", { result: null, metadata: { version: -1 }, createdAt: "invalid" }), event("failed", { result: "failure", actorCredential: "cli" })] });
  assert.match(html, /Deploy bot/); assert.match(html, /Token · omt_public/); assert.match(html, /Denied/); assert.match(html, /Failed/); assert.match(html, /CLI/); assert.match(html, /Time not recorded/);
  assert.doesNotMatch(html, /never-render|arbitrary-value|Version |Success|dateTime="invalid"/);
});

test("loading, empty, permission denial, retry, and retained page errors are distinct", () => {
  const loading = render({ events: [], loading: true }); assert.match(loading, /Loading access history/); assert.doesNotMatch(loading, /No access history yet/);
  const empty = render({ events: [] }); assert.match(empty, /No access history yet/); assert.doesNotMatch(empty, /role="alert"/);
  const failure = render({ events: [], error: "Connection interrupted." }); assert.match(failure, /Couldn’t load access history/); assert.match(failure, /Try again/); assert.doesNotMatch(failure, /No access history yet/);
  const denied = render({ events: [], error: "Permission required.", denied: true }); assert.match(denied, /Access history unavailable/); assert.doesNotMatch(denied, /Try again|No access history yet/);
  const page = render({ hasMore: true, error: "Page unavailable." }); assert.match(page, /Secret revealed/); assert.match(page, /Page unavailable/); assert.match(page, />Retry</);
});
