import type { UptimeIncident, UptimeMonitor } from "./uptime-client";
import { incidentLabel } from "@/lib/uptime/incident-display";

export function uptimeOverviewSummary(monitors: UptimeMonitor[], incidents: UptimeIncident[]) {
  const enabled = monitors.filter((monitor) => monitor.enabled);
  const up = enabled.filter((monitor) => monitor.state === "up" && monitor.lastCheckedAt).length;
  const down = enabled.filter((monitor) => monitor.state === "down" && monitor.lastCheckedAt).length;
  const unknown = enabled.length - up - down;
  const detected = incidents.filter((incident) => incidentLabel(incident) === "Detected").length;
  const active = incidents.filter((incident) => incidentLabel(incident) === "Active").length;
  const health = !monitors.length ? "empty" : !enabled.length ? "paused" : down ? "down" : unknown ? "unknown" : "up";
  return { total: monitors.length, enabled: enabled.length, paused: monitors.length - enabled.length, up, down, unknown, detected, active, health };
}

/** Surface monitors requiring attention first without changing the resource order. */
export function overviewMonitorRows(monitors: UptimeMonitor[]) {
  const rank = (monitor: UptimeMonitor) => !monitor.enabled ? 3 : monitor.state === "down" ? 0 : monitor.state === "unknown" || !monitor.lastCheckedAt ? 1 : 2;
  return [...monitors].sort((left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name)).slice(0, 5);
}
