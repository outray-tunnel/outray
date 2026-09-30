import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { uptimeStatusComponents, uptimeStatusGroups, uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { textField } from "@/lib/uptime/validation";

export const Route = createFileRoute("/api/$orgSlug/uptime/groups/")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const name = textField(body.name, 100, true);
      if (name === undefined) return badInput("Group name must be 1–100 characters", "name");
      const [page] = await db.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
        .where(eq(uptimeStatusPages.organizationId, access.organization.id)).limit(1);
      if (!page) return notFound("Status page");
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(uptimeStatusGroups).where(and(
          eq(uptimeStatusGroups.organizationId, access.organization.id), eq(uptimeStatusGroups.pageId, page.id),
        ));
      if (count >= 30) return Response.json({ error: "Group limit reached (30)" }, { status: 403 });
      const [[lastGroup], [lastStandalone]] = await Promise.all([
        db.select({ order: sql<number>`coalesce(max(${uptimeStatusGroups.sortOrder}), -1)::int` })
          .from(uptimeStatusGroups).where(eq(uptimeStatusGroups.pageId, page.id)),
        db.select({ order: sql<number>`coalesce(max(${uptimeStatusComponents.sortOrder}), -1)::int` })
          .from(uptimeStatusComponents).where(and(eq(uptimeStatusComponents.pageId, page.id), sql`${uptimeStatusComponents.groupId} IS NULL`)),
      ]);
      const [group] = await db.insert(uptimeStatusGroups).values({
        id: crypto.randomUUID(), organizationId: access.organization.id,
        pageId: page.id, name: name!, sortOrder: Math.max(lastGroup.order, lastStandalone.order) + 1,
      }).returning();
      return Response.json({ group: { ...group, components: [] } }, { status: 201 });
    },
  } },
});
