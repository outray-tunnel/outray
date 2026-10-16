import { createHash } from "node:crypto";
import type { ParsedLogRecord } from "./logs.js";
import type { ParsedMetricPoint } from "./metrics.js";
import type { AttributeValue, ParsedSpan } from "./otlp.js";

const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|secret|token|apikey|authkey|privatekey|session|credential|csrf|xsrf|assertion|codeverifier|codechallenge|passcode|onetimecode/i;

// `code` and `state` are useful diagnostic fields outside URLs. Only treat
// them as credentials in URLs, not as blanket-redacted diagnostic fields.
const AUTH_QUERY_KEY = /^(?:code|state|nonce|ticket|otp|sig|signature)$/i;

const CAPTURE_HEADER_ATTRIBUTES = new Set([
  "outray.http.request.headers",
  "outray.http.response.headers",
]);

const CAPTURE_BODY_ATTRIBUTES = new Set([
  "outray.http.request.body",
  "outray.http.response.body",
]);

const MAX_ATTRIBUTE_LENGTH = 16_384;

function sensitiveKey(key: string) {
  return SENSITIVE_KEY.test(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

function sensitiveQueryKey(key: string) {
  let decoded = key;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const next = decodeURIComponent(decoded.replaceAll("+", " "));
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return sensitiveKey(decoded) || AUTH_QUERY_KEY.test(decoded);
}

function sanitizedValue(value: AttributeValue, depth = 0): AttributeValue {
  if (typeof value === "string") return sanitizedTextCapture(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (depth >= 8) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.slice(0, 128).map((item) => sanitizedValue(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 256)
      .map(([key, item]) => [
        key.slice(0, 256),
        sensitiveKey(key) ? "[REDACTED]" : sanitizedValue(item, depth + 1),
      ]),
  );
}

function jsonAttribute(value: AttributeValue, fallback: string) {
  const serialized = JSON.stringify(sanitizedValue(value));
  return serialized.length <= MAX_ATTRIBUTE_LENGTH ? serialized : fallback;
}

function parsedJson(value: string): AttributeValue | null {
  try {
    return JSON.parse(value) as AttributeValue;
  } catch {
    return null;
  }
}

function sanitizedTextCapture(
  value: string,
  depth = 0,
  maxLength = MAX_ATTRIBUTE_LENGTH,
): string {
  // A redirect URL may itself contain an encoded callback URL. Decode only via
  // URLSearchParams, then bound recursion so nested redirects cannot loop.
  const urls = value.replace(
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi,
    (candidate) => {
      try {
        const url = new URL(candidate);
        if (url.username) url.username = "[REDACTED]";
        if (url.password) url.password = "[REDACTED]";
        for (const [key, item] of [...url.searchParams]) {
          if (sensitiveQueryKey(key)) {
            url.searchParams.set(key, "[REDACTED]");
          } else if (depth < 3) {
            const safe = sanitizedTextCapture(item, depth + 1);
            if (safe !== item) url.searchParams.set(key, safe);
          } else if (/[?&#]|%[0-9a-f]{2}/i.test(item)) {
            url.searchParams.set(key, "[REDACTED]");
          }
        }
        if (url.hash) {
          // Share-link decryption keys can be opaque fragments, not key=value.
          url.hash = depth < 3 && url.hash.includes("=")
            ? sanitizedTextCapture(url.hash, depth + 1)
            : "[REDACTED]";
        }
        return url.toString();
      } catch {
        return candidate;
      }
    },
  );
  return urls
    // Also cover malformed connection URLs that URL() cannot parse.
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/\s<>]+)@/gi, "$1[REDACTED]@")
    .replace(/((?:^|[\s"'(])\/[^\s"'`<>#]*)#([^\s"'`<>]*)/g, "$1#[REDACTED]")
    .replace(
      /([?&#])([^\s?&#=]+)=([^\s&#<>"'`]*)/g,
      (match, separator: string, key: string, item: string) => {
        if (sensitiveQueryKey(key)) return `${separator}${key}=[REDACTED]`;
        if (depth >= 3) {
          return /%[0-9a-f]{2}/i.test(item)
            ? `${separator}${key}=[REDACTED]`
            : match;
        }
        try {
          const decoded = decodeURIComponent(item);
          const safe = sanitizedTextCapture(decoded, depth + 1);
          return safe === decoded ? match : `${separator}${key}=${encodeURIComponent(safe)}`;
        } catch {
          return match;
        }
      },
    )
    .replace(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )?PRIVATE KEY-----|$)/g, "[REDACTED]")
    .replace(/\b((?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    // Header lines can contain several cookie pairs or a Basic auth scheme;
    // redacting a single whitespace-delimited word is not sufficient.
    .replace(
      /\b((?:proxy-)?authorization|cookie|set-cookie)([ \t]*:[ \t]*)([^\r\n]*)/gi,
      "$1$2[REDACTED]",
    )
    .replace(
      /(?<![a-z0-9_.-])(["']?)([a-z0-9_.-]*(?:authorization|cookie|password|passwd|secret|token|api[._-]?key|auth[._-]?key|private[._-]?key|session|credential|csrf|xsrf|assertion|code[._-]?verifier|code[._-]?challenge|passcode|one[._-]?time[._-]?code)[a-z0-9_.-]*)(["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]]+)/gi,
      (match, openingQuote: string, key: string, separator: string, item: string) => {
        if (!sensitiveKey(key)) return match;
        const quote = item[0] === '"' || item[0] === "'" ? item[0] : "";
        return `${openingQuote}${key}${separator}${quote}[REDACTED]${quote}`;
      },
    )
    .slice(0, maxLength);
}

function bodyContentType(
  attributes: Record<string, AttributeValue>,
  key: string,
) {
  const contentTypeKey = `${key}.content_type`;
  const value = attributes[contentTypeKey];
  return typeof value === "string" ? value.toLowerCase() : "";
}

function safeCaptureAttributeValue(
  key: string,
  value: string,
  attributes: Record<string, AttributeValue>,
) {
  if (CAPTURE_HEADER_ATTRIBUTES.has(key)) {
    const parsed = parsedJson(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "{}";
    }
    return jsonAttribute(parsed, '{"_outray":"[TRUNCATED]"}');
  }

  if (!CAPTURE_BODY_ATTRIBUTES.has(key)) return null;

  const contentType = bodyContentType(attributes, key);
  const parsed = parsedJson(value);
  if (parsed !== null && (contentType.includes("json") || /^[\s]*[\[{]/.test(value))) {
    return jsonAttribute(parsed, '"[TRUNCATED]"');
  }

  if (contentType.split(";", 1)[0]?.trim() === "application/x-www-form-urlencoded") {
    const result = new URLSearchParams();
    for (const [name, item] of new URLSearchParams(value)) {
      result.append(
        name,
        sensitiveKey(name) ? "[REDACTED]" : sanitizedTextCapture(item),
      );
    }
    return result
      .toString()
      .replaceAll("%5BREDACTED%5D", "[REDACTED]")
      .slice(0, MAX_ATTRIBUTE_LENGTH);
  }

  return sanitizedTextCapture(value);
}

function safeAttributeValue(
  key: string,
  value: AttributeValue,
  attributes: Record<string, AttributeValue>,
): string {
  if (typeof value === "string") {
    const captureValue = safeCaptureAttributeValue(key, value, attributes);
    if (captureValue !== null) return captureValue;
  }
  const safe = sanitizedValue(value);
  if (typeof safe === "string") return safe;
  if (safe === null) return "null";
  return JSON.stringify(safe).slice(0, MAX_ATTRIBUTE_LENGTH);
}

function sanitizedAttributes(attributes: Record<string, AttributeValue>) {
  return Object.fromEntries(
    Object.entries(attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 256)
      .map(([key, value]) => [
        key.slice(0, 256),
        sensitiveKey(key)
          ? "[REDACTED]"
          : safeAttributeValue(key, value, attributes),
      ]),
  );
}

function sanitizedOtlpValue(candidate: unknown, depth = 0): unknown {
  if (typeof candidate === "string") return sanitizedTextCapture(candidate, 0, 262_144);
  if (candidate === null || typeof candidate === "boolean" || typeof candidate === "number") {
    return candidate;
  }
  if (depth >= 12) return "[TRUNCATED]";
  if (Array.isArray(candidate)) {
    return candidate.slice(0, 256).map((item) => sanitizedOtlpValue(item, depth + 1));
  }
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  // OTLP encodes nested objects as kvlistValue.values arrays of KeyValue
  // records. Redact those just like decoded span/log attributes.
  const sensitiveEntry = typeof record.key === "string" && sensitiveKey(record.key);
  return Object.fromEntries(
    Object.entries(record).slice(0, 256).map(([key, value]) => [
      key.slice(0, 256),
      key === "value" && sensitiveEntry
        ? { stringValue: "[REDACTED]" }
        : sensitiveKey(key) ? "[REDACTED]" : sanitizedOtlpValue(value, depth + 1),
    ]),
  );
}

function sanitizedOtlpRecords(records: unknown[]) {
  return records.slice(0, 128).map((candidate) => sanitizedOtlpValue(candidate));
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

export interface TinybirdMetricRecord {
  organization_id: string;
  retention_days: number;
  ingested_at: string;
  event_id: string;
  timestamp: string;
  start_timestamp: string | null;
  metric_name: string;
  metric_description: string;
  metric_unit: string;
  metric_type: string;
  aggregation_temporality: number;
  is_monotonic: number;
  value: number | null;
  value_int: string | null;
  count: string;
  sum: number | null;
  min: number | null;
  max: number | null;
  bucket_counts: string[];
  explicit_bounds: number[];
  scale: number;
  zero_count: string;
  zero_threshold: number;
  positive_offset: number;
  positive_bucket_counts: string[];
  negative_offset: number;
  negative_bucket_counts: string[];
  quantiles: number[];
  quantile_values: number[];
  flags: number;
  service_name: string;
  service_namespace: string;
  service_version: string;
  environment: string;
  region: string;
  scope_name: string;
  scope_version: string;
  resource_schema_url: string;
  scope_schema_url: string;
  resource_attributes: Record<string, string>;
  attributes: Record<string, string>;
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
    trace_state: sanitizedTextCapture(span.traceState),
    span_name: sanitizedTextCapture(span.name),
    span_kind: span.kind,
    service_name: sanitizedTextCapture(span.serviceName).slice(0, 512),
    service_namespace: sanitizedTextCapture(span.serviceNamespace).slice(0, 512),
    service_version: sanitizedTextCapture(span.serviceVersion).slice(0, 256),
    environment: sanitizedTextCapture(span.environment).slice(0, 256),
    region: sanitizedTextCapture(span.region).slice(0, 256),
    scope_name: sanitizedTextCapture(span.scopeName).slice(0, 512),
    scope_version: sanitizedTextCapture(span.scopeVersion).slice(0, 256),
    duration_nano: Number(span.durationNano),
    status_code: span.statusCode,
    status_message: sanitizedTextCapture(span.statusMessage),
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
    severity_text: sanitizedTextCapture(log.severityText).slice(0, 256),
    severity_level: log.severityLevel,
    body,
    event_name: sanitizedTextCapture(log.eventName).slice(0, 256),
    trace_id: log.traceId,
    span_id: log.spanId,
    flags: log.flags,
    service_name: sanitizedTextCapture(log.serviceName).slice(0, 512),
    service_namespace: sanitizedTextCapture(log.serviceNamespace).slice(0, 512),
    service_version: sanitizedTextCapture(log.serviceVersion).slice(0, 256),
    environment: sanitizedTextCapture(log.environment).slice(0, 256),
    region: sanitizedTextCapture(log.region).slice(0, 256),
    scope_name: sanitizedTextCapture(log.scopeName).slice(0, 512),
    scope_version: sanitizedTextCapture(log.scopeVersion).slice(0, 256),
    resource_attributes: resourceAttributes,
    log_attributes: logAttributes,
    scope_attributes: scopeAttributes,
  };
  const { retention_days: _retentionDays, ...deduplicationRecord } =
    stableRecord;
  const eventId = createHash("sha256")
    .update(JSON.stringify(deduplicationRecord))
    .digest("hex");

  const {
    timestamp_nano: _timestampNano,
    observed_timestamp_nano: _observedNano,
    ...record
  } = stableRecord;
  return {
    ...record,
    ingested_at: new Date().toISOString(),
    event_id: eventId,
  };
}

export function toTinybirdMetric(
  organizationId: string,
  retentionDays: number,
  point: ParsedMetricPoint,
): TinybirdMetricRecord {
  const stableRecord = {
    organization_id: organizationId,
    retention_days: retentionDays,
    timestamp: point.timestamp,
    start_timestamp: point.startTimestamp,
    timestamp_nano: point.timestampNano,
    start_timestamp_nano: point.startTimestampNano,
    metric_name: sanitizedTextCapture(point.metricName).slice(0, 1_024),
    metric_description: sanitizedTextCapture(point.metricDescription).slice(0, 4_096),
    metric_unit: sanitizedTextCapture(point.metricUnit).slice(0, 256),
    metric_type: point.metricType,
    aggregation_temporality: point.aggregationTemporality,
    is_monotonic: point.isMonotonic ? 1 : 0,
    value: point.value,
    value_int: point.valueInt,
    count: point.count,
    sum: point.sum,
    min: point.min,
    max: point.max,
    bucket_counts: point.bucketCounts.slice(0, 4_096),
    explicit_bounds: point.explicitBounds.slice(0, 4_095),
    scale: point.scale,
    zero_count: point.zeroCount,
    zero_threshold: point.zeroThreshold,
    positive_offset: point.positiveOffset,
    positive_bucket_counts: point.positiveBucketCounts.slice(0, 4_096),
    negative_offset: point.negativeOffset,
    negative_bucket_counts: point.negativeBucketCounts.slice(0, 4_096),
    quantiles: point.quantiles.slice(0, 256),
    quantile_values: point.quantileValues.slice(0, 256),
    flags: point.flags,
    service_name: sanitizedTextCapture(point.serviceName).slice(0, 512),
    service_namespace: sanitizedTextCapture(point.serviceNamespace).slice(0, 512),
    service_version: sanitizedTextCapture(point.serviceVersion).slice(0, 256),
    environment: sanitizedTextCapture(point.environment).slice(0, 256),
    region: sanitizedTextCapture(point.region).slice(0, 256),
    scope_name: sanitizedTextCapture(point.scopeName).slice(0, 512),
    scope_version: sanitizedTextCapture(point.scopeVersion).slice(0, 256),
    resource_schema_url: sanitizedTextCapture(point.resourceSchemaUrl).slice(0, 2_048),
    scope_schema_url: sanitizedTextCapture(point.scopeSchemaUrl).slice(0, 2_048),
    resource_attributes: sanitizedAttributes(point.resourceAttributes),
    attributes: sanitizedAttributes(point.metricAttributes),
    scope_attributes: sanitizedAttributes(point.scopeAttributes),
  };
  const pointIdentity = {
    organization_id: stableRecord.organization_id,
    timestamp_nano: point.timestampNano,
    start_timestamp_nano:
      point.metricType === "gauge" ? "0" : point.startTimestampNano,
    metric_name: stableRecord.metric_name,
    metric_unit: stableRecord.metric_unit,
    metric_type: stableRecord.metric_type,
    aggregation_temporality: stableRecord.aggregation_temporality,
    is_monotonic: stableRecord.is_monotonic,
    service_name: stableRecord.service_name,
    service_namespace: stableRecord.service_namespace,
    service_version: stableRecord.service_version,
    environment: stableRecord.environment,
    region: stableRecord.region,
    scope_name: stableRecord.scope_name,
    scope_version: stableRecord.scope_version,
    resource_schema_url: stableRecord.resource_schema_url,
    scope_schema_url: stableRecord.scope_schema_url,
    resource_attributes: stableRecord.resource_attributes,
    attributes: stableRecord.attributes,
    scope_attributes: stableRecord.scope_attributes,
  };
  const eventId = createHash("sha256")
    .update(JSON.stringify(pointIdentity))
    .digest("hex");
  const {
    timestamp_nano: _storedTimestampNano,
    start_timestamp_nano: _storedStartTimestampNano,
    ...record
  } = stableRecord;

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

  async appendMetrics(metrics: TinybirdMetricRecord[]) {
    await this.append("otel_metrics", metrics);
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

    const detail = (await response.text()).slice(0, 500);
    if (!response.ok) {
      throw new Error(
        `${name} ingestion failed (${response.status}): ${detail}`,
      );
    }

    try {
      const result = JSON.parse(detail) as {
        successful_rows?: number;
        quarantined_rows?: number;
      };
      const successful = Number(result.successful_rows);
      const quarantined = Number(result.quarantined_rows);
      if (quarantined > 0 || successful !== records.length) {
        throw new Error(
          `${successful || 0} rows committed and ${quarantined || 0} rows quarantined`,
        );
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `${name} ingestion returned an invalid acknowledgement`,
        );
      }
      throw new Error(
        `${name} ingestion was not fully committed: ${error instanceof Error ? error.message : "unknown acknowledgement"}`,
      );
    }
  }
}
