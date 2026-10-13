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
import { normalizeNextRoute, withOutrayPayloadCapture, withOutrayRequest } from "../src/index.js";

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

test("default asset filters can be disabled while custom ignores remain in control", async () => {
  for (const pathname of ["/_next/static/app.js", "/assets/app.js", "/favicon.ico", "/robots.txt"]) {
    const response = new Response("asset");
    let calls = 0;
    const handler = async () => { calls += 1; return response; };
    const request = new Request(`https://example.test${pathname}`);
    assert.equal(await withOutrayRequest(handler)(request), response);
    assert.equal(spanExporter.getFinishedSpans().length, 0);
    assert.equal(await withOutrayRequest(handler, { ignoreDefaultPaths: false })(request), response);
    assert.equal(spanExporter.getFinishedSpans()[0]?.attributes["http.route"], pathname);
    spanExporter.reset();
    assert.equal(await withOutrayRequest(handler, { ignoreDefaultPaths: false, ignore: () => true })(request), response);
    assert.equal(spanExporter.getFinishedSpans().length, 0);
    assert.equal(calls, 3);
  }
});

test("one shared policy keeps concurrent sensitive Next requests metadata-only while public capture continues", async () => {
  const privateRequest = new Request("https://example.test/api/secrets/reveal?token=private-query", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "private-request" }),
  });
  const privateResponse = Response.json({ value: "private-response" });
  let privateClones = 0;
  privateRequest.clone = () => { privateClones += 1; throw new Error("private request clone"); };
  privateResponse.clone = () => { privateClones += 1; throw new Error("private response clone"); };
  const publicRequest = new Request("https://example.test/api/orders", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item: "book" }),
  });
  const publicResponse = Response.json({ ok: true }, { status: 201 });
  const evaluations = new Map<string, number>();
  const options = { capturePayloads: true, shouldCapturePayloads: ({ pathname, method }: { pathname: string; method?: string }) => {
    assert.equal(method, "POST");
    evaluations.set(pathname, (evaluations.get(pathname) ?? 0) + 1);
    return !pathname.startsWith("/api/secrets/");
  } };
  const wrapped = withOutrayRequest(async (request) => {
    assert.equal(request.bodyUsed, false);
    await request.json();
    await Promise.resolve();
    return request === privateRequest ? privateResponse : publicResponse;
  }, options);
  const responses = await Promise.all([wrapped(privateRequest), wrapped(publicRequest)]);
  assert.equal(responses[0], privateResponse);
  assert.equal(responses[1], publicResponse);
  assert.equal(privateClones, 0);
  assert.equal(privateResponse.bodyUsed, false);
  assert.equal(publicResponse.bodyUsed, false);
  assert.equal(options.capturePayloads, true);
  assert.deepEqual([...evaluations.values()], [1, 1]);
  const spans = spanExporter.getFinishedSpans();
  assert.equal(spans.length, 2);
  const privateSpan = spans.find((span) => span.attributes["http.route"] === "/api/secrets/reveal")!;
  const publicSpan = spans.find((span) => span.attributes["http.route"] === "/api/orders")!;
  assert.equal(Object.keys(privateSpan.attributes).some((key) => key.startsWith("outray.http.")), false);
  assert.doesNotMatch(JSON.stringify(privateSpan.attributes), /private-(?:query|request|response)/);
  assert.equal(JSON.parse(String(publicSpan.attributes["outray.http.request.body"])).item, "book");
  assert.equal(JSON.parse(String(publicSpan.attributes["outray.http.response.body"])).ok, true);
  await meterProvider.forceFlush();
  const count = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics).flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");
  for (const route of ["/api/secrets/reveal", "/api/orders"]) {
    assert.ok(count?.dataPoints.some((point) => point.attributes["http.route"] === route));
  }
});

test("the payload-capture shortcut forwards framework policy and default-path options", async () => {
  const request = new Request("https://example.test/favicon.ico");
  const response = Response.json({ ok: true });
  let calls = 0, clones = 0;
  request.clone = () => { clones += 1; throw new Error("private request clone"); };
  response.clone = () => { clones += 1; throw new Error("private response clone"); };
  const wrapped = withOutrayPayloadCapture(async (received) => {
    assert.equal(received, request);
    return response;
  }, true, { ignoreDefaultPaths: false, shouldCapturePayloads: ({ pathname, method }) => {
    calls += 1;
    assert.equal(pathname, "/favicon.ico");
    assert.equal(method, "GET");
    return false;
  } });
  assert.equal(await wrapped(request), response);
  assert.equal(clones, 0);
  assert.equal(calls, 1);
  assert.equal(spanExporter.getFinishedSpans()[0]?.attributes["http.response.status_code"], 200);
});

test("failed payload predicates fail closed while sensitive handler failures retain generic status and identity", async () => {
  const request = new Request("https://example.test/api/policy-failure", { method: "POST", body: "private-body" });
  const response = Response.json({ value: "private-response" });
  let calls = 0, clones = 0;
  request.clone = () => { clones += 1; throw new Error("unexpected request clone"); };
  response.clone = () => { clones += 1; throw new Error("unexpected response clone"); };
  const options = { capturePayloads: true, recordExceptions: false, shouldCapturePayloads: () => {
    calls += 1;
    throw new Error("private-policy-error");
  } };
  assert.equal(await withOutrayRequest(async () => response, options)(request), response);
  assert.equal(calls, 1);
  assert.equal(clones, 0);
  assert.equal(Object.keys(spanExporter.getFinishedSpans()[0]!.attributes).some((key) => key.startsWith("outray.http.")), false);
  const failure = new Error("private-handler-error");
  failure.name = "private-error-name";
  for (const handler of [() => { throw failure; }, async () => { throw failure; }]) {
    await assert.rejects(withOutrayRequest(handler, options)(request), (error) => error === failure);
  }
  for (const span of spanExporter.getFinishedSpans().slice(1)) {
    assert.equal(span.status.code, 2);
    assert.equal(span.attributes["http.response.status_code"], 500);
    assert.equal(span.events.length, 0);
    assert.doesNotMatch(JSON.stringify({ attributes: span.attributes, events: span.events }), /private-(?:handler|error-name)/);
  }
  await meterProvider.forceFlush();
  const count = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics).flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");
  const failurePoint = count?.dataPoints.find((point) => point.attributes["http.route"] === "/api/policy-failure" && point.attributes["http.response.status_code"] === 500);
  assert.ok(failurePoint);
  assert.equal(failurePoint.attributes["error.type"], undefined);
});

test("Next static capture disablement never invokes the policy or clones content", async () => {
  for (const capturePayloads of [undefined, false] as const) {
    const request = new Request("https://example.test/api/static-capture-disabled");
    const response = Response.json({ ok: true });
    let evaluations = 0, clones = 0;
    request.clone = () => { clones += 1; throw new Error("unexpected request clone"); };
    response.clone = () => { clones += 1; throw new Error("unexpected response clone"); };
    assert.equal(await withOutrayRequest(async () => response, { capturePayloads, shouldCapturePayloads: () => { evaluations += 1; return true; } })(request), response);
    assert.equal(evaluations, 0);
    assert.equal(clones, 0);
    assert.equal(Object.keys(spanExporter.getFinishedSpans().at(-1)!.attributes).some((key) => key.startsWith("outray.http.")), false);
  }
});

test("a throwing enumerable payload-policy getter cannot interrupt Next request wrappers", async () => {
  const options = { capturePayloads: true };
  let evaluations = 0, clones = 0;
  Object.defineProperty(options, "shouldCapturePayloads", { enumerable: true, get() {
    evaluations += 1;
    throw new Error("private-policy-getter-error");
  } });
  const request = new Request("https://example.test/api/throwing-policy-getter");
  const response = Response.json({ ok: true }, { status: 202 });
  request.clone = () => { clones += 1; throw new Error("unexpected clone"); };
  response.clone = () => { clones += 1; throw new Error("unexpected clone"); };
  assert.equal(await withOutrayRequest(async () => response, options)(request), response);
  assert.equal(evaluations, 1);
  assert.equal(clones, 0);
  assert.equal(spanExporter.getFinishedSpans()[0]?.attributes["http.response.status_code"], 202);
  await meterProvider.forceFlush();
  const count = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics).flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");
  assert.ok(count?.dataPoints.some((point) => point.attributes["http.route"] === "/api/throwing-policy-getter"));
});

test("the payload shortcut forwards throwing policy getters lazily to core", async () => {
  const policy = {};
  let evaluations = 0, clones = 0;
  Object.defineProperty(policy, "shouldCapturePayloads", { enumerable: true, get() {
    evaluations += 1;
    throw new Error("private-shortcut-policy-getter-error");
  } });
  const request = new Request("https://example.test/api/shortcut-policy-getter");
  const response = Response.json({ ok: true });
  request.clone = () => { clones += 1; throw new Error("unexpected clone"); };
  response.clone = () => { clones += 1; throw new Error("unexpected clone"); };
  const wrapped = withOutrayPayloadCapture(async () => response, true, policy);
  assert.equal(evaluations, 0, "construction must not evaluate a request policy");
  assert.equal(await wrapped(request), response);
  assert.equal(evaluations, 1);
  assert.equal(clones, 0);
  assert.equal(spanExporter.getFinishedSpans()[0]?.attributes["http.response.status_code"], 200);
});
