import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { appClient } from "@/lib/app-client";
import type { TimeRange } from "./types";
import {
  createLiveRequestsState,
  filterRequests,
  historicalRequestsReducer,
  liveRequestsReducer,
  normalizeRequests,
  REQUESTS_LIMIT,
} from "./requests-feed-state";

interface RequestsFeedOptions {
  orgSlug: string;
  orgId?: string;
  tunnelId?: string;
}

interface HistoryRequestScope {
  scopeKey: string;
  search: string;
  retryVersion: number;
}

export function historyRequestDelay(
  previous: HistoryRequestScope | null,
  next: HistoryRequestScope,
) {
  return previous?.scopeKey === next.scopeKey &&
    previous.retryVersion === next.retryVersion &&
    previous.search !== next.search
    ? 300
    : 0;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const CONNECTION_TIMEOUT_MS = 12_000;

export function useRequestsFeed({
  orgSlug,
  orgId,
  tunnelId,
}: RequestsFeedOptions) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<TimeRange>("live");
  const [retryVersion, retry] = useReducer((version: number) => version + 1, 0);
  const scopeKey = JSON.stringify([orgSlug, orgId, tunnelId]);
  const historyScopeKey = JSON.stringify([scopeKey, range]);
  const historyKey = JSON.stringify([scopeKey, range, search, retryVersion]);
  const previousHistoryRequest = useRef<HistoryRequestScope | null>(null);
  const [live, dispatchLive] = useReducer(
    liveRequestsReducer,
    scopeKey,
    createLiveRequestsState,
  );
  const [history, dispatchHistory] = useReducer(historicalRequestsReducer, {
    key: "",
    scopeKey: "",
    requests: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const previous = previousHistoryRequest.current;
    previousHistoryRequest.current = null;
    if (range === "live" || !orgSlug) return;
    const next = {
      scopeKey: historyScopeKey,
      search,
      retryVersion,
    };
    const delay = historyRequestDelay(previous, next);
    previousHistoryRequest.current = next;
    let cancelled = false;
    const controller = new AbortController();
    dispatchHistory({ type: "start", key: historyKey, scopeKey: historyScopeKey });
    const load = async () => {
      try {
        const response = await appClient.requests.list(
          orgSlug,
          {
            range,
            limit: REQUESTS_LIMIT,
            search,
            ...(tunnelId ? { tunnelId } : {}),
          },
          { signal: controller.signal },
        );
        if (cancelled) return;
        if ("error" in response) {
          throw new Error("Requests could not be loaded. Please try again.");
        }
        dispatchHistory({
          type: "success",
          key: historyKey,
          // The API resolves legacy tunnel aliases, so only filter its tenant here.
          requests: normalizeRequests(response.requests, { orgId }),
        });
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          dispatchHistory({
            type: "error",
            key: historyKey,
            error: "Requests could not be loaded. Please try again.",
          });
        }
      }
    };
    // Initial loads, range/tenant changes and explicit retries start immediately.
    const timer = delay
      ? setTimeout(() => void load(), delay)
      : undefined;
    if (!delay) void load();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [orgSlug, orgId, tunnelId, range, search, retryVersion, historyKey, historyScopeKey]);

  useEffect(() => {
    if (range !== "live" || !orgId) return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let tokenController: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attemptTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;
    let activeAttempt = 0;
    dispatchLive({ type: "start", scopeKey });

    const connect = async () => {
      if (cancelled) return;
      const attempt = ++activeAttempt;
      const isCurrent = () => !cancelled && activeAttempt === attempt;
      const controller = new AbortController();
      tokenController = controller;
      let attemptSocket: WebSocket | null = null;

      const fail = (message: string) => {
        if (!isCurrent()) return;
        activeAttempt += 1;
        clearTimeout(attemptTimer);
        controller.abort();
        attemptSocket?.close();
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          dispatchLive({
            type: "connection",
            scopeKey,
            connection: "disconnected",
            error: "Live requests are disconnected. Retry to reconnect.",
          });
          return;
        }
        reconnectAttempts += 1;
        dispatchLive({
          type: "connection",
          scopeKey,
          connection: "reconnecting",
          error: message,
        });
        reconnectTimer = setTimeout(
          () => void connect(),
          Math.min(1_000 * 2 ** (reconnectAttempts - 1), 8_000),
        );
      };

      attemptTimer = setTimeout(
        () => fail("The live connection timed out. Reconnecting…"),
        CONNECTION_TIMEOUT_MS,
      );
      try {
        const response = await fetch("/api/dashboard/ws-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orgId }),
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (!response.ok) {
          fail("Live requests could not connect. Reconnecting…");
          return;
        }
        const { token } = (await response.json()) as { token?: unknown };
        if (!isCurrent()) return;
        const wsUrl = import.meta.env.VITE_TUNNEL_URL;
        if (typeof token !== "string" || !token || !wsUrl) {
          fail("Live requests could not connect. Reconnecting…");
          return;
        }
        attemptSocket = new WebSocket(
          `${wsUrl.replace(/\/$/, "")}/dashboard/events?token=${encodeURIComponent(token)}`,
        );
        socket = attemptSocket;
        attemptSocket.onopen = () => {
          if (!isCurrent()) return;
          clearTimeout(attemptTimer);
          dispatchLive({
            type: "connection",
            scopeKey,
            connection: "live",
          });
        };
        attemptSocket.onmessage = (event) => {
          if (!isCurrent()) return;
          try {
            const message = JSON.parse(event.data) as {
              type?: string;
              data?: unknown;
            };
            if (message.type !== "history" && message.type !== "log") return;
            if (message.type === "history" && Array.isArray(message.data)) {
              // A complete handshake starts a fresh consecutive-failure budget.
              reconnectAttempts = 0;
            }
            dispatchLive({
              type: "receive",
              scopeKey,
              mode: message.type,
              requests: normalizeRequests(
                message.type === "history" ? message.data : [message.data],
                { orgId, tunnelId },
              ),
            });
          } catch {
            dispatchLive({
              type: "connection",
              scopeKey,
              connection: "live",
              error: "A live update could not be read. New requests will continue to arrive.",
            });
          }
        };
        attemptSocket.onclose = () =>
          fail("The live connection was interrupted. Reconnecting…");
        attemptSocket.onerror = () =>
          fail("The live connection was interrupted. Reconnecting…");
      } catch {
        fail("Live requests could not connect. Reconnecting…");
      }
    };

    void connect();
    return () => {
      cancelled = true;
      activeAttempt += 1;
      clearTimeout(reconnectTimer);
      clearTimeout(attemptTimer);
      tokenController?.abort();
      socket?.close();
    };
    // Search must not recreate the stream or clear its buffered requests.
  }, [orgId, tunnelId, range, scopeKey, retryVersion]);

  const liveIsCurrent = live.scopeKey === scopeKey;
  const historyIsCurrent = history.key === historyKey;
  const historyScopeIsCurrent = history.scopeKey === historyScopeKey;
  const connection =
    liveIsCurrent && orgId ? live.connection : "connecting";
  const liveRequests = liveIsCurrent
    ? (live.frozenRequests ?? live.requests)
    : [];
  const requests =
    range === "live"
      ? filterRequests(liveRequests, search)
      : historyScopeIsCurrent
        ? history.requests
        : [];
  const historyPending = !historyIsCurrent || history.loading;
  const paused = range === "live" && liveIsCurrent && !!live.frozenRequests;
  const togglePause = useCallback(() => {
    dispatchLive({ type: paused ? "resume" : "pause", scopeKey });
  }, [paused, scopeKey]);

  return {
    search,
    setSearch,
    range,
    setRange,
    requests,
    totalCount:
      range === "live"
        ? liveRequests.length
        : historyScopeIsCurrent
          ? history.requests.length
          : 0,
    connection,
    isLoading:
      range === "live"
        ? connection === "connecting" && liveRequests.length === 0
        : historyPending && requests.length === 0,
    isUpdating: range !== "live" && historyPending && requests.length > 0,
    error:
      range === "live"
        ? liveIsCurrent
          ? live.error
          : null
        : historyIsCurrent
          ? history.error
          : null,
    paused,
    pendingCount: paused ? live.pendingCount : 0,
    togglePause,
    retry,
    scopeKey,
  };
}

export type RequestsFeed = ReturnType<typeof useRequestsFeed>;
