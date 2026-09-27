import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { withOutraySpan } from "../src/index.js";

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

test("runs application work inside a child span", async () => {
  const result = await withOutraySpan(
    "load order",
    async (span) => {
      span.setAttribute("order.id", "order_123");
      return "complete";
    },
    { attributes: { "app.operation": "load" } },
  );

  assert.equal(result, "complete");
  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.name, "load order");
  assert.equal(span.attributes["app.operation"], "load");
  assert.equal(span.attributes["order.id"], "order_123");
});

test("records and rethrows application errors", async () => {
  const failure = new Error("database unavailable");

  await assert.rejects(
    withOutraySpan("load order", async () => {
      throw failure;
    }),
    (error) => error === failure,
  );

  const [span] = exporter.getFinishedSpans();
  assert.ok(span);
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.events[0]?.name, "exception");
});
