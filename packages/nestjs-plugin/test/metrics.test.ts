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
import type { INestApplication } from "@nestjs/common";
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

test("records Nest request metrics through the Express adapter", async () => {
  const middleware: Array<(...args: any[]) => void> = [];
  const app = {
    isInitialized: false,
    getHttpAdapter: () => ({ getType: () => "express" }),
    getHttpServer: () => ({ listening: false }),
    use(value: (...args: any[]) => void) {
      middleware.push(value);
      return this;
    },
  } as unknown as INestApplication;

  const observability = registerOutrayObservability(app, {
    apiKey: "test-token",
    serviceName: "nest-metrics-test",
    enabled: false,
  });
  assert.notEqual(observability, false);

  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = 204;
  middleware[0]?.(
    {
      method: "DELETE",
      originalUrl: "/users/42",
      baseUrl: "/users",
      route: { path: "/:userId" },
    },
    response,
    () => response.emit("finish"),
  );

  await provider.forceFlush();
  const requestCount = exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");

  assert.ok(requestCount);
  assert.deepEqual(requestCount.dataPoints[0]?.attributes, {
    "http.request.method": "DELETE",
    "http.route": "/users/:userId",
    "http.response.status_code": 204,
    "outray.framework": "nestjs",
  });
});
