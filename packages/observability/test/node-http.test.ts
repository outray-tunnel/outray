import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { after, before, beforeEach, test } from "node:test";
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { createOutrayNodeHttpMiddleware } from "../src/index.js";

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

test("creates a bounded server span without a Node preloader", () => {
  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = 201;
  let activeDuringNext = false;

  createOutrayNodeHttpMiddleware()(
    {
      method: "POST",
      originalUrl: "/orders/2a4f6a6d-c422-4cc5-b659-8c074a64450b?view=full",
      baseUrl: "/orders",
      route: { path: "/:orderId" },
    },
    response,
    () => {
      activeDuringNext = Boolean(trace.getActiveSpan());
      response.emit("finish");
    },
  );

  assert.equal(activeDuringNext, true);
  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.name, "POST /orders/:orderId");
  assert.equal(span.attributes["http.route"], "/orders/:orderId");
  assert.equal(span.attributes["http.response.status_code"], 201);
});

test("marks server failures and honors request filters", () => {
  const failedResponse = new EventEmitter() as EventEmitter & {
    statusCode: number;
  };
  failedResponse.statusCode = 503;
  const middleware = createOutrayNodeHttpMiddleware({
    ignore: (request) => request.path === "/health",
  });

  middleware({ method: "GET", path: "/api/fail" }, failedResponse, () => {
    failedResponse.emit("finish");
  });
  middleware(
    { method: "GET", path: "/health" },
    new EventEmitter() as EventEmitter & { statusCode?: number },
    () => undefined,
  );

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1);
  assert.equal(spans[0]?.status.code, 2);
});
