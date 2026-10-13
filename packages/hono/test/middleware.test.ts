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
  outray,
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

test("default health and OPTIONS exclusions can be disabled while explicit ignores remain effective", async () => {
  for (const [pathname, method] of [["/health", "GET"], ["/api/preflight", "OPTIONS"]]) {
    const response = new Response(null, { status: 204 });
    const context = { req: { raw: new Request(`https://app.test${pathname}`, { method }), routePath: pathname }, res: response };
    let calls = 0;
    const next = async () => { calls += 1; };
    await createOutrayHonoMiddleware()(context, next);
    assert.equal(exporter.getFinishedSpans().length, 0);
    await createOutrayHonoMiddleware({ ignoreDefaultPaths: false })(context, next);
    assert.equal(exporter.getFinishedSpans()[0]?.attributes["http.response.status_code"], 204);
    assert.equal(context.res, response);
    exporter.reset();
    await createOutrayHonoMiddleware({ ignoreDefaultPaths: false, ignore: () => true })(context, next);
    assert.equal(exporter.getFinishedSpans().length, 0);
    assert.equal(calls, 3);
  }
});

test("a shared payload policy separates concurrent public and private Hono requests without cloning private content", async () => {
  const privateRequest = new Request("https://app.test/api/secrets/reveal?token=private-query", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "private-request" }),
  });
  const privateResponse = Response.json({ value: "private-response" });
  let privateClones = 0;
  privateRequest.clone = () => { privateClones += 1; throw new Error("private request clone"); };
  privateResponse.clone = () => { privateClones += 1; throw new Error("private response clone"); };
  const publicRequest = new Request("https://app.test/api/orders", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item: "book" }),
  });
  const publicResponse = Response.json({ ok: true }, { status: 201 });
  const requests = [
    { req: { raw: privateRequest, routePath: "/api/secrets/reveal" }, res: privateResponse },
    { req: { raw: publicRequest, routePath: "/api/orders" }, res: publicResponse },
  ];
  const evaluations = new Map<string, number>();
  const options = { capturePayloads: true, shouldCapturePayloads: ({ pathname, method }: { pathname: string; method?: string }) => {
    assert.equal(method, "POST");
    evaluations.set(pathname, (evaluations.get(pathname) ?? 0) + 1);
    return !pathname.startsWith("/api/secrets/");
  } };
  const middleware = createOutrayHonoMiddleware(options);
  await Promise.all(requests.map((context) => middleware(context, async () => {
    assert.equal(context.req.raw.bodyUsed, false);
    await context.req.raw.json();
    await Promise.resolve();
  })));
  assert.equal(privateClones, 0);
  assert.equal(requests[0].res, privateResponse);
  assert.equal(requests[1].res, publicResponse);
  assert.equal(privateResponse.bodyUsed, false);
  assert.equal(publicResponse.bodyUsed, false);
  assert.deepEqual([...evaluations.values()], [1, 1]);
  assert.equal(options.capturePayloads, true);
  const spans = exporter.getFinishedSpans();
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

test("failed Hono payload policies fail closed and metadata-only errors preserve identity without exception details", async () => {
  const request = new Request("https://app.test/api/policy-failure", { method: "POST", body: "private-body" });
  const response = Response.json({ value: "private-response" });
  let evaluations = 0, clones = 0, handlerCalls = 0;
  request.clone = () => { clones += 1; throw new Error("unexpected clone"); };
  response.clone = () => { clones += 1; throw new Error("unexpected clone"); };
  const context = { req: { raw: request, routePath: "/api/policy-failure" }, res: response };
  const middleware = createOutrayHonoMiddleware({ capturePayloads: true, recordExceptions: false, shouldCapturePayloads: () => {
    evaluations += 1;
    throw new Error("private-policy-error");
  } });
  await middleware(context, async () => { handlerCalls += 1; });
  assert.equal(context.res, response);
  assert.equal(evaluations, 1);
  assert.equal(clones, 0);
  assert.equal(handlerCalls, 1);
  assert.equal(exporter.getFinishedSpans()[0]?.attributes["http.response.status_code"], 200);
  assert.equal(Object.keys(exporter.getFinishedSpans()[0]!.attributes).some((key) => key.startsWith("outray.http.")), false);

  const failure = new Error("private-handler-error");
  failure.name = "private-error-name";
  await assert.rejects(middleware(context, async () => { throw failure; }), (error) => error === failure);
  const failedSpan = exporter.getFinishedSpans()[1]!;
  assert.equal(failedSpan.status.code, 2);
  assert.equal(failedSpan.attributes["http.response.status_code"], 500);
  assert.equal(failedSpan.events.length, 0);
  await meterProvider.forceFlush();
  const count = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics).flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");
  const failurePoint = count?.dataPoints.find((point) => point.attributes["http.route"] === "/api/policy-failure" && point.attributes["http.response.status_code"] === 500);
  assert.ok(failurePoint);
  assert.equal(failurePoint.attributes["error.type"], undefined);
});

test("Hono registration forwards the per-request policy independently of global SDK configuration", async () => {
  let evaluations = 0;
  const registration = outray({ apiKey: "synthetic-test-token", enabled: false, capturePayloads: true,
    ignoreDefaultPaths: false, shouldCapturePayloads: ({ pathname, method }) => {
      assert.equal(pathname, "/health");
      assert.equal(method, "GET");
      evaluations += 1;
      return false;
    } });
  const response = Response.json({ ok: true });
  const request = new Request("https://app.test/health");
  request.clone = () => { throw new Error("metadata-only request must not be cloned"); };
  await registration.middleware({ req: { raw: request, routePath: "/health" }, res: response }, async () => {});
  assert.equal(evaluations, 1);
  assert.equal(exporter.getFinishedSpans()[0]?.attributes["http.route"], "/health");
  for (const key of ["capturePayloads", "shouldCapturePayloads", "ignoreDefaultPaths", "recordExceptions"]) {
    assert.equal(key in registration.observability.config, false);
  }
});

test("Hono static capture disablement never invokes the policy or clones content", async () => {
  for (const capturePayloads of [undefined, false] as const) {
    const request = new Request("https://app.test/api/static-capture-disabled");
    const response = Response.json({ ok: true });
    let evaluations = 0, clones = 0;
    request.clone = () => { clones += 1; throw new Error("unexpected request clone"); };
    response.clone = () => { clones += 1; throw new Error("unexpected response clone"); };
    await createOutrayHonoMiddleware({ capturePayloads, shouldCapturePayloads: () => { evaluations += 1; return true; } })(
      { req: { raw: request, routePath: "/api/static-capture-disabled" }, res: response }, async () => {},
    );
    assert.equal(evaluations, 0);
    assert.equal(clones, 0);
    assert.equal(Object.keys(exporter.getFinishedSpans().at(-1)!.attributes).some((key) => key.startsWith("outray.http.")), false);
  }
});

test("a throwing enumerable payload-policy getter cannot interrupt Hono requests", async () => {
  const options = { capturePayloads: true };
  let evaluations = 0, clones = 0;
  Object.defineProperty(options, "shouldCapturePayloads", { enumerable: true, get() {
    evaluations += 1;
    throw new Error("private-policy-getter-error");
  } });
  const request = new Request("https://app.test/api/throwing-policy-getter");
  const response = Response.json({ ok: true }, { status: 202 });
  request.clone = () => { clones += 1; throw new Error("unexpected clone"); };
  response.clone = () => { clones += 1; throw new Error("unexpected clone"); };
  const context = { req: { raw: request, routePath: "/api/throwing-policy-getter" }, res: response };
  await createOutrayHonoMiddleware(options)(context, async () => {});
  assert.equal(context.res, response);
  assert.equal(evaluations, 1);
  assert.equal(clones, 0);
  assert.equal(exporter.getFinishedSpans()[0]?.attributes["http.response.status_code"], 202);
  await meterProvider.forceFlush();
  const count = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics).flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");
  assert.ok(count?.dataPoints.some((point) => point.attributes["http.route"] === "/api/throwing-policy-getter"));
});
