import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { LogRecord } from "@opentelemetry/api-logs";
import { instrumentTanStackRequest } from "@outray/tanstack-start";
import { captureConsoleLogs, type OutrayConsoleTarget } from "../../../packages/observability/src/logging";
import {
  resolveInternalObservabilityOptions,
  runWithInternalObservabilityRequest,
} from "../src/lib/internal-observability.server";

const spans = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] });
const contextManager = new AsyncLocalStorageContextManager();
const options = resolveInternalObservabilityOptions({
  OUTRAY_INTERNAL_OBSERVABILITY_API_KEY: "synthetic-capture-test",
  OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT: "https://ingest.ops.example.test",
})!;

before(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(provider);
});
beforeEach(() => spans.reset());
after(async () => {
  await provider.shutdown();
  contextManager.disable();
  context.disable();
  trace.disable();
});

function capturedConsole() {
  const records: LogRecord[] = [], localCalls: unknown[][] = [];
  const write = (...args: unknown[]) => { localCalls.push(args); };
  const target: OutrayConsoleTarget = { debug: write, error: write, info: write, log: write, warn: write };
  const restore = captureConsoleLogs({ emit(record) { records.push(record); } }, target, options.shouldCaptureLog);
  return { records, localCalls, target, restore };
}

test("internal capture keeps useful JSON payloads and logs while redacting credentials and opaque nested captures", async () => {
  const logs = capturedConsole();
  const request = new Request("https://app.example.test/api/acme/uptime/monitors?token=private-query", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer private-header", cookie: "session=private-cookie" },
    body: JSON.stringify({ name: "Checkout", url: "https://example.test/health", password: "private-password", body: '{"token":"private-opaque"}' }),
  });
  const response = Response.json({ ok: true, apiKey: "private-response-key" }, { status: 201, headers: { "set-cookie": "session=private-response-cookie" } });
  try {
    const result = await runWithInternalObservabilityRequest(request, () => instrumentTanStackRequest({
      request,
      next: async () => {
        assert.equal((await request.json()).name, "Checkout", "capture must not consume the application's body");
        logs.target.info("monitor created", { name: "Checkout", accessToken: "private-log-token" });
        return response;
      },
    }, options));
    assert.equal(result, response);
    assert.equal((await result.json()).apiKey, "private-response-key", "redaction must not change the application response");
    const [span] = spans.getFinishedSpans();
    assert.ok(span);
    const requestBody = JSON.parse(String(span.attributes["outray.http.request.body"]));
    const responseBody = JSON.parse(String(span.attributes["outray.http.response.body"]));
    assert.equal(requestBody.name, "Checkout");
    assert.equal(requestBody.password, "[REDACTED]");
    assert.equal(requestBody.body, "[REDACTED]");
    assert.equal(responseBody.ok, true);
    assert.equal(responseBody.apiKey, "[REDACTED]");
    assert.equal(logs.records.length, 1);
    assert.match(String(logs.records[0].body), /monitor created/);
    const exported = JSON.stringify({ attributes: span.attributes, events: span.events, logs: logs.records });
    assert.doesNotMatch(exported, /private-(?:query|header|cookie|password|opaque|response-key|response-cookie|log-token)/);
    assert.equal(logs.localCalls.length, 1);
  } finally { logs.restore(); }
});

test("sensitive endpoints still execute but export neither payloads, spans nor console logs", async () => {
  const logs = capturedConsole();
  const request = new Request("https://app.example.test/api/acme/secrets/entries/key/reveal");
  const response = Response.json({ value: "private-secret-result" });
  try {
    const result = await runWithInternalObservabilityRequest(request, () => instrumentTanStackRequest({ request, next: async () => {
      await Promise.resolve();
      logs.target.error("secret diagnostic", { value: "private-secret-result" });
      return response;
    } }, options));
    assert.equal(result, response);
    assert.equal(spans.getFinishedSpans().length, 0);
    assert.equal(logs.records.length, 0);
    assert.equal(logs.localCalls.length, 1, "local application logging is preserved");
  } finally { logs.restore(); }
});
