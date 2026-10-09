import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Tinybird = typeof import("../src/lib/tinybird");
type FetchCall = { url: URL; init: RequestInit };
const scope = { organization_id: "synthetic-org-a", service: "checkout" };
const endpoint = "request_details";
const maximum = 1_048_576;

async function harness(reply: (call: FetchCall, index: number) => Response | Promise<Response>) {
  const source = await readFile(new URL("../src/lib/tinybird.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } });
  const module = { exports: {} as Tinybird };
  const calls: FetchCall[] = [];
  let now = 1_000;
  class Clock extends Date { static now() { return now; } }
  runInNewContext(outputText, {
    module, exports: module.exports,
    // The actual source executes with an isolated cache and synthetic config, never the user's env.
    process: { env: {
      TINYBIRD_API_HOST: "https://tinybird.invalid/", TINYBIRD_QUERY_TOKEN: "synthetic-test-token",
      TINYBIRD_QUERY_CACHE_TTL_MS: "30000",
    } },
    Date: Clock, AbortSignal, URLSearchParams, TextDecoder, Uint8Array, JSON,
    fetch: async (url: string, init: RequestInit) => {
      const call = { url: new URL(url), init };
      calls.push(call);
      return reply(call, calls.length);
    },
  });
  return { query: module.exports.queryTinybird, calls, advance(milliseconds: number) { now += milliseconds; } };
}
function body(data: unknown) { return Response.json({ data }); }
function nextTurn() { return new Promise<void>((resolve) => setImmediate(resolve)); }

test("no-store bypasses a cached dashboard result without replacing or reusing it", async () => {
  const f = await harness((_call, index) => body([{ version: index }]));
  assert.deepEqual(await f.query(endpoint, scope), [{ version: 1 }]);
  assert.deepEqual(await f.query(endpoint, scope, { cache: "no-store" }), [{ version: 2 }]);
  assert.deepEqual(await f.query(endpoint, scope), [{ version: 1 }]);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(await f.query(endpoint, scope, { cache: "no-store" }), [{ version: 3 }]);
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[1].init.cache, "no-store");
  assert.equal(new Headers(f.calls[1].init.headers).get("authorization"), "Bearer synthetic-test-token");
  assert.equal(f.calls[1].url.host, "tinybird.invalid");
});

test("no-store does not populate an empty dashboard cache", async () => {
  const f = await harness((_call, index) => body([{ version: index }]));
  assert.deepEqual(await f.query(endpoint, scope, { cache: "no-store" }), [{ version: 1 }]);
  assert.deepEqual(await f.query(endpoint, scope), [{ version: 2 }]);
  assert.deepEqual(await f.query(endpoint, scope), [{ version: 2 }]);
  assert.equal(f.calls.length, 2);
});

test("no-store HTTP and network failures reject instead of returning cached or stale evidence", async () => {
  const f = await harness((_call, index) => {
    if (index === 1) return body([{ version: "old" }]);
    if (index === 2) return new Response("Evidence temporarily unavailable", { status: 503 });
    throw new Error("Synthetic network failure");
  });
  await f.query(endpoint, scope);
  f.advance(30_001);
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), { message: "Tinybird query failed (503)" });
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), /Synthetic network failure/);
  assert.equal(f.calls.length, 3);
});

test("no-store cancels an oversized HTTP error body without reading it or exposing its details", async (t) => {
  let cancelled = false;
  let reads = 0;
  let textReads = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads += 1;
      controller.enqueue(new Uint8Array(maximum + 1));
      controller.close();
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const response = new Response(stream, { status: 503 });
  t.mock.method(response, "text", async () => { textReads += 1; return "Synthetic private provider error details"; });
  const f = await harness(() => response);
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), { message: "Tinybird query failed (503)" });
  assert.equal(cancelled, true);
  assert.equal(reads, 0);
  assert.equal(textReads, 0);
  assert.equal(stream.locked, false);
});

test("a no-store caller abort propagates through the composed fetch signal", async () => {
  const controller = new AbortController();
  const reason = new Error("Synthetic caller cancellation");
  const f = await harness(({ init }) => new Promise<Response>((_resolve, reject) => {
    assert.ok(init.signal);
    if (init.signal.aborted) reject(init.signal.reason);
    else init.signal.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  }));
  const pending = f.query(endpoint, scope, { cache: "no-store", signal: controller.signal });
  const rejection = assert.rejects(pending, /Synthetic caller cancellation/);
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
  assert.notStrictEqual(f.calls[0].init.signal, controller.signal);
  assert.equal(f.calls[0].init.signal!.aborted, false);
  controller.abort(reason);
  await rejection;
  assert.equal(f.calls[0].init.signal!.aborted, true);
  assert.strictEqual(f.calls[0].init.signal!.reason, reason);
});

test("no-store rejects malformed JSON while retaining no successful cache entry", async () => {
  const f = await harness((_call, index) => index === 1 ? new Response("{broken-json") : body([{ valid: true }]));
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), SyntaxError);
  assert.deepEqual(await f.query(endpoint, scope), [{ valid: true }]);
  assert.equal(f.calls.length, 2);
});

for (const payload of [null, {}, { data: null }, { data: {} }, { data: "not-an-array" }]) {
  test(`no-store rejects malformed data shape ${JSON.stringify(payload)}`, async () => {
    const f = await harness(() => Response.json(payload));
    await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), /Malformed Tinybird evidence response/);
  });
}

test("no-store distinguishes a legitimate empty data array from an absent body", async () => {
  const f = await harness((_call, index) => index === 1 ? body([]) : new Response(null));
  assert.deepEqual(await f.query(endpoint, scope, { cache: "no-store" }), []);
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), /Malformed Tinybird evidence response/);
});

test("no-store stops reading oversized evidence, cancels upstream and releases the reader", async () => {
  let cancelled = false;
  let produced = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { produced += 1; controller.enqueue(new Uint8Array(maximum / 2 + 1)); },
    cancel() { cancelled = true; },
  });
  const f = await harness(() => new Response(stream));
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), /Tinybird evidence response is too large/);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
  assert.ok(produced <= 3, "reading stops at the size limit, allowing one prefetched chunk");
});

test("no-store permits exactly 1 MiB of valid JSON and releases the reader", async () => {
  const prefix = '{"data":[{"withinBound":true}],"padding":"';
  const suffix = '"}';
  const payload = prefix + "x".repeat(maximum - prefix.length - suffix.length) + suffix;
  assert.equal(new TextEncoder().encode(payload).byteLength, maximum);
  const response = new Response(payload);
  const f = await harness(() => response);
  assert.deepEqual(await f.query(endpoint, scope, { cache: "no-store" }), [{ withinBound: true }]);
  assert.equal(response.body!.locked, false);
});

test("capture no-store queries can request up to 4 MiB without caching a missing result", async () => {
  const prefix = '{"data":[{"largeCapture":true}],"padding":"';
  const suffix = '"}';
  const payload = prefix + "x".repeat(2 * maximum - prefix.length - suffix.length) + suffix;
  const f = await harness((_call, index) => index === 1 ? body([]) : new Response(payload));
  assert.deepEqual(await f.query("tunnel_capture", scope, { cache: "no-store", maximumResponseBytes: 4 * maximum }), []);
  assert.deepEqual(await f.query("tunnel_capture", scope, { cache: "no-store", maximumResponseBytes: 4 * maximum }), [{ largeCapture: true }]);
  assert.equal(f.calls.length, 2);
});

test("no-store response bounds clamp excessive limits and default invalid limits safely", async () => {
  for (const maximumResponseBytes of [0, -1, NaN, Infinity, 1.5]) {
    const f = await harness(() => new Response("x".repeat(maximum + 1)));
    await assert.rejects(f.query(endpoint, scope, { cache: "no-store", maximumResponseBytes }), /response is too large/);
  }
  const f = await harness(() => new Response("x".repeat(4 * maximum + 1)));
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store", maximumResponseBytes: Number.MAX_SAFE_INTEGER }), /response is too large/);
});

test("no-store releases its reader after a stream transport failure", async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error("Synthetic stream failure")); },
  });
  const f = await harness(() => new Response(stream));
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), /Synthetic stream failure/);
  assert.equal(stream.locked, false);
});

test("ordinary dashboard reads still cache and deduplicate simultaneous queries with reordered parameters", async () => {
  let release!: (value: Response) => void;
  const f = await harness(() => new Promise<Response>((resolve) => { release = resolve; }));
  const first = f.query(endpoint, scope);
  const second = f.query(endpoint, { service: scope.service, organization_id: scope.organization_id });
  assert.equal(f.calls.length, 1);
  release(body([{ cached: true }]));
  assert.deepEqual(await first, [{ cached: true }]);
  assert.deepEqual(await second, [{ cached: true }]);
  assert.deepEqual(await f.query(endpoint, scope), [{ cached: true }]);
  assert.equal(f.calls.length, 1);
});

test("ordinary dashboard stale-while-refresh keeps stale rows and performs one background refresh", async () => {
  let release!: (value: Response) => void;
  const f = await harness((_call, index) => index === 1 ? body([{ version: "old" }])
    : new Promise<Response>((resolve) => { release = resolve; }));
  await f.query(endpoint, scope);
  f.advance(30_001);
  assert.deepEqual(await f.query(endpoint, scope), [{ version: "old" }]);
  assert.deepEqual(await f.query(endpoint, scope), [{ version: "old" }]);
  assert.equal(f.calls.length, 2);
  release(body([{ version: "fresh" }]));
  await nextTurn();
  assert.deepEqual(await f.query(endpoint, scope), [{ version: "fresh" }]);
  assert.equal(f.calls.length, 2);
});

test("ordinary dashboard refresh failures still retain stale rows and initial failures do not poison cache", async () => {
  const f = await harness((_call, index) => index === 1 ? body([{ version: "old" }])
    : new Response("Synthetic unavailable", { status: 503 }));
  await f.query(endpoint, scope);
  f.advance(30_001);
  assert.deepEqual(await f.query(endpoint, scope), [{ version: "old" }]);
  await nextTurn();
  assert.deepEqual(await f.query(endpoint, scope), [{ version: "old" }]);
  assert.equal(f.calls.length, 2);

  const fresh = await harness((_call, index) => index === 1 ? new Response("Synthetic failure", { status: 500 }) : body([{ retried: true }]));
  await assert.rejects(fresh.query(endpoint, scope), /Tinybird query failed \(500\)/);
  assert.deepEqual(await fresh.query(endpoint, scope), [{ retried: true }]);
  assert.equal(fresh.calls.length, 2);
});

test("ordinary dashboard optional-data behavior is unchanged while no-store validation is strict", async () => {
  const f = await harness(() => Response.json({ rows: 0 }));
  const rows = await f.query(endpoint, scope);
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length, 0);
  await assert.rejects(f.query(endpoint, scope, { cache: "no-store" }), /Malformed Tinybird evidence response/);
  assert.equal(f.calls.length, 2);
});

test("organization parameters isolate dashboard caches and fresh agent evidence requests", async () => {
  const f = await harness(({ url }, index) => body([{ organization: url.searchParams.get("organization_id"), version: index }]));
  const other = { ...scope, organization_id: "synthetic-org-b" };
  assert.deepEqual(await f.query(endpoint, scope), [{ organization: scope.organization_id, version: 1 }]);
  assert.deepEqual(await f.query(endpoint, other), [{ organization: other.organization_id, version: 2 }]);
  assert.deepEqual(await f.query(endpoint, scope), [{ organization: scope.organization_id, version: 1 }]);
  assert.deepEqual(await f.query(endpoint, other, { cache: "no-store" }), [{ organization: other.organization_id, version: 3 }]);
  assert.deepEqual(await f.query(endpoint, scope, { cache: "no-store" }), [{ organization: scope.organization_id, version: 4 }]);
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls.every((call) => call.url.searchParams.get("organization_id") === scope.organization_id
    || call.url.searchParams.get("organization_id") === other.organization_id));
});
