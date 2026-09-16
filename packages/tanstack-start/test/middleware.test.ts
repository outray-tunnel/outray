import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
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

before(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(provider);
});

beforeEach(() => exporter.reset());

after(async () => {
  await provider.shutdown();
  contextManager.disable();
  context.disable();
  trace.disable();
});

test("normalizes obvious route identifiers without touching stable slugs", () => {
  assert.equal(
    normalizeTanStackRoute(
      "/api/orders/2a4f6a6d-c422-4cc5-b659-8c074a64450b/items/42",
    ),
    "/api/orders/:id/items/:id",
  );
  assert.equal(normalizeTanStackRoute("/titanium/settings"), "/titanium/settings");
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
  assert.equal(span.events.some((event) => event.name === "exception"), true);
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
  assert.equal(
    exporter.getFinishedSpans()[0]?.name,
    "POST /api/consumed",
  );
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
