import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { metrics } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { createOutrayHttpServerMetrics } from "../src/index.js";

const exporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE,
);
const reader = new PeriodicExportingMetricReader({
  exporter,
  exportIntervalMillis: 60_000,
});
const provider = new MeterProvider({ readers: [reader] });

before(() => {
  metrics.setGlobalMeterProvider(provider);
});

after(async () => {
  await provider.shutdown();
  metrics.disable();
});

test("records completed HTTP requests with the final route template", async () => {
  const requestMetrics = createOutrayHttpServerMetrics({
    framework: "test-framework",
    instrumentationName: "@outray/test-framework",
    instrumentationVersion: "1.0.0",
  });

  const finish = requestMetrics.start({
    method: "post",
    route: "/orders/order_123",
  });
  finish({ statusCode: 201, route: "/orders/:orderId" });
  finish({ statusCode: 500, errorType: "IgnoredSecondCompletion" });

  await provider.forceFlush();

  const exportedMetrics = exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics);
  const requestCount = exportedMetrics.find(
    (metric) => metric.descriptor.name === "http.server.request.count",
  );
  const requestDuration = exportedMetrics.find(
    (metric) => metric.descriptor.name === "http.server.request.duration",
  );
  const activeRequests = exportedMetrics.find(
    (metric) => metric.descriptor.name === "http.server.active_requests",
  );

  assert.ok(requestCount);
  assert.ok(requestDuration);
  assert.ok(activeRequests);
  assert.equal(requestCount.dataPoints.length, 1);
  assert.deepEqual(requestCount.dataPoints[0]?.attributes, {
    "http.request.method": "POST",
    "http.route": "/orders/:orderId",
    "http.response.status_code": 201,
    "outray.framework": "test-framework",
  });
  assert.equal(requestCount.dataPoints[0]?.value, 1);
  assert.equal(requestDuration.dataPoints[0]?.value.count, 1);
  assert.ok((requestDuration.dataPoints[0]?.value.sum ?? -1) >= 0);
  assert.equal(activeRequests.dataPoints[0]?.value, 0);
});
