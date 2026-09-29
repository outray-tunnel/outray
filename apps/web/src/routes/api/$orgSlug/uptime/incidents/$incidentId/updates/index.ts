import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidents } from "@/db/alerts-schema";
import { uptimeIncidentComponents, uptimeIncidentUpdates } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { parseIncidentUpdate, publishUptimeUpdate } from "@/lib/uptime/incident-api";
import { PublishError } from "../../index";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/$incidentId/updates/")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const parsed = parseIncidentUpdate(body);
      if (!parsed.success) return badInput(parsed.error, parsed.field);
      const [incident] = await db.select().from(incidents).where(and(
        eq(incidents.id, params.incidentId), eq(incidents.organizationId, access.organization.id),
        eq(incidents.sourceType, "uptime_manual"),
      )).limit(1);
      if (!incident) return notFound("Manual incident");
      if (incident.status === "resolved") return badInput("Resolved incidents cannot receive new updates");
      const associations = await db.select({ componentId: uptimeIncidentComponents.componentId })
        .from(uptimeIncidentComponents).where(and(
          eq(uptimeIncidentComponents.incidentId, incident.id),
          eq(uptimeIncidentComponents.organizationId, access.organization.id),
        ));
      const now = new Date();
      try {
        const result = await db.transaction(async (tx) => {
          const updateId = crypto.randomUUID();
          const [update] = await tx.insert(uptimeIncidentUpdates).values({
            id: updateId, organizationId: access.organization.id, incidentId: incident.id,
            createdBy: access.session!.user.id,
            note: parsed.data.note, status: parsed.data.status,
            componentStates: parsed.data.componentStates,
            publishedAt: parsed.data.publish ? now : null,
          }).returning();
          if (parsed.data.publish) {
            const publish = await publishUptimeUpdate(tx, {
              organizationId: access.organization.id, incidentId: incident.id,
              updateId, title: incident.title,
              affectedComponentIds: associations.map((link) => link.componentId),
              note: parsed.data.note, status: parsed.data.status,
              componentStates: parsed.data.componentStates, now,
            });
            if (!publish.success) throw new PublishError(publish.error, publish.status);
          }
          return update;
        });
        return Response.json({ update: result }, { status: 201 });
      } catch (error) {
        if (error instanceof PublishError) return Response.json({ error: error.message }, { status: error.status });
        throw error;
      }
    },
  } },
});
