import type { AttributeValue, ParsedSpan } from "./otlp.js";

const SENSITIVE_KEY =
  /(^|[._-])(authorization|cookie|set-cookie|password|passwd|secret|token|api-key|apikey|private-key)([._-]|$)/i;

function safeAttributeValue(value: AttributeValue): string {
  if (typeof value === "string") return value.slice(0, 16_384);
  if (value === null) return "null";
  return JSON.stringify(value).slice(0, 16_384);
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

export class TinybirdIngestClient {
  constructor(
    private readonly apiHost: string,
    private readonly token: string,
  ) {}

  async appendSpans(spans: TinybirdSpanRecord[]) {
    if (spans.length === 0) return;

    const response = await fetch(
      `${this.apiHost}/v0/events?name=otel_spans&wait=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/x-ndjson",
        },
        body: spans.map((span) => JSON.stringify(span)).join("\n"),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Tinybird ingestion failed (${response.status}): ${detail}`);
    }
  }
}
