import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { incidents } from "@/db/alerts-schema";
import { uptimeIncidentComponents, uptimeIncidentUpdates, uptimeStatusComponents, uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager, requireUptimeRead } from "@/lib/uptime/api";
import { parseComponentIds, parseIncidentUpdate, publishUptimeUpdate } from "@/lib/uptime/incident-api";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const access = await requireUptimeRead(request, params.orgSlug);
      if ("error" in access) return access.error;
      const rows = await db.select().from(incidents).where(and(
        eq(incidents.organizationId, access.organization.id),
        inArray(incidents.sourceType, ["uptime_monitor", "uptime_manual"]),
      )).orderBy(desc(incidents.startedAt)).limit(100);
      const ids = rows.map((row) => row.id);
      const [updates, associations] = ids.length ? await Promise.all([
        db.select().from(uptimeIncidentUpdates).where(and(
          eq(uptimeIncidentUpdates.organizationId, access.organization.id),
          inArray(uptimeIncidentUpdates.incidentId, ids),
        )).orderBy(desc(uptimeIncidentUpdates.createdAt)),
        db.select().from(uptimeIncidentComponents).where(and(
          eq(uptimeIncidentComponents.organizationId, access.organization.id),
          inArray(uptimeIncidentComponents.incidentId, ids),
        )),
      ]) : [[], []];
      return Response.json({ incidents: rows.map((row) => ({
        ...row,
        componentIds: associations.filter((link) => link.incidentId === row.id).map((link) => link.componentId),
        updates: updates.filter((update) => update.incidentId === row.id),
      })) });
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
            createdBy: access.session!.user.id, note: parsed.data.note,
            status: parsed.data.status, componentStates: parsed.data.componentStates,
            publishedAt: parsed.data.publish ? now : null,
          }).returning();
          if (parsed.data.publish) {
            const result = await publishUptimeUpdate(tx, {
              organizationId: access.organization.id, incidentId, updateId,
              title: title.trim(), affectedComponentIds: componentIds,
              note: parsed.data.note, status: parsed.data.status,
              componentStates: parsed.data.componentStates, now,
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

export class PublishError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
