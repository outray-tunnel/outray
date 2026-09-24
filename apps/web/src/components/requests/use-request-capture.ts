import { useState, useEffect } from "react";
import type { RequestCapture, TunnelEvent } from "./types";

export function useRequestCapture(
  orgSlug: string,
  request: TunnelEvent | null,
) {
  const [capture, setCapture] = useState<RequestCapture | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      setCapture(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;
    const maxRetries = 6;
    const retryDelayMs = 2_000;

    setCapture(null);

    const fetchCapture = async (attempt = 0) => {
      setLoading(true);
      setError(null);
      abortController = new AbortController();
      let retryScheduled = false;

      try {
        const response = await fetch(`/api/${orgSlug}/requests/capture`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tunnelId: request.tunnel_id,
            timestamp: request.timestamp,
            requestId: request.request_id,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (response.status === 404 && attempt < maxRetries) {
            retryScheduled = true;
            retryTimeout = setTimeout(() => {
              void fetchCapture(attempt + 1);
            }, retryDelayMs);
          } else if (response.status === 404) {
            setError("Request capture not found");
          } else {
            setError("Failed to fetch request capture");
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setCapture(data.capture);
        }
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setError("Failed to fetch request capture");
          console.error("Error fetching request capture:", err);
        }
      } finally {
        if (!cancelled && !retryScheduled) {
          setLoading(false);
        }
      }
    };

    void fetchCapture();

    return () => {
      cancelled = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      abortController?.abort();
    };
  }, [orgSlug, request]);

  return { capture, loading, error };
}
