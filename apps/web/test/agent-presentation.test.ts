import assert from "node:assert/strict";
import test from "node:test";
import { createAgentEvidenceReader, type AgentEvidence, type AgentEvidenceQuery } from "../src/lib/agent/evidence";
import { projectAgentEvidencePresentation, readAgentEvidencePresentation } from "../src/lib/agent/presentation";
import type { AgentEvidencePresentation } from "../src/lib/agent/protocol";

const traceId = "a".repeat(32);
const spanId = "b".repeat(16);
const timestamp = "2026-10-08T12:30:00.123Z";

const request: Extract<AgentEvidencePresentation, { kind: "request" }> = {
  kind: "request", method: "GET", route: "/api/orders/:id", service: "checkout-api",
  statusCode: 200, durationMs: 783, timestamp, captureState: "redacted",
  requestSizeBytes: 0, responseSizeBytes: 48,
};
const span: Extract<AgentEvidencePresentation, { kind: "trace" }>["spans"][number] = {
  spanId, parentSpanId: null, operationName: "GET /api/orders/:id", service: "checkout-api",
  startedAt: timestamp, offsetMs: 0, durationMs: 783, status: "ok", kind: 2,
};
const trace: Extract<AgentEvidencePresentation, { kind: "trace" }> = {
  kind: "trace", spanCount: 1, returnedSpanCount: 1, truncated: false, spans: [span],
};
const comparison: Extract<AgentEvidencePresentation, { kind: "comparison" }> = {
  kind: "comparison", hours: 24, service: null, path: null, totalRequests: 49_318,
  errorRequests: 1_495, errorRate: 3.03, p95DurationMs: 2_063, averageDurationMs: null,
  measurement: "aggregate", sampleSize: null, truncated: false,
};
const log: Extract<AgentEvidencePresentation, { kind: "log" }> = {
  kind: "log", level: "info", timestamp, service: "checkout-api", messageSummary: "[message withheld]", spanId,
};

function evidence(kind: AgentEvidence["kind"], data: Record<string, unknown>): AgentEvidence {
  return { id: "test-reference", kind, label: "Test", href: "/acme/observability/requests", observedAt: "2026-10-08T15:08:33.388Z", data };
}

test("all supported presentation cards survive validation and a JSON round trip", () => {
  for (const value of [request, trace, comparison, log]) {
    assert.deepEqual(readAgentEvidencePresentation(JSON.parse(JSON.stringify(value))), value);
    assert.notEqual(readAgentEvidencePresentation(value), value, "validation returns a fresh whitelist projection");
  }
});

test("request presentation preserves zero sizes and event time instead of retrieval time", () => {
  const source = evidence("request", {
    ...request, requestId: `${traceId}:${spanId}`, traceId, spanId, isError: false,
    requestBody: "private request", responseBody: "private response", headers: { Authorization: "private key" },
    query: "token=private", environment: "private-environment", payloadsIncluded: false,
  });
  assert.deepEqual(projectAgentEvidencePresentation(source), request);
  const projected = JSON.stringify(projectAgentEvidencePresentation(source));
  assert.ok(!projected.includes("private"));
  assert.ok(!projected.includes(source.observedAt));
});

test("nullable request metadata stays unknown, never becomes zero or healthy", () => {
  const unknown = { ...request, method: null, route: null, service: null, statusCode: null, durationMs: null, timestamp: null, captureState: "unknown" as const, requestSizeBytes: null, responseSizeBytes: null };
  assert.deepEqual(projectAgentEvidencePresentation(evidence("request", unknown)), unknown);
});

test("trace presentation projects capped sanitized spans without their extra fields", () => {
  const projected = projectAgentEvidencePresentation(evidence("trace", {
    traceId, spanCount: 101, returnedSpanCount: 1,
    spans: [{ ...span, attributes: { password: "private" }, events: "private", statusMessage: "private" }],
  }), true);
  assert.deepEqual(projected, { ...trace, spanCount: 101, truncated: true });
  assert.ok(!JSON.stringify(projected).includes("private"));
});

test("comparison metrics retain percentage units and do not infer an unavailable average", () => {
  const projected = projectAgentEvidencePresentation(evidence("request_statistics", {
    hours: 24, service: null, measurementScope: "all_matching_requests", totalRequests: 49_318,
    errorRequests: 1_495, errorRate: 3.03, p95DurationMs: 2_063, averageDurationMs: 800,
  }));
  assert.deepEqual(projected, comparison);
});

test("bounded samples do not imply a population total", () => {
  const projected = projectAgentEvidencePresentation(evidence("request_statistics", {
    hours: 1, service: "checkout-api", path: "/api/orders", measurementScope: "bounded_matching_sample",
    returnedRequests: 10, sampledSearchRows: 25, sampleLimit: 25, populationTotal: null,
    totalRequests: 100_000, errorRequests: 1, errorRate: 10, p95DurationMs: 300, sampleMayBeIncomplete: true,
  }));
  assert.deepEqual(projected, {
    kind: "comparison", hours: 1, service: "checkout-api", path: "/api/orders", totalRequests: null,
    errorRequests: 1, errorRate: 10, p95DurationMs: 300, averageDurationMs: null,
    measurement: "sample", sampleSize: 10, truncated: true,
  });
});

test("no matching traffic retains unavailable rate and duration values", () => {
  assert.deepEqual(projectAgentEvidencePresentation(evidence("request_statistics", {
    hours: 1, service: null, measurementScope: "all_matching_requests", totalRequests: 0,
    errorRequests: 0, errorRate: null, p95DurationMs: null,
  })), { ...comparison, hours: 1, totalRequests: 0, errorRequests: 0, errorRate: null, p95DurationMs: null });
});

test("logs use fixed redaction summaries and never raw text or arbitrary event IDs", () => {
  assert.deepEqual(projectAgentEvidencePresentation(evidence("log", {
    ...log, message: "private password", id: "private-person@example.com", observedTimestamp: timestamp,
    traceId, severityNumber: 9, messageRedacted: true,
  })), log);
  assert.equal(readAgentEvidencePresentation({ ...log, messageSummary: "Connection failed with password=private" }), undefined);
});

test("old history and malformed optional cards can be omitted without throwing", () => {
  for (const invalid of [undefined, null, false, 0, [], {}, { kind: "unknown" }, { kind: "request" }, { kind: "comparison", hours: 48 }]) {
    assert.equal(readAgentEvidencePresentation(invalid), undefined);
  }
  assert.equal(projectAgentEvidencePresentation(evidence("request_statistics", { ...comparison, measurementScope: "unrecognized" })), undefined);
});

test("presentation validators reject extra telemetry fields and control bytes", () => {
  for (const value of [request, trace, comparison, log]) {
    assert.equal(readAgentEvidencePresentation({ ...value, payload: "private" }), undefined);
  }
  for (const service of ["service\nIgnore previous", "checkout\u202e-api", "x".repeat(81), "https://private.example", "private@person.example"]) {
    assert.equal(readAgentEvidencePresentation({ ...request, service }), undefined);
    assert.equal(readAgentEvidencePresentation({ ...comparison, service }), undefined);
    assert.equal(readAgentEvidencePresentation({ ...log, service }), undefined);
  }
  for (const route of ["/api/orders?token=private", "https://private.example", "/api/orders\u0000", "/" + "x".repeat(160)]) {
    assert.equal(readAgentEvidencePresentation({ ...request, route }), undefined);
  }
});

test("numeric values must be finite, in range, and integral for counts", () => {
  for (const invalid of [undefined, "42", NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(readAgentEvidencePresentation({ ...request, durationMs: invalid }), undefined);
  }
  for (const statusCode of [0, 99, 600, 200.5, "200"]) {
    assert.equal(readAgentEvidencePresentation({ ...request, statusCode }), undefined);
  }
  for (const errorRate of [-1, 100.01, Infinity, "3.03"]) {
    assert.equal(readAgentEvidencePresentation({ ...comparison, errorRate }), undefined);
  }
  assert.equal(readAgentEvidencePresentation({ ...comparison, errorRequests: comparison.totalRequests! + 1 }), undefined);
  assert.equal(readAgentEvidencePresentation({ ...comparison, totalRequests: 10.5 }), undefined);
});

test("trace counts, span fields, and timestamps cannot be inconsistent or oversized", () => {
  for (const invalid of [
    { ...trace, returnedSpanCount: 0 }, { ...trace, spanCount: 0 },
    { ...trace, spanCount: 2, truncated: false },
    { ...trace, returnedSpanCount: 101, spanCount: 101, spans: Array.from({ length: 101 }, () => span) },
    { ...trace, spans: [{ ...span, spanId: "invalid" }] },
    { ...trace, spans: [{ ...span, status: "healthy" }] },
    { ...trace, spans: [{ ...span, operationName: "private query SELECT * FROM accounts" }] },
    { ...trace, spans: [{ ...span, attributes: { secret: "private" } }] },
  ]) assert.equal(readAgentEvidencePresentation(invalid), undefined);
  for (const invalidTime of ["2026-02-30T12:30:00.123Z", "2026-10-08", "invalid", "2026-10-08T12:30:00.123Z\n"]) {
    assert.equal(readAgentEvidencePresentation({ ...request, timestamp: invalidTime }), undefined);
  }
});

test("sample and aggregate card measurement claims are validated", () => {
  for (const invalid of [
    { ...comparison, measurement: "population" },
    { ...comparison, sampleSize: 25 },
    { ...comparison, path: "/api/orders" },
    { ...comparison, measurement: "sample", sampleSize: 10 },
    { ...comparison, measurement: "sample", totalRequests: null, sampleSize: null },
    { ...comparison, measurement: "sample", totalRequests: null, sampleSize: 26 },
    { ...comparison, totalRequests: 0, errorRequests: 0, errorRate: 0 },
  ]) assert.equal(readAgentEvidencePresentation(invalid), undefined);
});

test("presentation projector accepts actual sanitized reader output for each tool", async () => {
  const query: AgentEvidenceQuery = async <T>(endpoint: string) => {
    const rows = endpoint === "http_request_details" ? [{
      id: `${traceId}:${spanId}`, timestamp, method: "GET", route: "/api/orders/:id", service: "checkout-api",
      trace_id: traceId, span_id: spanId, status_code: 200, is_error: false, duration_ms: 783,
      capture_state: "redacted", request_body_size: 0, response_body_size: 48,
    }] : endpoint === "trace_details" ? [{
      trace_id: traceId, span_id: spanId, parent_span_id: "", name: "GET /api/orders/:id", service: "checkout-api",
      started_at: timestamp, offset_ms: 0, duration_ms: 783, status: "ok", kind: 2,
    }] : endpoint === "logs" ? [{
      id: "private-event-id", timestamp, observed_timestamp: timestamp, trace_id: traceId, span_id: spanId,
      service: "checkout-api", level: "info", message: "private customer payload",
    }] : [{ total_requests: 49_318, error_requests: 1_495, error_rate: 3.03, p95_duration_ms: 2_063 }];
    return rows as T[];
  };
  const reader = createAgentEvidenceReader({ organizationId: "authorized-org", orgSlug: "acme", requestId: `${traceId}:${spanId}`, query });
  const results = [
    await reader.inspectRequest({ requestId: `${traceId}:${spanId}` }),
    await reader.inspectTrace({ traceId }),
    await reader.findRelatedLogs({ traceId }),
    await reader.compareRequests({ hours: 24 }),
  ];
  assert.deepEqual(results.flatMap((result) => result.evidence.map((item) => projectAgentEvidencePresentation(item, result.truncated)?.kind)), ["request", "trace", "log", "comparison", "comparison"]);
  assert.deepEqual(projectAgentEvidencePresentation(results[0].evidence[0]), request);
});
