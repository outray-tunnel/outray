import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { uptimeComponentMonitors, uptimeMonitors, uptimeStatusComponents, uptimeStatusGroups, uptimeStatusPages } from "@/db/uptime-schema";
import { requireAlertManager } from "@/lib/observability/alert-access";
import { requireOrgFromSlug } from "@/lib/org";
import { deriveComponentState, rollupStatus } from "./state";

export function uptimeDisabled() {
  return process.env.OUTRAY_UPTIME_DISABLED === "true";
}

export function uptimeUnavailable() {
  return Response.json({ error: "Uptime is temporarily unavailable" }, { status: 503 });
}

export async function requireUptimeRead(request: Request, orgSlug: string) {
  if (uptimeDisabled()) return { error: uptimeUnavailable() } as const;
  return requireOrgFromSlug(request, orgSlug);
}

export async function requireUptimeManager(request: Request, orgSlug: string) {
  if (uptimeDisabled()) return { error: uptimeUnavailable() } as const;
  return requireAlertManager(request, orgSlug);
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

export async function loadPage(organizationId: string) {
  const [page] = await db.select().from(uptimeStatusPages)
    .where(eq(uptimeStatusPages.organizationId, organizationId)).limit(1);
  if (!page) return null;
  const [groups, components] = await Promise.all([
    db.select().from(uptimeStatusGroups).where(and(eq(uptimeStatusGroups.organizationId, organizationId), eq(uptimeStatusGroups.pageId, page.id))),
    db.select().from(uptimeStatusComponents).where(and(eq(uptimeStatusComponents.organizationId, organizationId), eq(uptimeStatusComponents.pageId, page.id))),
  ]);
  const links = components.length ? await db.select().from(uptimeComponentMonitors)
    .where(and(eq(uptimeComponentMonitors.organizationId, organizationId), inArray(uptimeComponentMonitors.componentId, components.map((component) => component.id)))) : [];
  const monitorIds = Array.from(new Set(links.map((link) => link.monitorId)));
  const monitors = monitorIds.length ? await db.select().from(uptimeMonitors)
    .where(and(eq(uptimeMonitors.organizationId, organizationId), inArray(uptimeMonitors.id, monitorIds), isNull(uptimeMonitors.deletedAt))) : [];
  const monitorById = new Map(monitors.map((monitor) => [monitor.id, monitor]));
  const linksByComponent = new Map<string, string[]>();
  for (const link of links) {
    const ids = linksByComponent.get(link.componentId) ?? [];
    ids.push(link.monitorId);
    linksByComponent.set(link.componentId, ids);
  }
  const assembledGroups = groups.sort((a, b) => a.sortOrder - b.sortOrder).map((group) => {
    const assembledComponents = components.filter((component) => component.groupId === group.id)
        .sort((a, b) => a.sortOrder - b.sortOrder).map((component) => {
          const monitorIds = linksByComponent.get(component.id) ?? [];
          return {
            ...component,
            monitorIds,
            state: deriveComponentState(component.manualState as "unknown" | "operational" | "degraded" | "outage",
              monitorIds.map((id) => monitorById.get(id) ?? {
                state: "unknown", lastCheckedAt: null, enabled: false, deletedAt: new Date(),
              })),
          };
        });
    return {
      ...group,
      components: assembledComponents,
      state: rollupStatus(assembledComponents.filter((component) => component.visible)
        .map((component) => component.state)),
    };
  });
  return {
    page: {
      ...page,
      state: rollupStatus(assembledGroups.filter((group) => group.visible)
        .flatMap((group) => group.components.filter((component) => component.visible)
          .map((component) => component.state))),
    },
    groups: assembledGroups,
  };
}
