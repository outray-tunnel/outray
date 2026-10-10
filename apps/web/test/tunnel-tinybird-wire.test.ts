import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Tinybird = typeof import("../src/lib/tinybird");
type FetchCall = { url: URL; init: RequestInit };
const endpoints = [
  "tunnel_http_stats", "tunnel_http_chart", "tunnel_requests",
  "tunnel_protocol_stats", "tunnel_protocol_chart", "tunnel_protocol_recent",
  "tunnel_capture", "tunnel_overview_stats", "tunnel_overview_chart",
  "tunnel_admin_active_series", "tunnel_admin_http_chart",
  "tunnel_admin_active_chart", "tunnel_admin_usage",
];
const iso = "2026-10-09T12:34:56.789Z";
const canonical = "2026-10-09 12:34:56.789";
const dateTimeKeys = (endpoint: string) => ["start", "end",
  ...(endpoint === "tunnel_overview_stats" ? ["previous_start"] : []),
  ...(endpoint === "tunnel_capture" ? ["timestamp"] : []),
];

async function harness(reply: (call: FetchCall, index: number) => Response | Promise<Response>) {
  const source = await readFile(new URL("../src/lib/tinybird.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } });
  const module = { exports: {} as Tinybird };
  const calls: FetchCall[] = [];
  runInNewContext(outputText, {
    module, exports: module.exports,
    // No runtime configuration or real provider access: execute the actual HTTP
    // client with isolated synthetic credentials and a strict provider stand-in.
    process: { env: {
      TINYBIRD_API_HOST: "https://tinybird.invalid/", TINYBIRD_QUERY_TOKEN: "synthetic-test-token",
      TINYBIRD_QUERY_CACHE_TTL_MS: "30000",
    } },
    Date, AbortSignal, URLSearchParams, TextDecoder, Uint8Array, JSON,
    fetch: async (url: string, init: RequestInit) => {
      const call = { url: new URL(url), init };
      calls.push(call);
      return reply(call, calls.length);
    },
  });
  return { query: module.exports.queryTinybird, calls };
}

test("HTTP adapter coverage exactly matches the deployed tunnel DateTime64 definitions", async () => {
  const directory = new URL("../../../tinybird/endpoints/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.startsWith("tunnel_") && name.endsWith(".pipe"));
  const declared: Record<string, string[]> = {};
  for (const file of files) {
    const source = await readFile(new URL(file, directory), "utf8");
    declared[file.replace(/\.pipe$/, "")] = [...new Set(
      [...source.matchAll(/\{\{DateTime64\((\w+)\)\}\}/g)].map((match) => match[1]),
    )].sort();
  }
  assert.deepEqual(Object.keys(declared).sort(), [...endpoints].sort());
  for (const endpoint of endpoints) assert.deepEqual(declared[endpoint], dateTimeKeys(endpoint).sort());
});

for (const endpoint of endpoints) {
  test(`${endpoint} sends UTC SQL DateTime64 values over HTTP, preserving milliseconds and caller input`, async () => {
    const f = await harness(({ url }) => {
      // This stand-in refuses the ISO wire format that made live queries fail,
      // rather than stubbing queryTinybird and overlooking serialization.
      const valid = dateTimeKeys(endpoint).every((key) => url.searchParams.get(key) === canonical);
      return valid ? Response.json({ data: [{ ok: true }] }) : new Response("Invalid DateTime64", { status: 400 });
    });
    const input = Object.freeze({
      organization_id: "2026-10-09T12:34:56.789Z",
      tunnel_ids: '["2026-10-09T12:34:56.789Z","with & spaces"]',
      search: "%checkout% & quoted",
      limit: 50, include_errors: true,
      ...Object.fromEntries(dateTimeKeys(endpoint).map((key) => [key, iso])),
    });
    assert.deepEqual(await f.query(endpoint, input), [{ ok: true }]);
    assert.equal(f.calls.length, 1);
    const { url, init } = f.calls[0];
    assert.equal(url.pathname, `/v0/pipes/${endpoint}.json`);
    for (const key of dateTimeKeys(endpoint)) {
      assert.equal(url.searchParams.get(key), canonical);
      assert.equal(input[key as keyof typeof input], iso);
    }
    for (const key of ["organization_id", "tunnel_ids", "search", "limit", "include_errors"] as const) {
      assert.equal(url.searchParams.get(key), String(input[key]));
    }
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer synthetic-test-token");
    assert.equal(init.cache, "no-store");
  });
}

test("ISO offsets cross day boundaries correctly and retain UTC milliseconds", async () => {
  const f = await harness(() => Response.json({ data: [] }));
  await f.query("tunnel_overview_stats", {
    start: "2026-10-09T00:34:56.789+01:30",
    end: "2026-10-09T23:34:56.123-02:00",
    previous_start: "2026-10-07T00:00:00+00:00",
  });
  const query = f.calls[0].url.searchParams;
  assert.equal(query.get("start"), "2026-10-08 23:04:56.789");
  assert.equal(query.get("end"), "2026-10-10 01:34:56.123");
  assert.equal(query.get("previous_start"), "2026-10-07 00:00:00.000");
});

test("ISO fractional precision normalizes to the pipe's milliseconds without changing the instant", async () => {
  const f = await harness(() => Response.json({ data: [] }));
  for (const [fraction, expected] of [["", "000"], [".1", "100"], [".12", "120"], [".123456789", "123"]]) {
    await f.query("tunnel_http_stats", { start: `2024-02-29T12:34:56${fraction}Z` });
    assert.equal(f.calls.at(-1)!.url.searchParams.get("start"), `2024-02-29 12:34:56.${expected}`);
  }
});

test("canonical timestamps remain byte-stable while empty and undefined parameters remain omitted", async () => {
  const f = await harness(() => Response.json({ data: [] }));
  await f.query("tunnel_capture", { start: canonical, end: "", timestamp: undefined, request_id: "" });
  const query = f.calls[0].url.searchParams;
  assert.equal(query.get("start"), canonical);
  assert.equal(query.has("end"), false);
  assert.equal(query.has("timestamp"), false);
  assert.equal(query.has("request_id"), false);
});

test("only exact endpoint and parameter allowlists receive timestamp conversion", async () => {
  const f = await harness(() => Response.json({ data: [] }));
  const input = { start: iso, end: iso, timestamp: iso, previous_start: iso, search: iso };
  for (const endpoint of ["trace_stats", "logs", "metric_series", "tunnel_custom", "prefix_tunnel_overview_stats"]) {
    await f.query(endpoint, input);
    assert.deepEqual(Object.fromEntries(f.calls.at(-1)!.url.searchParams), input);
  }
  await f.query("tunnel_http_stats", input);
  const query = f.calls.at(-1)!.url.searchParams;
  assert.equal(query.get("start"), canonical);
  assert.equal(query.get("end"), canonical);
  for (const key of ["timestamp", "previous_start", "search"]) assert.equal(query.get(key), iso);
});

test("malformed zoned ISO parameters fail safely before an HTTP request", async () => {
  const f = await harness(() => Response.json({ data: [] }));
  for (const start of [
    "2026-10-09T12:34:56", "2026-10-09T12:34:56.789Zextra",
    "2026-02-30T12:34:56.789Z", "2025-02-29T12:34:56.789+01:00",
    "2026-10-09T12:34:56.789+25:00",
  ]) {
    await assert.rejects(f.query("tunnel_overview_stats", { start }), { message: "Invalid Tinybird datetime parameter" });
  }
  assert.equal(f.calls.length, 0);
});

test("ISO and canonical forms deduplicate one in-flight and cached dashboard query", async () => {
  let release!: (response: Response) => void;
  const f = await harness(() => new Promise<Response>((resolve) => { release = resolve; }));
  const isoInput = { organization_id: "org-a", start: iso, end: iso };
  const canonicalInput = { end: canonical, organization_id: "org-a", start: canonical };
  const first = f.query("tunnel_requests", isoInput);
  const second = f.query("tunnel_requests", canonicalInput);
  assert.equal(f.calls.length, 1);
  release(Response.json({ data: [{ cached: true }] }));
  assert.deepEqual(await first, [{ cached: true }]);
  assert.deepEqual(await second, [{ cached: true }]);
  assert.deepEqual(await f.query("tunnel_requests", canonicalInput), [{ cached: true }]);
  assert.equal(f.calls.length, 1);
  assert.equal(isoInput.start, iso);
});

test("no-store capture requests still bypass dashboard cache with normalized wire timestamps", async () => {
  const f = await harness(({ url }, index) => {
    assert.equal(url.searchParams.get("timestamp"), canonical);
    return Response.json({ data: [{ version: index }] });
  });
  const input = { start: iso, end: iso, timestamp: iso, organization_id: "org-a" };
  assert.deepEqual(await f.query("tunnel_capture", input), [{ version: 1 }]);
  assert.deepEqual(await f.query("tunnel_capture", input, { cache: "no-store" }), [{ version: 2 }]);
  assert.deepEqual(await f.query("tunnel_capture", input, { cache: "no-store" }), [{ version: 3 }]);
  assert.deepEqual(await f.query("tunnel_capture", input), [{ version: 1 }]);
  assert.equal(f.calls.length, 3);
});
