import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { context, metrics, trace } from "@opentelemetry/api";
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
import { createStart } from "@tanstack/react-start";
import {
  createOutrayTanStackMiddleware,
  instrumentTanStackRequest,
  isDefaultIgnoredTanStackPath,
  normalizeTanStackRoute,
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

test("normalizes obvious route identifiers without touching stable slugs", () => {
  assert.equal(
    normalizeTanStackRoute(
      "/api/orders/2a4f6a6d-c422-4cc5-b659-8c074a64450b/items/42",
    ),
    "/api/orders/:id/items/:id",
  );
  assert.equal(
    normalizeTanStackRoute("/titanium/settings"),
    "/titanium/settings",
  );
  assert.equal(isDefaultIgnoredTanStackPath("/@vite/client"), true);
  assert.equal(isDefaultIgnoredTanStackPath("/api/orders"), false);
});

test("creates a server span with route metadata and safe payload capture", async () => {
  const result = await instrumentTanStackRequest(
    {
      request: new Request("https://app.test/api/orders/42", {
        method: "POST",
        headers: {
          authorization: "Bearer never-store-this",
          "content-type": "application/json",
        },
        body: JSON.stringify({ orderId: "order_1", password: "secret" }),
      }),
      pathname: "/api/orders/42",
      next: () =>
        Promise.resolve({
          response: Response.json(
            { ok: true, accessToken: "never-store-this" },
            { status: 201 },
          ),
          context: {},
        }),
    },
    { capturePayloads: true },
  );

  assert.equal(result instanceof Response, false);
  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.name, "POST /api/orders/:id");
  assert.equal(span.kind, 1);
  assert.equal(span.attributes["http.route"], "/api/orders/:id");
  assert.equal(span.attributes["outray.framework"], "tanstack-start");
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
  assert.equal(requestBody.orderId, "order_1");
  assert.equal(requestBody.password, "[REDACTED]");
  assert.equal(responseBody.accessToken, "[REDACTED]");
});

test("uses an application route resolver and preserves the original response", async () => {
  const response = new Response("ok", { status: 202 });
  const result = await instrumentTanStackRequest(
    {
      request: new Request("https://app.test/org-acme/orders/invoice-seven"),
      next: () => response,
    },
    {
      routeResolver: () => "/:orgSlug/orders/:orderSlug",
    },
  );

  assert.equal(result, response);
  assert.equal(
    exporter.getFinishedSpans()[0]?.name,
    "GET /:orgSlug/orders/:orderSlug",
  );
});

test("records HTTP metrics with the resolved TanStack route", async () => {
  await instrumentTanStackRequest(
    {
      request: new Request("https://app.test/api/orders/order_123"),
      next: () => new Response("ok", { status: 202 }),
    },
    { routeResolver: () => "/api/orders/:orderId" },
  );
  await meterProvider.forceFlush();

  const requestCount = metricExporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");
  const dataPoint = requestCount?.dataPoints.find(
    (point) => point.attributes["http.route"] === "/api/orders/:orderId",
  );

  assert.ok(dataPoint);
  assert.equal(dataPoint.attributes["outray.framework"], "tanstack-start");
  assert.equal(dataPoint.attributes["http.response.status_code"], 202);
});

test("renames the existing HTTP span instead of creating a duplicate", async () => {
  const httpSpan = provider.getTracer("http-test").startSpan("GET");
  const activeContext = trace.setSpan(context.active(), httpSpan);
  await context.with(activeContext, () =>
    instrumentTanStackRequest({
      request: new Request("https://app.test/api/users/123"),
      next: () => new Response("ok"),
    }),
  );
  httpSpan.end();

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1);
  assert.equal(spans[0]?.name, "GET /api/users/:id");
  assert.equal(spans[0]?.attributes["http.route"], "/api/users/:id");
});

test("ignored requests bypass instrumentation and still execute once", async () => {
  let executions = 0;
  const response = new Response("asset");
  const result = await instrumentTanStackRequest({
    request: new Request("https://app.test/@vite/client"),
    next: () => {
      executions += 1;
      return response;
    },
  });

  assert.equal(result, response);
  assert.equal(executions, 1);
  assert.equal(exporter.getFinishedSpans().length, 0);
});

test("default asset exclusions remain compatible and can be disabled without overriding custom ignores", async () => {
  const paths = ["/@vite/client", "/assets/application.js", "/favicon.ico", "/robots.txt"];
  for (const pathname of paths) {
    const response = new Response("asset", { status: 404 });
    let executions = 0;
    const context = {
      request: new Request(`https://app.test${pathname}`),
      next: () => { executions += 1; return response; },
    };
    assert.equal(await instrumentTanStackRequest(context), response);
    assert.equal(executions, 1);
    assert.equal(exporter.getFinishedSpans().length, 0);

    assert.equal(await instrumentTanStackRequest(context, { ignoreDefaultPaths: false }), response);
    const [span] = exporter.getFinishedSpans();
    assert.equal(span?.attributes["http.route"], pathname);
    assert.equal(span?.attributes["http.response.status_code"], 404);
    assert.equal(executions, 2);
    exporter.reset();

    assert.equal(await instrumentTanStackRequest(context, { ignoreDefaultPaths: false, ignore: () => true }), response);
    assert.equal(executions, 3);
    assert.equal(exporter.getFinishedSpans().length, 0);
  }
});

test("a shared per-request payload gate keeps concurrent sensitive requests metadata-only", async () => {
  const privateRequest = new Request("https://app.test/api/acme/secrets/reveal?token=private-query", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer private-header" },
    body: JSON.stringify({ value: "private-request-body" }),
  });
  const privateResponse = Response.json({ value: "private-response-body" });
  let privateClones = 0;
  privateRequest.clone = () => { privateClones += 1; throw new Error("must never clone private request"); };
  privateResponse.clone = () => { privateClones += 1; throw new Error("must never clone private response"); };

  const publicRequest = new Request("https://app.test/api/acme/uptime/monitors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Checkout" }),
  });
  const publicResponse = Response.json({ ok: true }, { status: 201 });
  const gateCalls = new Map<string, number>();
  const options = {
    capturePayloads: true,
    shouldCapturePayloads: ({ pathname, method }: { pathname: string; method?: string }) => {
      assert.equal(method, "POST");
      gateCalls.set(pathname, (gateCalls.get(pathname) ?? 0) + 1);
      return !pathname.includes("/secrets/");
    },
    routeResolver: ({ pathname }: { pathname: string }) => pathname.includes("/secrets/")
      ? "/api/:orgSlug/secrets/reveal" : "/api/:orgSlug/uptime/monitors",
  };
  const results = await Promise.all([
    instrumentTanStackRequest({ request: privateRequest, next: async () => {
      assert.equal(privateRequest.bodyUsed, false);
      assert.equal((await privateRequest.json()).value, "private-request-body");
      await Promise.resolve();
      return privateResponse;
    } }, options),
    instrumentTanStackRequest({ request: publicRequest, next: async () => {
      assert.equal(publicRequest.bodyUsed, false);
      assert.equal((await publicRequest.json()).name, "Checkout");
      await Promise.resolve();
      return publicResponse;
    } }, options),
  ]);
  assert.equal(results[0], privateResponse);
  assert.equal(results[1], publicResponse);
  assert.equal(privateResponse.bodyUsed, false);
  assert.equal(publicResponse.bodyUsed, false);
  assert.equal(privateClones, 0);
  assert.equal(options.capturePayloads, true, "the gate cannot mutate shared configuration");
  assert.deepEqual([...gateCalls.values()], [1, 1], "capture eligibility is resolved only once for each request");

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 2);
  const privateSpan = spans.find((span) => span.attributes["http.route"] === "/api/:orgSlug/secrets/reveal")!;
  const publicSpan = spans.find((span) => span.attributes["http.route"] === "/api/:orgSlug/uptime/monitors")!;
  assert.equal(privateSpan.attributes["http.response.status_code"], 200);
  assert.equal(Object.keys(privateSpan.attributes).some((key) => key.startsWith("outray.http.")), false);
  assert.doesNotMatch(JSON.stringify(privateSpan.attributes), /private-(?:query|header|request-body|response-body)/);
  assert.equal(JSON.parse(String(publicSpan.attributes["outray.http.request.body"])).name, "Checkout");
  assert.equal(JSON.parse(String(publicSpan.attributes["outray.http.response.body"])).ok, true);

  await meterProvider.forceFlush();
  const requestCount = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics).find((metric) => metric.descriptor.name === "http.server.request.count");
  for (const route of ["/api/:orgSlug/secrets/reveal", "/api/:orgSlug/uptime/monitors"]) {
    assert.ok(requestCount?.dataPoints.some((point) => point.attributes["http.route"] === route));
  }
});

test("payload gate failures fail closed before cloning without changing the handler or metrics", async () => {
  const request = new Request("https://app.test/api/capture-gate-failure", { method: "POST", body: "private-body" });
  const response = Response.json({ value: "private-response" }, { status: 202 });
  let clones = 0, evaluations = 0, executions = 0;
  request.clone = () => { clones += 1; throw new Error("unexpected request clone"); };
  response.clone = () => { clones += 1; throw new Error("unexpected response clone"); };
  const result = await instrumentTanStackRequest({ request, next: () => {
    executions += 1;
    assert.equal(request.bodyUsed, false);
    return response;
  } }, { capturePayloads: true, shouldCapturePayloads: () => {
    evaluations += 1;
    throw new Error("private capture predicate failure");
  } });
  assert.equal(result, response);
  assert.equal(clones, 0);
  assert.equal(evaluations, 1);
  assert.equal(executions, 1);
  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.attributes["http.response.status_code"], 202);
  assert.equal(Object.keys(span.attributes).some((key) => key.startsWith("outray.http.")), false);
  assert.equal(span.events.length, 0);
  await meterProvider.forceFlush();
  const point = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics).find((metric) => metric.descriptor.name === "http.server.request.count")
    ?.dataPoints.find((entry) => entry.attributes["http.route"] === "/api/capture-gate-failure");
  assert.equal(point?.attributes["http.response.status_code"], 202);
});

test("a payload predicate cannot enable capture when the static setting is disabled", async () => {
  let evaluations = 0;
  const response = Response.json({ ok: true });
  assert.equal(await instrumentTanStackRequest({
    request: new Request("https://app.test/api/no-payload-setting"), next: () => response,
  }, { capturePayloads: false, shouldCapturePayloads: () => { evaluations += 1; return true; } }), response);
  assert.equal(evaluations, 0);
  assert.equal(Object.keys(exporter.getFinishedSpans()[0]!.attributes).some((key) => key.startsWith("outray.http.")), false);
});

test("a throwing enumerable payload-policy getter cannot interrupt TanStack requests", async () => {
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
  assert.equal(await instrumentTanStackRequest({ request, next: () => response }, options), response);
  assert.equal(evaluations, 1);
  assert.equal(clones, 0);
  assert.equal(exporter.getFinishedSpans()[0]?.attributes["http.response.status_code"], 202);
  await meterProvider.forceFlush();
  const count = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics).flatMap((scope) => scope.metrics)
    .find((metric) => metric.descriptor.name === "http.server.request.count");
  assert.ok(count?.dataPoints.some((point) => point.attributes["http.route"] === "/api/throwing-policy-getter"));
});

test("records failures without swallowing them", async () => {
  const failure = new Error("handler failed");
  await assert.rejects(
    instrumentTanStackRequest({
      request: new Request("https://app.test/api/fail"),
      next: () => Promise.reject(failure),
    }),
    failure,
  );

  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.status.code, 2);
  assert.equal(
    span.events.some((event) => event.name === "exception"),
    true,
  );
});

test("metadata-only requests omit query values, credentials, bodies, and exception details", async () => {
  const failure = new Error("private-database-query-parameter");
  await assert.rejects(instrumentTanStackRequest({
    request: new Request("https://app.test/api/orders?token=private-query-value", {
      method: "POST",
      headers: { authorization: "Bearer private-header-value", "content-type": "application/json" },
      body: JSON.stringify({ password: "private-body-value" }),
    }),
    next: () => Promise.reject(failure),
  }, { capturePayloads: false, recordExceptions: false }), failure);

  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.status.code, 2);
  assert.equal(span.attributes["http.route"], "/api/orders");
  assert.equal(span.events.length, 0);
  const serialized = JSON.stringify({ name: span.name, attributes: span.attributes, events: span.events });
  for (const value of ["private-query-value", "private-header-value", "private-body-value", failure.message]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("metadata-only failures keep generic HTTP status without leaking error names into spans or metrics", async () => {
  for (const useActiveSpan of [false, true]) {
    const failure = new Error("private-exception-message");
    failure.name = "private-database-query-error-name";
    const route = useActiveSpan ? "/api/metadata-failure-active" : "/api/metadata-failure-new";
    const request = new Request(`https://app.test${route}`);
    const activeSpan = useActiveSpan ? provider.getTracer("metadata-only-test").startSpan("incoming") : undefined;
    const run = () => instrumentTanStackRequest({ request, next: () => Promise.reject(failure) }, {
      capturePayloads: true, shouldCapturePayloads: () => false, recordExceptions: false,
    });
    await assert.rejects(activeSpan ? context.with(trace.setSpan(context.active(), activeSpan), run) : run(), failure);
    activeSpan?.end();
    const span = exporter.getFinishedSpans().find((candidate) => candidate.attributes["http.route"] === route)!;
    assert.equal(span.attributes["http.response.status_code"], 500);
    assert.equal(span.status.code, 2);
    assert.equal(span.events.length, 0);
    assert.doesNotMatch(JSON.stringify({ name: span.name, attributes: span.attributes, events: span.events, status: span.status }), /private-/);

    await meterProvider.forceFlush();
    const attributes = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics).flatMap((metric) => metric.dataPoints.map((point) => point.attributes))
      .filter((entry) => entry["http.route"] === route);
    assert.ok(attributes.length > 0);
    assert.ok(attributes.some((entry) => entry["http.response.status_code"] === 500));
    for (const entry of attributes) {
      assert.equal(entry["error.type"], undefined);
      assert.doesNotMatch(JSON.stringify(entry), /private-/);
    }
  }
});

test("capture failures never change the handler result", async () => {
  const request = new Request("https://app.test/api/consumed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  });
  await request.text();
  const response = Response.json({ ok: true });
  await response.text();

  const result = await instrumentTanStackRequest(
    { request, next: () => response },
    {
      capturePayloads: true,
      routeResolver: () => {
        throw new Error("bad telemetry resolver");
      },
      ignore: () => {
        throw new Error("bad telemetry filter");
      },
    },
  );

  assert.equal(result, response);
  assert.equal(exporter.getFinishedSpans()[0]?.name, "POST /api/consumed");
});

test("exposes a TanStack Start request middleware", async () => {
  const middleware = createOutrayTanStackMiddleware();
  assert.equal(typeof middleware.options.server, "function");

  const response = new Response("ok");
  const server = middleware.options.server as unknown as (context: {
    request: Request;
    pathname: string;
    context: Record<string, never>;
    next: () => {
      request: Request;
      pathname: string;
      context: Record<string, never>;
      response: Response;
    };
  }) => Promise<{ response: Response }>;
  const result = await server({
    request: new Request("https://app.test/health"),
    pathname: "/health",
    context: {},
    next: () => ({
      request: new Request("https://app.test/health"),
      pathname: "/health",
      context: {},
      response,
    }),
  });
  assert.equal((result as { response: Response }).response, response);
});

test("composes with TanStack Start global request middleware", async () => {
  const observabilityMiddleware = createOutrayTanStackMiddleware();
  const startInstance = createStart(() => ({
    requestMiddleware: [observabilityMiddleware],
  }));

  const options = await startInstance.getOptions();
  assert.equal(options.requestMiddleware?.length, 1);
});
