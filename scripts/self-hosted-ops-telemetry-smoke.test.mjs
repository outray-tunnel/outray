import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialEnvironment } from "./self-hosted.mjs";
import { opsTinybirdHost } from "./self-hosted-config-tinybird.mjs";
import { tokenConfiguration, tokenEndpoint } from "./self-hosted-observability-token.mjs";
import { runSmoke, smokeArguments, smokeOrganization, smokePayloads, smokeQueries, verifySmokeRows } from "./self-hosted-ops-telemetry-smoke.mjs";

const apiKey = `outray_${"K".repeat(43)}`, queryToken = "read_fixture_token_must_not_escape";
const payload = () => smokePayloads({ traceId: "a".repeat(32), spanId: "b".repeat(16), nonce: "c".repeat(16), now: 1791648000000 });
const rows = (p) => ({
  traces: { data: [{ trace_id: p.traceId, span_id: p.spanId, service: p.service }] },
  logs: { data: [{ trace_id: p.traceId, span_id: p.spanId, service: p.service, message: "OutRay Ops synthetic telemetry verification", id: "d".repeat(64) }] },
  metrics: { data: [{ count: 1, value: 7, type: "gauge" }] },
  requests: { data: [{ trace_id: p.traceId, span_id: p.spanId, service: p.service, method: "GET", status_code: 200 }] },
});
async function privateFixture(callback) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "outray-ops-smoke-test-"))), file = join(directory, "instance.env"), integration = join(directory, "outray-web-observability.env");
  const source = initialEnvironment("ops.outray.dev", "owner@example.net")
    .replace(/^TINYBIRD_API_HOST=.*$/m, `TINYBIRD_API_HOST=${opsTinybirdHost}`)
    .replace(/^TINYBIRD_QUERY_TOKEN=.*$/m, `TINYBIRD_QUERY_TOKEN=${queryToken}`)
    .replace(/^TINYBIRD_INGEST_TOKEN=.*$/m, "TINYBIRD_INGEST_TOKEN=append_other_fixture_token_no_read");
  writeFileSync(file, source, { mode: 0o600 });
  writeFileSync(integration, Object.entries(tokenConfiguration(apiKey)).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
  try { await callback({ file, integration }); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("smoke accepts only an explicit private instance file and creates minimal correlated records", () => {
  assert.equal(smokeArguments(["--file", "/private/instance.env"]).integration, "/private/outray-web-observability.env");
  for (const args of [[], ["--file", ".env.prod"], ["--file", "instance.env", "--token", apiKey]]) assert.throws(() => smokeArguments(args));
  const p = payload(), span = p.trace.resourceSpans[0].scopeSpans[0].spans[0], log = p.logs.resourceLogs[0].scopeLogs[0].logRecords[0];
  assert.equal(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano), 12_000_000n); assert.equal(log.traceId, span.traceId);
  assert.equal(p.metrics.resourceMetrics[0].scopeMetrics[0].metrics[0].gauge.dataPoints[0].asInt, "7");
  assert.ok(!JSON.stringify(p).includes(apiKey)); assert.ok(!JSON.stringify(p).includes(queryToken));
});

test("queries use exact own org and correlated identifiers with scoped known READ pipes", () => {
  const p = payload(), queries = smokeQueries(p);
  for (const url of Object.values(queries)) { assert.equal(url.origin, opsTinybirdHost); assert.equal(url.searchParams.get("organization_id"), smokeOrganization); assert.equal(url.username, ""); assert.equal(url.searchParams.get("token"), null); }
  assert.equal(queries.traces.searchParams.get("trace_id"), p.traceId); assert.equal(queries.logs.searchParams.get("service"), p.service);
  assert.equal(queries.metrics.searchParams.get("metric_name"), p.metricName); assert.equal(queries.requests.searchParams.get("search"), p.traceId);
  for (const [pipe, keys] of [["trace_details", ["organization_id", "trace_id"]], ["logs", ["organization_id", "service", "trace_id"]], ["metric_series", ["organization_id", "metric_name", "service"]], ["http_requests", ["organization_id", "service", "search"]]]) {
    const contents = readFileSync(new URL(`../tinybird/endpoints/${pipe}.pipe`, import.meta.url), "utf8");
    for (const key of keys) assert.ok(contents.includes(`String(${key}`));
  }
});

test("proof fails closed on missing, duplicate, wrong-service, invalid IDs or mismatched values", () => {
  const p = payload(); assert.equal(verifySmokeRows(p, rows(p)).success, true);
  assert.equal(verifySmokeRows(p, { ...rows(p), logs: { data: [] } }), null);
  for (const transform of [
    (r) => { r.traces.data[0].trace_id = "wrong"; }, (r) => { r.logs.data[0].service = "foreign"; },
    (r) => { r.logs.data[0].id = "invalid"; }, (r) => { r.metrics.data[0].value = 0; },
    (r) => { r.requests.data[0].status_code = 500; }, (r) => { r.logs.data.push(r.logs.data[0]); },
  ]) { const r = rows(p); transform(r); assert.throws(() => verifySmokeRows(p, r), /diagnostics suppressed/); }
});

test("full smoke verifies boundaries, accepts exactly three records and polls only the known workspace", async () => {
  await privateFixture(async ({ file }) => {
    const calls = [], published = {}, printed = []; let p, queries = 0;
    const fetch = async (input, options) => {
      const url = new URL(input); calls.push({ url, options }); assert.equal(options.redirect, "error"); assert.ok(options.signal);
      if (url.origin === tokenEndpoint) {
        if (url.pathname === "/not-a-telemetry-route") return new Response("", { status: 404 });
        if (!options.headers.Authorization) return new Response("", { status: 401 });
        assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
        const body = JSON.parse(options.body); published[url.pathname] = body;
        if (url.pathname === "/v1/traces") {
          const span = body.resourceSpans[0].scopeSpans[0].spans[0], service = body.resourceSpans[0].resource.attributes[0].value.stringValue;
          p = { traceId: span.traceId, spanId: span.spanId, service, metricName: `outray.ops.smoke.${service.split("-").at(-1)}` };
        }
        return Response.json({});
      }
      assert.equal(url.origin, opsTinybirdHost); assert.equal(options.headers.Authorization, `Bearer ${queryToken}`);
      assert.equal(url.searchParams.get("organization_id"), smokeOrganization); queries++;
      const signal = { "/v0/pipes/trace_details.json": "traces", "/v0/pipes/logs.json": "logs", "/v0/pipes/metric_series.json": "metrics", "/v0/pipes/http_requests.json": "requests" }[url.pathname]; assert.ok(signal);
      return Response.json(queries <= 4 ? { data: [] } : rows(p)[signal]);
    };
    const log = console.log; console.log = (message) => printed.push(message);
    let result;
    try { result = await runSmoke(["--file", file], { fetch, delay: async () => {} }); } finally { console.log = log; }
    assert.equal(result.success, true); assert.equal(Object.keys(published).length, 3); assert.equal(queries, 8);
    assert.equal(printed.length, 1); assert.ok(!printed[0].includes(apiKey)); assert.ok(!printed[0].includes(queryToken));
    assert.equal(calls.filter((call) => call.options.method === "POST" && call.options.headers.Authorization).length, 3);
  });
});

test("bad auth boundary cannot publish and partial-success responses cannot claim delivery", async () => {
  await privateFixture(async ({ file }) => {
    for (const mode of ["bad-boundary", "partial", "upstream-error"]) {
      let writes = 0, queries = 0;
      const fetch = async (url, options) => {
        if (new URL(url).origin === opsTinybirdHost) { queries++; return Response.json({ data: [] }); }
        if (new URL(url).pathname === "/not-a-telemetry-route") return new Response("", { status: 404 });
        if (!options.headers?.Authorization) return new Response("", { status: mode === "bad-boundary" ? 200 : 401 });
        writes++;
        if (mode === "upstream-error") throw new Error(`Sensitive ${apiKey}`);
        return Response.json({ partialSuccess: { rejectedSpans: 1 } });
      };
      await assert.rejects(runSmoke(["--file", file], { fetch }), (error) => error.message.includes("diagnostics suppressed") && !error.message.includes(apiKey));
      if (mode === "bad-boundary") assert.equal(writes, 0);
      assert.equal(queries, 0);
    }
  });
});

test("private config permissions and exact independent endpoint are enforced before any HTTP call", async () => {
  await privateFixture(async ({ file, integration }) => {
    const fetch = async () => assert.fail("HTTP must not be called");
    chmodSync(integration, 0o644); await assert.rejects(runSmoke(["--file", file], { fetch })); chmodSync(integration, 0o600);
    writeFileSync(integration, readFileSync(integration, "utf8").replace(tokenEndpoint, "https://ingest.outray.dev"));
    await assert.rejects(runSmoke(["--file", file], { fetch }));
  });
});
