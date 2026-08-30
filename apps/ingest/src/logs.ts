import {
  attributeString,
  decodeAnyValue,
  decodeAttributes,
  field,
  identifier,
  integerString,
  list,
  record,
  stringValue,
  type AttributeValue,
} from "./otlp.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ParsedLogRecord {
  timestamp: string;
  observedTimestamp: string;
  timestampNano: string;
  observedTimestampNano: string;
  severityNumber: number;
  severityText: string;
  severityLevel: LogLevel;
  body: AttributeValue;
  message: string;
  eventName: string;
  traceId: string;
  spanId: string;
  flags: number;
  serviceName: string;
  serviceNamespace: string;
  serviceVersion: string;
  environment: string;
  region: string;
  scopeName: string;
  scopeVersion: string;
  resourceAttributes: Record<string, AttributeValue>;
  logAttributes: Record<string, AttributeValue>;
  scopeAttributes: Record<string, AttributeValue>;
}

export interface ParsedLogsPayload {
  records: ParsedLogRecord[];
  rejected: number;
}

function nanoTimestamp(value: string): string | null {
  try {
    const nanos = BigInt(value);
    if (nanos <= 0n) return null;
    const seconds = nanos / 1_000_000_000n;
    const fraction = String(nanos % 1_000_000_000n).padStart(9, "0");
    const date = new Date(Number(seconds * 1_000n));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(".000Z", `.${fraction}Z`);
  } catch {
    return null;
  }
}

function severityLevel(number: number, text: string): LogLevel {
  if (number >= 17) return "error";
  if (number >= 13) return "warn";
  if (number >= 9) return "info";
  if (number >= 1) return "debug";

  const normalized = text.toLowerCase();
  if (/fatal|error|err/.test(normalized)) return "error";
  if (/warn/.test(normalized)) return "warn";
  if (/trace|debug/.test(normalized)) return "debug";
  return "info";
}

function logMessage(body: AttributeValue): string {
  if (typeof body === "string") return body;
  if (body === null) return "";
  return JSON.stringify(body);
}

export function parseLogsPayload(payload: unknown): ParsedLogsPayload {
  const root = record(payload);
  const resourceLogs = list(field(root, "resourceLogs", "resource_logs"));
  if (!root || !Array.isArray(field(root, "resourceLogs", "resource_logs"))) {
    throw new Error("resourceLogs must be an array");
  }

  const records: ParsedLogRecord[] = [];
  let rejected = 0;

  for (const resourceLogCandidate of resourceLogs) {
    const resourceLog = record(resourceLogCandidate);
    const resource = record(resourceLog?.resource);
    const resourceAttributes = decodeAttributes(resource?.attributes);
    const scopeLogs = list(field(resourceLog, "scopeLogs", "scope_logs"));

    for (const scopeLogCandidate of scopeLogs) {
      const scopeLog = record(scopeLogCandidate);
      const scope = record(scopeLog?.scope ?? scopeLog?.instrumentationLibrary);
      const scopeAttributes = decodeAttributes(scope?.attributes);
      const logRecords = list(field(scopeLog, "logRecords", "log_records"));

      for (const candidate of logRecords) {
        const item = record(candidate);
        const timeNano =
          integerString(field(item, "timeUnixNano", "time_unix_nano")) || "0";
        const observedNano =
          integerString(
            field(item, "observedTimeUnixNano", "observed_time_unix_nano"),
          ) || "0";
        const timestamp =
          nanoTimestamp(timeNano) || nanoTimestamp(observedNano);
        const observedTimestamp = nanoTimestamp(observedNano) || timestamp;
        const body = decodeAnyValue(item?.body);
        const eventName = stringValue(field(item, "eventName", "event_name"));
        const severityText = stringValue(
          field(item, "severityText", "severity_text"),
        );
        const message = (
          logMessage(body) ||
          eventName ||
          severityText ||
          "(empty log record)"
        ).slice(0, 262_144);

        if (!item || !timestamp || !observedTimestamp || !message) {
          rejected++;
          continue;
        }

        const rawSeverityNumber = Number(
          field(item, "severityNumber", "severity_number") ?? 0,
        );
        const severityNumber =
          Number.isInteger(rawSeverityNumber) &&
          rawSeverityNumber >= 0 &&
          rawSeverityNumber <= 24
            ? rawSeverityNumber
            : 0;
        const rawFlags = Number(item.flags ?? 0);

        records.push({
          timestamp,
          observedTimestamp,
          timestampNano: timeNano === "0" ? observedNano : timeNano,
          observedTimestampNano: observedNano === "0" ? timeNano : observedNano,
          severityNumber,
          severityText,
          severityLevel: severityLevel(severityNumber, severityText),
          body,
          message,
          eventName,
          traceId: identifier(field(item, "traceId", "trace_id"), 32) || "",
          spanId: identifier(field(item, "spanId", "span_id"), 16) || "",
          flags:
            Number.isInteger(rawFlags) &&
            rawFlags >= 0 &&
            rawFlags <= 0xffffffff
              ? rawFlags
              : 0,
          serviceName:
            attributeString(resourceAttributes, "service.name") ||
            "unknown_service",
          serviceNamespace: attributeString(
            resourceAttributes,
            "service.namespace",
          ),
          serviceVersion: attributeString(
            resourceAttributes,
            "service.version",
          ),
          environment: attributeString(
            resourceAttributes,
            "deployment.environment.name",
            "deployment.environment",
          ),
          region: attributeString(
            resourceAttributes,
            "cloud.region",
            "host.region",
          ),
          scopeName: stringValue(scope?.name),
          scopeVersion: stringValue(scope?.version),
          resourceAttributes,
          logAttributes: decodeAttributes(item.attributes),
          scopeAttributes,
        });
      }
    }
  }

  return { records, rejected };
}
