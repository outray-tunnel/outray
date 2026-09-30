import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { createManualIncidentUpdate, parseIncidentUpdate, PublishError } from "@/lib/uptime/incident-api";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/$incidentId/updates/")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const parsed = parseIncidentUpdate(body);
      if (!parsed.success) return badInput(parsed.error, parsed.field);
      try {
        const update = await db.transaction((tx) => createManualIncidentUpdate(tx, {
          organizationId: access.organization.id, incidentId: params.incidentId,
          userId: access.session!.user.id, data: parsed.data,
        }));
        if (!update) return notFound("Manual incident");
        return Response.json({ update }, { status: 201 });
      } catch (error) {
        if (error instanceof PublishError) return Response.json({ error: error.message, field: error.field }, { status: error.status });
        throw error;
      }
    },
  } },
});
