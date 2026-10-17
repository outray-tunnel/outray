import type { UptimeComponent, UptimeGroup, UptimePageResponse } from "@/components/uptime/uptime-client";

export interface AlertStatusPageLink {
  publicTitle: string;
  impact: "degraded" | "outage";
  componentIds: string[];
}

export interface AlertStatusPageResponse {
  link: AlertStatusPageLink | null;
  page: { id: string; name: string; slug: string; published: boolean } | null;
  pages: Array<{ id: string; name: string; slug: string; published: boolean }>;
  components: Array<{ id: string; name: string; visible: boolean; groupId: string | null; groupName?: string | null }>;
  incidentId: string | null;
  canManage: boolean;
}

export function alertStatusPagePath(orgSlug: string, alertId: string, pageId?: string | null) {
  const path = `/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alertId)}/status-page`;
  return pageId ? `${path}?pageId=${encodeURIComponent(pageId)}` : path;
}

export async function requestAlertStatusPage(orgSlug: string, alertId: string, init?: RequestInit, pageId?: string | null): Promise<AlertStatusPageResponse> {
  const response = await fetch(alertStatusPagePath(orgSlug, alertId, pageId), {
    credentials: "same-origin", cache: "no-store", ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const result = await response.json().catch(() => null) as (AlertStatusPageResponse & { error?: string; field?: string }) | null;
  if (!response.ok || !result) throw new Error(result?.error || "Could not load status-page linking.");
  return result;
}

// The linking API exposes only selectable public components, not telemetry.
export function alertStatusPageComponents(data: AlertStatusPageResponse): UptimePageResponse {
  const groups = new Map<string, UptimeGroup>();
  const standaloneComponents: UptimeComponent[] = [];
  for (const [sortOrder, component] of data.components.entries()) {
    if (!component.visible) continue;
    const row: UptimeComponent = { ...component, description: null, monitorIds: [], state: "unknown", sortOrder };
    if (!component.groupId) {
      standaloneComponents.push(row);
      continue;
    }
    let group = groups.get(component.groupId);
    if (!group) {
      group = { id: component.groupId, name: component.groupName?.trim() || `Component group ${groups.size + 1}`, visible: true, sortOrder: groups.size, components: [] };
      groups.set(component.groupId, group);
    }
    group.components.push(row);
  }
  return { page: null, groups: Array.from(groups.values()), standaloneComponents };
}
