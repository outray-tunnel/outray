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
import { normalizeNextRoute, withOutrayRequest } from "../src/index.js";

const spanExporter = new InMemorySpanExporter();
const tracerProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
});
const metricExporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE,
);
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60_000,
});
const meterProvider = new MeterProvider({ readers: [metricReader] });
const contextManager = new AsyncLocalStorageContextManager();

before(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(tracerProvider);
  metrics.setGlobalMeterProvider(meterProvider);
});

beforeEach(() => {
  spanExporter.reset();
  metricExporter.reset();
});

after(async () => {
  await Promise.all([tracerProvider.shutdown(), meterProvider.shutdown()]);
  contextManager.disable();
  context.disable();
  trace.disable();
  metrics.disable();
});

test("normalizes identifiers in Next.js request routes", () => {
  assert.equal(
    normalizeNextRoute(
      "/api/orders/2a4f6a6d-c422-4cc5-b659-8c074a64450b/items/42",
    ),
    "/api/orders/:id/items/:id",
  );
});

test("records a route-aware request span and HTTP metrics", async () => {
  const wrapped = withOutrayRequest(
    async () => Response.json({ ok: true }, { status: 201 }),
    { routeResolver: () => "/api/orders/:orderId" },
  );

  const response = await wrapped(
    new Request("https://example.test/api/orders/order_123", {
      method: "POST",
    }),
  );
  assert.equal(response.status, 201);

  const [span] = spanExporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.kind, SpanKind.SERVER);
  assert.equal(span.name, "POST /api/orders/:orderId");
  assert.equal(span.attributes["http.route"], "/api/orders/:orderId");
  assert.equal(span.attributes["outray.framework"], "nextjs");

  await meterProvider.forceFlush();
  const exportedMetrics = metricExporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics);
  const requestCount = exportedMetrics.find(
    (metric) => metric.descriptor.name === "http.server.request.count",
  );
  assert.ok(requestCount);
  assert.deepEqual(requestCount.dataPoints[0]?.attributes, {
    "http.request.method": "POST",
    "http.route": "/api/orders/:orderId",
    "http.response.status_code": 201,
    "outray.framework": "nextjs",
  });
});

test("skips framework assets without changing their response", async () => {
  const wrapped = withOutrayRequest(async () => new Response("asset"));
  const response = await wrapped(
    new Request("https://example.test/_next/static/app.js"),
  );

  assert.equal(await response.text(), "asset");
  assert.equal(spanExporter.getFinishedSpans().length, 0);
});
