import type { UptimeMonitor } from "./uptime-client";

export type MonitorView = "all" | "up" | "down" | "unknown" | "paused";
export interface MonitorDraft {
  name: string; url: string; method: "GET" | "HEAD"; statusMode: "range" | "exact"; expectedStatus: string;
  responseText: string; replaceHeaders: boolean; headerLines: string; notificationEmails: string[];
  failureThreshold: number; incidentPublishing: UptimeMonitor["incidentPublishing"]; publishAfterMinutes: number;
}

export function initialMonitorDraft(monitor?: UptimeMonitor): MonitorDraft {
  return {
    name: monitor?.name ?? "", url: monitor?.url ?? "", method: monitor?.method ?? "GET",
    statusMode: monitor?.expectedStatus == null ? "range" : "exact", expectedStatus: String(monitor?.expectedStatus ?? 200),
    responseText: monitor?.responseText ?? "", replaceHeaders: false, headerLines: "", notificationEmails: [...(monitor?.notificationEmails ?? [])],
    failureThreshold: monitor?.failureThreshold ?? 3, incidentPublishing: monitor?.incidentPublishing ?? "manual", publishAfterMinutes: monitor?.publishAfterMinutes ?? 5,
  };
}

export function parseMonitorHeaders(input: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw new Error("Each header needs a name and value separated by a colon.");
    const name = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim();
    if (!name || !value) throw new Error("Header names and values cannot be empty.");
    headers[name] = value;
  }
  return headers;
}

export function monitorPayload(draft: MonitorDraft, editing: boolean): Record<string, unknown> {
  const expectedStatus = draft.statusMode === "exact" ? Number(draft.expectedStatus) : null;
  if (draft.statusMode === "exact" && (!draft.expectedStatus.trim() || !Number.isInteger(expectedStatus) || expectedStatus! < 100 || expectedStatus! > 599)) {
    throw new Error("Choose an exact HTTP status code between 100 and 599.");
  }
  return {
    name: draft.name.trim(), url: draft.url.trim(), method: draft.method, expectedStatus,
    responseText: draft.method === "GET" && draft.responseText.trim() ? draft.responseText : null,
    notificationEmails: [...draft.notificationEmails], failureThreshold: draft.failureThreshold,
    incidentPublishing: draft.incidentPublishing, publishAfterMinutes: draft.publishAfterMinutes,
    ...(!editing || draft.replaceHeaders ? { headers: parseMonitorHeaders(draft.headerLines) } : {}),
  };
}

export function filterMonitors(monitors: UptimeMonitor[], search: string, view: MonitorView): UptimeMonitor[] {
  const query = search.trim().toLowerCase();
  return monitors.filter((monitor) => {
    const matchesView = view === "all" || (view === "paused" ? !monitor.enabled : monitor.enabled && monitor.state === view);
    return matchesView && (!query || `${monitor.name} ${monitor.url} ${monitor.method}`.toLowerCase().includes(query));
  });
}

export function monitorPublishingLabel(monitor: Pick<UptimeMonitor, "incidentPublishing" | "publishAfterMinutes">): string {
  return monitor.incidentPublishing === "after_confirmation" ? `After ${monitor.publishAfterMinutes} min` : monitor.incidentPublishing === "automatic" ? "Automatic" : "Manual acknowledgement";
}
