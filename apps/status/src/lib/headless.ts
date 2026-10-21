import type { IncidentDocument } from "@outray/incident-content";
import policy from "../../../../shared/status-headless";
import { getStatusConfig } from "./config";
import { findPublishedPageById, loadPublicIncident, loadPublicPage, publishedIncidentStage,
  type PublicComponent, type PublicIncident, type PublicState, type PublicStatusPage } from "./status-data";

export interface PublicIncidentV1 {
  id: string; title: string; status: "open" | "resolved"; stage: string;
  startedAt: string; resolvedAt: string | null; components: string[];
  latestNote: string | null; latestNoteAt: string | null;
  updates: Array<{ id: string; note: string; body: IncidentDocument | null; status: string; publishedAt: string }>;
}
export interface PublicComponentV1 {
  id: string; sortOrder: number; name: string; description: string | null; state: PublicState;
  manual: boolean; updatedAt: string | null; observedUptime90d: number | null;
  history: Array<{ date: string; state: PublicState; checks: number; successes: number;
    detectedFailureMinutes: number; reportedMonitors: number; expectedMonitors: number;
    incidentMinutes: number; incidentKind: "downtime" | "incident" | null;
    incidents: Array<{ id: string; title: string; minutes: number; automatic: boolean }> }>;
}
export interface PublicStatusPageV1 {
  id: string; slug: string; name: string; description: string | null; logoUrl: string | null;
  accentColor: string; canonicalUrl: string; subscriptionsEnabled: boolean; state: PublicState;
  generatedAt: string;
  groups: Array<{ id: string; sortOrder: number; name: string; state: PublicState; components: PublicComponentV1[] }>;
  standaloneComponents: PublicComponentV1[]; incidents: PublicIncidentV1[];
}

const iso = (date: Date | null) => date === null ? null : date.toISOString();
export function publicIncidentV1(incident: PublicIncident): PublicIncidentV1 {
  return {
    id: incident.id, title: incident.title, status: incident.status, stage: publishedIncidentStage(incident),
    startedAt: incident.startedAt.toISOString(), resolvedAt: iso(incident.resolvedAt),
    components: [...incident.components], latestNote: incident.latestNote, latestNoteAt: iso(incident.latestNoteAt),
    updates: [...incident.updates].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.id.localeCompare(b.id))
      .map((update) => ({ id: update.id, note: update.note, body: update.body, status: update.status, publishedAt: update.publishedAt.toISOString() })),
  };
}
function publicComponentV1(component: PublicComponent): PublicComponentV1 {
  return {
    id: component.id, sortOrder: component.sortOrder, name: component.name, description: component.description,
    state: component.state, manual: component.manual, updatedAt: iso(component.updatedAt), observedUptime90d: component.observedUptime90d,
    history: component.history.map((day) => ({
      date: day.date, state: day.state, checks: day.checks, successes: day.successes,
      detectedFailureMinutes: day.detectedFailureMinutes, reportedMonitors: day.reportedMonitors, expectedMonitors: day.expectedMonitors,
      incidentMinutes: day.incidentMinutes, incidentKind: day.incidentKind,
      incidents: day.incidents.map((incident) => ({ id: incident.id, title: incident.title, minutes: incident.minutes, automatic: incident.automatic })),
    })),
  };
}
export function publicStatusPageV1(page: PublicStatusPage): PublicStatusPageV1 {
  // Whitelist the wire contract; never spread database/loader objects into public JSON.
  return {
    id: page.id, slug: page.slug, name: page.name, description: page.description, logoUrl: page.logoUrl,
    accentColor: page.accentColor, canonicalUrl: page.canonicalUrl, subscriptionsEnabled: page.subscriptionsEnabled,
    state: page.state, generatedAt: new Date().toISOString(),
    groups: page.groups.map((group) => ({ id: group.id, sortOrder: group.sortOrder, name: group.name, state: group.state, components: group.components.map(publicComponentV1) })),
    standaloneComponents: page.standaloneComponents.map(publicComponentV1), incidents: page.incidents.map(publicIncidentV1),
  };
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
export const publicStatusOptions = () => new Response(null, { status: 204, headers: { ...cors, "Cache-Control": "public, max-age=15" } });
export async function publicStatusResponse(pageId: string | undefined, incidentId?: string): Promise<Response> {
  const error = (status: number, code: string) => Response.json({ error: code }, { status, headers: { ...cors, "Cache-Control": "no-store" } });
  try {
    if (!getStatusConfig().enabled || !policy.PUBLIC_STATUS_ID.test(pageId || "") ||
        (incidentId !== undefined && !policy.PUBLIC_STATUS_ID.test(incidentId))) return error(404, "not_found");
    const page = await findPublishedPageById(pageId!);
    if (!page) return error(404, "not_found");
    let data: PublicStatusPageV1 | PublicIncidentV1;
    if (incidentId !== undefined) {
      const incident = await loadPublicIncident(page, incidentId);
      if (!incident) return error(404, "not_found");
      data = publicIncidentV1(incident);
    } else data = publicStatusPageV1(await loadPublicPage(page));
    return Response.json(data, { headers: { ...cors, "Cache-Control": "public, max-age=15, s-maxage=15" } });
  } catch {
    console.warn("headless_status_unavailable");
    return error(503, "status_unavailable");
  }
}
