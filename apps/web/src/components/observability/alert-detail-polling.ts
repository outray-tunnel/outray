import type { AlertDetailsResponse } from "./alert-detail-context";

interface PollingOptions {
  url: string;
  onStart: () => void;
  onData: (data: AlertDetailsResponse) => void;
  onError: (message: string) => void;
  onComplete: () => void;
}

/** A single request at a time; hidden views never keep evaluating the UI in the background. */
export function startAlertDetailPolling({ url, onStart, onData, onError, onComplete }: PollingOptions) {
  let disposed = false;
  let timer: number | undefined;
  let active: AbortController | null = null;
  const hidden = () => document.visibilityState === "hidden";

  const clearTimer = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };
  const load = async () => {
    if (disposed || hidden() || active) return;
    clearTimer();
    const controller = new AbortController();
    active = controller;
    const current = () => !disposed && active === controller && !controller.signal.aborted;
    onStart();
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!current()) return;
      if (!response.ok) throw new Error(response.status === 404 ? "Alert not found" : "Could not load alert");
      const data = await response.json() as AlertDetailsResponse;
      if (!data?.alert || typeof data.alert.id !== "string" || typeof data.alert.name !== "string" ||
        !Array.isArray(data.evaluations) || !Array.isArray(data.incidents) || !Array.isArray(data.notifications)) {
        throw new Error("Invalid alert response");
      }
      if (current()) onData(data);
    } catch (error) {
      if (current()) onError(error instanceof Error && error.message === "Alert not found"
        ? "This alert does not exist or you no longer have access to it."
        : "Alert details are temporarily unavailable.");
    } finally {
      if (active === controller) active = null;
      if (!disposed && !controller.signal.aborted) {
        onComplete();
        if (!hidden()) timer = window.setTimeout(() => void load(), 10_000);
      }
    }
  };
  const visibility = () => {
    clearTimer();
    if (hidden()) {
      active?.abort();
      active = null;
      onComplete();
    } else void load();
  };
  const focus = () => { void load(); };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("focus", focus);
  void load();
  return () => {
    disposed = true;
    clearTimer();
    active?.abort();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("focus", focus);
  };
}
