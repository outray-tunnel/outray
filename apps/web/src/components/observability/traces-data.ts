import { parseServiceLastSeen } from "./services-data";

export const TRACE_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
export type TracesRange = (typeof TRACE_RANGES)[number];

// Search fields remain optional so existing service/log links stay valid.
export interface TracesSearch {
  search?: string;
  range?: TracesRange;
  errorsOnly?: boolean;
}

export interface NormalizedTracesSearch extends TracesSearch {
  range: TracesRange;
  errorsOnly?: true;
}

export interface TraceSummary {
  id: string;
  name: string;
  rootService: string;
  startedAt: string;
  duration: number;
  spanCount: number;
  status: string;
  method: string;
  // The summary endpoint currently sends an empty array, not span details.
  spans?: TraceSpan[];
}

export interface TraceSpan {
  id: string;
  parentId: string | null;
  name: string;
  service: string;
  startedAt: string;
  duration: number;
  offset: number;
  status: string;
  kind: number;
  statusMessage: string;
  attributes: Record<string, unknown> | null;
  resourceAttributes: Record<string, unknown> | null;
  events: unknown[];
  links: unknown[];
}

export interface TraceDetailsResponse {
  traceId: string;
  spans: TraceSpan[];
}

export interface TraceStatistics {
  totalTraces: number;
  errorTraces: number;
  errorRate: number;
  p95Duration: number;
  longestDuration: number;
}

export interface TracesResponse {
  traces: TraceSummary[];
  // These aggregates cover all traces in the period, not the list filters.
  statistics: TraceStatistics;
  distribution: Array<{ bucket: string; count: number }>;
  range: string;
}

/** Retained evidence keeps the selection that actually produced it. */
export interface TracesSnapshot extends TracesResponse {
  receivedAt: number;
  requestedSearch: NormalizedTracesSearch;
}

export function normalizeTracesSearch(input: unknown = {}): NormalizedTracesSearch {
  const values = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const search = typeof values.search === "string" ? values.search.trim() : "";
  const candidate = typeof values.range === "string" ? values.range.trim() : "";
  const range = TRACE_RANGES.find((item) => item === candidate) ?? "1h";
  return {
    ...(search ? { search } : {}),
    ...(values.errorsOnly === true || values.errorsOnly === "true" ? { errorsOnly: true as const } : {}),
    range,
  };
}

export function tracesSelectionMatches(snapshot: TracesSnapshot, input: TracesSearch): boolean {
  const search = normalizeTracesSearch(input);
  return snapshot.requestedSearch.search === search.search &&
    !!snapshot.requestedSearch.errorsOnly === !!search.errorsOnly &&
    snapshot.requestedSearch.range === search.range;
}

/** Unzoned Tinybird DateTime64 timestamps represent UTC. */
export function parseTraceTimestamp(value: string): number {
  return typeof value === "string" ? parseServiceLastSeen(value) : NaN;
}

export function formatTraceTime(value: string, includeMilliseconds = false): string {
  const time = parseTraceTimestamp(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      ...(includeMilliseconds ? { fractionalSecondDigits: 3 as const } : {}),
    })
    : "—";
}

export function formatTraceDateTime(value: string): string {
  const time = parseTraceTimestamp(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "—";
}

export function formatTraceISO(value: string): string {
  const time = parseTraceTimestamp(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

export function traceIdentity(trace: Pick<TraceSummary, "id" | "startedAt">): string {
  return JSON.stringify([trace.id, trace.startedAt]);
}

/** Do not mutate cached data or discard an event with an invalid timestamp. */
export function sortedTraces(traces: readonly TraceSummary[]): TraceSummary[] {
  return [...traces].sort((left, right) => {
    const leftTime = parseTraceTimestamp(left.startedAt);
    const rightTime = parseTraceTimestamp(right.startedAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
    if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) return Number.isFinite(leftTime) ? -1 : 1;
    return left.id.localeCompare(right.id, "en-US") || left.startedAt.localeCompare(right.startedAt, "en-US");
  });
}

/** Unknown measurements are not zero; a recorded zero remains meaningful. */
export function formatTraceDuration(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  if (value >= 60_000) {
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.floor((value % 60_000) / 1_000);
    return `${minutes.toLocaleString()}m${seconds ? ` ${seconds}s` : ""}`;
  }
  if (value >= 1_000) return `${(value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} s`;
  return `${value.toLocaleString(undefined, value > 0 && value < 1
    ? { maximumSignificantDigits: 2 }
    : { maximumFractionDigits: 2 })} ms`;
}

export function formatTraceCount(value: number): string {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : "—";
}

export function formatTraceRate(value: number): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
    : "—";
}

export const formatTracePercentage = formatTraceRate;

export interface TraceStatusPresentation {
  status: "ok" | "error" | "unknown";
  label: "OK" | "Error" | "Unknown";
  tone: "emerald" | "rose" | "zinc";
}

export function traceStatusDisplay(status: string): TraceStatusPresentation {
  const value = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (value === "ok") return { status: "ok", label: "OK", tone: "emerald" };
  if (value === "error") return { status: "error", label: "Error", tone: "rose" };
  return { status: "unknown", label: "Unknown", tone: "zinc" };
}

/** Clip measured spans to the timeline without inventing a minimum duration. */
export function traceWaterfallGeometry(
  span: Pick<TraceSpan, "offset" | "duration">,
  totalDuration: number,
): { left: number; width: number } | null {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0 ||
    !Number.isFinite(span.offset) || !Number.isFinite(span.duration) || span.duration < 0) return null;
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const left = clamp(span.offset / totalDuration);
  const end = clamp((span.offset + span.duration) / totalDuration);
  return { left: left * 100, width: Math.max(0, end - left) * 100 };
}
