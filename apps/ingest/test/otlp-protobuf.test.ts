import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { context, trace } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { parseLogsPayload, type ParsedLogsPayload } from "../src/logs.js";
import {
  parseMetricsPayload,
  type ParsedMetricsPayload,
} from "../src/metrics.js";
import { parseTracePayload, type ParsedTracePayload } from "../src/otlp.js";
import {
  decodeLogsRequest,
  decodeMetricsRequest,
  decodeTraceRequest,
} from "../src/protobuf.js";
import { TinybirdIngestClient, toTinybirdMetric } from "../src/tinybird.js";

let endpointBase = "";
let received: ParsedTracePayload | null = null;
let receivedLogs: ParsedLogsPayload | null = null;
let receivedMetrics: ParsedMetricsPayload | null = null;

const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));

  assert.match(
    request.headers["content-type"] || "",
    /^application\/x-protobuf/,
  );
  assert.equal(request.headers.authorization, "Bearer outray_test_token");

  const payload = Buffer.concat(chunks);
  if (request.url === "/v1/traces") {
    received = parseTracePayload(decodeTraceRequest(payload));
  } else if (request.url === "/v1/logs") {
    receivedLogs = parseLogsPayload(decodeLogsRequest(payload));
  } else if (request.url === "/v1/metrics") {
    receivedMetrics = parseMetricsPayload(decodeMetricsRequest(payload));
  } else {
    assert.fail(`Unexpected OTLP path: ${request.url}`);
  }
  response.writeHead(200, {
    "Content-Type": "application/x-protobuf",
    "Content-Length": "0",
  });
  response.end();
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  endpointBase = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("accepts traces from the official OTLP HTTP/protobuf exporter", async () => {
  const exporter = new OTLPTraceExporter({
    url: `${endpointBase}/v1/traces`,
    headers: { Authorization: "Bearer outray_test_token" },
  });
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      "service.name": "checkout-api",
      "service.version": "1.2.3",
      "deployment.environment.name": "test",
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  const tracer = provider.getTracer("outray-ingest-test", "1.0.0");
  const span = tracer.startSpan("POST /checkout", {
    attributes: {
      "http.request.method": "POST",
      "http.response.status_code": 201,
    },
  });
  span.addEvent("order.created", { "order.id": "order_123" });
  span.end();

  await provider.forceFlush();
  await provider.shutdown();

  assert(received);
  assert.equal(received.rejected, 0);
  assert.equal(received.spans.length, 1);
  assert.equal(received.spans[0]?.name, "POST /checkout");
  assert.equal(received.spans[0]?.serviceName, "checkout-api");
  assert.equal(received.spans[0]?.httpMethod, "POST");
  assert.match(received.spans[0]?.traceId || "", /^[0-9a-f]{32}$/);
  assert.match(received.spans[0]?.spanId || "", /^[0-9a-f]{16}$/);
});

test("accepts logs from the official OTLP HTTP/protobuf exporter", async () => {
  const exporter = new OTLPLogExporter({
    url: `${endpointBase}/v1/logs`,
    headers: { Authorization: "Bearer outray_test_token" },
  });
  const provider = new LoggerProvider({
    resource: resourceFromAttributes({
      "service.name": "checkout-api",
      "service.version": "1.2.3",
      "deployment.environment.name": "test",
    }),
    processors: [new SimpleLogRecordProcessor({ exporter })],
  });
  const tracerProvider = new BasicTracerProvider();
  const span = tracerProvider.getTracer("log-test").startSpan("process-order");
  const logContext = trace.setSpan(context.active(), span);

  provider.getLogger("outray-logger", "1.0.0").emit({
    context: logContext,
    eventName: "order.payment_failed",
    severityNumber: SeverityNumber.ERROR,
    severityText: "ERROR",
    body: "payment authorization failed",
    attributes: {
      "order.id": "order_123",
      "request.authorization": "must-redact",
    },
  });
  span.end();

  await provider.forceFlush();
  await provider.shutdown();
  await tracerProvider.shutdown();

  assert(receivedLogs);
  assert.equal(receivedLogs.rejected, 0);
  assert.equal(receivedLogs.records.length, 1);
  assert.equal(
    receivedLogs.records[0]?.message,
    "payment authorization failed",
  );
  assert.equal(receivedLogs.records[0]?.severityLevel, "error");
  assert.equal(receivedLogs.records[0]?.serviceName, "checkout-api");
  assert.equal(receivedLogs.records[0]?.eventName, "order.payment_failed");
  assert.match(receivedLogs.records[0]?.traceId || "", /^[0-9a-f]{32}$/);
  assert.match(receivedLogs.records[0]?.spanId || "", /^[0-9a-f]{16}$/);
});

test("accepts metrics from the official OTLP HTTP/protobuf exporter", async () => {
  const exporter = new OTLPMetricExporter({
    url: `${endpointBase}/v1/metrics`,
    headers: { Authorization: "Bearer outray_test_token" },
  });
  const provider = new MeterProvider({
    resource: resourceFromAttributes({
      "service.name": "checkout-api",
      "service.version": "1.2.3",
      "deployment.environment.name": "test",
    }),
    readers: [
      new PeriodicExportingMetricReader({
        exporter,
        exportIntervalMillis: 60_000,
      }),
    ],
  });
  const meter = provider.getMeter("outray-metrics-test", "1.0.0");
  const attributes = {
    "http.route": "/checkout",
    "http.request.method": "POST",
  };

  meter
    .createGauge("checkout.queue.depth", { unit: "{item}" })
    .record(7, attributes);
  meter
    .createCounter("checkout.requests", { unit: "{request}" })
    .add(3, attributes);
  meter
    .createHistogram("http.server.request.duration", { unit: "ms" })
    .record(42, attributes);

  await provider.forceFlush();
  await provider.shutdown();

  assert(receivedMetrics);
  assert.equal(receivedMetrics.rejected, 0);
  assert.equal(receivedMetrics.points.length, 3);
  const byName = new Map(
    receivedMetrics.points.map((point) => [point.metricName, point]),
  );
  assert.equal(byName.get("checkout.queue.depth")?.metricType, "gauge");
  assert.equal(byName.get("checkout.queue.depth")?.value, 7);
  assert.equal(byName.get("checkout.requests")?.metricType, "sum");
  assert.equal(byName.get("checkout.requests")?.value, 3);
  assert.equal(
    byName.get("http.server.request.duration")?.metricType,
    "histogram",
  );
  assert.equal(byName.get("http.server.request.duration")?.count, "1");
  assert.equal(byName.get("http.server.request.duration")?.sum, 42);
  assert.equal(byName.get("checkout.requests")?.serviceName, "checkout-api");
  assert.equal(
    byName.get("checkout.requests")?.metricAttributes["http.route"],
    "/checkout",
  );
});

test("parses exponential histogram and summary OTLP JSON data points", () => {
  const timestamp = "1788080400123456789";
  const parsed = parseMetricsPayload({
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "analytics-api" } },
          ],
        },
        scopeMetrics: [
          {
            scope: { name: "metrics-test", version: "1.0.0" },
            metrics: [
              {
                name: "request.size",
                unit: "By",
                exponentialHistogram: {
                  aggregationTemporality: 1,
                  dataPoints: [
                    {
                      timeUnixNano: timestamp,
                      count: "3",
                      sum: 12,
                      scale: 2,
                      zeroCount: "1",
                      positive: { offset: -1, bucketCounts: ["1", "1"] },
                      negative: { offset: 0, bucketCounts: [] },
                      min: 0,
                      max: 8,
                      zeroThreshold: 0.001,
                    },
                  ],
                },
              },
              {
                name: "request.duration.summary",
                summary: {
                  dataPoints: [
                    {
                      timeUnixNano: timestamp,
                      count: "2",
                      sum: 30,
                      quantileValues: [
                        { quantile: 0.5, value: 10 },
                        { quantile: 0.95, value: 20 },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(parsed.rejected, 0);
  assert.equal(parsed.points.length, 2);
  assert.equal(parsed.points[0]?.metricType, "exponential_histogram");
  assert.deepEqual(parsed.points[0]?.positiveBucketCounts, ["1", "1"]);
  assert.equal(parsed.points[0]?.zeroThreshold, 0.001);
  assert.equal(parsed.points[1]?.metricType, "summary");
  assert.deepEqual(parsed.points[1]?.quantiles, [0.5, 0.95]);
  assert.deepEqual(parsed.points[1]?.quantileValues, [10, 20]);
});

test("preserves int64 values and honors metric staleness markers", () => {
  const timestamp = "1788080400123456789";
  const parsed = parseMetricsPayload({
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: "exact.integer",
                gauge: {
                  dataPoints: [
                    {
                      timeUnixNano: timestamp,
                      asInt: "9007199254740993",
                      attributes: [
                        {
                          key: "clientSecret",
                          value: { stringValue: "must-redact" },
                        },
                        {
                          key: "api_key",
                          value: { stringValue: "must-redact" },
                        },
                      ],
                    },
                    { timeUnixNano: timestamp, asDouble: 42, flags: 1 },
                  ],
                },
              },
              {
                name: "zero.summary",
                summary: {
                  dataPoints: [
                    {
                      timeUnixNano: timestamp,
                      count: "1",
                      quantileValues: [{ quantile: 0, value: 0 }],
                    },
                  ],
                },
              },
              {
                name: "invalid.summary",
                summary: {
                  dataPoints: [
                    {
                      timeUnixNano: timestamp,
                      count: "1",
                      sum: 1,
                      quantileValues: [{ quantile: 0.5, value: -1 }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(parsed.rejected, 1);
  assert.equal(parsed.points.length, 3);
  assert.equal(parsed.points[0]?.value, null);
  assert.equal(parsed.points[0]?.valueInt, "9007199254740993");
  const stored = toTinybirdMetric("org_test", 3, parsed.points[0]!);
  assert.equal(stored.value_int, "9007199254740993");
  assert.equal(stored.attributes.clientSecret, "[REDACTED]");
  assert.equal(stored.attributes.api_key, "[REDACTED]");
  assert.equal(parsed.points[1]?.flags, 1);
  assert.equal(parsed.points[1]?.value, null);
  assert.equal(parsed.points[1]?.valueInt, null);
  assert.equal(parsed.points[2]?.sum, 0);
  assert.deepEqual(parsed.points[2]?.quantiles, [0]);
  assert.deepEqual(parsed.points[2]?.quantileValues, [0]);
});

test("deduplicates metric corrections by OTLP point identity", () => {
  const timestamp = "1788080400123456789";
  const startTimestamp = "1788080399123456789";
  const parsePoint = ({
    description,
    value,
    startTimeUnixNano = startTimestamp,
    timeUnixNano = timestamp,
    resourceSchemaUrl = "https://opentelemetry.io/schemas/1.37.0",
    scopeSchemaUrl = "https://opentelemetry.io/schemas/1.37.0",
  }: {
    description: string;
    value: string;
    startTimeUnixNano?: string;
    timeUnixNano?: string;
    resourceSchemaUrl?: string;
    scopeSchemaUrl?: string;
  }) =>
    parseMetricsPayload({
      resourceMetrics: [
        {
          schemaUrl: resourceSchemaUrl,
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "checkout-api" },
              },
            ],
          },
          scopeMetrics: [
            {
              schemaUrl: scopeSchemaUrl,
              scope: { name: "identity-test", version: "1.0.0" },
              metrics: [
                {
                  name: "checkout.requests",
                  description,
                  unit: "{request}",
                  sum: {
                    aggregationTemporality: 1,
                    isMonotonic: true,
                    dataPoints: [
                      {
                        startTimeUnixNano,
                        timeUnixNano,
                        asInt: value,
                        attributes: [
                          {
                            key: "http.route",
                            value: { stringValue: "/checkout" },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    }).points[0]!;

  const original = toTinybirdMetric(
    "org_test",
    3,
    parsePoint({ description: "Original", value: "1" }),
  );
  const corrected = toTinybirdMetric(
    "org_test",
    3,
    parsePoint({ description: "Corrected description", value: "2" }),
  );
  const nextInterval = toTinybirdMetric(
    "org_test",
    3,
    parsePoint({
      description: "Original",
      value: "1",
      startTimeUnixNano: "1788080400123456789",
      timeUnixNano: "1788080401123456789",
    }),
  );
  const differentResourceSchema = toTinybirdMetric(
    "org_test",
    3,
    parsePoint({
      description: "Original",
      value: "1",
      resourceSchemaUrl: "https://opentelemetry.io/schemas/1.38.0",
    }),
  );
  const differentScopeSchema = toTinybirdMetric(
    "org_test",
    3,
    parsePoint({
      description: "Original",
      value: "1",
      scopeSchemaUrl: "https://opentelemetry.io/schemas/1.38.0",
    }),
  );

  assert.equal(original.event_id, corrected.event_id);
  assert.notEqual(original.event_id, nextInterval.event_id);
  assert.notEqual(original.event_id, differentResourceSchema.event_id);
  assert.notEqual(original.event_id, differentScopeSchema.event_id);
  assert.equal(original.value_int, "1");
  assert.equal(corrected.value_int, "2");
  assert.equal(corrected.metric_description, "Corrected description");
});

test("rejects interval metrics without delta or cumulative temporality", () => {
  const timestamp = "1788080400123456789";
  const parsed = parseMetricsPayload({
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: "invalid.sum",
                sum: {
                  aggregationTemporality: 0,
                  dataPoints: [{ timeUnixNano: timestamp, asInt: "1" }],
                },
              },
              {
                name: "invalid.histogram",
                histogram: {
                  aggregationTemporality: 99,
                  dataPoints: [{ timeUnixNano: timestamp, count: "0" }],
                },
              },
              {
                name: "invalid.exponential_histogram",
                exponentialHistogram: {
                  dataPoints: [
                    {
                      timeUnixNano: timestamp,
                      count: "0",
                      zeroCount: "0",
                    },
                  ],
                },
              },
              {
                name: "valid.gauge",
                gauge: {
                  dataPoints: [{ timeUnixNano: timestamp, asDouble: 1 }],
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(parsed.rejected, 3);
  assert.equal(parsed.points.length, 1);
  assert.equal(parsed.points[0]?.metricName, "valid.gauge");
});

test("treats Tinybird quarantined rows as a delivery failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ successful_rows: 0, quarantined_rows: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const client = new TinybirdIngestClient(
      "https://api.example.test",
      "test_token",
    );
    await assert.rejects(
      client.appendMetrics([{} as never]),
      /not fully committed.*quarantined/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
