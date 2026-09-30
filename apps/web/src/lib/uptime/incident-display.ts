import type { UptimeComponent, UptimeIncident, UptimeIncidentUpdate, UptimePageResponse } from "@/components/uptime/uptime-client";

export type IncidentSearch = { q?: string; view?: "all" | "active" | "resolved" | "drafts"; source?: "all" | "manual" | "automatic" };

export function incidentSearch(value: Record<string, unknown>): IncidentSearch {
  const q = typeof value.q === "string" ? value.q.trim().slice(0, 160) : "";
  const view = value.view === "active" || value.view === "resolved" || value.view === "drafts" ? value.view : undefined;
  const source = value.source === "manual" || value.source === "automatic" ? value.source : undefined;
  return { ...(q ? { q } : {}), ...(view ? { view } : {}), ...(source ? { source } : {}) };
}

export function incidentLabel(incident: UptimeIncident, updates = incident.updates ?? []): "Active" | "Resolved" | "Draft" {
  if (incident.status === "resolved") return "Resolved";
  if (incident.sourceType === "uptime_manual" && !updates.some((update) => update.publishedAt)) return "Draft";
  return "Active";
}

export function incidentDuration(incident: UptimeIncident, now = Date.now()): string {
  const start = Date.parse(incident.startedAt || incident.createdAt || "");
  const end = incident.resolvedAt ? Date.parse(incident.resolvedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  if (minutes < 1) return "Less than a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainder = minutes % 60;
  if (days) return `${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours) return `${hours}h${remainder ? ` ${remainder}m` : ""}`;
  return `${minutes}m`;
}

export function pageComponents(page?: UptimePageResponse | null): UptimeComponent[] {
  return [...(page?.standaloneComponents ?? []), ...(page?.groups ?? []).flatMap((group) => group.components)];
}

export function affectedComponentNames(incident: UptimeIncident, components: UptimeComponent[]): string[] {
  const names = new Map(components.map((component) => [component.id, component.name]));
  const snapshots = incident.sourceSnapshot?.affectedComponents ?? [];
  const ids = new Set([...(incident.componentIds ?? []), ...snapshots.map((component) => component.id)]);
  return [...ids].map((id) => names.get(id) ?? snapshots.find((component) => component.id === id)?.name ?? "Removed component");
}

export function publishedIncidentUpdates(updates: UptimeIncidentUpdate[]): UptimeIncidentUpdate[] {
  return updates.filter((update) => update.publishedAt).sort((a, b) =>
    Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!) || b.id.localeCompare(a.id));
}
