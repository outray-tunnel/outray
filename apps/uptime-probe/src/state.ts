export type MonitorState = "unknown" | "up" | "down";

export type MonitorTransition = {
  state: MonitorState;
  failureStreak: number;
  successStreak: number;
  incidentAction: "open" | "resolve" | null;
};

/**
 * A first successful observation establishes Up. A new outage requires two
 * consecutive failures; recovery from Down requires two consecutive successes.
 * Pending observations retain the last confirmed public state.
 */
export function transitionMonitor(
  state: MonitorState,
  failureStreak: number,
  successStreak: number,
  success: boolean,
): MonitorTransition {
  if (success) {
    const nextSuccesses = Math.min(2, Math.max(0, successStreak) + 1);
    if (state === "down" && nextSuccesses < 2) {
      return { state: "down", failureStreak: 0, successStreak: nextSuccesses, incidentAction: null };
    }
    return { state: "up", failureStreak: 0, successStreak: nextSuccesses,
      incidentAction: state === "down" ? "resolve" : null };
  }

  const nextFailures = Math.min(2, Math.max(0, failureStreak) + 1);
  if (state !== "down" && nextFailures >= 2) {
    return { state: "down", failureStreak: nextFailures, successStreak: 0,
      incidentAction: "open" };
  }
  return { state, failureStreak: nextFailures, successStreak: 0, incidentAction: null };
}

export function effectiveMonitorState(
  stored: MonitorState,
  lastCheckedAt: Date | null,
  now = new Date(),
  staleAfterMs = 3 * 60_000,
): MonitorState {
  if (!lastCheckedAt || !Number.isFinite(lastCheckedAt.getTime()) ||
      now.getTime() - lastCheckedAt.getTime() > staleAfterMs) return "unknown";
  return stored;
}
