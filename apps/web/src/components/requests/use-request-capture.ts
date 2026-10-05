import { useCallback, useEffect, useState } from "react";
import type { RequestCapture, TunnelEvent } from "./types";

interface CaptureState {
  scope: string | null;
  capture: RequestCapture | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
}

const emptyState: CaptureState = {
  scope: null,
  capture: null,
  loading: false,
  error: null,
  notFound: false,
};

export function useRequestCapture(
  orgSlug: string,
  request: TunnelEvent | null,
) {
  const tunnelId = request?.tunnel_id;
  const timestamp = request?.timestamp;
  const requestId = request?.request_id;
  const scope = request
    ? JSON.stringify([orgSlug, tunnelId, timestamp, requestId ?? null])
    : null;
  const [state, setState] = useState<CaptureState>(() => ({
    ...emptyState,
    scope,
    loading: scope !== null,
  }));
  const [retryVersion, setRetryVersion] = useState(0);

  // Reset only when the selected identity changes, including closing/reopening.
  // React rerenders before committing, so no stale payload reaches the sheet.
  if (state.scope !== scope) {
    setState({ ...emptyState, scope, loading: scope !== null });
  }

  const retry = useCallback(() => {
    if (!scope) return;
    setState({ ...emptyState, scope, loading: true });
    setRetryVersion((version) => version + 1);
  }, [scope]);

  useEffect(() => {
    if (!scope) return;

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;
    const maxRetries = 6;
    const retryDelayMs = 2_000;

    const fetchCapture = async (attempt = 0) => {
      if (cancelled) return;
      abortController = new AbortController();

      try {
        const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/requests/capture`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tunnelId,
            timestamp,
            requestId,
          }),
          signal: abortController.signal,
        });

        // Aborted transports are not guaranteed to reject their pending work.
        // Ignore every late response before it can change state or retry.
        if (cancelled) return;
        if (!response.ok) {
          if (response.status === 404 && attempt < maxRetries) {
            retryTimeout = setTimeout(() => {
              retryTimeout = null;
              if (!cancelled) void fetchCapture(attempt + 1);
            }, retryDelayMs);
            return;
          }

          setState({
            ...emptyState,
            scope,
            error: response.status === 404
              ? "Request capture not found"
              : "Failed to fetch request capture",
            notFound: response.status === 404,
          });
          return;
        }

        const data: { capture?: RequestCapture | null } = await response.json();
        if (!cancelled) {
          setState({ ...emptyState, scope, capture: data.capture ?? null });
        }
      } catch (error) {
        if (
          cancelled ||
          (error instanceof Error && error.name === "AbortError")
        ) return;

        setState({
          ...emptyState,
          scope,
          error: "Failed to fetch request capture",
        });
      }
    };

    void fetchCapture();

    return () => {
      cancelled = true;
      if (retryTimeout !== null) clearTimeout(retryTimeout);
      abortController?.abort();
    };
  }, [orgSlug, tunnelId, timestamp, requestId, scope, retryVersion]);

  // Effects run after rendering. Do not show a prior request's payload or error
  // for even one frame while a new request or organization is being selected.
  const current = scope && state.scope === scope ? state : null;
  return {
    capture: current?.capture ?? null,
    loading: scope !== null && (current?.loading ?? true),
    error: current?.error ?? null,
    notFound: current?.notFound ?? false,
    retry,
  };
}
