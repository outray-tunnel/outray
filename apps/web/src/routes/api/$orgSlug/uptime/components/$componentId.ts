import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { uptimeComponentMonitors, uptimeStatusComponents, uptimeStatusGroups } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { textField } from "@/lib/uptime/validation";
import { monitorsBelongToOrg, parseMonitorIds } from "./index";

export const Route = createFileRoute("/api/$orgSlug/uptime/components/$componentId")({
  server: { handlers: {
    PATCH: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const allowed = new Set(["name", "description", "groupId", "sortOrder", "visible", "monitorIds"]);
      if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) return badInput("Provide valid component settings");
      const [current] = await db.select().from(uptimeStatusComponents).where(and(
        eq(uptimeStatusComponents.id, params.componentId), eq(uptimeStatusComponents.organizationId, access.organization.id),
      )).limit(1);
      if (!current) return notFound("Component");
      const values: Partial<typeof uptimeStatusComponents.$inferInsert> = { updatedAt: new Date() };
      if (Object.hasOwn(body, "name")) {
        const value = textField(body.name, 120, true);
        if (value === undefined) return badInput("Component name must be 1–120 characters", "name");
        values.name = value!;
      }
      if (Object.hasOwn(body, "description")) {
        const value = textField(body.description, 500);
        if (value === undefined) return badInput("Description is too long", "description");
        values.description = value;
      }
      if (Object.hasOwn(body, "groupId")) {
        if (body.groupId === null) values.groupId = null;
        else {
          if (typeof body.groupId !== "string") return badInput("Invalid group", "groupId");
          const [group] = await db.select({ id: uptimeStatusGroups.id }).from(uptimeStatusGroups).where(and(
            eq(uptimeStatusGroups.id, body.groupId), eq(uptimeStatusGroups.pageId, current.pageId),
            eq(uptimeStatusGroups.organizationId, access.organization.id),
          )).limit(1);
          if (!group) return notFound("Group");
          values.groupId = group.id;
        }
        if (values.groupId !== current.groupId) {
          const [last] = await db.select({ sortOrder: sql<number>`coalesce(max(${uptimeStatusComponents.sortOrder}), -1)::int` })
            .from(uptimeStatusComponents).where(and(
              eq(uptimeStatusComponents.organizationId, access.organization.id),
              eq(uptimeStatusComponents.pageId, current.pageId),
              values.groupId === null ? isNull(uptimeStatusComponents.groupId) : eq(uptimeStatusComponents.groupId, values.groupId),
            ));
          values.sortOrder = last.sortOrder + 1;
        }
      }
      if (Object.hasOwn(body, "sortOrder")) {
        if (!Number.isInteger(body.sortOrder) || (body.sortOrder as number) < 0 || (body.sortOrder as number) > 1_000) return badInput("Invalid order", "sortOrder");
        values.sortOrder = body.sortOrder as number;
      }
      if (Object.hasOwn(body, "visible")) {
        if (typeof body.visible !== "boolean") return badInput("Visible must be true or false", "visible");
        values.visible = body.visible;
      }
      let monitorIds: string[] | undefined;
      if (Object.hasOwn(body, "monitorIds")) {
        const parsed = parseMonitorIds(body.monitorIds);
        if (!parsed || !await monitorsBelongToOrg(access.organization.id, parsed)) return badInput("A monitor is unavailable", "monitorIds");
        monitorIds = parsed;
      }
      const result = await db.transaction(async (tx) => {
        const [component] = await tx.update(uptimeStatusComponents).set(values).where(and(
          eq(uptimeStatusComponents.id, current.id), eq(uptimeStatusComponents.organizationId, access.organization.id),
        )).returning();
        if (monitorIds) {
          await tx.delete(uptimeComponentMonitors).where(and(
            eq(uptimeComponentMonitors.organizationId, access.organization.id),
            eq(uptimeComponentMonitors.componentId, current.id),
          ));
          if (monitorIds.length) await tx.insert(uptimeComponentMonitors).values(monitorIds.map((monitorId) => ({
            organizationId: access.organization.id, componentId: current.id, monitorId,
          })));
        }
        return component;
      });
      return Response.json({ component: result });
    },
    DELETE: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      // Preserve incident history and audit references; removal from public view is an archive.
      const [component] = await db.update(uptimeStatusComponents).set({ visible: false, updatedAt: new Date() })
        .where(and(eq(uptimeStatusComponents.id, params.componentId),
          eq(uptimeStatusComponents.organizationId, access.organization.id)))
        .returning({ id: uptimeStatusComponents.id });
      if (!component) return notFound("Component");
      return Response.json({ success: true, archived: true });
    },
  } },
});
