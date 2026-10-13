import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { context, metrics, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, type ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { LogRecord } from "@opentelemetry/api-logs";
import { instrumentTanStackRequest } from "../../../packages/tanstack-start/src/index";
import { captureConsoleLogs, type OutrayConsoleTarget } from "../../../packages/observability/src/logging";
import {
  resolveInternalObservabilityOptions,
  resolveInternalObservabilityRoute,
  runWithInternalObservabilityRequest,
} from "../src/lib/internal-observability.server";

const spans = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] });
const contextManager = new AsyncLocalStorageContextManager();
const metricExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
const meterProvider = new MeterProvider({ readers: [new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 60_000 })] });
const options = resolveInternalObservabilityOptions({
  OUTRAY_INTERNAL_OBSERVABILITY_API_KEY: "synthetic-capture-test",
  OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT: "https://ingest.ops.example.test",
})!;

before(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(provider);
  metrics.setGlobalMeterProvider(meterProvider);
});
beforeEach(() => { spans.reset(); metricExporter.reset(); });
after(async () => {
  await Promise.all([provider.shutdown(), meterProvider.shutdown()]);
  contextManager.disable();
  context.disable();
  trace.disable();
  metrics.disable();
});

function capturedConsole() {
  const records: LogRecord[] = [], localCalls: unknown[][] = [];
  const write = (...args: unknown[]) => { localCalls.push(args); };
  const target: OutrayConsoleTarget = { debug: write, error: write, info: write, log: write, warn: write };
  const restore = captureConsoleLogs({ emit(record) { records.push(record); } }, target, options.shouldCaptureLog);
  return { records, localCalls, target, restore };
}

/** Exported span data, not the in-memory processor's circular SDK internals. */
function exportedSpan(span: ReadableSpan) {
  return { name: span.name, kind: span.kind, attributes: span.attributes, events: span.events, status: span.status,
    links: span.links, duration: span.duration, resource: span.resource.attributes };
}

test("internal capture keeps useful JSON payloads and logs while redacting credentials and opaque nested captures", async () => {
  const logs = capturedConsole();
  const request = new Request("https://app.example.test/api/acme/uptime/monitors?token=private-query", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer private-header", cookie: "session=private-cookie" },
    body: JSON.stringify({ name: "Checkout", url: "https://example.test/health", password: "private-password", body: '{"token":"private-opaque"}' }),
  });
  const response = Response.json({ ok: true, apiKey: "private-response-key" }, { status: 201, headers: {
    "set-cookie": "session=private-response-cookie", location: "https://example.test/callback?code=private-redirect-code",
  } });
  try {
    const result = await runWithInternalObservabilityRequest(request, () => instrumentTanStackRequest({
      request,
      next: async () => {
        assert.equal((await request.json()).name, "Checkout", "capture must not consume the application's body");
        logs.target.info("monitor created", { name: "Checkout", accessToken: "private-log-token" });
        return response;
      },
    }, options));
    assert.equal(result, response);
    assert.equal((await result.json()).apiKey, "private-response-key", "redaction must not change the application response");
    const [span] = spans.getFinishedSpans();
    assert.ok(span);
    const requestBody = JSON.parse(String(span.attributes["outray.http.request.body"]));
    const responseBody = JSON.parse(String(span.attributes["outray.http.response.body"]));
    assert.equal(requestBody.name, "Checkout");
    assert.equal(requestBody.password, "[REDACTED]");
    assert.equal(requestBody.body, "[REDACTED]");
    assert.equal(responseBody.ok, true);
    assert.equal(responseBody.apiKey, "[REDACTED]");
    assert.equal(JSON.parse(String(span.attributes["outray.http.response.headers"])).location, "[REDACTED]");
    assert.equal(logs.records.length, 1);
    assert.match(String(logs.records[0].body), /monitor created/);
    const exported = JSON.stringify({ attributes: span.attributes, events: span.events, logs: logs.records });
    assert.doesNotMatch(exported, /private-(?:query|header|cookie|password|opaque|response-key|response-cookie|log-token|redirect-code)/);
    assert.equal(logs.localCalls.length, 1);
  } finally { logs.restore(); }
});

test("a real reveal route records sanitized request metadata and metrics without exporting its secret content", async () => {
  const logs = capturedConsole();
  const pathname = "/api/private-org/secrets/projects/private-project/environments/private-environment/secrets/private-secret/reveal";
  const request = new Request(`https://app.example.test${pathname}?private-query=private-query-value`, {
    headers: { authorization: "Bearer private-token", "x-private-header": "private-header-value" },
  });
  const response = Response.json({ value: "private-secret-result" });
  try {
    const result = await runWithInternalObservabilityRequest(request, () => instrumentTanStackRequest({ request, next: async () => {
      await Promise.resolve();
      logs.target.error("secret diagnostic", { value: "private-secret-result" });
      return response;
    } }, options));
    assert.equal(result, response);
    assert.equal((await result.json()).value, "private-secret-result", "the application's reveal result stays unchanged");
    const [span] = spans.getFinishedSpans();
    assert.equal(spans.getFinishedSpans().length, 1);
    assert.ok(span);
    const route = "/api/:orgSlug/secrets/projects/:projectSlug/environments/:environmentSlug/secrets/:secretId/reveal";
    assert.equal(span.name, `GET ${route}`);
    assert.equal(span.kind, SpanKind.SERVER);
    assert.equal(span.attributes["http.route"], route);
    assert.equal(span.attributes["http.request.method"], "GET");
    assert.equal(span.attributes["http.response.status_code"], 200);
    assert.ok(span.duration[0] >= 0 && span.duration[1] >= 0);
    assert.ok(span.duration[0] + span.duration[1] > 0, "request timing remains available");
    assert.deepEqual(span.events, [], "no private exception details are attached");
    assert.equal(logs.records.length, 0);
    assert.equal(logs.localCalls.length, 1, "local application logging is preserved");
    await meterProvider.forceFlush();
    const exportedMetrics = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics).flatMap((scope) => scope.metrics);
    for (const name of ["http.server.request.count", "http.server.request.duration"]) {
      const metric = exportedMetrics.find((entry) => entry.descriptor.name === name);
      const point = metric?.dataPoints.find((entry) => entry.attributes["http.route"] === route);
      assert.ok(point, `${name} keeps the private request's safe route metadata`);
      assert.equal(point.attributes["http.response.status_code"], 200);
      if (name === "http.server.request.count") assert.equal(point.value, 1);
      else {
        const value = point.value as { count: number; sum: number };
        assert.equal(value.count, 1);
        assert.ok(value.sum >= 0, "the request duration is exported in seconds");
      }
    }
    assert.doesNotMatch(JSON.stringify({ span: exportedSpan(span), logs: logs.records, metrics: exportedMetrics }), /private-/);
  } finally { logs.restore(); }
});

test("every sensitive request family records successes and failures without payload, header, query, log or exception content", async () => {
  const logs = capturedConsole();
  const paths = [
    "/login", "/logout", "/signup", "/register", "/api/auth/session", "/api/auth/callback/private-provider", "/api/tunnel/auth",
    "/private-org/secrets/vaults/private-project/environments/private-environment",
    "/api/private-org/secrets/projects/private-project/environments/private-environment/secrets/private-secret/reveal",
    "/api/private-org/auth-tokens", "/api/private-org/secrets/machine-tokens/private-token", "/api/private-org/tokens/private-token",
    "/api/private-org/invitations/private-invitation", "/invite/private-invitation", "/api/admin/users/private-user",
    "/api/cli/exchange", "/api/dashboard/ws-token", "/api/webhooks/polar", "/api/checkout/polar", "/api/private-org/portal/polar",
    "/_serverFn/private-function", "/api/uptime/integrations/private-provider/callback",
    "/v1/traces", "/v1/logs", "/v1/metrics", "/api/private-org/%2573ecrets/private-value", "/api/bad%encoding",
  ];
  let handled = 0;
  try {
    for (const pathname of paths) for (const outcome of ["success", "response-error", "throw"] as const) {
      spans.reset();
      const request = new Request(`https://app.example.test${pathname}?private-query=private-query-value`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-private-header": "private-header-value", authorization: "Bearer private-token" },
        body: JSON.stringify({ value: "private-request-value" }),
      });
      const failure = new Error("private-exception-message");
      const response = Response.json({ value: "private-response-value" }, { status: outcome === "response-error" ? 500 : 200 });
      const pending = runWithInternalObservabilityRequest(request, () => instrumentTanStackRequest({ request, next: async () => {
        handled++;
        assert.equal((await request.json()).value, "private-request-value", "observability leaves the application's request readable");
        logs.target.error("private-log-message", { value: "private-log-value", error: failure });
        await Promise.resolve();
        if (outcome === "throw") throw failure;
        return response;
      } }, options));
      if (outcome === "throw") await assert.rejects(pending, (error) => error === failure);
      else {
        const result = await pending;
        assert.equal(result, response);
        assert.equal((await result.json()).value, "private-response-value");
      }
      const finished = spans.getFinishedSpans();
      assert.equal(finished.length, 1, `${pathname}: ${outcome} is observable, never ignored`);
      const [span] = finished;
      assert.equal(span.attributes["http.route"], resolveInternalObservabilityRoute({ pathname }));
      if (outcome !== "throw") assert.equal(span.attributes["http.response.status_code"], outcome === "response-error" ? 500 : 200);
      if (outcome !== "success") assert.equal(span.status.code, SpanStatusCode.ERROR);
      assert.ok(span.duration[0] + span.duration[1] > 0);
      assert.deepEqual(span.events, []);
      assert.ok(!Object.keys(span.attributes).some((name) => name.startsWith("outray.http.") || ["url.full", "url.query", "http.url", "http.target"].includes(name)), "no private payload, header or URL attributes are captured");
      assert.doesNotMatch(JSON.stringify(exportedSpan(span)), /private-/);
    }
    assert.equal(handled, paths.length * 3);
    assert.equal(logs.localCalls.length, handled, "local logs still execute for every private request");
    assert.deepEqual(logs.records, []);
    await meterProvider.forceFlush();
    assert.doesNotMatch(JSON.stringify(metricExporter.getMetrics()), /private-/);
  } finally { logs.restore(); }
});

test("simultaneous public and private requests keep independent payload and log capture policies across awaits", async () => {
  const logs = capturedConsole();
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const privateRequest = new Request("https://app.example.test/api/private-org/secrets/projects/private-project/environments/private-environment/secrets/private-secret/reveal");
  const publicRequest = new Request("https://app.example.test/api/acme/uptime/monitors", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Public monitor" }),
  });
  try {
    const privatePending = runWithInternalObservabilityRequest(privateRequest, () => instrumentTanStackRequest({ request: privateRequest, next: async () => {
      logs.target.info("private-before-await");
      await barrier;
      logs.target.info("private-after-await");
      return Response.json({ value: "private-secret-value" });
    } }, options));
    const publicPending = runWithInternalObservabilityRequest(publicRequest, () => instrumentTanStackRequest({ request: publicRequest, next: async () => {
      await Promise.resolve();
      logs.target.info("public-monitor-created");
      release();
      return Response.json({ name: "Public monitor" }, { status: 201 });
    } }, options));
    await Promise.all([privatePending, publicPending]);
    assert.equal(spans.getFinishedSpans().length, 2);
    const publicSpan = spans.getFinishedSpans().find((span) => span.attributes["http.response.status_code"] === 201)!;
    assert.equal(JSON.parse(String(publicSpan.attributes["outray.http.request.body"])).name, "Public monitor");
    assert.equal(JSON.parse(String(publicSpan.attributes["outray.http.response.body"])).name, "Public monitor");
    assert.equal(logs.records.length, 1);
    assert.match(String(logs.records[0].body), /public-monitor-created/);
    assert.equal(logs.localCalls.length, 3);
    assert.doesNotMatch(JSON.stringify({ spans: spans.getFinishedSpans().map(exportedSpan), logs: logs.records }), /private-/);
  } finally { release(); logs.restore(); }
});

test("the internal integration records default adapter asset paths instead of silently omitting their requests", async () => {
  for (const pathname of ["/favicon.ico", "/robots.txt", "/assets/app.js", "/@vite/client", "/@fs/example.js", "/@id/module", "/__vite/ping", "/node_modules/module.js"]) {
    spans.reset();
    let handled = 0;
    const request = new Request(`https://app.example.test${pathname}`);
    const response = new Response("asset", { status: 200 });
    assert.equal(await runWithInternalObservabilityRequest(request, () => instrumentTanStackRequest({ request, next: () => {
      handled++; return response;
    } }, options)), response);
    assert.equal(handled, 1);
    assert.equal(spans.getFinishedSpans().length, 1, pathname);
    assert.equal(spans.getFinishedSpans()[0].attributes["http.response.status_code"], 200);
  }
});
