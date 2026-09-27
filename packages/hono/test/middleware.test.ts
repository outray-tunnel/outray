import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { context, metrics, SpanKind, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Hono } from "hono";
import {
  createOutrayHonoMiddleware,
  normalizeHonoRoute,
  withOutraySpan,
} from "../src/index.js";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const contextManager = new AsyncLocalStorageContextManager();
const metricExporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE,
);
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60_000,
});
const meterProvider = new MeterProvider({ readers: [metricReader] });

before(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(provider);
  metrics.setGlobalMeterProvider(meterProvider);
});

beforeEach(() => {
  exporter.reset();
  metricExporter.reset();
});

after(async () => {
  await Promise.all([provider.shutdown(), meterProvider.shutdown()]);
  contextManager.disable();
  context.disable();
  trace.disable();
  metrics.disable();
});

test("normalizes obvious route identifiers", () => {
  assert.equal(
    normalizeHonoRoute(
      "/v1/uploads/2a4f6a6d-c422-4cc5-b659-8c074a64450b/parts/42",
    ),
    "/v1/uploads/:id/parts/:id",
  );
});

test("uses the matched Hono route and captures safe payloads", async () => {
  const app = new Hono();
  app.use("*", createOutrayHonoMiddleware({ capturePayloads: true }));
  app.post("/v1/uploads/:id/complete", async (context) => {
    await context.req.json();
    return context.json({ ok: true, accessToken: "never-store-this" }, 201);
  });

  const response = await app.request("/v1/uploads/upload_123/complete", {
    method: "POST",
    headers: {
      authorization: "Bearer never-store-this",
      "content-type": "application/json",
    },
    body: JSON.stringify({ fileId: "file_1", password: "never-store-this" }),
  });

  assert.equal(response.status, 201);
  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.name, "POST /v1/uploads/:id/complete");
  assert.equal(span.kind, SpanKind.SERVER);
  assert.equal(span.attributes["http.route"], "/v1/uploads/:id/complete");
  assert.equal(span.attributes["outray.framework"], "hono");
  assert.equal(span.attributes["http.response.status_code"], 201);

  const requestHeaders = JSON.parse(
    String(span.attributes["outray.http.request.headers"]),
  );
  const requestBody = JSON.parse(
    String(span.attributes["outray.http.request.body"]),
  );
  const responseBody = JSON.parse(
    String(span.attributes["outray.http.response.body"]),
  );
  assert.equal(requestHeaders.authorization, "[REDACTED]");
  assert.equal(requestBody.fileId, "file_1");
  assert.equal(requestBody.password, "[REDACTED]");
  assert.equal(responseBody.accessToken, "[REDACTED]");
});

test("keeps application spans inside the request trace", async () => {
  const app = new Hono();
  app.use("*", createOutrayHonoMiddleware());
  app.get("/v1/files/:id", async (context) => {
    await withOutraySpan("db findOne file", async (span) => {
      span.setAttribute("db.system.name", "postgresql");
    });
    return context.json({ ok: true });
  });

  const response = await app.request("/v1/files/42");
  assert.equal(response.status, 200);

  const spans = exporter.getFinishedSpans();
  const requestSpan = spans.find((span) => span.kind === SpanKind.SERVER);
  const databaseSpan = spans.find((span) => span.name === "db findOne file");
  assert.ok(requestSpan);
  assert.ok(databaseSpan);
  assert.equal(
    databaseSpan.spanContext().traceId,
    requestSpan.spanContext().traceId,
  );
  assert.equal(
    databaseSpan.parentSpanContext?.spanId,
    requestSpan.spanContext().spanId,
  );
});

test("marks 5xx responses as errors", async () => {
  const app = new Hono();
  app.use("*", createOutrayHonoMiddleware());
  app.get("/fail", (context) => context.json({ error: "failed" }, 503));

  await app.request("/fail");

  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.status.code, 2);
  assert.equal(span.attributes["http.response.status_code"], 503);
});

test("records HTTP metrics with the matched Hono route", async () => {
  const app = new Hono();
  app.use("*", createOutrayHonoMiddleware());
  app.get("/v1/files/:id", (context) => context.json({ ok: true }, 202));

  await app.request("/v1/files/42");
  await meterProvider.forceFlush();

  const requestCount = metricExporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");
  const dataPoint = requestCount?.dataPoints.find(
    (point) =>
      point.attributes["http.route"] === "/v1/files/:id" &&
      point.attributes["http.response.status_code"] === 202,
  );

  assert.ok(dataPoint);
  assert.equal(dataPoint.attributes["outray.framework"], "hono");
  assert.equal(dataPoint.attributes["http.response.status_code"], 202);
});

test("ignores health checks and preflight requests by default", async () => {
  const app = new Hono();
  app.use("*", createOutrayHonoMiddleware());
  app.get("/health", (context) => context.json({ ok: true }));
  app.options("/v1/files", (context) => context.body(null, 204));

  await app.request("/health");
  await app.request("/v1/files", { method: "OPTIONS" });

  assert.equal(exporter.getFinishedSpans().length, 0);
});
