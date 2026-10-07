import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

type Effect = { callback: () => void | (() => void); deps: readonly unknown[] };

/** Model hook renders and effect commits, leaving transport and the browser explicit boundaries. */
function hooks() {
  const state: any[] = [];
  const callbacks: { value: (...args: any[]) => any; deps: readonly unknown[] }[] = [];
  const active: { deps: readonly unknown[]; cleanup?: () => void }[] = [];
  let pending: Effect[] = [];
  let stateIndex = 0, callbackIndex = 0, writes = 0;
  return {
    api: {
      useState(initial: any) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (next: any) => { state[index] = typeof next === "function" ? next(state[index]) : next; writes++; }];
      },
      useCallback(value: (...args: any[]) => any, deps: readonly unknown[]) {
        const index = callbackIndex++, previous = callbacks[index];
        if (!previous || deps.length !== previous.deps.length || deps.some((dep, slot) => !Object.is(dep, previous.deps[slot]))) callbacks[index] = { value, deps };
        return callbacks[index].value;
      },
      useEffect(callback: Effect["callback"], deps: Effect["deps"]) { pending.push({ callback, deps }); },
    },
    render<T>(read: () => T) { stateIndex = 0; callbackIndex = 0; pending = []; return read(); },
    commit() {
      for (const [index, effect] of pending.entries()) {
        const previous = active[index];
        if (previous && effect.deps.length === previous.deps.length && effect.deps.every((dep, slot) => Object.is(dep, previous.deps[slot]))) continue;
        previous?.cleanup?.();
        active[index] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
      }
      pending = [];
    },
    writes: () => writes,
    unmount() { for (const effect of active) effect?.cleanup?.(); active.length = 0; pending = []; },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((finish) => setImmediate(finish));
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;

type Snapshot = { name: string; items?: string[] };
type Resource = { data: Snapshot | null; loading: boolean; error: string | null; reload: () => void };
type Read = { url: string; options: RequestInit & { signal: AbortSignal } };

async function resource(fetcher: (index: number, read: Read) => Promise<Response> = async () => Response.json({ name: "Current" })) {
  const source = await readFile(new URL("../src/components/uptime/uptime-client.ts", import.meta.url), "utf8");
  const runtime = hooks(), reads: Read[] = [];
  const module = { exports: {} as { useUptimeResource: (orgSlug: string, path: string) => Resource } };
  runInNewContext(compile(source), {
    module, exports: module.exports, Error, AbortController, encodeURIComponent,
    fetch(url: string, options: Read["options"]) { const read = { url, options }; reads.push(read); return fetcher(reads.length - 1, read); },
    require(specifier: string) { assert.equal(specifier, "react"); return runtime.api; },
  });
  return { ...runtime, reads, render: (orgSlug = "acme", path = "/monitors") => runtime.render(() => module.exports.useUptimeResource(orgSlug, path)) };
}

test("Uptime resources begin scoped and transport uses encoded organization, same-origin credentials, and no-store", async () => {
  const hook = await resource();
  const first = hook.render("team /?β");
  assert.equal(first.data, null); assert.equal(first.loading, true); assert.equal(first.error, null);
  hook.commit(); await flush();
  assert.equal(hook.reads[0].url, "/api/team%20%2F%3F%CE%B2/uptime/monitors");
  assert.equal(hook.reads[0].options.credentials, "same-origin"); assert.equal(hook.reads[0].options.cache, "no-store");
  const current = hook.render("team /?β");
  assert.deepEqual(current.data, { name: "Current" }); assert.equal(current.loading, false); assert.equal(current.error, null);
  hook.unmount(); assert.equal(hook.reads[0].options.signal.aborted, true);
});

test("same-key background refresh retains the precise existing snapshot and a stable reload action", async () => {
  const pending = deferred<Response>();
  const hook = await resource(async (index) => index ? pending.promise : Response.json({ name: "Current", items: ["first"] }));
  hook.render(); hook.commit(); await flush();
  const loaded = hook.render(), snapshot = loaded.data;
  hook.commit(); assert.equal(hook.reads.length, 1, "ordinary rerenders must not repeat reads");
  loaded.reload(); const refreshing = hook.render();
  assert.equal(refreshing.data, snapshot); assert.equal(refreshing.loading, true); assert.equal(refreshing.error, null);
  assert.equal(refreshing.reload, loaded.reload);
  hook.commit(); assert.equal(hook.reads.length, 2); assert.equal(hook.reads[0].options.signal.aborted, true);
  pending.resolve(Response.json({ name: "Fresh", items: ["first", "second"] })); await flush();
  const refreshed = hook.render(); assert.equal(refreshed.loading, false); assert.equal(refreshed.data?.name, "Fresh");
  assert.equal(snapshot?.name, "Current", "refresh does not mutate a previously opened snapshot");
  hook.unmount();
});

test("background failures preserve data, expose action errors, and clear the old error while retrying", async () => {
  const retry = deferred<Response>();
  const hook = await resource(async (index) => index === 0 ? Response.json({ name: "Current" }) : index === 1 ? Response.json({ error: "Refresh unavailable" }, { status: 503 }) : retry.promise);
  hook.render(); hook.commit(); await flush(); const loaded = hook.render();
  loaded.reload(); hook.render(); hook.commit(); await flush(); const failed = hook.render();
  assert.equal(failed.data, loaded.data); assert.equal(failed.error, "Refresh unavailable"); assert.equal(failed.loading, false);
  failed.reload(); const trying = hook.render();
  assert.equal(trying.data, loaded.data); assert.equal(trying.loading, true); assert.equal(trying.error, null);
  hook.commit(); retry.resolve(Response.json({ name: "Recovered" })); await flush();
  assert.equal(hook.render().data?.name, "Recovered"); assert.equal(hook.render().error, null); hook.unmount();
});

test("organization and path changes hide prior data and errors before effect cleanup", async () => {
  const hook = await resource(async (index) => index === 1 ? Response.json({ error: "Old-team failure" }, { status: 500 }) : Response.json({ name: `Snapshot ${index}` }));
  hook.render("old-team"); hook.commit(); await flush();
  hook.render("old-team").reload(); hook.render("old-team"); hook.commit(); await flush();
  assert.equal(hook.render("old-team").error, "Old-team failure");
  const switching = hook.render("new-team");
  assert.equal(switching.data, null); assert.equal(switching.error, null); assert.equal(switching.loading, true);
  hook.commit(); await flush(); assert.equal(hook.render("new-team").data?.name, "Snapshot 2");
  const detail = hook.render("new-team", "/monitors/id-one");
  assert.equal(detail.data, null); assert.equal(detail.error, null); assert.equal(detail.loading, true);
  hook.commit(); await flush(); assert.equal(hook.render("new-team", "/monitors/id-one").data?.name, "Snapshot 3");
  assert.equal(hook.reads[2].options.signal.aborted, true); hook.unmount();
});

test("late success or failure cannot write across organization scopes even when fetch ignores cancellation", async () => {
  for (const outcome of ["success", "failure"] as const) {
    const late = deferred<Response>();
    const hook = await resource(async (index) => index === 0 ? late.promise : Response.json({ name: "New team" }));
    hook.render("old-team"); hook.commit(); hook.render("new-team"); hook.commit(); await flush();
    const before = hook.writes();
    if (outcome === "success") late.resolve(Response.json({ name: "Old team" })); else late.reject(new Error("Old-team transport failed"));
    await flush(); const view = hook.render("new-team");
    assert.equal(hook.writes(), before); assert.equal(view.data?.name, "New team"); assert.equal(view.error, null);
    assert.equal(hook.reads[0].options.signal.aborted, true); hook.unmount();
  }
});

test("a newer reload supersedes its predecessor and stale same-key results cannot replace it", async () => {
  const late = deferred<Response>();
  const hook = await resource(async (index) => index === 0 ? late.promise : Response.json({ name: "Newest generation" }));
  hook.render(); hook.commit(); hook.render().reload(); hook.render(); hook.commit(); await flush();
  const before = hook.writes(); late.resolve(Response.json({ name: "Superseded" })); await flush();
  assert.equal(hook.render().data?.name, "Newest generation"); assert.equal(hook.writes(), before);
  hook.unmount();
});

test("unmount aborts pending transport and JSON parsing without state writes", async () => {
  for (const phase of ["http", "json"] as const) {
    const late = deferred<any>();
    const hook = await resource(async () => phase === "http" ? late.promise : ({ ok: true, json: () => late.promise }) as Response);
    hook.render(); hook.commit(); await flush(); hook.unmount(); const before = hook.writes();
    late.resolve(phase === "http" ? Response.json({ name: "Too late" }) : { name: "Too late" }); await flush();
    assert.equal(hook.reads[0].options.signal.aborted, true); assert.equal(hook.writes(), before);
  }
});

test("empty or non-JSON responses expose safe initial errors instead of raw server HTML", async () => {
  for (const [response, message] of [
    [new Response("<html>private upstream trace</html>", { status: 503 }), "Request failed (503)"],
    [new Response(""), "The server returned an empty response."],
  ] as const) {
    const hook = await resource(async () => response);
    hook.render(); hook.commit(); await flush(); const failed = hook.render();
    assert.equal(failed.data, null); assert.equal(failed.loading, false); assert.equal(failed.error, message);
    assert.doesNotMatch(failed.error!, /private upstream|Unexpected token/); hook.unmount();
  }
});
