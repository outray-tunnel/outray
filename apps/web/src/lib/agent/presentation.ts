import type { AgentEvidence, AgentEvidenceResult } from "./evidence";
import type { AgentEvidencePresentation } from "./protocol";

const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"]);
const levels = new Set(["debug", "info", "warn", "error", "fatal", "trace", "unknown"]);
const summaries = new Set([
  "[message withheld]",
  "[message withheld; timeout mentioned]",
  "[message withheld; connection failure mentioned]",
  "[message withheld; rate limiting mentioned]",
  "[message withheld; memory exhaustion mentioned]",
]);
const spanIdPattern = /^[a-f0-9]{16}$/;
const technicalPattern = /^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/;
const routePattern = /^\/[a-zA-Z0-9/_:.*{}-]{0,159}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 31 || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
  });
}

function text(value: unknown, maximum: number, pattern?: RegExp): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !hasControlCharacters(value) && (!pattern || pattern.test(value));
}

function nullableText(value: unknown, maximum: number, pattern?: RegExp): value is string | null {
  return value === null || text(value, maximum, pattern);
}

function numeric(value: unknown, maximum = Number.MAX_SAFE_INTEGER, integer = false): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum && (!integer || Number.isSafeInteger(value));
}

function nullableNumeric(value: unknown, maximum = Number.MAX_SAFE_INTEGER, integer = false): value is number | null {
  return value === null || numeric(value, maximum, integer);
}

function instant(value: unknown): value is string | null {
  if (value === null) return true;
  if (!text(value, 24) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = Date.parse(value);
  return Number.isFinite(date) && new Date(date).toISOString() === value;
}

function operation(value: unknown): value is string | null {
  if (value === null || nullableText(value, 80, technicalPattern)) return true;
  if (!text(value, 168)) return false;
  const match = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS) (\/.*)$/.exec(value);
  return Boolean(match && routePattern.test(match[2]));
}

/**
 * Browser-safe validation for optional presentation data in streams and history.
 * Invalid cards are omitted without invalidating a legacy message or its sources.
 * Fields are copied explicitly; extra fields, control bytes, and raw logs cannot
 * turn this renderer into a second route for arbitrary telemetry or model JSON.
 */
export function readAgentEvidencePresentation(value: unknown): AgentEvidencePresentation | undefined {
  if (!record(value)) return undefined;
  if (value.kind === "request") {
    if (!exactFields(value, ["kind", "method", "route", "service", "statusCode", "durationMs", "timestamp", "captureState", "requestSizeBytes", "responseSizeBytes"])) return undefined;
    if (value.method !== null && (typeof value.method !== "string" || !methods.has(value.method))) return undefined;
    if (!nullableText(value.route, 160, routePattern) || !nullableText(value.service, 80, technicalPattern)) return undefined;
    if (!nullableNumeric(value.statusCode, 599, true) || (value.statusCode !== null && value.statusCode < 100)) return undefined;
    if (!nullableNumeric(value.durationMs) || !instant(value.timestamp)) return undefined;
    if (value.captureState !== "metadata" && value.captureState !== "redacted" && value.captureState !== "full" && value.captureState !== "unknown") return undefined;
    if (!nullableNumeric(value.requestSizeBytes, Number.MAX_SAFE_INTEGER, true) || !nullableNumeric(value.responseSizeBytes, Number.MAX_SAFE_INTEGER, true)) return undefined;
    return {
      kind: "request", method: value.method, route: value.route, service: value.service,
      statusCode: value.statusCode, durationMs: value.durationMs, timestamp: value.timestamp,
      captureState: value.captureState, requestSizeBytes: value.requestSizeBytes, responseSizeBytes: value.responseSizeBytes,
    };
  }
  if (value.kind === "trace") {
    if (!exactFields(value, ["kind", "spanCount", "returnedSpanCount", "truncated", "spans"])) return undefined;
    if (!numeric(value.spanCount, Number.MAX_SAFE_INTEGER, true) || !numeric(value.returnedSpanCount, 100, true) || typeof value.truncated !== "boolean") return undefined;
    if (!Array.isArray(value.spans) || value.spans.length !== value.returnedSpanCount || value.returnedSpanCount > value.spanCount) return undefined;
    if (value.returnedSpanCount < value.spanCount && !value.truncated) return undefined;
    const spans: Extract<AgentEvidencePresentation, { kind: "trace" }>["spans"] = [];
    for (const span of value.spans) {
      if (!record(span) || !exactFields(span, ["spanId", "parentSpanId", "operationName", "service", "startedAt", "offsetMs", "durationMs", "status", "kind"])) return undefined;
      if (!text(span.spanId, 16, spanIdPattern) || !nullableText(span.parentSpanId, 16, spanIdPattern)) return undefined;
      if (!operation(span.operationName) || !nullableText(span.service, 80, technicalPattern) || !instant(span.startedAt)) return undefined;
      if (!nullableNumeric(span.offsetMs) || !nullableNumeric(span.durationMs) || !nullableNumeric(span.kind, Number.MAX_SAFE_INTEGER, true)) return undefined;
      if (span.status !== "ok" && span.status !== "error" && span.status !== "unknown") return undefined;
      spans.push({
        spanId: span.spanId, parentSpanId: span.parentSpanId, operationName: span.operationName,
        service: span.service, startedAt: span.startedAt, offsetMs: span.offsetMs, durationMs: span.durationMs,
        status: span.status, kind: span.kind,
      });
    }
    return { kind: "trace", spanCount: value.spanCount, returnedSpanCount: value.returnedSpanCount, truncated: value.truncated, spans };
  }
  if (value.kind === "comparison") {
    if (!exactFields(value, ["kind", "hours", "service", "path", "totalRequests", "errorRequests", "errorRate", "p95DurationMs", "averageDurationMs", "measurement", "sampleSize", "truncated"])) return undefined;
    if (value.hours !== 1 && value.hours !== 24) return undefined;
    if (!nullableText(value.service, 80, technicalPattern) || !nullableText(value.path, 160, routePattern)) return undefined;
    if (!nullableNumeric(value.totalRequests, Number.MAX_SAFE_INTEGER, true) || !nullableNumeric(value.errorRequests, Number.MAX_SAFE_INTEGER, true) || !nullableNumeric(value.errorRate, 100)) return undefined;
    if (!nullableNumeric(value.p95DurationMs) || !nullableNumeric(value.averageDurationMs) || !nullableNumeric(value.sampleSize, 25, true) || typeof value.truncated !== "boolean") return undefined;
    if (value.measurement !== "aggregate" && value.measurement !== "sample") return undefined;
    if (value.measurement === "sample" && (value.totalRequests !== null || value.sampleSize === null)) return undefined;
    if (value.measurement === "aggregate" && (value.totalRequests === null || value.sampleSize !== null)) return undefined;
    if (value.measurement === "sample" ? value.path === null : value.path !== null) return undefined;
    const denominator = value.measurement === "sample" ? value.sampleSize : value.totalRequests;
    if (denominator !== null && value.errorRequests !== null && value.errorRequests > denominator) return undefined;
    if (denominator === 0 && (value.errorRate !== null || value.p95DurationMs !== null || value.averageDurationMs !== null)) return undefined;
    return {
      kind: "comparison", hours: value.hours, service: value.service, path: value.path,
      totalRequests: value.totalRequests, errorRequests: value.errorRequests, errorRate: value.errorRate,
      p95DurationMs: value.p95DurationMs, averageDurationMs: value.averageDurationMs,
      measurement: value.measurement, sampleSize: value.sampleSize, truncated: value.truncated,
    };
  }
  if (value.kind === "log") {
    if (!exactFields(value, ["kind", "level", "timestamp", "service", "messageSummary", "spanId"])) return undefined;
    if (typeof value.level !== "string" || !levels.has(value.level) || !instant(value.timestamp)) return undefined;
    if (!nullableText(value.service, 80, technicalPattern) || !nullableText(value.spanId, 16, spanIdPattern)) return undefined;
    if (typeof value.messageSummary !== "string" || !summaries.has(value.messageSummary)) return undefined;
    return { kind: "log", level: value.level, timestamp: value.timestamp, service: value.service, messageSummary: value.messageSummary, spanId: value.spanId };
  }
  return undefined;
}

/** Projects only the evidence reader's sanitized output; it never reads raw rows. */
export function projectAgentEvidencePresentation(
  evidence: AgentEvidence,
  truncated: AgentEvidenceResult["truncated"] = false,
): AgentEvidencePresentation | undefined {
  const data = evidence.data;
  if (evidence.kind === "request") {
    return readAgentEvidencePresentation({
      kind: "request", method: data.method, route: data.route, service: data.service,
      statusCode: data.statusCode, durationMs: data.durationMs, timestamp: data.timestamp,
      captureState: data.captureState, requestSizeBytes: data.requestSizeBytes, responseSizeBytes: data.responseSizeBytes,
    });
  }
  if (evidence.kind === "trace") {
    const spans = Array.isArray(data.spans) ? data.spans.map((span: unknown) => {
      if (!record(span)) return null;
      return {
        spanId: span.spanId, parentSpanId: span.parentSpanId, operationName: span.operationName,
        service: span.service, startedAt: span.startedAt, offsetMs: span.offsetMs,
        durationMs: span.durationMs, status: span.status, kind: span.kind,
      };
    }) : undefined;
    return readAgentEvidencePresentation({ kind: "trace", spanCount: data.spanCount, returnedSpanCount: data.returnedSpanCount, truncated, spans });
  }
  if (evidence.kind === "request_statistics") {
    const sampled = data.measurementScope === "bounded_matching_sample";
    if (!sampled && data.measurementScope !== "all_matching_requests") return undefined;
    return readAgentEvidencePresentation({
      kind: "comparison", hours: data.hours, service: data.service, path: data.path ?? null,
      totalRequests: sampled ? null : data.totalRequests, errorRequests: data.errorRequests,
      errorRate: data.errorRate, p95DurationMs: data.p95DurationMs,
      // Current telemetry pipes do not return an average. Do not infer one.
      averageDurationMs: null, measurement: sampled ? "sample" : "aggregate",
      sampleSize: sampled ? data.returnedRequests : null,
      truncated: sampled && (truncated || data.sampleMayBeIncomplete === true),
    });
  }
  if (evidence.kind === "log") {
    return readAgentEvidencePresentation({
      kind: "log", level: data.level, timestamp: data.timestamp, service: data.service,
      messageSummary: data.messageSummary, spanId: data.spanId,
    });
  }
  return undefined;
}
