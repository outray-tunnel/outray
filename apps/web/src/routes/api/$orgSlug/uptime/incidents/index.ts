import { createFileRoute } from "@tanstack/react-router";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { incidents } from "@/db/alerts-schema";
import { uptimeIncidentComponents, uptimeIncidentUpdates, uptimeStatusComponents, uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, canManageUptime, jsonBody, notFound, requireUptimeManager, requireUptimeRead } from "@/lib/uptime/api";
import { lockUptimeOrganization, parseComponentIds, parseIncidentUpdate, PublishError, publishUptimeUpdate } from "@/lib/uptime/incident-api";
import { loadIncidentList, parseIncidentListQuery } from "@/lib/uptime/incident-query";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const access = await requireUptimeRead(request, params.orgSlug);
      if ("error" in access) return access.error;
      const query = parseIncidentListQuery(new URL(request.url).searchParams);
      if (!query.success) return badInput(query.error, query.field);
      const [result, canManage] = await Promise.all([
        loadIncidentList(db, access.organization.id, query.data),
        canManageUptime(access.organization.id, access.session?.user.id),
      ]);
      return Response.json({ ...result, canManage });
    },
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const title = body.title;
      if (typeof title !== "string" || !title.trim() || title.trim().length > 160) return badInput("Title must be 1–160 characters", "title");
      const componentIds = parseComponentIds(body.componentIds);
      if (!componentIds) return badInput("Choose at least one affected component", "componentIds");
      const parsed = parseIncidentUpdate(body);
      if (!parsed.success) return badInput(parsed.error, parsed.field);
      const [page] = await db.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
        .where(eq(uptimeStatusPages.organizationId, access.organization.id)).limit(1);
      if (!page) return notFound("Status page");
      const components = await db.select({ id: uptimeStatusComponents.id, name: uptimeStatusComponents.name })
        .from(uptimeStatusComponents).where(and(
          eq(uptimeStatusComponents.organizationId, access.organization.id),
          eq(uptimeStatusComponents.pageId, page.id), inArray(uptimeStatusComponents.id, componentIds),
        ));
      if (components.length !== componentIds.length) return badInput("An affected component is unavailable", "componentIds");
      const now = new Date();
      try {
        const created = await db.transaction(async (tx) => {
          await lockUptimeOrganization(tx, access.organization.id);
          const incidentId = crypto.randomUUID();
          const updateId = crypto.randomUUID();
          const [incident] = await tx.insert(incidents).values({
            id: incidentId, organizationId: access.organization.id,
            sourceType: "uptime_manual", sourceId: incidentId,
            title: title.trim(), status: "open",
            sourceSnapshot: { affectedComponents: components },
            startedAt: now,
          }).returning();
          await tx.insert(uptimeIncidentComponents).values(componentIds.map((componentId) => ({
            organizationId: access.organization.id, incidentId, componentId,
          })));
          const [update] = await tx.insert(uptimeIncidentUpdates).values({
            id: updateId, organizationId: access.organization.id, incidentId,
            createdBy: access.session!.user.id, note: parsed.data.note, bodyJson: parsed.data.bodyJson,
            status: parsed.data.status, componentStates: parsed.data.componentStates,
            publishedAt: parsed.data.publish ? now : null,
          }).returning();
          if (parsed.data.publish) {
            const result = await publishUptimeUpdate(tx, {
              organizationId: access.organization.id, incidentId, updateId,
              title: title.trim(), affectedComponentIds: componentIds,
              note: parsed.data.note, status: parsed.data.status,
              componentStates: parsed.data.componentStates, applyManualLifecycle: true, now,
            });
            if (!result.success) throw new PublishError(result.error, result.status);
          }
          return { incident, update };
        });
        return Response.json(created, { status: 201 });
      } catch (error) {
        if (error instanceof PublishError) return Response.json({ error: error.message }, { status: error.status });
        throw error;
      }
    },
  } },
});
