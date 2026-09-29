import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { uptimeStatusComponents, uptimeStatusGroups } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { textField } from "@/lib/uptime/validation";

export const Route = createFileRoute("/api/$orgSlug/uptime/groups/$groupId")({
  server: { handlers: {
    PATCH: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const allowed = new Set(["name", "sortOrder", "visible"]);
      if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) return badInput("Provide valid group settings");
      const values: Partial<typeof uptimeStatusGroups.$inferInsert> = { updatedAt: new Date() };
      if (Object.hasOwn(body, "name")) {
        const value = textField(body.name, 100, true);
        if (value === undefined) return badInput("Group name must be 1–100 characters", "name");
        values.name = value!;
      }
      if (Object.hasOwn(body, "sortOrder")) {
        if (!Number.isInteger(body.sortOrder) || (body.sortOrder as number) < 0 || (body.sortOrder as number) > 1_000) return badInput("Invalid order", "sortOrder");
        values.sortOrder = body.sortOrder as number;
      }
      if (Object.hasOwn(body, "visible")) {
        if (typeof body.visible !== "boolean") return badInput("Visible must be true or false", "visible");
        values.visible = body.visible;
      }
      const [group] = await db.update(uptimeStatusGroups).set(values).where(and(
        eq(uptimeStatusGroups.id, params.groupId), eq(uptimeStatusGroups.organizationId, access.organization.id),
      )).returning();
      if (!group) return notFound("Group");
      return Response.json({ group });
    },
    DELETE: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [group] = await db.select({ id: uptimeStatusGroups.id, pageId: uptimeStatusGroups.pageId })
        .from(uptimeStatusGroups).where(and(eq(uptimeStatusGroups.id, params.groupId),
          eq(uptimeStatusGroups.organizationId, access.organization.id))).limit(1);
      if (!group) return notFound("Group");
      const [totals] = await db.select({ count: sql<number>`count(*)::int` }).from(uptimeStatusGroups)
        .where(and(eq(uptimeStatusGroups.pageId, group.pageId), eq(uptimeStatusGroups.organizationId, access.organization.id)));
      if (totals.count <= 1) return badInput("A status page must retain one group");
      const [components] = await db.select({ count: sql<number>`count(*)::int` }).from(uptimeStatusComponents)
        .where(and(eq(uptimeStatusComponents.groupId, group.id), eq(uptimeStatusComponents.organizationId, access.organization.id)));
      if (components.count) return badInput("Move or hide this group's components before deleting it");
      await db.delete(uptimeStatusGroups).where(eq(uptimeStatusGroups.id, group.id));
      return Response.json({ success: true });
    },
  } },
});
