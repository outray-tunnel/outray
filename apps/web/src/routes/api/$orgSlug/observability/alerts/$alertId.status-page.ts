import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { loadAlertStatusPage, parseAlertStatusPageInput, saveAlertStatusPage } from "@/lib/observability/alert-status-page";
import { badInput, canManageUptime, jsonBody, notFound, requireUptimeManager, requireUptimeRead } from "@/lib/uptime/api";
import { PublishError } from "@/lib/uptime/incident-api";

export const Route = createFileRoute("/api/$orgSlug/observability/alerts/$alertId/status-page")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const access = await requireUptimeRead(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [result, canManage] = await Promise.all([
        loadAlertStatusPage(db, access.organization.id, params.alertId),
        canManageUptime(access.organization.id, access.session?.user.id),
      ]);
      if (!result) return notFound("Alert");
      return Response.json({ ...result, canManage });
    },
    PATCH: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      const parsed = parseAlertStatusPageInput(body);
      if (!parsed.success) return badInput(parsed.error, parsed.field);
      try {
        const result = await db.transaction(async (tx) => {
          const saved = await saveAlertStatusPage(tx, {
            organizationId: access.organization.id, alertId: params.alertId, data: parsed.data,
          });
          return saved ? loadAlertStatusPage(tx, access.organization.id, params.alertId) : null;
        });
        if (!result) return notFound("Alert");
        return Response.json({ ...result, canManage: true });
      } catch (error) {
        if (error instanceof PublishError) return Response.json({ error: error.message, field: error.field }, { status: error.status });
        throw error;
      }
    },
  } },
});
