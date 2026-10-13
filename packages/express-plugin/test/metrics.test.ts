import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { after, before, test } from "node:test";
import { metrics } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import type { Application } from "express";
import { registerOutrayObservability } from "../src/index.js";

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({
  exporter,
  exportIntervalMillis: 60_000,
});
const provider = new MeterProvider({ readers: [reader] });

before(() => metrics.setGlobalMeterProvider(provider));

after(async () => {
  await provider.shutdown();
  metrics.disable();
});

test("records Express request metrics with the matched route", async () => {
  const middleware: Array<(...args: any[]) => void> = [];
  const app = {
    use(value: (...args: any[]) => void) {
      middleware.push(value);
      return this;
    },
  } as unknown as Application;

  registerOutrayObservability(app, {
    apiKey: "test-token",
    serviceName: "express-metrics-test",
    enabled: false,
    capturePayloads: true,
    shouldCapturePayloads: () => false,
  });
  assert.equal(middleware.length, 2, "a rejected payload gate does not remove request metrics");

  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = 202;
  const request = {
      method: "POST",
      originalUrl: "/orders/order_123",
      baseUrl: "/orders",
      route: { path: "/:orderId" },
    };
  middleware[0]?.(
    request,
    response,
    () => middleware[1]?.(request, response, () => response.emit("finish")),
  );

  await provider.forceFlush();
  const requestCount = exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");

  assert.ok(requestCount);
  assert.deepEqual(requestCount.dataPoints[0]?.attributes, {
    "http.request.method": "POST",
    "http.route": "/orders/:orderId",
    "http.response.status_code": 202,
    "outray.framework": "express",
  });
});
