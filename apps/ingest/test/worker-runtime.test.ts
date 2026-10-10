import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { build } from "esbuild";
import {
  convertV4MiniflareOptions,
  Miniflare,
  NoOpLog,
  Response as MockResponse,
} from "miniflare";

async function waitFor(check: () => boolean, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= end)
      throw new Error("Timed out waiting for local Queue delivery");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function traces(eventName = "test event") {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "runtime-service" } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: "a".repeat(32),
                spanId: "b".repeat(16),
                name: "runtime operation",
                kind: 2,
                startTimeUnixNano: "1791633600000000000",
                endTimeUnixNano: "1791633600100000000",
                attributes: [
                  {
                    key: "authorization",
                    value: { stringValue: "SENSITIVE_RUNTIME_VALUE" },
                  },
                ],
                events: [
                  {
                    name: eventName,
                    timeUnixNano: "1791633600050000000",
                    attributes: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

async function runtime(options: { failFirst?: boolean } = {}) {
  const bundle = await build({
    entryPoints: [
      fileURLToPath(new URL("./fixtures/worker-runtime.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
    external: ["cloudflare:*"],
    banner: {
      js: 'import { createRequire as runtimeCreateRequire } from "node:module"; const require = runtimeCreateRequire("/runtime-worker.js");',
    },
  });
  const committed: Record<string, unknown>[][] = [];
  const observed: { url: string; authorization: string | null }[] = [];
  let downstreamCalls = 0;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      log: new NoOpLog(),
      modules: true,
      script: bundle.outputFiles[0]!.text,
      compatibilityDate: "2026-10-10",
      compatibilityFlags: ["nodejs_compat"],
      bindings: {
        TINYBIRD_API_HOST: "https://runtime-tinybird.invalid",
        TINYBIRD_INGEST_TOKEN: "runtime-private-token",
      },
      queueProducers: { OTLP_QUEUE: "runtime-otlp" },
      queueConsumers: {
        "runtime-otlp": { maxBatchSize: 1, maxBatchTimeout: 0, maxRetries: 2 },
      },
      r2Buckets: { OTLP_OVERFLOW: "runtime-overflow" },
      durableObjects: {
        ORG_RATE_LIMITER: {
          className: "OrganizationRateLimiter",
          useSQLite: true,
        },
      },
      async outboundService(request) {
        assert.equal(
          new URL(request.url).hostname,
          "runtime-tinybird.invalid",
          "no real outbound requests permitted",
        );
        downstreamCalls += 1;
        observed.push({
          url: request.url,
          authorization: request.headers.get("authorization"),
        });
        const rows = (await request.text())
          .split("\n")
          .map((line) => JSON.parse(line));
        if (options.failFirst && downstreamCalls === 1)
          return new MockResponse("temporary failure", { status: 503 });
        committed.push(rows);
        return MockResponse.json({
          successful_rows: rows.length,
          quarantined_rows: 0,
        });
      },
    }),
  );
  try {
    await mf.ready;
  } catch (error) {
    await mf.dispose();
    throw error;
  }
  return {
    mf,
    committed,
    observed,
    get downstreamCalls() {
      return downstreamCalls;
    },
  };
}

test(
  "real workerd JSON/gzip HTTP → Queue → Tinybird delivery preserves tenant and redaction",
  { timeout: 30_000 },
  async () => {
    const f = await runtime();
    try {
      const health = await f.mf.dispatchFetch("http://runtime.test/health");
      assert.equal(health.status, 200);
      const unauthorized = await f.mf.dispatchFetch(
        "http://runtime.test/v1/traces",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(traces()),
        },
      );
      assert.equal(unauthorized.status, 401);
      assert.equal(f.downstreamCalls, 0);
      const result = await f.mf.dispatchFetch("http://runtime.test/v1/traces", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
          authorization: "Bearer outray_test_runtime",
        },
        body: gzipSync(JSON.stringify(traces())),
      });
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), {});
      await waitFor(() => f.committed.length === 1);
      const [row] = f.committed[0]!;
      assert.equal(row!.organization_id, "org_runtime");
      assert.equal(row!.service_name, "runtime-service");
      assert.equal(row!.trace_id, "a".repeat(32));
      assert.equal(row!.span_id, "b".repeat(16));
      assert.deepEqual(row!.span_attributes, { authorization: "[REDACTED]" });
      assert.equal(
        f.observed[0]!.authorization,
        "Bearer runtime-private-token",
      );
      assert.match(f.observed[0]!.url, /name=otel_spans&wait=true/);
      const bucket = await f.mf.getR2Bucket("OTLP_OVERFLOW");
      assert.equal((await bucket.list()).objects.length, 0);
    } finally {
      await f.mf.dispose();
    }
  },
);

test(
  "real workerd uses R2 for large normalized rows and keeps the object after confirmed delivery",
  { timeout: 30_000 },
  async () => {
    const f = await runtime();
    try {
      const result = await f.mf.dispatchFetch(
        "http://runtime.test/api/otlp/v1/traces",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-outray-api-key": "outray_test_runtime",
          },
          body: JSON.stringify(traces("x".repeat(150_000))),
        },
      );
      assert.equal(result.status, 200);
      await waitFor(() => f.committed.length === 1);
      assert.ok(String(f.committed[0]![0]!.events).length > 124_000);
      const bucket = await f.mf.getR2Bucket("OTLP_OVERFLOW");
      const objects = await bucket.list({
        prefix: "otlp-overflow/v1/org_runtime/traces/",
      });
      assert.equal(objects.objects.length, 1);
      const retained = await bucket.get(objects.objects[0]!.key);
      const payload = JSON.parse(await retained!.text());
      assert.equal(payload.organizationId, "org_runtime");
      assert.deepEqual(payload.rows[0].span_attributes, {
        authorization: "[REDACTED]",
      });
      assert.doesNotMatch(
        JSON.stringify(payload),
        /SENSITIVE_RUNTIME_VALUE|runtime-private-token|outray_test_runtime/,
      );
    } finally {
      await f.mf.dispose();
    }
  },
);

test(
  "real Queue runtime retries downstream failure before acknowledging the message",
  { timeout: 30_000 },
  async () => {
    const f = await runtime({ failFirst: true });
    try {
      const result = await f.mf.dispatchFetch("http://runtime.test/v1/traces", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer outray_test_runtime",
        },
        body: JSON.stringify(traces()),
      });
      assert.equal(result.status, 200);
      await waitFor(() => f.committed.length === 1);
      assert.equal(f.downstreamCalls, 2);
      assert.equal(f.committed[0]![0]!.organization_id, "org_runtime");
    } finally {
      await f.mf.dispose();
    }
  },
);

test(
  "real Durable Object RPC enforces the per-organization limit for concurrent requests",
  { timeout: 30_000 },
  async () => {
    const f = await runtime();
    try {
      const results = await Promise.all(
        Array.from({ length: 625 }, async () => {
          const response = await f.mf.dispatchFetch(
            "http://runtime.test/test-rate-limit?org=org-concurrent",
          );
          assert.equal(response.status, 200);
          return (await response.json()) as {
            allowed: boolean;
            minute: number;
          };
        }),
      );
      const minutes = new Map<number, { allowed: number; denied: number }>();
      for (const result of results) {
        const counts = minutes.get(result.minute) ?? { allowed: 0, denied: 0 };
        if (result.allowed) counts.allowed += 1;
        else counts.denied += 1;
        minutes.set(result.minute, counts);
      }
      for (const counts of minutes.values()) assert.ok(counts.allowed <= 600);
      // A run spanning a clock-minute boundary correctly gets a fresh window.
      if (minutes.size === 1) {
        assert.equal(results.filter((result) => result.allowed).length, 600);
        assert.equal(results.filter((result) => !result.allowed).length, 25);
      }
      const independent = await f.mf.dispatchFetch(
        "http://runtime.test/test-rate-limit?org=org-independent",
      );
      assert.equal(
        ((await independent.json()) as { allowed: boolean }).allowed,
        true,
      );
      assert.equal(f.downstreamCalls, 0);
    } finally {
      await f.mf.dispose();
    }
  },
);
