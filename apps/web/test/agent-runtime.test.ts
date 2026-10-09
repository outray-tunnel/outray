import assert from "node:assert/strict";
import test from "node:test";
import type { LanguageModelV4FinishReason, LanguageModelV4StreamPart, LanguageModelV4StreamResult, LanguageModelV4Usage } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { readAgentConfig, type AgentConfig } from "../src/lib/agent/config";
import { createAgentEvidenceReader, type AgentEvidenceEndpoint, type AgentEvidenceParameters, type AgentEvidenceQuery } from "../src/lib/agent/evidence";
import type { AgentSavedMessage, AgentStreamEvent } from "../src/lib/agent/protocol";
import { AGENT_INSTRUCTIONS, agentModelHistory, runAgentInvestigation } from "../src/lib/agent/runtime";

const traceId = "a".repeat(32);
const otherTraceId = "b".repeat(32);
const spanId = "c".repeat(16);
const requestId = `${traceId}:${spanId}`;
const organizationId = "server-resolved-org";
const orgSlug = "acme";
const config = readAgentConfig({ XAI_API_KEY: "offline-never-used", AGENT_GROK_MODEL: "grok-4.7" });

function usage(input = 5, output = 3): LanguageModelV4Usage {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

function finish(reason: LanguageModelV4FinishReason["unified"] = "stop", input = 5, output = 3): LanguageModelV4StreamPart {
  return { type: "finish", finishReason: { unified: reason, raw: undefined }, usage: usage(input, output) };
}

function textParts(parts = ["Observed ", "a failed request."], input = 5, output = 3): LanguageModelV4StreamPart[] {
  return [
    { type: "text-start", id: "answer" },
    ...parts.map((delta): LanguageModelV4StreamPart => ({ type: "text-delta", id: "answer", delta })),
    { type: "text-end", id: "answer" }, finish("stop", input, output),
  ];
}

function toolParts(toolName: string, input: unknown, toolCallId: string): LanguageModelV4StreamPart[] {
  return [{ type: "tool-call", toolName, input: JSON.stringify(input), toolCallId }, finish("tool-calls")];
}

function response(chunks: LanguageModelV4StreamPart[]): LanguageModelV4StreamResult {
  return { stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null }) };
}

function message(id: string, text: string, role: AgentSavedMessage["role"] = "user", status: AgentSavedMessage["status"] = "complete"): AgentSavedMessage {
  return { id, text, role, status, steps: [], evidence: [] };
}

type QueryCall = { endpoint: AgentEvidenceEndpoint; parameters: AgentEvidenceParameters; options: { cache: "no-store"; signal?: AbortSignal } };
function telemetry(call: QueryCall): unknown[] {
  switch (call.endpoint) {
    case "http_request_details": return [{
      id: requestId, trace_id: traceId, span_id: spanId, method: "GET", route: "/payments/:id",
      path: "/payments/123?token=private-query", service: "payments-worker", timestamp: "2026-10-08 12:30:00",
      status_code: 503, is_error: 1, duration_ms: 80, capture_state: "full",
      request_headers: "private-header", request_body: "private-body", response_body: "private-response",
      request_query: "private-query", client_address: "192.168.1.1", attributes: { secret: "private-attribute" },
    }];
    case "trace_details": return [{
      trace_id: traceId, span_id: spanId, parent_span_id: "", name: "GET /payments/:id", service: "payments-worker",
      started_at: "2026-10-08 12:30:00", duration_ms: 80, offset_ms: 0, status: "error", kind: 2,
      status_message: "private-status", attributes: { secret: "private-attribute" },
    }];
    case "logs": return [{
      id: "private-event-id", trace_id: traceId, span_id: spanId, service: "payments-worker", level: "error", severity_number: 17,
      timestamp: "2026-10-08 12:30:00", observed_timestamp: "2026-10-08 12:30:01", message: "timeout for private-person@example.com",
    }];
    case "http_request_stats": return [{ total_requests: 10, error_requests: 2, error_rate: 20, p95_duration_ms: 100 }];
    default: return [];
  }
}

function harness(options: {
  streams?: LanguageModelV4StreamPart[][];
  attached?: boolean;
  signal?: AbortSignal;
  config?: Partial<AgentConfig>;
  history?: AgentSavedMessage[];
  query?: (call: QueryCall) => unknown[] | Promise<unknown[]>;
  model?: MockLanguageModelV4;
} = {}) {
  const events: AgentStreamEvent[] = [];
  const usages: Array<{ inputTokens: number; outputTokens: number }> = [];
  const calls: QueryCall[] = [];
  const signal = options.signal ?? new AbortController().signal;
  const query: AgentEvidenceQuery = async <T>(endpoint: AgentEvidenceEndpoint, parameters: AgentEvidenceParameters, queryOptions: QueryCall["options"]) => {
    const call = { endpoint, parameters, options: queryOptions };
    calls.push(call);
    return await (options.query ?? telemetry)(call) as T[];
  };
  const reader = createAgentEvidenceReader({ organizationId, orgSlug, signal, query, ...(options.attached ? { requestId } : {}) });
  const model = options.model ?? new MockLanguageModelV4({ doStream: (options.streams ?? [textParts()]).map(response) });
  return {
    events, usages, calls, model, signal,
    run: () => runAgentInvestigation({
      config: { ...config, ...options.config }, reader, model, signal,
      history: options.history ?? [message("latest-user", "Explain the observed request.")],
      sourceRequestId: options.attached ? requestId : null,
      emit: (event) => { events.push(event); },
      onUsage: (usage) => { usages.push({ ...usage }); },
    }),
  };
}

test("server model history excludes unfinished assistant output and redacts saved prompts", () => {
  const history = agentModelHistory([
    message("user", 'Why did {"password":"DO_NOT_FORWARD"} fail? https://user:PRIVATE_CREDENTIAL@example.com/api?token=PRIVATE_QUERY'),
    message("completed", "An observed fact.", "assistant"),
    message("running", "unfinished-private-reasoning", "assistant", "running"),
    message("failed", "failed-private-provider-error", "assistant", "failed"),
    message("cancelled", "cancelled-private-output", "assistant", "cancelled"),
    message("newest", "Check Authorization: Basic PRIVATE_BASE64"),
  ]);
  assert.deepEqual(history.map((item) => item.role), ["user", "assistant", "user"]);
  const serialized = JSON.stringify(history);
  for (const forbidden of ["DO_NOT_FORWARD", "PRIVATE_CREDENTIAL", "PRIVATE_QUERY", "PRIVATE_BASE64", "unfinished-private", "failed-private", "cancelled-private"]) assert.ok(!serialized.includes(forbidden), forbidden);
  assert.ok(serialized.includes("[redacted]"));
});

test("history retains chronological recent messages with per-message and total character bounds", () => {
  const history = agentModelHistory(Array.from({ length: 20 }, (_, index) => message(String(index), `entry-${index}:` + "x".repeat(5_000), index % 2 ? "assistant" : "user")));
  assert.equal(history.length, 4);
  assert.deepEqual(history.map((item) => String(item.content).slice(0, 9)), ["entry-16:", "entry-17:", "entry-18:", "entry-19:"]);
  assert.equal(history.reduce((total, item) => total + String(item.content).length, 0), 16_000);
  assert.ok(history.every((item) => String(item.content).length <= 4_000));
  const short = agentModelHistory(Array.from({ length: 20 }, (_, index) => message(String(index), `entry-${index}`)));
  assert.equal(short.length, 12);
  assert.equal(short[0].content, "entry-8");
  assert.equal(short.at(-1)?.content, "entry-19");
});

test("attached request uses real scoped reader and emits complete evidence before model text", async () => {
  const f = harness({ attached: true, streams: [textParts(["A 503 ", "was observed."], 12, 7)] });
  const result = await f.run();
  assert.deepEqual(result, { text: "A 503 was observed.", inputTokens: 12, outputTokens: 7 });
  assert.deepEqual(f.events.map((event) => event.type), ["step", "step", "evidence", "text", "text"]);
  const running = f.events[0];
  const completed = f.events[1];
  assert.equal(running.type, "step");
  assert.equal(completed.type, "step");
  if (running.type !== "step" || completed.type !== "step") assert.fail("Missing request steps");
  assert.equal(running.step.status, "running");
  assert.equal(completed.step.status, "complete");
  assert.equal(running.step.id, completed.step.id);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].parameters, { request_id: requestId, organization_id: organizationId });
  assert.equal(f.calls[0].options.cache, "no-store");
  assert.equal(f.calls[0].options.signal, f.signal);
  const evidence = f.events[2];
  if (evidence.type !== "evidence") assert.fail("Missing evidence event");
  assert.deepEqual(Object.keys(evidence.evidence[0]).sort(), ["href", "id", "label", "observedAt", "presentation"]);
  assert.equal(evidence.evidence[0].id, `request:${requestId}`);
  assert.deepEqual(evidence.evidence[0].presentation, {
    kind: "request", method: "GET", route: "/payments/:id", service: "payments-worker",
    statusCode: 503, durationMs: 80, timestamp: "2026-10-08T12:30:00.000Z",
    captureState: "full", requestSizeBytes: null, responseSizeBytes: null,
  });
  assert.doesNotMatch(JSON.stringify(evidence), /private-|192\.168|headers|attributes|payload/);
  const prompt = JSON.stringify(f.model.doStreamCalls[0].prompt);
  assert.ok(f.model.doStreamCalls[0].prompt.some((item) => item.role === "system" && item.content === AGENT_INSTRUCTIONS));
  assert.ok(prompt.includes(`Attached request ${requestId}`));
  assert.ok(prompt.includes("untrusted_telemetry"));
  for (const forbidden of ["private-header", "private-body", "private-query", "private-attribute", "192.168.1.1"]) assert.ok(!prompt.includes(forbidden), forbidden);
  assert.deepEqual(f.model.doStreamCalls[0].providerOptions?.xai, { store: false, parallelToolCalls: false, reasoningEffort: "low" });
  assert.equal(f.model.doStreamCalls[0].maxOutputTokens, config.maxOutputTokens);
});

test("SDK multi-step tool calls execute only typed scoped reads and accumulate usage", async () => {
  const f = harness({ attached: true, streams: [
    toolParts("inspectTrace", { traceId }, "trace-call"),
    toolParts("findRelatedLogs", { traceId }, "logs-call"),
    toolParts("compareRequests", { service: "payments-worker", hours: 24 }, "comparison-call"),
    textParts(["The request and trace show an error; related logs mention a timeout."], 11, 9),
  ] });
  const result = await f.run();
  assert.equal(result.inputTokens, 26);
  assert.equal(result.outputTokens, 18);
  assert.deepEqual(f.usages, [
    { inputTokens: 5, outputTokens: 3 }, { inputTokens: 10, outputTokens: 6 },
    { inputTokens: 15, outputTokens: 9 }, { inputTokens: 26, outputTokens: 18 },
  ]);
  assert.deepEqual(f.calls.map((call) => call.endpoint), ["http_request_details", "trace_details", "logs", "http_request_stats", "http_request_stats"]);
  assert.ok(f.calls.every((call) => call.parameters.organization_id === organizationId && call.options.cache === "no-store" && call.options.signal === f.signal));
  assert.equal(f.calls[1].parameters.trace_id, traceId);
  assert.deepEqual(f.calls[2].parameters, { trace_id: traceId, hours: 24, limit: 20, organization_id: organizationId });
  assert.deepEqual(f.calls.slice(3).map((call) => call.parameters.hours), [24, 1]);
  assert.equal(f.model.doStreamCalls.length, 4);
  const lastPrompt = JSON.stringify(f.model.doStreamCalls.at(-1)?.prompt);
  assert.ok(lastPrompt.includes("messageSummary"));
  assert.ok(lastPrompt.includes("[message withheld; timeout mentioned]"));
  assert.ok(lastPrompt.includes("measurementScope"));
  for (const forbidden of ["private-status", "private-attribute", "private-person", "private-event-id", "private-body"]) assert.ok(!lastPrompt.includes(forbidden), forbidden);
  assert.equal(f.events.filter((event) => event.type === "step" && event.step.status === "running").length, 4);
  const references = f.events.flatMap((event) => event.type === "evidence" ? event.evidence : []);
  assert.deepEqual(references.map((reference) => reference.presentation?.kind), ["request", "trace", "log", "comparison", "comparison"]);
  const trace = references[1].presentation;
  assert.equal(trace?.kind, "trace");
  if (trace?.kind === "trace") assert.deepEqual(trace.spans.map(({ operationName, offsetMs, durationMs }) => ({ operationName, offsetMs, durationMs })), [{ operationName: "GET /payments/:id", offsetMs: 0, durationMs: 80 }]);
  assert.doesNotMatch(JSON.stringify(references), /private-|192\.168|headers|attributes|payload/);
});

test("answer instructions request readable Markdown and interpretation without raw telemetry dumps", () => {
  assert.match(AGENT_INSTRUCTIONS, /Use Markdown/);
  assert.match(AGENT_INSTRUCTIONS, /Findings/);
  assert.match(AGENT_INSTRUCTIONS, /Next checks/);
  assert.match(AGENT_INSTRUCTIONS, /Refer to evidence by human-readable names/);
  assert.match(AGENT_INSTRUCTIONS, /overlapping/);
  assert.doesNotMatch(AGENT_INSTRUCTIONS, /answer in plain text/i);
});

test("unrelated trace tool calls remain unavailable without invoking an out-of-scope query", async () => {
  const f = harness({ attached: true, streams: [toolParts("inspectTrace", { traceId: otherTraceId }, "foreign-trace"), textParts(["That trace is outside the attached request context."])] });
  await f.run();
  assert.deepEqual(f.calls.map((call) => call.endpoint), ["http_request_details"]);
  const failed = f.events.find((event) => event.type === "step" && event.step.status === "failed");
  assert.ok(failed);
  assert.ok(JSON.stringify(f.model.doStreamCalls[1].prompt).includes("out_of_scope"));
  assert.equal(f.events.filter((event) => event.type === "evidence").length, 1);
});

test("empty evidence and query errors receive distinct honest step details", async () => {
  for (const queryFails of [false, true]) {
    const f = harness({ attached: true, query: () => {
      if (queryFails) throw new Error("PRIVATE_PROVIDER_ERROR credentials=PRIVATE_VALUE");
      return [];
    }, streams: [textParts(["The requested evidence is not available."])] });
    await f.run();
    const step = f.events[1];
    if (step.type !== "step") assert.fail("Missing terminal request step");
    assert.equal(step.step.status, queryFails ? "failed" : "complete");
    assert.equal(step.step.detail, queryFails ? "Evidence unavailable; this is not an empty result." : "No matching evidence in this query.");
    assert.equal(f.events.filter((event) => event.type === "evidence").length, 0);
    assert.ok(!JSON.stringify(f.events).includes("PRIVATE_PROVIDER_ERROR"));
    assert.ok(!JSON.stringify(f.model.doStreamCalls[0].prompt).includes("PRIVATE_VALUE"));
  }
});

test("reasoning, raw provider parts, response metadata, sources and files are never emitted", async () => {
  const parts: LanguageModelV4StreamPart[] = [
    { type: "reasoning-start", id: "hidden" },
    { type: "reasoning-delta", id: "hidden", delta: "PRIVATE_HIDDEN_REASONING" },
    { type: "reasoning-end", id: "hidden" },
    { type: "response-metadata", id: "PRIVATE_RESPONSE_ID", modelId: "PRIVATE_MODEL_ID", timestamp: new Date() },
    { type: "source", sourceType: "url", id: "PRIVATE_SOURCE_ID", url: "https://private-source.example", title: "PRIVATE_SOURCE_TITLE" },
    { type: "file", mediaType: "text/plain", data: { type: "data", data: "UFJJVkFURV9GSUxF" } },
    { type: "raw", rawValue: { authorization: "PRIVATE_RAW_CREDENTIAL" } },
    { type: "text-start", id: "public", providerMetadata: { xai: { internal: "PRIVATE_TEXT_METADATA" } } },
    { type: "text-delta", id: "public", delta: "An observed fact.", providerMetadata: { xai: { internal: "PRIVATE_DELTA_METADATA" } } },
    { type: "text-end", id: "public" },
    { type: "finish", finishReason: { unified: "stop", raw: "PRIVATE_RAW_FINISH" }, usage: usage(), providerMetadata: { xai: { internal: "PRIVATE_FINISH_METADATA" } } },
  ];
  const model = new MockLanguageModelV4({ doStream: async () => ({ ...response(parts), request: { body: "PRIVATE_REQUEST_BODY" }, response: { headers: { authorization: "PRIVATE_RESPONSE_HEADER" } } }) });
  const f = harness({ model });
  const result = await f.run();
  assert.equal(result.text, "An observed fact.");
  assert.deepEqual(f.events, [{ type: "text", delta: "An observed fact." }]);
  assert.ok(!JSON.stringify({ result, events: f.events }).includes("PRIVATE"));
});

test("provider exceptions and streamed provider errors expose neither browser nor console payloads", async (t) => {
  const loggedErrors = t.mock.method(console, "error", () => {});
  for (const model of [
    new MockLanguageModelV4({ doStream: async () => { throw new Error("PRIVATE_PROVIDER_EXCEPTION Authorization: Bearer PRIVATE_KEY"); } }),
    new MockLanguageModelV4({ doStream: response([{ type: "error", error: new Error("PRIVATE_STREAM_ERROR body=PRIVATE_BODY") }]) }),
  ]) {
    const f = harness({ model });
    await assert.rejects(f.run(), (error: unknown) => error instanceof Error && error.message === "Grok could not complete this investigation.");
    assert.equal(f.events.length, 0);
  }
  assert.equal(loggedErrors.mock.callCount(), 0, "SDK provider exceptions must not be logged verbatim");
});

test("aborted investigations stop before querying telemetry or invoking the offline model", async () => {
  const controller = new AbortController();
  controller.abort();
  const f = harness({ attached: true, signal: controller.signal });
  await assert.rejects(f.run());
  assert.equal(f.calls.length, 0);
  assert.equal(f.model.doStreamCalls.length, 0);
  assert.equal(f.events.length, 0);
});

test("cancellation during provider streaming emits no text after the abort", async () => {
  const controller = new AbortController();
  const f = harness({ signal: controller.signal, model: new MockLanguageModelV4({ doStream: async () => ({ stream: new ReadableStream<LanguageModelV4StreamPart>({ start(stream) {
    stream.enqueue({ type: "text-start", id: "answer" });
    controller.abort();
    stream.enqueue({ type: "text-delta", id: "answer", delta: "PRIVATE_POST_ABORT_TEXT" });
    stream.close();
  } }) }) }) });
  await assert.rejects(f.run());
  assert.equal(f.events.length, 0);
});

test("invalid model tool arguments never reach the reader even when an SDK loop continues", async () => {
  const f = harness({ streams: [
    toolParts("inspectRequest", { requestId, organization_id: "attacker-org" }, "extra-tenant"),
    toolParts("inspectTrace", { traceId: "invalid-trace" }, "invalid-trace"),
    toolParts("compareRequests", { hours: 720 }, "invalid-hours"),
    textParts(["Valid request context is required."]),
  ] });
  await f.run();
  assert.equal(f.calls.length, 0);
  assert.ok(f.events.every((event) => event.type === "text"));
  assert.equal(f.model.doStreamCalls.length, 4);
});

test("hard tool cap blocks excess model calls and disables tools on the following step", async () => {
  const f = harness({ config: { maxToolCalls: 1 }, streams: [
    [
      { type: "tool-call", toolName: "inspectTrace", input: JSON.stringify({ traceId }), toolCallId: "allowed" },
      { type: "tool-call", toolName: "findRelatedLogs", input: JSON.stringify({ traceId }), toolCallId: "over-budget" },
      finish("tool-calls"),
    ],
    textParts(["The investigation tool budget was reached."]),
  ] });
  await f.run();
  assert.deepEqual(f.calls.map((call) => call.endpoint), ["trace_details"]);
  assert.equal(f.events.filter((event) => event.type === "step" && event.step.status === "running").length, 1);
  assert.deepEqual(f.model.doStreamCalls[1].toolChoice, { type: "none" });
});

test("a provider finish without any answer text is not treated as a successful response", async () => {
  const f = harness({ streams: [[finish()]] });
  await assert.rejects(f.run(), /No answer was generated/);
  assert.equal(f.events.length, 0);
});

test("final allowed SDK step disables further tools and attached-request inspection consumes the tool budget", async () => {
  const lastStep = harness({ config: { maxSteps: 2 }, streams: [toolParts("inspectTrace", { traceId }, "first"), textParts(["The trace was observed."])] });
  await lastStep.run();
  assert.equal(lastStep.model.doStreamCalls.length, 2);
  assert.deepEqual(lastStep.model.doStreamCalls[1].toolChoice, { type: "none" });
  const attached = harness({ attached: true, config: { maxToolCalls: 1 } });
  await attached.run();
  assert.deepEqual(attached.model.doStreamCalls[0].toolChoice, { type: "none" });
  assert.deepEqual(attached.calls.map((call) => call.endpoint), ["http_request_details"]);
});

test("a run reaching its cumulative SDK token stop never makes another provider call", async () => {
  const f = harness({ config: { maxTotalTokens: 8 }, streams: [toolParts("inspectTrace", { traceId }, "budget-stop"), textParts(["This second call must not run."])] });
  await assert.rejects(f.run(), /No answer was generated/);
  assert.equal(f.model.doStreamCalls.length, 1);
  assert.deepEqual(f.calls.map((call) => call.endpoint), ["trace_details"]);
});

test("response character cap aborts a malformed overlong provider response", async () => {
  const f = harness({ streams: [textParts(["x".repeat(33_000)])] });
  await assert.rejects(f.run(), /Agent response limit reached/);
  const text = f.events.filter((event): event is Extract<AgentStreamEvent, { type: "text" }> => event.type === "text").map((event) => event.delta).join("");
  assert.equal(text.length, 32_000);
});

test("usage reports completed provider steps even if the following provider step fails", async (t) => {
  const loggedErrors = t.mock.method(console, "error", () => {});
  let call = 0;
  const f = harness({ model: new MockLanguageModelV4({ doStream: async () => {
    if (call++ === 0) return response(toolParts("inspectTrace", { traceId }, "completed-step"));
    throw new Error("PRIVATE_FAILURE_AFTER_COMPLETED_STEP");
  } }) });
  await assert.rejects(f.run(), /Grok could not complete this investigation/);
  assert.deepEqual(f.usages, [{ inputTokens: 5, outputTokens: 3 }]);
  assert.equal(f.model.doStreamCalls.length, 2);
  assert.equal(loggedErrors.mock.callCount(), 0);
});

test("streamed model tool-argument deltas cannot become browser events", async () => {
  const input = JSON.stringify({ traceId: "PRIVATE_MODEL_ARGUMENT" });
  const f = harness({ streams: [
    [
      { type: "tool-input-start", id: "arguments", toolName: "inspectTrace", title: "PRIVATE_MODEL_TITLE" },
      { type: "tool-input-delta", id: "arguments", delta: input },
      { type: "tool-input-end", id: "arguments" },
      { type: "tool-call", toolCallId: "arguments", toolName: "inspectTrace", input },
      finish("tool-calls"),
    ],
    textParts(["A valid trace identifier is required."]),
  ] });
  await f.run();
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.events, [{ type: "text", delta: "A valid trace identifier is required." }]);
});

test("cancelling during initial request retrieval cannot emit evidence or invoke a model", async () => {
  const controller = new AbortController();
  const f = harness({ attached: true, signal: controller.signal, query: (call) => {
    controller.abort();
    return telemetry(call);
  } });
  await assert.rejects(f.run());
  assert.equal(f.model.doStreamCalls.length, 0);
  assert.deepEqual(f.events.map((event) => event.type), ["step", "step"]);
  const failed = f.events[1];
  if (failed.type !== "step") assert.fail("Missing cancelled request step");
  assert.equal(failed.step.status, "failed");
  assert.equal(failed.step.detail, "Investigation stopped.");
});
