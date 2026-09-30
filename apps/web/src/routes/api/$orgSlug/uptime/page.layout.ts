import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uptimeStatusComponents, uptimeStatusGroups, uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { planStatusLayout } from "@/lib/uptime/status-layout";

export const Route = createFileRoute("/api/$orgSlug/uptime/page/layout")({
  server: { handlers: {
    PATCH: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;

      const result = await db.transaction(async (tx) => {
        const [page] = await tx.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
          .where(eq(uptimeStatusPages.organizationId, access.organization.id)).for("update").limit(1);
        if (!page) return "missing" as const;
        const groups = await tx.select({ id: uptimeStatusGroups.id }).from(uptimeStatusGroups).where(and(
          eq(uptimeStatusGroups.organizationId, access.organization.id), eq(uptimeStatusGroups.pageId, page.id),
        ));
        const components = await tx.select({ id: uptimeStatusComponents.id }).from(uptimeStatusComponents).where(and(
          eq(uptimeStatusComponents.organizationId, access.organization.id), eq(uptimeStatusComponents.pageId, page.id),
        ));
        const plan = planStatusLayout(body, groups.map((group) => group.id), components.map((component) => component.id));
        if (!plan) return "invalid" as const;
        for (const group of plan.groups) {
          await tx.update(uptimeStatusGroups).set({ sortOrder: group.sortOrder, updatedAt: new Date() })
            .where(and(eq(uptimeStatusGroups.id, group.id), eq(uptimeStatusGroups.organizationId, access.organization.id)));
        }
        for (const component of plan.components) {
          await tx.update(uptimeStatusComponents).set({
            groupId: component.groupId, sortOrder: component.sortOrder, updatedAt: new Date(),
          }).where(and(eq(uptimeStatusComponents.id, component.id), eq(uptimeStatusComponents.organizationId, access.organization.id)));
        }
        return "saved" as const;
      });
      if (result === "missing") return notFound("Status page");
      if (result === "invalid") return badInput("The status page layout is out of date. Refresh and try again.");
      return Response.json({ success: true });
    },
  } },
});
