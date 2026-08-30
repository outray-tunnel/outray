type UnknownRecord = Record<string, unknown>;
export interface AttributeObject {
  [key: string]: AttributeValue;
}
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | AttributeObject;

export interface ParsedSpan {
  timestamp: Date;
  endTimestamp: Date;
  traceId: string;
  spanId: string;
  parentSpanId: string;
  traceState: string;
  name: string;
  kind: number;
  durationNano: string;
  statusCode: number;
  statusMessage: string;
  serviceName: string;
  serviceNamespace: string;
  serviceVersion: string;
  environment: string;
  region: string;
  scopeName: string;
  scopeVersion: string;
  httpMethod: string;
  resourceAttributes: Record<string, AttributeValue>;
  spanAttributes: Record<string, AttributeValue>;
  scopeAttributes: Record<string, AttributeValue>;
  events: unknown[];
  links: unknown[];
}

export interface ParsedTracePayload {
  spans: ParsedSpan[];
  rejected: number;
}

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value : "";

function field(source: UnknownRecord | null, camel: string, snake: string) {
  return source?.[camel] ?? source?.[snake];
}

function integerString(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return null;
}

function identifier(value: unknown, length: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (normalized.length !== length || !/^[0-9a-f]+$/.test(normalized)) return null;
  return /^0+$/.test(normalized) ? null : normalized;
}

function nanoDate(value: string): Date | null {
  try {
    const date = new Date(Number(BigInt(value) / 1_000_000n));
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function decodeAnyValue(value: unknown): AttributeValue {
  const item = record(value);
  if (!item) return null;
  if (typeof item.stringValue === "string") return item.stringValue;
  if (typeof item.boolValue === "boolean") return item.boolValue;
  if (typeof item.doubleValue === "number") return item.doubleValue;
  if (typeof item.intValue === "number" || typeof item.intValue === "string") {
    const parsed = Number(item.intValue);
    return Number.isSafeInteger(parsed) ? parsed : String(item.intValue);
  }
  if (typeof item.bytesValue === "string") return item.bytesValue;

  const array = record(item.arrayValue);
  if (array) return list(array.values).map(decodeAnyValue);

  const keyValues = record(item.kvlistValue);
  if (keyValues) return decodeAttributes(keyValues.values);
  return null;
}

function decodeAttributes(value: unknown): Record<string, AttributeValue> {
  const result: Record<string, AttributeValue> = {};
  for (const candidate of list(value)) {
    const item = record(candidate);
    const key = stringValue(item?.key);
    if (item && key) result[key] = decodeAnyValue(item.value);
  }
  return result;
}

function attributeString(
  attributes: Record<string, AttributeValue>,
  ...keys: string[]
) {
  for (const key of keys) {
    if (typeof attributes[key] === "string") return attributes[key] as string;
  }
  return "";
}

export function parseTracePayload(payload: unknown): ParsedTracePayload {
  const root = record(payload);
  const resourceSpans = list(field(root, "resourceSpans", "resource_spans"));
  if (!root || !Array.isArray(field(root, "resourceSpans", "resource_spans"))) {
    throw new Error("resourceSpans must be an array");
  }

  const spans: ParsedSpan[] = [];
  let rejected = 0;

  for (const resourceSpanCandidate of resourceSpans) {
    const resourceSpan = record(resourceSpanCandidate);
    const resource = record(resourceSpan?.resource);
    const resourceAttributes = decodeAttributes(resource?.attributes);
    const scopeSpans = list(
      field(resourceSpan, "scopeSpans", "scope_spans") ??
        field(resourceSpan, "instrumentationLibrarySpans", "instrumentation_library_spans"),
    );

    for (const scopeSpanCandidate of scopeSpans) {
      const scopeSpan = record(scopeSpanCandidate);
      const scope = record(scopeSpan?.scope ?? scopeSpan?.instrumentationLibrary);
      const scopeAttributes = decodeAttributes(scope?.attributes);

      for (const spanCandidate of list(scopeSpan?.spans)) {
        const span = record(spanCandidate);
        const traceId = identifier(field(span, "traceId", "trace_id"), 32);
        const spanId = identifier(field(span, "spanId", "span_id"), 16);
        const parentSpanId = identifier(field(span, "parentSpanId", "parent_span_id"), 16) || "";
        const startNano = integerString(field(span, "startTimeUnixNano", "start_time_unix_nano"));
        const endNano = integerString(field(span, "endTimeUnixNano", "end_time_unix_nano"));
        const timestamp = startNano ? nanoDate(startNano) : null;
        const endTimestamp = endNano ? nanoDate(endNano) : null;
        const name = stringValue(span?.name);

        if (!span || !traceId || !spanId || !startNano || !endNano || !timestamp || !endTimestamp || !name) {
          rejected++;
          continue;
        }

        let durationNano: string;
        try {
          const duration = BigInt(endNano) - BigInt(startNano);
          if (duration < 0n || duration > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error("duration is outside the supported range");
          }
          durationNano = String(duration);
        } catch {
          rejected++;
          continue;
        }

        const spanAttributes = decodeAttributes(span.attributes);
        const status = record(span.status);
        const kindValue = Number(span.kind ?? 0);
        const statusValue = Number(status?.code ?? 0);

        spans.push({
          timestamp,
          endTimestamp,
          traceId,
          spanId,
          parentSpanId,
          traceState: stringValue(field(span, "traceState", "trace_state")),
          name,
          kind: Number.isFinite(kindValue) ? kindValue : 0,
          durationNano,
          statusCode: Number.isFinite(statusValue) ? statusValue : 0,
          statusMessage: stringValue(status?.message),
          serviceName: attributeString(resourceAttributes, "service.name") || "unknown_service",
          serviceNamespace: attributeString(resourceAttributes, "service.namespace"),
          serviceVersion: attributeString(resourceAttributes, "service.version"),
          environment: attributeString(resourceAttributes, "deployment.environment.name", "deployment.environment"),
          region: attributeString(resourceAttributes, "cloud.region", "host.region"),
          scopeName: stringValue(scope?.name),
          scopeVersion: stringValue(scope?.version),
          httpMethod: attributeString(spanAttributes, "http.request.method", "http.method") || "EVENT",
          resourceAttributes,
          spanAttributes,
          scopeAttributes,
          events: list(span.events),
          links: list(span.links),
        });
      }
    }
  }

  return { spans, rejected };
}
