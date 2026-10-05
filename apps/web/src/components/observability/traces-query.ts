import { queryOptions } from "@tanstack/react-query";
import {
  normalizeTracesSearch,
  type TraceDetailsResponse,
  type TracesResponse,
  type TracesSearch,
  type TracesSnapshot,
} from "./traces-data";

export function observabilityTracesQuery(orgSlug: string, input: TracesSearch, isLive: boolean) {
  const search = normalizeTracesSearch(input);
  return queryOptions({
    queryKey: ["observability", "traces", orgSlug, search.search ?? null, search.errorsOnly ?? false, search.range] as const,
    queryFn: async ({ signal }): Promise<TracesSnapshot> => {
      const parameters = new URLSearchParams({ range: search.range, limit: "100" });
      if (search.search) parameters.set("search", search.search);
      if (search.errorsOnly) parameters.set("errorsOnly", "true");
      const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/observability/traces?${parameters}`, { signal });
      if (!response.ok) throw new Error("Trace data is temporarily unavailable.");
      let data: TracesResponse;
      try {
        data = await response.json() as TracesResponse;
      } catch (error) {
        ensureNotAborted(signal);
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new Error("Trace data is temporarily unavailable.");
      }
      ensureNotAborted(signal);
      if (!data || !Array.isArray(data.traces) || !data.traces.every(isTraceSummary) ||
        !data.statistics || typeof data.statistics !== "object" || Array.isArray(data.statistics) ||
        !Array.isArray(data.distribution) || !data.distribution.every((item) => item && typeof item.bucket === "string")) {
        throw new Error("Trace data is temporarily unavailable.");
      }
      return { ...data, receivedAt: Date.now(), requestedSearch: { ...search } };
    },
    enabled: !!orgSlug,
    retry: false,
    refetchInterval: isLive ? 4_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isLive,
    refetchOnReconnect: isLive,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === orgSlug ? previousData : undefined,
  });
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function isAttributeMap(value: unknown): boolean {
  return value === null || (!!value && typeof value === "object" && !Array.isArray(value));
}

function isTraceSummary(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const trace = value as Record<string, unknown>;
  // Numeric nulls can be returned for unknown aggregates and remain em dashes.
  return ["id", "name", "rootService", "startedAt", "status", "method"].every((key) => typeof trace[key] === "string") &&
    ["duration", "spanCount"].every((key) => trace[key] === null || typeof trace[key] === "number");
}

function isTraceSpan(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const span = value as Record<string, unknown>;
  return ["id", "name", "service", "startedAt", "status", "statusMessage"].every((key) => typeof span[key] === "string") &&
    (span.parentId === null || typeof span.parentId === "string") &&
    ["duration", "offset", "kind"].every((key) => typeof span[key] === "number") &&
    isAttributeMap(span.attributes) && isAttributeMap(span.resourceAttributes) &&
    Array.isArray(span.events) && Array.isArray(span.links);
}

/** Only actual, matching detail responses may become a trace's span timeline. */
export async function fetchTraceDetails(
  orgSlug: string,
  traceId: string,
  signal?: AbortSignal,
): Promise<TraceDetailsResponse> {
  ensureNotAborted(signal);
  const response = await fetch(
    `/api/${encodeURIComponent(orgSlug)}/observability/traces/${encodeURIComponent(traceId)}`,
    { signal },
  );
  ensureNotAborted(signal);
  if (response.status === 404) throw new Error("This trace is no longer available.");
  if (!response.ok) throw new Error("Trace details are temporarily unavailable.");
  let data: TraceDetailsResponse;
  try {
    data = await response.json() as TraceDetailsResponse;
  } catch (error) {
    ensureNotAborted(signal);
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Trace details are temporarily unavailable.");
  }
  ensureNotAborted(signal);
  if (!data || data.traceId !== traceId || !Array.isArray(data.spans) || !data.spans.every(isTraceSpan)) {
    throw new Error("Trace details are temporarily unavailable.");
  }
  return data;
}
