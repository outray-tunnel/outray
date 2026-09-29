export type PublicComponentState = "unknown" | "operational" | "degraded" | "outage";

export type MonitorEvidence = {
  state: string;
  lastCheckedAt: Date | null;
  enabled: boolean;
  deletedAt: Date | null;
};

export function deriveComponentState(
  manualState: PublicComponentState,
  monitors: MonitorEvidence[],
  now = Date.now(),
): PublicComponentState {
  if (!monitors.length) return manualState;
  const states = monitors.map((monitor) =>
    monitor.enabled && !monitor.deletedAt && monitor.lastCheckedAt &&
    now - monitor.lastCheckedAt.getTime() <= 180_000 &&
    now >= monitor.lastCheckedAt.getTime() ? monitor.state : "unknown");
  if (states.every((state) => state === "up")) return "operational";
  if (states.every((state) => state === "down")) return "outage";
  if (states.includes("down")) return "degraded";
  return "unknown";
}

export function rollupStatus(states: PublicComponentState[]): PublicComponentState {
  if (!states.length) return "unknown";
  if (states.every((state) => state === "operational")) return "operational";
  if (states.every((state) => state === "outage")) return "outage";
  if (states.some((state) => state === "degraded" || state === "outage")) return "degraded";
  return "unknown";
}
