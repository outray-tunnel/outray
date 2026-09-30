import { createFileRoute } from "@tanstack/react-router";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { uptimeComponentMonitors, uptimeMonitors, uptimeStatusComponents, uptimeStatusGroups, uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { textField } from "@/lib/uptime/validation";

export const Route = createFileRoute("/api/$orgSlug/uptime/components/")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const name = textField(body.name, 120, true);
      const description = textField(body.description ?? null, 500);
      if (name === undefined) return badInput("Component name must be 1–120 characters", "name");
      if (description === undefined) return badInput("Description is too long", "description");
      if (body.groupId !== undefined && body.groupId !== null && typeof body.groupId !== "string") return badInput("Invalid group", "groupId");
      const monitorIds = parseMonitorIds(body.monitorIds ?? []);
      if (!monitorIds) return badInput("Choose valid monitor IDs", "monitorIds");
      const [page] = await db.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
        .where(eq(uptimeStatusPages.organizationId, access.organization.id)).limit(1);
      if (!page) return notFound("Status page");
      let groupId: string | null = null;
      if (typeof body.groupId === "string") {
        const [group] = await db.select({ id: uptimeStatusGroups.id }).from(uptimeStatusGroups).where(and(
          eq(uptimeStatusGroups.id, body.groupId), eq(uptimeStatusGroups.pageId, page.id),
          eq(uptimeStatusGroups.organizationId, access.organization.id),
        )).limit(1);
        if (!group) return notFound("Group");
        groupId = group.id;
      }
      if (!await monitorsBelongToOrg(access.organization.id, monitorIds)) return badInput("A monitor is unavailable", "monitorIds");
      const [totals] = await db.select({ count: sql<number>`count(*)::int` }).from(uptimeStatusComponents)
        .where(eq(uptimeStatusComponents.pageId, page.id));
      if (totals.count >= 100) return Response.json({ error: "Component limit reached (100)" }, { status: 403 });
      const [lastComponent] = await db.select({ order: sql<number>`coalesce(max(${uptimeStatusComponents.sortOrder}), -1)::int` })
        .from(uptimeStatusComponents).where(and(eq(uptimeStatusComponents.pageId, page.id),
          groupId === null ? isNull(uptimeStatusComponents.groupId) : eq(uptimeStatusComponents.groupId, groupId)));
      const [lastGroup] = groupId === null
        ? await db.select({ order: sql<number>`coalesce(max(${uptimeStatusGroups.sortOrder}), -1)::int` })
          .from(uptimeStatusGroups).where(eq(uptimeStatusGroups.pageId, page.id))
        : [{ order: -1 }];
      const result = await db.transaction(async (tx) => {
        const [component] = await tx.insert(uptimeStatusComponents).values({
          id: crypto.randomUUID(), organizationId: access.organization.id,
          pageId: page.id, groupId, name: name!, description,
          sortOrder: Math.max(lastComponent.order, lastGroup.order) + 1,
        }).returning();
        if (monitorIds.length) await tx.insert(uptimeComponentMonitors).values(monitorIds.map((monitorId) => ({
          organizationId: access.organization.id, componentId: component.id, monitorId,
        })));
        return component;
      });
      return Response.json({ component: { ...result, monitorIds, state: "unknown" } }, { status: 201 });
    },
  } },
});

export function parseMonitorIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 10 || value.some((id) => typeof id !== "string" || !id || id.length > 100)) return null;
  return Array.from(new Set(value as string[]));
}

export async function monitorsBelongToOrg(organizationId: string, ids: string[]) {
  if (!ids.length) return true;
  const monitors = await db.select({ id: uptimeMonitors.id }).from(uptimeMonitors).where(and(
    eq(uptimeMonitors.organizationId, organizationId), inArray(uptimeMonitors.id, ids),
    isNull(uptimeMonitors.deletedAt),
  ));
  return monitors.length === ids.length;
}
