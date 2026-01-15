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

    const fetchCapture = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/${orgSlug}/requests/capture`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tunnelId: request.tunnel_id,
            timestamp: request.timestamp,
          }),
        });

        if (!response.ok) {
          if (response.status === 404) {
            setError("Request capture not found");
          } else {
            setError("Failed to fetch request capture");
          }
          return;
        }

        const data = await response.json();
        setCapture(data.capture);
      } catch (err) {
        setError("Failed to fetch request capture");
        console.error("Error fetching request capture:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCapture();
  }, [orgSlug, request?.tunnel_id, request?.timestamp]);

  return { capture, loading, error };
}
