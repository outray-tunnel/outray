import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { editUptimeIncidentDraft, PublishError } from "@/lib/uptime/incident-api";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/$incidentId/updates/$updateId")({
  server: { handlers: {
    PATCH: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const allowed = new Set(["note", "body", "status", "componentStates", "publish"]);
      if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) return badInput("Provide valid draft update fields");
      try {
        const update = await db.transaction((tx) => editUptimeIncidentDraft(tx, {
          organizationId: access.organization.id, incidentId: params.incidentId,
          updateId: params.updateId, body,
        }));
        if (!update) return notFound("Draft update");
        return Response.json({ update });
      } catch (error) {
        if (error instanceof PublishError) return Response.json({ error: error.message, field: error.field }, { status: error.status });
        throw error;
      }
    },
  } },
});
