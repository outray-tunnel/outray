import { createHash } from "node:crypto";
import type { ParsedLogRecord } from "./logs.js";
import type { AttributeValue, ParsedSpan } from "./otlp.js";

const SENSITIVE_KEY =
  /(^|[._-])(authorization|cookie|set-cookie|password|passwd|secret|token|api-key|apikey|private-key)([._-]|$)/i;

function sanitizedValue(value: AttributeValue, depth = 0): AttributeValue {
  if (typeof value === "string") return value.slice(0, 16_384);
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (depth >= 8) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.slice(0, 128).map((item) => sanitizedValue(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 256)
      .map(([key, item]) => [
        key.slice(0, 256),
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizedValue(item, depth + 1),
      ]),
  );
}

function safeAttributeValue(value: AttributeValue): string {
  const safe = sanitizedValue(value);
  if (typeof safe === "string") return safe;
  if (safe === null) return "null";
  return JSON.stringify(safe).slice(0, 16_384);
}

function sanitizedAttributes(attributes: Record<string, AttributeValue>) {
  return Object.fromEntries(
    Object.entries(attributes)
      .slice(0, 256)
      .map(([key, value]) => [
        key.slice(0, 256),
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : safeAttributeValue(value),
      ]),
  );
}

function sanitizedOtlpRecords(records: unknown[]) {
  return records.slice(0, 128).map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return candidate;
    }

    const item = { ...(candidate as Record<string, unknown>) };
    if (Array.isArray(item.attributes)) {
      item.attributes = item.attributes.slice(0, 256).map((attribute) => {
        if (!attribute || typeof attribute !== "object" || Array.isArray(attribute)) {
          return attribute;
        }
        const entry = { ...(attribute as Record<string, unknown>) };
        if (typeof entry.key === "string" && SENSITIVE_KEY.test(entry.key)) {
          entry.value = { stringValue: "[REDACTED]" };
        }
        return entry;
      });
    }
    return item;
  });
}

export interface TinybirdSpanRecord {
  organization_id: string;
  retention_days: number;
  ingested_at: string;
  start_time: string;
  end_time: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  trace_state: string;
  span_name: string;
  span_kind: number;
  service_name: string;
  service_namespace: string;
  service_version: string;
  environment: string;
  region: string;
  scope_name: string;
  scope_version: string;
  duration_nano: number;
  status_code: number;
  status_message: string;
  http_method: string;
  resource_attributes: Record<string, string>;
  span_attributes: Record<string, string>;
  scope_attributes: Record<string, string>;
  events: string;
  links: string;
}

export interface TinybirdLogRecord {
  organization_id: string;
  retention_days: number;
  ingested_at: string;
  event_id: string;
  timestamp: string;
  observed_timestamp: string;
  severity_number: number;
  severity_text: string;
  severity_level: string;
  body: string;
  event_name: string;
  trace_id: string;
  span_id: string;
  flags: number;
  service_name: string;
  service_namespace: string;
  service_version: string;
  environment: string;
  region: string;
  scope_name: string;
  scope_version: string;
  resource_attributes: Record<string, string>;
  log_attributes: Record<string, string>;
  scope_attributes: Record<string, string>;
}

export function toTinybirdSpan(
  organizationId: string,
  retentionDays: number,
  span: ParsedSpan,
): TinybirdSpanRecord {
  return {
    organization_id: organizationId,
    retention_days: retentionDays,
    ingested_at: new Date().toISOString(),
    start_time: span.timestamp.toISOString(),
    end_time: span.endTimestamp.toISOString(),
    trace_id: span.traceId,
    span_id: span.spanId,
    parent_span_id: span.parentSpanId,
    trace_state: span.traceState,
    span_name: span.name,
    span_kind: span.kind,
    service_name: span.serviceName,
    service_namespace: span.serviceNamespace,
    service_version: span.serviceVersion,
    environment: span.environment,
    region: span.region,
    scope_name: span.scopeName,
    scope_version: span.scopeVersion,
    duration_nano: Number(span.durationNano),
    status_code: span.statusCode,
    status_message: span.statusMessage,
    http_method: span.httpMethod,
    resource_attributes: sanitizedAttributes(span.resourceAttributes),
    span_attributes: sanitizedAttributes(span.spanAttributes),
    scope_attributes: sanitizedAttributes(span.scopeAttributes),
    events: JSON.stringify(sanitizedOtlpRecords(span.events)).slice(0, 262_144),
    links: JSON.stringify(sanitizedOtlpRecords(span.links)).slice(0, 262_144),
  };
}

export function toTinybirdLog(
  organizationId: string,
  retentionDays: number,
  log: ParsedLogRecord,
): TinybirdLogRecord {
  const resourceAttributes = sanitizedAttributes(log.resourceAttributes);
  const logAttributes = sanitizedAttributes(log.logAttributes);
  const scopeAttributes = sanitizedAttributes(log.scopeAttributes);
  const bodyValue = sanitizedValue(log.body);
  const body =
    typeof bodyValue === "string"
      ? bodyValue.slice(0, 262_144)
      : JSON.stringify(bodyValue).slice(0, 262_144);
  const stableRecord = {
    organization_id: organizationId,
    retention_days: retentionDays,
    timestamp: log.timestamp,
    observed_timestamp: log.observedTimestamp,
    timestamp_nano: log.timestampNano,
    observed_timestamp_nano: log.observedTimestampNano,
    severity_number: log.severityNumber,
    severity_text: log.severityText.slice(0, 256),
    severity_level: log.severityLevel,
    body,
    event_name: log.eventName.slice(0, 256),
    trace_id: log.traceId,
    span_id: log.spanId,
    flags: log.flags,
    service_name: log.serviceName.slice(0, 512),
    service_namespace: log.serviceNamespace.slice(0, 512),
    service_version: log.serviceVersion.slice(0, 256),
    environment: log.environment.slice(0, 256),
    region: log.region.slice(0, 256),
    scope_name: log.scopeName.slice(0, 512),
    scope_version: log.scopeVersion.slice(0, 256),
    resource_attributes: resourceAttributes,
    log_attributes: logAttributes,
    scope_attributes: scopeAttributes,
  };
  const { retention_days: _retentionDays, ...deduplicationRecord } = stableRecord;
  const eventId = createHash("sha256")
    .update(JSON.stringify(deduplicationRecord))
    .digest("hex");

  const { timestamp_nano: _timestampNano, observed_timestamp_nano: _observedNano, ...record } =
    stableRecord;
  return {
    ...record,
    ingested_at: new Date().toISOString(),
    event_id: eventId,
  };
}

export class TinybirdIngestClient {
  constructor(
    private readonly apiHost: string,
    private readonly token: string,
  ) {}

  async appendSpans(spans: TinybirdSpanRecord[]) {
    await this.append("otel_spans", spans);
  }

  async appendLogs(logs: TinybirdLogRecord[]) {
    await this.append("otel_logs", logs);
  }

  private async append(name: string, records: unknown[]) {
    if (records.length === 0) return;

    const response = await fetch(
      `${this.apiHost}/v0/events?name=${encodeURIComponent(name)}&wait=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/x-ndjson",
        },
        body: records.map((record) => JSON.stringify(record)).join("\n"),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`${name} ingestion failed (${response.status}): ${detail}`);
    }
  }
}
