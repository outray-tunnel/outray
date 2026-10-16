import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { context, metrics, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, type ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { LogRecord } from "@opentelemetry/api-logs";
import { instrumentTanStackRequest } from "../../../packages/tanstack-start/src/index";
import { captureConsoleLogs, type OutrayConsoleTarget } from "../../../packages/observability/src/logging";
import { resolveInternalObservabilityOptions, resolveInternalObservabilityRoute } from "../src/lib/internal-observability.server";

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
  contextManager.disable(); context.disable(); trace.disable(); metrics.disable();
});

function capturedConsole() {
  const records: LogRecord[] = [], localCalls: unknown[][] = [], traceIds: Array<string | undefined> = [];
  const write = (...args: unknown[]) => { localCalls.push(args); };
  const target: OutrayConsoleTarget = { debug: write, error: write, info: write, log: write, warn: write };
  const restore = captureConsoleLogs({ emit(record) {
    records.push(record);
    traceIds.push(trace.getActiveSpan()?.spanContext().traceId);
  } }, target, options.shouldCaptureLog, options.redactedLogFields);
  return { records, localCalls, traceIds, target, restore };
}

function exportedSpan(span: ReadableSpan) {
  return { name: span.name, kind: span.kind, attributes: span.attributes, events: span.events, status: span.status,
    links: span.links, duration: span.duration, resource: span.resource.attributes };
}

test("failed auth captures useful request/response bodies and correlated error logs, never credentials", async () => {
  const logs = capturedConsole();
  const request = new Request("https://app.example.test/api/auth/sign-in/email?code=private-query", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer private-header", cookie: "session=private-cookie" },
    body: JSON.stringify({ email: "member@example.test", password: "private-password", code: "private-login-code", callbackURL: "/callback?code=private-code&state=private-state" }),
  });
  const response = Response.json({ code: "INVALID_CREDENTIALS", message: "The provided credentials are invalid" }, {
    status: 401, headers: { "set-cookie": "session=private-session", location: "/login?error=INVALID_CREDENTIALS&code=private-redirect" },
  });
  const cause = Object.assign(new Error("database connection failed"), { code: "08006" });
  const failure = new Error("Authentication failed", { cause });
  try {
    const result = await instrumentTanStackRequest({ request, next: async () => {
      assert.equal((await request.json()).password, "private-password");
      logs.target.error("Auth request failed", failure, { password: "private-log-password", params: ["private-sql-param"] });
      return response;
    } }, options);
    assert.equal(result, response);
    assert.equal((await result.json()).code, "INVALID_CREDENTIALS");
    const [span] = spans.getFinishedSpans();
    assert.equal(span.attributes["http.response.status_code"], 401);
    assert.equal(span.kind, SpanKind.SERVER);
    const requestBody = JSON.parse(String(span.attributes["outray.http.request.body"]));
    assert.equal(requestBody.email, "member@example.test");
    assert.equal(requestBody.password, "[REDACTED]");
    assert.equal(requestBody.code, "[REDACTED]");
    assert.match(requestBody.callbackURL, /REDACTED/);
    const body = JSON.parse(String(span.attributes["outray.http.response.body"]));
    assert.equal(body.code, "INVALID_CREDENTIALS");
    assert.equal(body.message, "The provided credentials are invalid");
    const headers = JSON.parse(String(span.attributes["outray.http.response.headers"]));
    assert.equal(headers["set-cookie"], "[REDACTED]");
    assert.match(headers.location, /error=INVALID_CREDENTIALS/);
    assert.doesNotMatch(headers.location, /private-/);
    assert.equal(logs.records.length, 1);
    assert.match(String(logs.records[0].body), /Authentication failed|08006/);
    assert.match(JSON.stringify(logs.records), /database connection failed/);
    assert.equal(logs.traceIds[0], span.spanContext().traceId);
    assert.equal(logs.localCalls.length, 1);
    assert.doesNotMatch(JSON.stringify({ span: exportedSpan(span), logs: logs.records }), /private-/);
  } finally { logs.restore(); }
});

test("auth session responses and OAuth redirects are visible with session credentials redacted", async () => {
  const sessionRequest = new Request("https://app.example.test/api/auth/get-session");
  const sessionResponse = Response.json({ session: { token: "private-session-token" }, user: { id: "user-1" } });
  await instrumentTanStackRequest({ request: sessionRequest, next: () => sessionResponse }, options);
  const session = JSON.parse(String(spans.getFinishedSpans()[0].attributes["outray.http.response.body"]));
  assert.equal(session.session, "[REDACTED]");
  assert.equal(session.user.id, "user-1");
  const request = new Request("https://app.example.test/api/auth/callback/github?code=private-code&state=private-state");
  const response = new Response(null, { status: 302, headers: {
    location: "/login?error=SIGN_IN_FAILED&error_description=Provider%20unavailable&code=private-code&state=private-state",
    "set-cookie": "session=private-cookie",
  } });
  assert.equal(await instrumentTanStackRequest({ request, next: () => response }, options), response);
  const span = spans.getFinishedSpans()[1];
  assert.equal(span.attributes["http.route"], "/api/auth/callback/:provider");
  const headers = JSON.parse(String(span.attributes["outray.http.response.headers"]));
  assert.match(headers.location, /SIGN_IN_FAILED/);
  assert.match(headers.location, /Provider/);
  assert.doesNotMatch(JSON.stringify(spans.getFinishedSpans().map(exportedSpan)), /private-/);
  assert.match(response.headers.get("location")!, /private-code/, "the actual redirect remains unchanged");
});

test("Secrets requests retain diagnostics while values and opaque nested captures are redacted", async () => {
  const logs = capturedConsole();
  const pathname = "/api/private-org/secrets/projects/private-project/environments/private-environment/secrets/private-secret/reveal";
  const request = new Request("https://app.example.test" + pathname, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "private-input", envText: "PRIVATE=private-env", expectedRevision: 3 }),
  });
  const response = Response.json({ value: "private-output", revision: 4, expiresIn: 30, responseBody: '{"innocent":"private-nested"}' });
  try {
    const result = await instrumentTanStackRequest({ request, next: async () => {
      logs.target.info("Secret revealed", { value: "private-output", revision: 4 });
      return response;
    } }, options);
    assert.equal((await result.json()).value, "private-output");
    const [span] = spans.getFinishedSpans();
    assert.equal(span.attributes["http.route"], resolveInternalObservabilityRoute({ pathname }));
    const input = JSON.parse(String(span.attributes["outray.http.request.body"]));
    const output = JSON.parse(String(span.attributes["outray.http.response.body"]));
    assert.equal(input.expectedRevision, 3);
    assert.equal(input.value, "[REDACTED]");
    assert.equal(input.envText, "[REDACTED]");
    assert.equal(output.value, "[REDACTED]");
    assert.equal(output.responseBody, "[REDACTED]");
    assert.equal(output.revision, 4);
    assert.equal(output.expiresIn, 30);
    assert.match(String(logs.records[0].body), /Secret revealed/);
    assert.equal(logs.traceIds[0], span.spanContext().traceId);
    await meterProvider.forceFlush();
    const exportedMetrics = metricExporter.getMetrics();
    assert.match(JSON.stringify(exportedMetrics), /http.server.request.count/);
    assert.doesNotMatch(JSON.stringify({ span: exportedSpan(span), logs: logs.records, metrics: exportedMetrics }), /private-/);
  } finally { logs.restore(); }
});

test("every sensitive route records successful, response-error and thrown-error requests without suppressing logs", async () => {
  const logs = capturedConsole();
  const paths = ["/login", "/api/auth/get-session", "/api/tunnel/auth", "/api/cli/exchange",
    "/api/acme/auth-tokens", "/api/acme/invitations/id", "/api/admin/users/id",
    "/api/webhooks/polar", "/api/checkout/polar", "/api/acme/portal/polar",
    "/_serverFn/id", "/v1/traces", "/v1/logs", "/v1/metrics", "/api/bad%encoding"];
  try {
    for (const pathname of paths) for (const outcome of ["success", "response-error", "throw"]) {
      spans.reset();
      const request = new Request("https://app.example.test" + pathname, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "private-input", operation: "request-check" }),
      });
      const failure = new Error("Auth provider unavailable");
      const response = Response.json({ code: "PROVIDER_UNAVAILABLE", message: "Try again", token: "private-output" }, { status: outcome === "response-error" ? 503 : 200 });
      const pending = instrumentTanStackRequest({ request, next: async () => {
        logs.target.warn("Request diagnostic", { status: outcome, value: "private-log" });
        if (outcome === "throw") throw failure;
        return response;
      } }, options);
      if (outcome === "throw") await assert.rejects(pending, (error) => error === failure);
      else assert.equal(await pending, response);
      const [span] = spans.getFinishedSpans();
      assert.equal(spans.getFinishedSpans().length, 1);
      assert.equal(span.attributes["http.response.status_code"], outcome === "throw" ? 500 : outcome === "response-error" ? 503 : 200);
      if (outcome !== "success") assert.equal(span.status.code, SpanStatusCode.ERROR);
      assert.deepEqual(span.events, [], "do not export unsanitized exception events");
      assert.equal(JSON.parse(String(span.attributes["outray.http.request.body"])).operation, "request-check");
      assert.doesNotMatch(JSON.stringify(exportedSpan(span)), /private-/);
    }
    assert.equal(logs.records.length, paths.length * 3);
    assert.equal(logs.localCalls.length, logs.records.length);
    assert.doesNotMatch(JSON.stringify(logs.records), /private-/);
  } finally { logs.restore(); }
});

test("concurrent auth and ordinary requests keep correlated logs across awaits", async () => {
  const logs = capturedConsole();
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  try {
    const auth = new Request("https://app.example.test/api/auth/get-session");
    const ordinary = new Request("https://app.example.test/api/acme/uptime/monitors");
    const authPending = instrumentTanStackRequest({ request: auth, next: async () => {
      logs.target.debug("auth-before", { session: "private-session" });
      await barrier;
      logs.target.error("auth-after", { token: "private-token" });
      return Response.json({ ok: true });
    } }, options);
    const otherPending = instrumentTanStackRequest({ request: ordinary, next: async () => {
      await Promise.resolve();
      logs.target.log("monitor-list");
      release();
      return Response.json({ ok: true });
    } }, options);
    await Promise.all([authPending, otherPending]);
    assert.equal(logs.records.length, 3);
    assert.equal(logs.traceIds[0], logs.traceIds[2]);
    assert.notEqual(logs.traceIds[0], logs.traceIds[1]);
    assert.doesNotMatch(JSON.stringify(logs.records), /private-/);
  } finally { release(); logs.restore(); }
});

test("asset and framework paths are not omitted from internal request telemetry", async () => {
  for (const pathname of ["/favicon.ico", "/robots.txt", "/assets/app.js", "/@vite/client", "/@fs/example.js", "/@id/module", "/__vite/ping", "/node_modules/module.js"]) {
    spans.reset();
    const request = new Request("https://app.example.test" + pathname);
    const response = new Response("asset");
    assert.equal(await instrumentTanStackRequest({ request, next: () => response }, options), response);
    assert.equal(spans.getFinishedSpans().length, 1, pathname);
  }
});
