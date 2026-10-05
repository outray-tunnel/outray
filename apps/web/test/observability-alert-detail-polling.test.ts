import assert from "node:assert/strict";
import test from "node:test";
import { startAlertDetailPolling } from "../src/components/observability/alert-detail-polling";
import type { AlertDetailsResponse } from "../src/components/observability/alert-detail-context";

const snapshot = { alert: { id: "rule-1", name: "Checkout errors" }, evaluations: [], incidents: [], notifications: [] } as unknown as AlertDetailsResponse;
const settle = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(fetcher: typeof fetch) {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const documentTarget = new EventTarget();
  const windowTarget = new EventTarget();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let key = 0;
  const doc = Object.assign(documentTarget, { visibilityState: "visible" });
  Object.assign(globalThis, {
    document: doc,
    window: Object.assign(windowTarget, {
      setTimeout(callback: () => void, delay: number) { timers.set(++key, { callback, delay }); return key; },
      clearTimeout(id: number) { timers.delete(id); },
    }),
    fetch: fetcher,
  });
  const data: AlertDetailsResponse[] = [];
  const errors: string[] = [];
  let starts = 0, completes = 0;
  const stop = startAlertDetailPolling({ url: "/api/acme/observability/alerts/rule-1", onStart: () => { starts++; }, onData: (value) => data.push(value), onError: (message) => errors.push(message), onComplete: () => { completes++; } });
  return {
    data, errors, timers, starts: () => starts, completes: () => completes,
    stop,
    hidden: (value: boolean) => { doc.visibilityState = value ? "hidden" : "visible"; documentTarget.dispatchEvent(new Event("visibilitychange")); },
    focus: () => windowTarget.dispatchEvent(new Event("focus")),
    tick: () => { const [id, timer] = [...timers][0]; timers.delete(id); timer.callback(); },
    restore: () => { stop(); Object.assign(globalThis, original); },
  };
}

test("detail polls every ten seconds, keeps the current snapshot, and cleans up", async () => {
  const requests: string[] = [];
  const harness = setup(async (url) => { requests.push(String(url)); return Response.json(snapshot); });
  try {
    await settle();
    assert.equal(harness.data.length, 1);
    assert.equal(harness.timers.size, 1);
    assert.equal([...harness.timers.values()][0].delay, 10_000);
    harness.tick(); await settle();
    assert.equal(requests.length, 2);
    assert.equal(harness.data.length, 2);
    harness.stop();
    assert.equal(harness.timers.size, 0);
    harness.focus(); await settle();
    assert.equal(requests.length, 2);
  } finally { harness.restore(); }
});

test("focus never starts overlapping requests and resumes refresh while visible", async () => {
  const response = deferred<Response>();
  let requests = 0;
  const harness = setup(async () => { requests++; return requests === 1 ? response.promise : Response.json(snapshot); });
  try {
    harness.focus(); harness.focus();
    assert.equal(requests, 1);
    response.resolve(Response.json(snapshot)); await settle();
    harness.focus(); await settle();
    assert.equal(requests, 2);
    assert.equal(harness.timers.size, 1);
  } finally { harness.restore(); }
});

test("hidden tabs cancel polling and active requests; late results cannot replace visible data", async () => {
  const late = deferred<Response>();
  const signals: AbortSignal[] = [];
  let requests = 0;
  const harness = setup(async (_url, options) => {
    requests++;
    signals.push(options!.signal!);
    return requests === 1 ? late.promise : Response.json(snapshot);
  });
  try {
    harness.hidden(true);
    assert.equal(signals[0].aborted, true);
    assert.equal(harness.timers.size, 0);
    harness.focus(); assert.equal(requests, 1);
    harness.hidden(false); await settle();
    assert.equal(requests, 2);
    assert.equal(harness.data.length, 1);
    late.resolve(Response.json({ ...snapshot, alert: { ...snapshot.alert, name: "Stale data" } })); await settle();
    assert.equal(harness.data.length, 1);
    assert.equal(harness.data[0].alert.name, "Checkout errors");
    assert.equal(harness.timers.size, 1);
  } finally { harness.restore(); }
});

test("cleanup ignores pending JSON and does not call a completed view", async () => {
  const json = deferred<AlertDetailsResponse>();
  const harness = setup(async () => ({ ok: true, json: () => json.promise }) as Response);
  try {
    await settle();
    harness.stop();
    json.resolve(snapshot); await settle();
    assert.equal(harness.data.length, 0);
    assert.equal(harness.completes(), 0);
    assert.equal(harness.timers.size, 0);
  } finally { harness.restore(); }
});

test("temporary failures leave the prior result visible and retry normally", async () => {
  let requests = 0;
  const harness = setup(async () => { requests++; return requests === 1 ? Response.json(snapshot) : new Response("Unavailable", { status: 503 }); });
  try {
    await settle(); harness.tick(); await settle();
    assert.equal(harness.data.length, 1);
    assert.deepEqual(harness.errors, ["Alert details are temporarily unavailable."]);
    assert.equal(harness.timers.size, 1);
    assert.equal(harness.completes(), 2);
  } finally { harness.restore(); }
});

test("missing and malformed detail responses have safe distinct feedback", async () => {
  const harness = setup(async () => new Response("", { status: 404 }));
  try {
    await settle();
    assert.match(harness.errors[0], /does not exist or you no longer have access/);
    assert.equal(harness.data.length, 0);
  } finally { harness.restore(); }
  const malformed = setup(async () => Response.json({ alert: null }));
  try {
    await settle();
    assert.deepEqual(malformed.errors, ["Alert details are temporarily unavailable."]);
    assert.equal(malformed.data.length, 0);
  } finally { malformed.restore(); }
});
