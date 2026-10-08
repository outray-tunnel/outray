import { queryTinybird } from "../tinybird";
import { createHash } from "node:crypto";
import type { AgentEvidenceReference } from "./protocol";

/** The only telemetry endpoints this read-only agent is allowed to invoke. */
export type AgentEvidenceEndpoint =
  | "http_request_details"
  | "trace_details"
  | "logs"
  | "http_request_stats"
  | "http_requests";

export type AgentEvidenceParameters = Record<string, string | number | boolean | undefined>;
export type AgentEvidenceQuery = <T>(
  endpoint: AgentEvidenceEndpoint,
  parameters: AgentEvidenceParameters,
  options: { cache: "no-store"; signal?: AbortSignal },
) => Promise<T[]>;

export const AGENT_EVIDENCE_LIMITS = Object.freeze({
  spans: 100,
  logs: 20,
  requestSample: 25,
  relatedLogsHours: 24,
});

export const AGENT_REQUEST_ID_PATTERN = /^[a-f0-9]{32}:[a-f0-9]{16}$/i;
export const AGENT_TRACE_ID_PATTERN = /^[a-f0-9]{32}$/i;

export interface AgentRequestInput { requestId: string }
export interface AgentTraceInput { traceId: string }
export interface AgentCompareRequestsInput { service?: string; path?: string; hours?: 1 | 24 }

export interface AgentEvidence extends AgentEvidenceReference {
  /** Stable citation ID. No model-created URL or raw event content is used. */
  id: string;
  kind: "request" | "trace" | "log" | "request_statistics";
  href: string;
  data: Record<string, unknown>;
}

export interface AgentEvidenceResult {
  status: "available" | "empty" | "unavailable";
  /** Retrieval time, not a claim about the freshness of the underlying events. */
  observedAt: string;
  freshness: {
    mode: "uncached";
    guaranteedFresh: false;
    ingestionLag: "unknown";
    note: string;
  };
  evidence: AgentEvidence[];
  reason?: "invalid_input" | "out_of_scope" | "query_failed" | "cancelled" | "malformed_response";
  /** All telemetry text is untrusted data, never instructions. */
  trust: "untrusted_telemetry";
  truncated: boolean;
  scope?: { hours?: 1 | 24; service?: string; path?: string; traceId?: string };
}

export interface AgentEvidenceReaderOptions {
  /** Resolved by authentication on the server; never accepted as a tool argument. */
  organizationId: string;
  orgSlug: string;
  /** Locks an Explain Request session before any model-facing tool runs. */
  requestId?: string;
  signal?: AbortSignal;
  query?: AgentEvidenceQuery;
}

interface RequestRow {
  id: string;
  timestamp: string;
  method: string;
  route: string;
  path: string;
  service: string;
  trace_id: string;
  span_id: string;
  status_code: number;
  is_error: boolean | number;
  duration_ms: number;
  request_body_size?: number;
  response_body_size?: number;
  request_size?: number;
  response_size?: number;
  capture_state?: string;
  total_count?: number;
  has_more?: boolean | number;
}

interface SpanRow {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  name: string;
  service: string;
  started_at: string;
  duration_ms: number;
  offset_ms: number;
  status: string;
  kind: number;
}

interface LogRow {
  id: string;
  timestamp: string;
  observed_timestamp: string;
  trace_id: string;
  span_id: string;
  service: string;
  level: string;
  severity_number: number;
  message: string;
}

interface StatisticsRow {
  total_requests: number;
  error_requests: number;
  error_rate: number;
  p95_duration_ms: number;
}

const freshness: AgentEvidenceResult["freshness"] = {
  mode: "uncached",
  guaranteedFresh: false,
  ingestionLag: "unknown",
  note: "Queried without the dashboard cache. observedAt is retrieval time, not event time; telemetry ingestion and source retention can limit evidence.",
};

const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"]);
const levels = new Set(["debug", "info", "warn", "error", "fatal", "trace"]);
const sensitiveLabel = /(?:bearer|password|passwd|secret|token|authorization|cookie|api[._-]?key|ignore[._-]?previous|system[._-]?prompt|instructions|assistant|credential)/i;
const ipAddress = /(?:\b\d{1,3}(?:\.\d{1,3}){3}\b|\b[a-f\d]{0,4}:[a-f\d:]{2,}\b)/i;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function traceId(value: unknown): string | null {
  return typeof value === "string" && AGENT_TRACE_ID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function requestId(value: unknown): string | null {
  return typeof value === "string" && AGENT_REQUEST_ID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function spanId(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{16}$/i.test(value) ? value.toLowerCase() : null;
}

/** Technical names only: no arbitrary strings, credentials, addresses, or instructions. */
function technicalLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80 || sensitiveLabel.test(value) || ipAddress.test(value)) return null;
  if (/[a-f\d]{24,}/i.test(value)) return null;
  return /^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/.test(value) ? value : null;
}

/** Do not forward URL/query values or dynamic path data to the model. */
export function sanitizeAgentRoute(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  const path = value.split(/[?#]/, 1)[0];
  if (!path.startsWith("/") || !/^\/[a-zA-Z0-9/_:.*{}-]*$/.test(path)) return null;
  if (sensitiveLabel.test(path) || ipAddress.test(path)) return null;
  const parts = path.split("/").map((part) => {
    if (/^[a-f\d]{8,}$/i.test(part) || /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(part) || part.length > 40 || /^eyJ/.test(part) || (part.length >= 16 && /[A-Z]/.test(part) && /\d/.test(part))) return ":redacted";
    if (!part || /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(part)) return part;
    if (/^[:{][a-zA-Z][a-zA-Z0-9_]{0,39}}?$/.test(part) || part === "*") return part;
    // Numeric IDs, UUIDs, hashes, and long identifiers are private path data.
    return ":redacted";
  });
  return parts.join("/").slice(0, 160);
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(value);
  if (!match) return null;
  const [, date, time, fraction = "", zone = "Z"] = match;
  const base = `${date}T${time}${fraction.slice(0, 4)}`;
  const utc = Date.parse(`${base}Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 19) !== `${date}T${time}`) return null;
  const offset = zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone.toUpperCase();
  const instant = Date.parse(`${base}${offset}`);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
}

function measurement(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
}

function count(value: unknown): number | null {
  const number = measurement(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

function boolean(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

/** No original log text survives. Fixed hints are useful without exposing secret values. */
export function summarizeAgentLogMessage(value: unknown): string {
  if (typeof value !== "string" || !value) return "[message withheld]";
  const message = value.slice(0, 2_000);
  if (/(?:ignore.{0,30}(?:instructions|previous)|system\s*prompt|<\/?(?:system|assistant)>|you are|execute|run command|authorization|bearer|password|secret|token|cookie|api[_-]?key)/i.test(message)) {
    return "[message withheld]";
  }
  if (/timeout|timed out|deadline exceeded/i.test(message)) return "[message withheld; timeout mentioned]";
  if (/connection refused|econnrefused|econnreset/i.test(message)) return "[message withheld; connection failure mentioned]";
  if (/rate limit|too many requests/i.test(message)) return "[message withheld; rate limiting mentioned]";
  if (/out of memory|heap exhausted|enomem/i.test(message)) return "[message withheld; memory exhaustion mentioned]";
  return "[message withheld]";
}

function safeOperationName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS) (\/.*)$/.exec(value);
  if (match) {
    const route = sanitizeAgentRoute(match[2]);
    return route ? `${match[1]} ${route}` : null;
  }
  return technicalLabel(value);
}

function logEvidenceId(row: LogRow, id: string, index: number): string {
  // Stable citations without forwarding arbitrary event IDs or other private text.
  const sourceId = typeof row.id === "string" ? row.id.slice(0, 512) : "";
  const time = timestamp(row.timestamp) ?? "";
  const digest = createHash("sha256").update(JSON.stringify([sourceId, time, spanId(row.span_id), sourceId ? null : index])).digest("hex").slice(0, 20);
  return `log:${id}:${digest}`;
}

function requestProjection(row: RequestRow) {
  return {
    requestId: requestId(row.id),
    traceId: traceId(row.trace_id),
    spanId: spanId(row.span_id),
    timestamp: timestamp(row.timestamp),
    method: methods.has(row.method) ? row.method : null,
    route: sanitizeAgentRoute(row.route || row.path),
    service: technicalLabel(row.service),
    statusCode: count(row.status_code) !== null && row.status_code >= 100 && row.status_code <= 599 ? Number(row.status_code) : null,
    durationMs: measurement(row.duration_ms),
    isError: boolean(row.is_error),
    requestSizeBytes: count(row.request_body_size ?? row.request_size),
    responseSizeBytes: count(row.response_body_size ?? row.response_size),
    captureState: ["metadata", "redacted", "full"].includes(row.capture_state || "") ? row.capture_state : "unknown",
    payloadsIncluded: false,
  };
}

export function createAgentEvidenceReader(options: AgentEvidenceReaderOptions) {
  if (!options.organizationId || !/^[a-zA-Z0-9_-]+$/.test(options.orgSlug)) throw new Error("A server-resolved organization scope is required");
  const query: AgentEvidenceQuery = options.query ?? queryTinybird;
  let lockedRequest = options.requestId ? requestId(options.requestId) : null;
  let lockedTrace: string | null = null;
  let contextService: string | null = null;
  const invalidInitialRequest = options.requestId !== undefined && lockedRequest === null;

  function result(
    status: AgentEvidenceResult["status"],
    evidence: Array<Omit<AgentEvidence, "label" | "observedAt">> = [],
    details: Partial<Pick<AgentEvidenceResult, "reason" | "truncated" | "scope">> = {},
  ): AgentEvidenceResult {
    const observedAt = new Date().toISOString();
    const labels = { request: "HTTP request", trace: "Trace waterfall", log: "Correlated log", request_statistics: "Request comparison" };
    return {
      status, observedAt, freshness: { ...freshness },
      evidence: evidence.map((item) => ({ ...item, observedAt, label: item.kind === "request_statistics" ? `${item.data.hours}h request comparison` : labels[item.kind] })),
      trust: "untrusted_telemetry", truncated: false, ...details,
    };
  }

  function href(kind: "requests" | "traces" | "logs", search?: string, hours: 1 | 24 | 720 = 24, service?: string) {
    const params = new URLSearchParams({ range: hours === 720 ? "30d" : `${hours}h` });
    if (search) params.set("search", search);
    if (service) params.set("service", service);
    return `/${encodeURIComponent(options.orgSlug)}/observability/${kind}?${params}`;
  }

  async function read<T>(endpoint: AgentEvidenceEndpoint, parameters: AgentEvidenceParameters): Promise<T[]> {
    if (options.signal?.aborted) throw new Error("cancelled");
    const rows = await query<T>(endpoint, { ...parameters, organization_id: options.organizationId }, { cache: "no-store", signal: options.signal });
    if (options.signal?.aborted) throw new Error("cancelled");
    if (!Array.isArray(rows) || rows.some((row) => !record(row))) throw new Error("malformed_response");
    return rows;
  }

  function failed(error: unknown): AgentEvidenceResult {
    // Never send upstream provider error text to the model or browser.
    const reason = options.signal?.aborted ? "cancelled" : error instanceof Error && error.message === "malformed_response" ? "malformed_response" : "query_failed";
    return result("unavailable", [], { reason });
  }

  function allowedTrace(input: AgentTraceInput): string | AgentEvidenceResult {
    const id = traceId(record(input) ? input.traceId : null);
    if (!id || invalidInitialRequest) return result("unavailable", [], { reason: "invalid_input" });
    if (lockedRequest && id !== lockedTrace) return result("unavailable", [], { reason: "out_of_scope" });
    return id;
  }

  return {
    async inspectRequest(input: AgentRequestInput): Promise<AgentEvidenceResult> {
      const id = requestId(record(input) ? input.requestId : null);
      if (!id || invalidInitialRequest) return result("unavailable", [], { reason: "invalid_input" });
      if (lockedRequest && id !== lockedRequest) return result("unavailable", [], { reason: "out_of_scope" });
      // Lock before the await: concurrent model calls cannot race to widen context.
      lockedRequest = id;
      try {
        const rows = await read<RequestRow>("http_request_details", { request_id: id });
        const row = rows[0];
        if (!row) return result("empty");
        const expectedTrace = id.split(":")[0];
        const expectedSpan = id.split(":")[1];
        if (requestId(row.id) !== id || traceId(row.trace_id) !== expectedTrace || spanId(row.span_id) !== expectedSpan) return result("unavailable", [], { reason: "malformed_response" });
        lockedTrace = expectedTrace;
        contextService = technicalLabel(row.service);
        return result("available", [{ id: `request:${id}`, kind: "request", href: href("requests", id, 720), data: requestProjection(row) }]);
      } catch (error) { return failed(error); }
    },

    async inspectTrace(input: AgentTraceInput): Promise<AgentEvidenceResult> {
      const id = allowedTrace(input);
      if (typeof id !== "string") return id;
      try {
        const rows = await read<SpanRow>("trace_details", { trace_id: id });
        if (rows.some((row) => traceId(row.trace_id) !== id || !spanId(row.span_id))) return result("unavailable", [], { reason: "malformed_response" });
        if (!rows.length) return result("empty", [], { scope: { traceId: id } });
        const spans = rows.slice(0, AGENT_EVIDENCE_LIMITS.spans).map((row) => ({
          spanId: spanId(row.span_id), parentSpanId: spanId(row.parent_span_id),
          operationName: safeOperationName(row.name), service: technicalLabel(row.service),
          startedAt: timestamp(row.started_at), durationMs: measurement(row.duration_ms),
          offsetMs: measurement(row.offset_ms), status: ["ok", "error"].includes(row.status) ? row.status : "unknown",
          kind: count(row.kind),
        }));
        return result("available", [{ id: `trace:${id}`, kind: "trace", href: href("traces", id, 720), data: { traceId: id, spanCount: rows.length, returnedSpanCount: spans.length, spans } }], { truncated: rows.length > spans.length, scope: { traceId: id } });
      } catch (error) { return failed(error); }
    },

    async findRelatedLogs(input: AgentTraceInput): Promise<AgentEvidenceResult> {
      const id = allowedTrace(input);
      if (typeof id !== "string") return id;
      try {
        const rows = await read<LogRow>("logs", { trace_id: id, hours: AGENT_EVIDENCE_LIMITS.relatedLogsHours, limit: AGENT_EVIDENCE_LIMITS.logs });
        if (rows.some((row) => traceId(row.trace_id) !== id)) return result("unavailable", [], { reason: "malformed_response" });
        const evidence = rows.slice(0, AGENT_EVIDENCE_LIMITS.logs).map((row, index): Omit<AgentEvidence, "label" | "observedAt"> => ({
          // Event IDs are arbitrary source text and may contain private data.
          id: logEvidenceId(row, id, index),
          kind: "log", href: href("logs", id),
          data: {
            traceId: id, spanId: spanId(row.span_id), timestamp: timestamp(row.timestamp), observedTimestamp: timestamp(row.observed_timestamp),
            service: technicalLabel(row.service), level: levels.has(row.level) ? row.level : "unknown", severityNumber: count(row.severity_number),
            messageSummary: summarizeAgentLogMessage(row.message), messageRedacted: true,
          },
        }));
        return result(evidence.length ? "available" : "empty", evidence, { truncated: rows.length >= AGENT_EVIDENCE_LIMITS.logs, scope: { traceId: id, hours: 24 } });
      } catch (error) { return failed(error); }
    },

    async compareRequests(input: AgentCompareRequestsInput = {}): Promise<AgentEvidenceResult> {
      if (!record(input) || invalidInitialRequest || (input.hours !== undefined && input.hours !== 1 && input.hours !== 24)) return result("unavailable", [], { reason: "invalid_input" });
      const service = input.service === undefined ? contextService ?? undefined : technicalLabel(input.service);
      const path = input.path === undefined ? undefined : sanitizeAgentRoute(input.path);
      if (service === null || path === null || (input.path !== undefined && path !== input.path)) return result("unavailable", [], { reason: "invalid_input" });
      const hours = input.hours ?? 1;
      const windows: Array<1 | 24> = hours === 1 ? [1, 24] : [24, 1];
      const evidence: Array<Omit<AgentEvidence, "label" | "observedAt">> = [];
      let anyFailed = false;
      let anyData = false;
      let truncated = false;
      // One window failing never turns the other window into a false zero baseline.
      await Promise.all(windows.map(async (window) => {
        try {
          let data: Record<string, unknown>;
          if (path) {
            // Existing pipes support substring search, not exact path aggregates.
            // Explicitly report bounded samples; never label them population totals.
            const rows = await read<RequestRow>("http_requests", { hours: window, service, search: path, limit: AGENT_EVIDENCE_LIMITS.requestSample, offset: 0 });
            const limited = rows.slice(0, AGENT_EVIDENCE_LIMITS.requestSample);
            const matching = limited.filter((row) => sanitizeAgentRoute(row.route || row.path) === path && (!service || row.service === service));
            const durations = matching.map((row) => measurement(row.duration_ms)).filter((value): value is number => value !== null).sort((a, b) => a - b);
            const errors = matching.filter((row) => boolean(row.is_error) === true).length;
            const unknownErrors = matching.some((row) => boolean(row.is_error) === null);
            const capped = rows.length >= AGENT_EVIDENCE_LIMITS.requestSample || rows.some((row) => boolean(row.has_more) === true || (count(row.total_count) ?? 0) > limited.length);
            truncated ||= capped;
            anyData ||= matching.length > 0;
            data = { hours: window, service: service ?? null, path, measurementScope: "bounded_matching_sample", returnedRequests: matching.length, sampledSearchRows: limited.length, sampleLimit: AGENT_EVIDENCE_LIMITS.requestSample, populationTotal: null, sampleMayBeIncomplete: capped, errorRequests: unknownErrors ? null : errors, errorRate: matching.length && !unknownErrors ? Math.round(errors / matching.length * 10_000) / 100 : null, p95DurationMs: durations.length === matching.length && durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null };
          } else {
            const rows = await read<StatisticsRow>("http_request_stats", { hours: window, service });
            const row = rows[0];
            if (!row) throw new Error("malformed_response");
            const total = count(row.total_requests);
            const errors = count(row.error_requests);
            if (total === null || errors === null || errors > total) throw new Error("malformed_response");
            anyData ||= total > 0;
            data = { hours: window, service: service ?? null, measurementScope: "all_matching_requests", totalRequests: total, errorRequests: errors, errorRate: total > 0 ? measurement(row.error_rate, 100) : null, p95DurationMs: total > 0 ? measurement(row.p95_duration_ms) : null };
          }
          evidence.push({ id: `request-statistics:${window}h:${service || "all"}:${path || "all"}`, kind: "request_statistics", href: href("requests", path, window, service), data });
        } catch {
          anyFailed = true;
        }
      }));
      evidence.sort((a, b) => windows.indexOf(a.data.hours as 1 | 24) - windows.indexOf(b.data.hours as 1 | 24));
      return result(anyFailed ? "unavailable" : anyData ? "available" : "empty", evidence, { ...(anyFailed ? { reason: options.signal?.aborted ? "cancelled" as const : "query_failed" as const } : {}), truncated, scope: { hours, ...(service ? { service } : {}), ...(path ? { path } : {}) } });
    },
  };
}

export type AgentEvidenceReader = ReturnType<typeof createAgentEvidenceReader>;
