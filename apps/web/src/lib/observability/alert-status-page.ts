import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { incidents, observabilityAlerts } from "@/db/alerts-schema";
import { uptimeComponentAlerts, uptimeIncidentComponents, uptimeStatusComponents, uptimeStatusGroups, uptimeStatusPages } from "@/db/uptime-schema";
import type { SecretsTransaction } from "@/lib/secrets/database";
import { lockUptimeOrganization, PublishError } from "@/lib/uptime/incident-api";

export type AlertStatusPageInput = { publicTitle: string | null; impact: "degraded" | "outage"; componentIds: string[]; pageId?: string };

export function parseAlertStatusPageInput(body: Record<string, unknown>):
  { success: true; data: AlertStatusPageInput } | { success: false; error: string; field?: string } {
  if (Object.keys(body).length < 3 || Object.keys(body).length > 4 || Object.keys(body).some((key) => !["publicTitle", "impact", "componentIds", "pageId"].includes(key))) {
    return { success: false, error: "Provide the customer-facing title, impact, and components" };
  }
  if (!Array.isArray(body.componentIds) || body.componentIds.length > 100 || body.componentIds.some((id) => typeof id !== "string" || !id || id.length > 100)) {
    return { success: false, field: "componentIds", error: "Choose valid status-page components" };
  }
  if (body.impact !== "degraded" && body.impact !== "outage") {
    return { success: false, field: "impact", error: "Impact must be degraded or outage" };
  }
  if (typeof body.publicTitle !== "string" || body.publicTitle.trim().length > 160 || (body.componentIds.length && !body.publicTitle.trim())) {
    return { success: false, field: "publicTitle", error: "Customer-facing title must be 1–160 characters" };
  }
  if (body.pageId !== undefined && (typeof body.pageId !== "string" || !body.pageId)) {
    return { success: false, field: "pageId", error: "Choose a status page" };
  }
  return { success: true, data: {
    publicTitle: body.componentIds.length ? body.publicTitle.trim() : null,
    impact: body.impact, componentIds: [...new Set(body.componentIds as string[])],
    ...(typeof body.pageId === "string" ? { pageId: body.pageId } : {}),
  } };
}

export async function loadAlertStatusPage(database: Pick<SecretsTransaction, "select">, organizationId: string, alertId: string, requestedPageId?: string | null) {
  const [alert] = await database.select({ id: observabilityAlerts.id, publicTitle: observabilityAlerts.statusPagePublicTitle,
    impact: observabilityAlerts.statusPageImpact }).from(observabilityAlerts).where(and(
      eq(observabilityAlerts.id, alertId), eq(observabilityAlerts.organizationId, organizationId), isNull(observabilityAlerts.deletedAt),
    )).limit(1);
  if (!alert) return null;
  const pages = await database.select({ id: uptimeStatusPages.id, name: uptimeStatusPages.name,
    slug: uptimeStatusPages.slug, published: uptimeStatusPages.published }).from(uptimeStatusPages)
    .where(eq(uptimeStatusPages.organizationId, organizationId)).orderBy(asc(uptimeStatusPages.createdAt), asc(uptimeStatusPages.id));
  const [links, episode] = await Promise.all([
    database.select({ componentId: uptimeComponentAlerts.componentId, pageId: uptimeStatusComponents.pageId }).from(uptimeComponentAlerts)
      .innerJoin(uptimeStatusComponents, eq(uptimeStatusComponents.id, uptimeComponentAlerts.componentId))
      .where(and(eq(uptimeComponentAlerts.organizationId, organizationId), eq(uptimeComponentAlerts.alertId, alertId))),
    database.select({ id: incidents.id }).from(incidents).where(and(eq(incidents.organizationId, organizationId),
      eq(incidents.sourceType, "observability_alert"), eq(incidents.sourceId, alertId),
      or(eq(incidents.status, "open"), eq(incidents.uptimePublicationState, "published"))))
      .orderBy(desc(incidents.startedAt), desc(incidents.id)).limit(1),
  ]);
  const page = pages.find((item) => item.id === requestedPageId) ??
    pages.find((item) => item.id === links[0]?.pageId) ?? pages[0] ?? null;
  const components = page ? await database.select({ id: uptimeStatusComponents.id, name: uptimeStatusComponents.name,
      visible: uptimeStatusComponents.visible, groupId: uptimeStatusComponents.groupId,
      groupName: uptimeStatusGroups.name, groupVisible: uptimeStatusGroups.visible }).from(uptimeStatusComponents)
      .leftJoin(uptimeStatusGroups, and(eq(uptimeStatusGroups.id, uptimeStatusComponents.groupId),
        eq(uptimeStatusGroups.organizationId, organizationId), eq(uptimeStatusGroups.pageId, page.id)))
      .where(and(eq(uptimeStatusComponents.organizationId, organizationId), eq(uptimeStatusComponents.pageId, page.id)))
      .orderBy(uptimeStatusComponents.sortOrder, uptimeStatusComponents.id) : [];
  return {
    link: alert.publicTitle && links.some((link) => link.pageId === page?.id) ? { publicTitle: alert.publicTitle, impact: alert.impact,
      componentIds: links.filter((link) => link.pageId === page?.id).map((link) => link.componentId) } : null,
    page: page ?? null,
    pages,
    components: components.map(({ groupVisible, ...component }) => ({ ...component,
      visible: component.visible && (component.groupId === null || groupVisible === true) })),
    incidentId: episode[0]?.id ?? null,
  };
}

/** Configure future detections and attach the current private canonical episode.
 * Never replace or erase the approved component/title/impact snapshot of an episode.
 */
export async function saveAlertStatusPage(tx: SecretsTransaction, input: {
  organizationId: string; alertId: string; data: AlertStatusPageInput;
}) {
  await lockUptimeOrganization(tx, input.organizationId);
  const [alert] = await tx.select({ id: observabilityAlerts.id }).from(observabilityAlerts).where(and(
    eq(observabilityAlerts.id, input.alertId), eq(observabilityAlerts.organizationId, input.organizationId),
    isNull(observabilityAlerts.deletedAt),
  )).for("update").limit(1);
  if (!alert) return null;
  const [page] = await tx.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
    .where(and(eq(uptimeStatusPages.organizationId, input.organizationId), input.data.pageId ? eq(uptimeStatusPages.id, input.data.pageId) : undefined))
    .orderBy(asc(uptimeStatusPages.createdAt), asc(uptimeStatusPages.id)).limit(1);
  if (!page && input.data.componentIds.length) throw new PublishError("Create a status page before linking this alert", 409, "componentIds");
  const components = page && input.data.componentIds.length ? await tx.select({ id: uptimeStatusComponents.id,
    name: uptimeStatusComponents.name }).from(uptimeStatusComponents)
    .leftJoin(uptimeStatusGroups, and(eq(uptimeStatusGroups.id, uptimeStatusComponents.groupId),
      eq(uptimeStatusGroups.organizationId, input.organizationId), eq(uptimeStatusGroups.pageId, page.id)))
    .where(and(eq(uptimeStatusComponents.organizationId, input.organizationId), eq(uptimeStatusComponents.pageId, page.id),
      inArray(uptimeStatusComponents.id, input.data.componentIds), eq(uptimeStatusComponents.visible, true),
      or(isNull(uptimeStatusComponents.groupId), eq(uptimeStatusGroups.visible, true)))) : [];
  if (components.length !== input.data.componentIds.length) {
    throw new PublishError("An affected component is unavailable or hidden", 400, "componentIds");
  }
  const [incident] = await tx.select().from(incidents).where(and(eq(incidents.organizationId, input.organizationId),
    eq(incidents.sourceType, "observability_alert"), eq(incidents.sourceId, input.alertId), eq(incidents.status, "open")))
    .for("update").limit(1);
  const now = new Date();
  await tx.update(observabilityAlerts).set({ statusPagePublicTitle: input.data.publicTitle,
    statusPageImpact: input.data.impact, updatedAt: now }).where(and(eq(observabilityAlerts.id, alert.id),
      eq(observabilityAlerts.organizationId, input.organizationId)));
  await tx.delete(uptimeComponentAlerts).where(and(eq(uptimeComponentAlerts.organizationId, input.organizationId),
    eq(uptimeComponentAlerts.alertId, alert.id)));
  if (input.data.componentIds.length) {
    await tx.insert(uptimeComponentAlerts).values(input.data.componentIds.map((componentId) => ({
      organizationId: input.organizationId, alertId: alert.id, componentId,
    })));
  }
  if (incident && input.data.componentIds.length && !["published", "ignored"].includes(incident.uptimePublicationState ?? "")) {
    await tx.update(incidents).set({ publicTitle: input.data.publicTitle, publicImpact: input.data.impact,
      uptimePublicationState: "detected", sourceSnapshot: { ...incident.sourceSnapshot, affectedComponents: components },
      updatedAt: now }).where(and(eq(incidents.id, incident.id), eq(incidents.organizationId, input.organizationId)));
    await tx.delete(uptimeIncidentComponents).where(and(eq(uptimeIncidentComponents.organizationId, input.organizationId),
      eq(uptimeIncidentComponents.incidentId, incident.id)));
    await tx.insert(uptimeIncidentComponents).values(input.data.componentIds.map((componentId) => ({
      organizationId: input.organizationId, incidentId: incident.id, componentId,
    })));
  }
  return { incidentId: incident?.id ?? null };
}
