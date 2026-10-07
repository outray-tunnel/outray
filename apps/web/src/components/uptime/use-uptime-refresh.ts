import { useEffect } from "react";

/** One visible-tab poller. The resource owns retained data and aborting stale reads. */
export function useUptimeRefresh(reload: () => void) {
  useEffect(() => {
    let timer: number | undefined;
    let lastRefresh = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 1_000) return;
      lastRefresh = Date.now();
      reload();
    };
    const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
    const start = () => {
      stop();
      if (document.visibilityState === "visible") timer = window.setInterval(refresh, 30_000);
    };
    const visibilityChanged = () => { if (document.visibilityState === "visible") refresh(); start(); };
    start();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      stop();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [reload]);
}
