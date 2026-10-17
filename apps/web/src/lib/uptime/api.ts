import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/app-schema";
import { members } from "@/db/auth-schema";
import { incidents } from "@/db/alerts-schema";
import { uptimeComponentMonitors, uptimeIncidentComponents, uptimeMonitors, uptimeStatusComponents, uptimeStatusGroups, uptimeStatusPages } from "@/db/uptime-schema";
import { requireAlertManager } from "@/lib/observability/alert-access";
import { isAlertManagerRole } from "@/lib/observability/alert-validation";
import { requireOrgMembershipFromSlug } from "@/lib/org";
import { deriveComponentState, overlayIncidentImpacts, rollupStatus } from "./state";

export function uptimeDisabled() {
  return process.env.OUTRAY_UPTIME_DISABLED === "true";
}

export function uptimeUnavailable() {
  return Response.json({ error: "Uptime is temporarily unavailable" }, { status: 503 });
}

export async function requireUptimeRead(request: Request, orgSlug: string) {
  if (uptimeDisabled()) return { error: uptimeUnavailable() } as const;
  return requireOrgMembershipFromSlug(request, orgSlug);
}

export async function requireUptimeManager(request: Request, orgSlug: string) {
  if (uptimeDisabled()) return { error: uptimeUnavailable() } as const;
  return requireAlertManager(request, orgSlug);
}

export async function canManageUptime(organizationId: string, userId: string | undefined) {
  if (!userId) return false;
  const membership = await db.query.members.findFirst({
    columns: { role: true },
    where: and(eq(members.organizationId, organizationId), eq(members.userId, userId)),
  });
  return isAlertManagerRole(membership?.role);
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON object" }, { status: 400 });
  }
}

export function badInput(error: string, field?: string) {
  return Response.json({ error, ...(field ? { field } : {}) }, { status: 400 });
}

export function notFound(name: string) {
  return Response.json({ error: `${name} not found` }, { status: 404 });
}

export function serializeMonitor(row: typeof uptimeMonitors.$inferSelect) {
  const { headersCiphertext: _encrypted, ...rest } = row;
  return {
    ...rest,
    hasHeaders: Boolean(row.headersCiphertext),
    state: !row.enabled || !row.lastCheckedAt || Date.now() - row.lastCheckedAt.getTime() > 180_000
      ? "unknown" : row.state,
  };
}

export function requestedStatusPageId(request?: Request): string | null {
  return request ? new URL(request.url).searchParams.get("pageId") : null;
}

/** Explicit page IDs never fall back to another page. Legacy callers without
 * a page ID continue to address the organization's oldest status page. */
export async function findStatusPage(
  organizationId: string,
  request?: Request,
  database: Pick<typeof db, "select"> = db,
) {
  const pageId = requestedStatusPageId(request);
  const [page] = await database.select().from(uptimeStatusPages)
    .where(and(eq(uptimeStatusPages.organizationId, organizationId),
      pageId === null ? undefined : eq(uptimeStatusPages.id, pageId)))
    .orderBy(asc(uptimeStatusPages.createdAt), asc(uptimeStatusPages.id)).limit(1);
  return page ?? null;
}

export async function loadPage(organizationId: string, request?: Request) {
  const page = await findStatusPage(organizationId, request);
  if (!page) return null;
  const [groups, components, statusDomains] = await Promise.all([
    db.select().from(uptimeStatusGroups).where(and(eq(uptimeStatusGroups.organizationId, organizationId), eq(uptimeStatusGroups.pageId, page.id))),
    db.select().from(uptimeStatusComponents).where(and(eq(uptimeStatusComponents.organizationId, organizationId), eq(uptimeStatusComponents.pageId, page.id))),
    page.domainId ? db.select({ domain: domains.domain }).from(domains).where(and(
      eq(domains.id, page.domainId), eq(domains.organizationId, organizationId),
      eq(domains.purpose, "status"), eq(domains.status, "active"),
    )).limit(1) : Promise.resolve([]),
  ]);
  const links = components.length ? await db.select().from(uptimeComponentMonitors)
    .where(and(eq(uptimeComponentMonitors.organizationId, organizationId), inArray(uptimeComponentMonitors.componentId, components.map((component) => component.id)))) : [];
  const monitorIds = Array.from(new Set(links.map((link) => link.monitorId)));
  const monitors = monitorIds.length ? await db.select().from(uptimeMonitors)
    .where(and(eq(uptimeMonitors.organizationId, organizationId), inArray(uptimeMonitors.id, monitorIds), isNull(uptimeMonitors.deletedAt))) : [];
  const monitorById = new Map(monitors.map((monitor) => [monitor.id, monitor]));
  const impactRows = components.length ? await db.select({ componentId: uptimeIncidentComponents.componentId,
    impact: incidents.publicImpact }).from(uptimeIncidentComponents)
    .innerJoin(incidents, and(eq(incidents.id, uptimeIncidentComponents.incidentId), eq(incidents.organizationId, organizationId)))
    .where(and(eq(uptimeIncidentComponents.organizationId, organizationId),
      inArray(uptimeIncidentComponents.componentId, components.map((component) => component.id)),
      eq(incidents.sourceType, "observability_alert"), eq(incidents.uptimePublicationState, "published"),
      sql`length(trim(${incidents.publicTitle})) > 0`, inArray(incidents.publicImpact, ["degraded", "outage"]),
      or(ne(incidents.status, "resolved"), eq(incidents.recoveryConfirmed, false)))) : [];
  const impactsByComponent = new Map<string, string[]>();
  for (const row of impactRows) {
    const impacts = impactsByComponent.get(row.componentId) ?? [];
    if (row.impact) impacts.push(row.impact);
    impactsByComponent.set(row.componentId, impacts);
  }
  const linksByComponent = new Map<string, string[]>();
  for (const link of links) {
    const ids = linksByComponent.get(link.componentId) ?? [];
    ids.push(link.monitorId);
    linksByComponent.set(link.componentId, ids);
  }
  const assembleComponent = (component: typeof uptimeStatusComponents.$inferSelect) => {
    const componentMonitorIds = linksByComponent.get(component.id) ?? [];
    return {
      ...component,
      monitorIds: componentMonitorIds,
      state: overlayIncidentImpacts(deriveComponentState(component.manualState as "unknown" | "operational" | "degraded" | "outage",
        componentMonitorIds.map((id) => monitorById.get(id) ?? {
          state: "unknown", lastCheckedAt: null, enabled: false, deletedAt: new Date(),
        })), impactsByComponent.get(component.id) ?? []),
    };
  };
  const assembledGroups = groups.sort((a, b) => a.sortOrder - b.sortOrder).map((group) => {
    const assembledComponents = components.filter((component) => component.groupId === group.id)
      .sort((a, b) => a.sortOrder - b.sortOrder).map(assembleComponent);
    return {
      ...group,
      components: assembledComponents,
      state: rollupStatus(assembledComponents.filter((component) => component.visible)
        .map((component) => component.state)),
    };
  });
  const standaloneComponents = components.filter((component) => component.groupId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder).map(assembleComponent);
  return {
    page: {
      ...page,
      customDomain: statusDomains[0]?.domain ?? null,
      state: rollupStatus([
        ...standaloneComponents.filter((component) => component.visible).map((component) => component.state),
        ...assembledGroups.filter((group) => group.visible)
          .flatMap((group) => group.components.filter((component) => component.visible)
            .map((component) => component.state)),
      ]),
    },
    groups: assembledGroups,
    standaloneComponents,
  };
}
