import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { RequestCapture, TunnelEvent } from "../src/components/requests/types";

const request: TunnelEvent = {
  request_id: "request-one", timestamp: 1_759_660_800_000,
  tunnel_id: "tunnel-one", organization_id: "organization-one", host: "api.acme.dev",
  method: "POST", path: "/checkout", status_code: 201, request_duration_ms: 120,
  bytes_in: 256, bytes_out: 512, client_ip: "203.0.113.1", user_agent: "Test",
};
const capture: RequestCapture = {
  id: "request-one", timestamp: "2026-10-05T12:00:00Z", tunnelId: "tunnel-one",
  request: { headers: { "content-type": "application/json" }, body: '{"amount":42}', bodySize: 13 },
  response: { headers: {}, body: "Created", bodySize: 7 },
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Exercise the real hook, dependency effects and cancellation without a server. */
async function loadHook(fetchResponse: (callIndex: number) => Promise<Response> = async () => Response.json({ capture })) {
  const source = await readFile(new URL("../src/components/requests/use-request-capture.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const states: any[] = [];
  const effects: Array<{ callback: () => void | (() => void); deps: unknown[] }> = [];
  const activeEffects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const calls: Array<{ url: string; signal: AbortSignal; body: string; method: string }> = [];
  let stateIndex = 0;
  let timerId = 0;
  let stateWrites = 0;
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    module, exports: module.exports, AbortController, Error, encodeURIComponent, JSON,
    fetch: (url: string, options: { signal: AbortSignal; body: string; method: string }) => {
      calls.push({ url, signal: options.signal, body: options.body, method: options.method });
      return fetchResponse(calls.length - 1);
    },
    setTimeout: (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (id: number) => { timers.delete(id); },
    require: (specifier: string) => {
      assert.equal(specifier, "react");
      return {
        useState: (initial: any) => {
          const slot = stateIndex++;
          if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
          return [states[slot], (value: any) => {
            states[slot] = typeof value === "function" ? value(states[slot]) : value;
            stateWrites += 1;
          }];
        },
        useCallback: (callback: (...args: any[]) => any) => callback,
        useEffect: (callback: () => void | (() => void), deps: unknown[]) => effects.push({ callback, deps }),
      };
    },
  });
  return {
    calls, timers,
    writes: () => stateWrites,
    render(orgSlug = "acme", selected: TunnelEvent | null = request) {
      stateIndex = 0; effects.length = 0;
      return module.exports.useRequestCapture(orgSlug, selected) as {
        capture: RequestCapture | null; loading: boolean; error: string | null; notFound: boolean; retry: () => void;
      };
    },
    commit() {
      for (const [index, effect] of effects.entries()) {
        const previous = activeEffects[index];
        if (previous && effect.deps.length === previous.deps.length && effect.deps.every((value, slot) => Object.is(value, previous.deps[slot]))) continue;
        previous?.cleanup?.();
        activeEffects[index] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
      }
    },
    fireRetry() {
      const timer = [...timers].find(([, entry]) => entry.delay === 2_000);
      assert.ok(timer, "capture availability uses a two-second retry");
      timers.delete(timer[0]); timer[1].callback();
    },
    unmount() { activeEffects.forEach((effect) => effect.cleanup?.()); },
  };
}

test("closed capture does not load, and the first selected render is a scoped loading state", async () => {
  const hook = await loadHook();
  const closed = hook.render("acme", null);
  assert.equal(closed.capture, null); assert.equal(closed.loading, false); assert.equal(closed.error, null);
  closed.retry(); hook.commit();
  assert.equal(hook.calls.length, 0);
  const first = hook.render();
  assert.equal(first.capture, null); assert.equal(first.loading, true); assert.equal(first.notFound, false);
  hook.commit(); await flush();
  assert.deepEqual(hook.render().capture, capture);
  assert.equal(hook.render().loading, false);
  hook.unmount();
});

test("capture transport encodes organizations and uses semantic request identity, not object identity", async () => {
  const hook = await loadHook();
  hook.render("team /?β"); hook.commit(); await flush();
  const first = hook.calls[0];
  assert.equal(first.url, "/api/team%20%2F%3F%CE%B2/requests/capture");
  assert.equal(first.method, "POST");
  assert.deepEqual(JSON.parse(first.body), { tunnelId: request.tunnel_id, timestamp: request.timestamp, requestId: request.request_id });
  hook.render("team /?β", { ...request }); hook.commit(); await flush();
  assert.equal(hook.calls.length, 1, "live list object refreshes do not refetch the same payload");
  assert.equal(first.signal.aborted, false);
  hook.unmount();
});

test("legacy capture identity uses tunnel and timestamp, omitting an unavailable request ID", async () => {
  const hook = await loadHook();
  const legacy = { ...request, request_id: undefined };
  hook.render("acme", legacy); hook.commit(); await flush();
  assert.deepEqual(JSON.parse(hook.calls[0].body), { tunnelId: request.tunnel_id, timestamp: request.timestamp });
  const nextTime = { ...legacy, timestamp: legacy.timestamp + 1 };
  assert.equal(hook.render("acme", nextTime).loading, true);
  hook.commit(); await flush();
  const nextTunnel = { ...nextTime, tunnel_id: "tunnel-two" };
  assert.equal(hook.render("acme", nextTunnel).capture, null);
  hook.commit(); await flush();
  assert.equal(hook.calls.length, 3);
  assert.equal(JSON.parse(hook.calls[1].body).timestamp, nextTime.timestamp);
  assert.equal(JSON.parse(hook.calls[2].body).tunnelId, "tunnel-two");
  hook.unmount();
});

test("switching requests immediately hides old captures and errors before effects run", async () => {
  const nextResponse = deferred<Response>();
  const hook = await loadHook(async (index) => index === 0 ? Response.json({ capture }) : nextResponse.promise);
  hook.render(); hook.commit(); await flush();
  assert.deepEqual(hook.render().capture, capture);
  const other = { ...request, request_id: "request-two", timestamp: request.timestamp + 1 };
  const switching = hook.render("acme", other);
  assert.equal(switching.capture, null); assert.equal(switching.loading, true); assert.equal(switching.error, null);
  hook.commit();
  assert.equal(hook.calls[0].signal.aborted, true);
  nextResponse.resolve(Response.json({ capture: { ...capture, id: "request-two" } })); await flush();
  assert.equal(hook.render("acme", other).capture?.id, "request-two");
  hook.unmount();
});

test("a cancelled request cannot replace another request's payload even if fetch ignores abort", async () => {
  const firstResponse = deferred<Response>();
  const hook = await loadHook(async (index) => index === 0 ? firstResponse.promise : Response.json({ capture: { ...capture, id: "request-two" } }));
  hook.render(); hook.commit();
  const other = { ...request, request_id: "request-two" };
  hook.render("acme", other); hook.commit(); await flush();
  firstResponse.resolve(Response.json({ capture })); await flush();
  assert.equal(hook.render("acme", other).capture?.id, "request-two");
  assert.equal(hook.timers.size, 0);
  hook.unmount();
});

test("organization changes cancel old requests and late 404s cannot schedule old-scope retries", async () => {
  const firstResponse = deferred<Response>();
  const hook = await loadHook(async (index) => index === 0 ? firstResponse.promise : Response.json({ capture }));
  hook.render("old-team"); hook.commit();
  const switching = hook.render("new-team");
  assert.equal(switching.capture, null); assert.equal(switching.loading, true);
  hook.commit(); await flush();
  const before = hook.writes();
  firstResponse.resolve(new Response(null, { status: 404 })); await flush();
  assert.equal(hook.writes(), before);
  assert.equal(hook.timers.size, 0);
  assert.equal(hook.calls[0].signal.aborted, true);
  assert.equal(hook.render("new-team").error, null);
  hook.unmount();
});

test("capture availability retries six times and provides a distinct terminal unavailable state", async () => {
  const hook = await loadHook(async () => new Response(null, { status: 404 }));
  hook.render(); hook.commit(); await flush();
  for (let retry = 0; retry < 6; retry += 1) {
    const pending = hook.render();
    assert.equal(pending.loading, true); assert.equal(pending.error, null); assert.equal(pending.notFound, false);
    hook.fireRetry(); await flush();
  }
  const unavailable = hook.render();
  assert.equal(hook.calls.length, 7); assert.equal(hook.timers.size, 0);
  assert.equal(unavailable.loading, false); assert.equal(unavailable.notFound, true);
  assert.equal(unavailable.error, "Request capture not found");
  hook.unmount();
});

test("manual retry clears failed state and refetches the same request", async () => {
  const hook = await loadHook(async (index) => index === 0 ? new Response("private upstream details", { status: 500 }) : Response.json({ capture }));
  hook.render(); hook.commit(); await flush();
  const failed = hook.render();
  assert.equal(failed.error, "Failed to fetch request capture"); assert.equal(failed.loading, false); assert.equal(failed.notFound, false);
  failed.retry();
  const retrying = hook.render();
  assert.equal(retrying.error, null); assert.equal(retrying.loading, true); assert.equal(retrying.capture, null);
  hook.commit(); await flush();
  assert.equal(hook.calls.length, 2); assert.equal(hook.calls[0].signal.aborted, true);
  assert.deepEqual(hook.render().capture, capture);
  hook.unmount();
});

test("manual retry cancels a pending availability timer before starting a fresh generation", async () => {
  const hook = await loadHook(async (index) => index === 0 ? new Response(null, { status: 404 }) : Response.json({ capture }));
  hook.render(); hook.commit(); await flush();
  assert.equal(hook.timers.size, 1);
  hook.render().retry(); hook.render(); hook.commit(); await flush();
  assert.equal(hook.timers.size, 0); assert.equal(hook.calls.length, 2);
  assert.deepEqual(hook.render().capture, capture);
  hook.unmount();
});

test("closing immediately hides state, stops availability retries and aborts active transport", async () => {
  const hook = await loadHook(async () => new Response(null, { status: 404 }));
  hook.render(); hook.commit(); await flush();
  assert.equal(hook.timers.size, 1);
  const closed = hook.render("acme", null);
  assert.equal(closed.loading, false); assert.equal(closed.capture, null); assert.equal(closed.error, null);
  hook.commit();
  assert.equal(hook.timers.size, 0); assert.equal(hook.calls[0].signal.aborted, true);
  const before = hook.writes();
  closed.retry(); assert.equal(hook.writes(), before);
  hook.unmount();
});

test("reopening the same request refetches instead of flashing a capture retained before close", async () => {
  const pending = deferred<Response>();
  const hook = await loadHook(async (index) => index === 0 ? Response.json({ capture }) : pending.promise);
  hook.render(); hook.commit(); await flush();
  assert.deepEqual(hook.render().capture, capture);
  hook.render("acme", null); hook.commit();
  const reopening = hook.render();
  assert.equal(reopening.capture, null); assert.equal(reopening.loading, true);
  hook.commit();
  assert.equal(hook.calls.length, 2);
  pending.resolve(Response.json({ capture })); await flush();
  assert.deepEqual(hook.render().capture, capture);
  hook.unmount();
});

test("unmounting ignores late HTTP and JSON completion without setting state or retrying", async () => {
  for (const status of [200, 404, 503]) {
    const late = deferred<Response>();
    const hook = await loadHook(async () => late.promise);
    hook.render(); hook.commit(); hook.unmount();
    const before = hook.writes();
    late.resolve(status === 200 ? Response.json({ capture }) : new Response(null, { status })); await flush();
    assert.equal(hook.writes(), before); assert.equal(hook.timers.size, 0);
    assert.equal(hook.calls[0].signal.aborted, true);
  }
  const json = deferred<{ capture: RequestCapture }>();
  const hook = await loadHook(async () => ({ ok: true, json: () => json.promise }) as unknown as Response);
  hook.render(); hook.commit(); await flush(); hook.unmount();
  const before = hook.writes(); json.resolve({ capture }); await flush();
  assert.equal(hook.writes(), before);
});

test("network failures and malformed JSON have safe retryable errors, not unavailable-capture status", async () => {
  for (const response of [
    async () => { throw new Error("private database credentials"); },
    async () => new Response("<!DOCTYPE html>", { headers: { "Content-Type": "text/html" } }),
    async () => new Response(null, { status: 403 }),
  ]) {
    const hook = await loadHook(response);
    hook.render(); hook.commit(); await flush();
    const failed = hook.render();
    assert.equal(failed.capture, null); assert.equal(failed.loading, false); assert.equal(failed.notFound, false);
    assert.equal(failed.error, "Failed to fetch request capture"); assert.equal(hook.timers.size, 0);
    hook.unmount();
  }
});
