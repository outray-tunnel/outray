import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidents } from "@/db/alerts-schema";
import { uptimeIncidentComponents, uptimeIncidentUpdates } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { parseIncidentUpdate, publishUptimeUpdate } from "@/lib/uptime/incident-api";
import { PublishError } from "../../index";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/$incidentId/updates/$updateId")({
  server: { handlers: {
    PATCH: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const allowed = new Set(["note", "status", "componentStates", "publish"]);
      if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) return badInput("Provide valid draft update fields");
      try {
        const result = await db.transaction(async (tx) => {
          const [incident] = await tx.select().from(incidents).where(and(
            eq(incidents.id, params.incidentId), eq(incidents.organizationId, access.organization.id),
            eq(incidents.sourceType, "uptime_manual"),
          )).limit(1);
          if (!incident) return null;
          const [draft] = await tx.select().from(uptimeIncidentUpdates).where(and(
            eq(uptimeIncidentUpdates.id, params.updateId),
            eq(uptimeIncidentUpdates.incidentId, incident.id),
            eq(uptimeIncidentUpdates.organizationId, access.organization.id),
          )).for("update").limit(1);
          if (!draft) return null;
          if (draft.publishedAt) throw new PublishError("Published updates are immutable", 409);
          const parsed = parseIncidentUpdate({
            note: body.note ?? draft.note,
            status: body.status ?? draft.status,
            componentStates: body.componentStates ?? draft.componentStates,
            publish: body.publish ?? false,
          });
          if (!parsed.success) throw new PublishError(parsed.error, 400);
          const associations = await tx.select({ componentId: uptimeIncidentComponents.componentId })
            .from(uptimeIncidentComponents).where(and(
              eq(uptimeIncidentComponents.incidentId, incident.id),
              eq(uptimeIncidentComponents.organizationId, access.organization.id),
            ));
          const now = new Date();
          const [updated] = await tx.update(uptimeIncidentUpdates).set({
            note: parsed.data.note, status: parsed.data.status,
            componentStates: parsed.data.componentStates,
            publishedAt: parsed.data.publish ? now : null,
          }).where(eq(uptimeIncidentUpdates.id, draft.id)).returning();
          if (parsed.data.publish) {
            const publish = await publishUptimeUpdate(tx, {
              organizationId: access.organization.id, incidentId: incident.id,
              updateId: draft.id, title: incident.title,
              affectedComponentIds: associations.map((link) => link.componentId),
              note: parsed.data.note, status: parsed.data.status,
              componentStates: parsed.data.componentStates, now,
            });
            if (!publish.success) throw new PublishError(publish.error, publish.status);
          }
          return updated;
        });
        if (!result) return notFound("Draft update");
        return Response.json({ update: result });
      } catch (error) {
        if (error instanceof PublishError) return Response.json({ error: error.message }, { status: error.status });
        throw error;
      }
    },
  } },
});
