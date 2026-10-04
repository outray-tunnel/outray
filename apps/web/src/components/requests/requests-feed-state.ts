import type { TunnelEvent } from "./types";

export const REQUESTS_LIMIT = 100;
export type RequestsConnection =
  | "connecting"
  | "live"
  | "reconnecting"
  | "disconnected";

const metadataKeys = new WeakMap<TunnelEvent, string>();
let nextMetadataKey = 0;

export function requestKey(request: TunnelEvent): string {
  if (request.request_id) return request.request_id;
  let key = metadataKeys.get(request);
  if (!key) {
    key = `metadata-${++nextMetadataKey}`;
    metadataKeys.set(request, key);
  }
  return key;
}

function requestFingerprint(request: TunnelEvent): string {
  return JSON.stringify([
    request.organization_id,
    request.tunnel_id,
    request.timestamp,
    request.method,
    request.path,
    request.host,
    request.status_code,
    request.request_duration_ms,
    request.bytes_in,
    request.bytes_out,
    request.client_ip,
    request.user_agent,
  ]);
}

function newRequests(
  current: readonly TunnelEvent[],
  incoming: readonly TunnelEvent[],
  mode: "history" | "log",
): TunnelEvent[] {
  const ids = new Set(current.flatMap((request) => request.request_id ? [request.request_id] : []));
  const occurrences = new Map<string, number>();
  if (mode === "history") {
    for (const request of current) {
      if (request.request_id) continue;
      const fingerprint = requestFingerprint(request);
      occurrences.set(fingerprint, (occurrences.get(fingerprint) ?? 0) + 1);
    }
  }
  return incoming.filter((request) => {
    if (request.request_id) {
      if (ids.has(request.request_id)) return false;
      ids.add(request.request_id);
      return true;
    }
    // Each no-ID log is a new occurrence, even when every field is identical.
    // A history snapshot can reconcile only the multiplicity already buffered.
    const fingerprint = requestFingerprint(request);
    const remaining = occurrences.get(fingerprint) ?? 0;
    if (remaining > 0) {
      occurrences.set(fingerprint, remaining - 1);
      return false;
    }
    return true;
  });
}

/** Both the stream and historical API may serialize database numbers as strings. */
export function normalizeRequests(
  data: unknown,
  scope: { orgId?: string; tunnelId?: string },
): TunnelEvent[] {
  if (!Array.isArray(data)) return [];
  const requests: TunnelEvent[] = [];
  for (const value of data) {
    if (!value || typeof value !== "object") continue;
    const event = value as Record<string, unknown>;
    if (
      typeof event.organization_id !== "string" ||
      typeof event.tunnel_id !== "string" ||
      typeof event.method !== "string" ||
      typeof event.path !== "string" ||
      (scope.orgId && event.organization_id !== scope.orgId) ||
      (scope.tunnelId && event.tunnel_id !== scope.tunnelId)
    ) {
      continue;
    }
    const rawTimestamp = event.timestamp;
    const timestamp =
      typeof rawTimestamp === "number" ||
      (typeof rawTimestamp === "string" && /^\d+(\.\d+)?$/.test(rawTimestamp))
        ? Number(rawTimestamp)
        : new Date(String(rawTimestamp)).getTime();
    if (!Number.isFinite(new Date(timestamp).getTime())) continue;
    const number = (field: string) => {
      const numeric = Number(event[field]);
      return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    };
    requests.push({
      request_id:
        typeof event.request_id === "string" ? event.request_id : undefined,
      organization_id: event.organization_id,
      tunnel_id: event.tunnel_id,
      method: event.method,
      path: event.path,
      timestamp,
      host: typeof event.host === "string" ? event.host : "",
      status_code: number("status_code"),
      request_duration_ms: number("request_duration_ms"),
      bytes_in: number("bytes_in"),
      bytes_out: number("bytes_out"),
      client_ip: typeof event.client_ip === "string" ? event.client_ip : "",
      user_agent: typeof event.user_agent === "string" ? event.user_agent : "",
    });
  }
  return mergeRequests([], requests);
}

export function mergeRequests(
  current: readonly TunnelEvent[],
  incoming: readonly TunnelEvent[],
  mode: "history" | "log" = "history",
): TunnelEvent[] {
  return [...newRequests(current, incoming, mode), ...current]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, REQUESTS_LIMIT);
}

export function filterRequests(
  requests: readonly TunnelEvent[],
  search: string,
): TunnelEvent[] {
  const term = search.trim().toLowerCase();
  return requests.filter(
    (request) =>
      !term ||
      [request.path, request.method, request.host].some((value) =>
        value.toLowerCase().includes(term),
      ),
  );
}

export interface LiveRequestsState {
  scopeKey: string;
  requests: TunnelEvent[];
  frozenRequests: TunnelEvent[] | null;
  pendingCount: number;
  connection: RequestsConnection;
  error: string | null;
}

export function createLiveRequestsState(scopeKey: string): LiveRequestsState {
  return {
    scopeKey,
    requests: [],
    frozenRequests: null,
    pendingCount: 0,
    connection: "connecting",
    error: null,
  };
}

export type LiveRequestsAction =
  | { type: "start"; scopeKey: string }
  | {
      type: "connection";
      scopeKey: string;
      connection: RequestsConnection;
      error?: string | null;
    }
  | {
      type: "receive";
      scopeKey: string;
      requests: TunnelEvent[];
      mode?: "history" | "log";
    }
  | { type: "pause" | "resume"; scopeKey: string };

export function liveRequestsReducer(
  state: LiveRequestsState,
  action: LiveRequestsAction,
): LiveRequestsState {
  if (action.type === "start") {
    return state.scopeKey === action.scopeKey
      ? { ...state, connection: "connecting", error: null }
      : createLiveRequestsState(action.scopeKey);
  }
  // Cleanup also guards callbacks, but scoping state makes late actions harmless.
  if (state.scopeKey !== action.scopeKey) return state;
  switch (action.type) {
    case "connection":
      return {
        ...state,
        connection: action.connection,
        error: action.error ?? null,
      };
    case "receive": {
      const mode = action.mode ?? "history";
      const newCount = newRequests(state.requests, action.requests, mode).length;
      return {
        ...state,
        requests: mergeRequests(state.requests, action.requests, mode),
        error: null,
        pendingCount: state.frozenRequests
          ? state.pendingCount + newCount
          : 0,
      };
    }
    case "pause":
      return state.frozenRequests
        ? state
        : { ...state, frozenRequests: state.requests, pendingCount: 0 };
    case "resume":
      return { ...state, frozenRequests: null, pendingCount: 0 };
  }
}

export interface HistoricalRequestsState {
  key: string;
  scopeKey: string;
  requests: TunnelEvent[];
  loading: boolean;
  error: string | null;
}

export type HistoricalRequestsAction =
  | { type: "start"; key: string; scopeKey: string }
  | { type: "success"; key: string; requests: TunnelEvent[] }
  | { type: "error"; key: string; error: string };

export function historicalRequestsReducer(
  state: HistoricalRequestsState,
  action: HistoricalRequestsAction,
): HistoricalRequestsState {
  if (action.type === "start") {
    return {
      key: action.key,
      scopeKey: action.scopeKey,
      requests: state.scopeKey === action.scopeKey ? state.requests : [],
      loading: true,
      error: null,
    };
  }
  if (state.key !== action.key) return state;
  return action.type === "success"
    ? { ...state, requests: action.requests, loading: false, error: null }
    : { ...state, loading: false, error: action.error };
}
