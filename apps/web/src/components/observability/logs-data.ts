import { parseServiceLastSeen } from "./services-data";

export const LOG_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
export type LogsRange = (typeof LOG_RANGES)[number];
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogsSearch {
  search?: string;
  service?: string;
  level?: LogLevel;
  range: LogsRange;
}

export interface LogEvent {
  id: string;
  timestamp: string;
  observedTimestamp: string;
  level: string;
  severityNumber: number;
  severityText: string;
  message: string;
  eventName: string;
  traceId: string;
  spanId: string;
  flags: number;
  service: string;
  serviceNamespace: string;
  serviceVersion: string;
  environment: string;
  region: string;
  scopeName: string;
  scopeVersion: string;
  attributes: Record<string, unknown> | null;
  resourceAttributes: Record<string, unknown> | null;
  scopeAttributes: Record<string, unknown> | null;
}

export interface LogsResponse {
  logs: LogEvent[];
  services: string[];
  range: string;
}

/** Previous results retain their original filters while a new selection loads. */
export interface LogsSnapshot extends LogsResponse {
  receivedAt: number;
  requestedSearch: LogsSearch;
}

export function normalizeLogsSearch(input: unknown = {}): LogsSearch {
  const values = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const search = typeof values.search === "string" ? values.search.trim() : "";
  const service = typeof values.service === "string" ? values.service.trim() : "";
  const level = typeof values.level === "string" ? values.level.trim() : "";
  const candidate = typeof values.range === "string" ? values.range.trim() : "";
  const range = LOG_RANGES.find((item) => item === candidate) ?? "1h";
  return {
    ...(search ? { search } : {}),
    // A real service may be called "all"; the UI uses a separate sentinel.
    ...(service ? { service } : {}),
    ...(["debug", "info", "warn", "error"].includes(level) ? { level: level as LogLevel } : {}),
    range,
  };
}

export function logsSelectionMatches(snapshot: LogsSnapshot, input: LogsSearch): boolean {
  const search = normalizeLogsSearch(input);
  return snapshot.requestedSearch.search === search.search &&
    snapshot.requestedSearch.service === search.service &&
    snapshot.requestedSearch.level === search.level &&
    snapshot.requestedSearch.range === search.range;
}

/** DateTime64 records without an explicit zone are UTC, not local wall time. */
export function parseLogTimestamp(value: string): number {
  return typeof value === "string" ? parseServiceLastSeen(value) : NaN;
}

export function formatLogTime(value: string, includeMilliseconds = false): string {
  const time = parseLogTimestamp(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      ...(includeMilliseconds ? { fractionalSecondDigits: 3 as const } : {}),
    })
    : "—";
}

export function formatLogDateTime(value: string): string {
  const time = parseLogTimestamp(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "—";
}

export function formatLogISO(value: string): string {
  const time = parseLogTimestamp(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

export function logIdentity(event: Pick<LogEvent, "id" | "timestamp">): string {
  return JSON.stringify([event.id, event.timestamp]);
}

/** Invalid timestamps remain visible at the end; no observed event is invented. */
export function sortedLogs(logs: readonly LogEvent[]): LogEvent[] {
  return [...logs].sort((left, right) => {
    const leftTime = parseLogTimestamp(left.timestamp);
    const rightTime = parseLogTimestamp(right.timestamp);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
    if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) return Number.isFinite(leftTime) ? -1 : 1;
    return left.id.localeCompare(right.id, "en-US") || left.timestamp.localeCompare(right.timestamp, "en-US");
  });
}

export interface LogLevelPresentation {
  level: LogLevel | "unknown";
  label: string;
  tone: "zinc" | "sky" | "amber" | "rose";
}

export function logLevelDisplay(event: Pick<LogEvent, "level" | "severityText">): LogLevelPresentation {
  const value = typeof event.level === "string" ? event.level.trim().toLowerCase() : "";
  if (value === "debug") return { level: value, label: "Debug", tone: "zinc" };
  if (value === "info") return { level: value, label: "Info", tone: "sky" };
  if (value === "warn") return { level: value, label: "Warning", tone: "amber" };
  if (value === "error") return { level: value, label: "Error", tone: "rose" };
  const severity = typeof event.severityText === "string" ? event.severityText.trim() : "";
  const label = severity || "Unknown";
  return { level: "unknown", label: label.length > 32 ? `${label.slice(0, 31)}…` : label, tone: "zinc" };
}

function formatAttribute(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    // Malformed legacy attributes must not prevent inspection of the log line.
    return "[Unserializable value]";
  }
}

export function logAttributes(input: unknown): Array<{ key: string; value: string }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input).map(([key, value]) => ({ key, value: formatAttribute(value) }));
}

/** Export the complete API record, never the condensed row presentation. */
export function logRawJson(event: LogEvent): string {
  return JSON.stringify(event, null, 2);
}
