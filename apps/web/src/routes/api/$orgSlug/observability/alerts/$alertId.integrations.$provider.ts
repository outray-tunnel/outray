import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { observabilityAlerts } from "@/db/alerts-schema";
import { requireAlertManager } from "@/lib/observability/alert-access";
import { alertOAuthProvider } from "@/lib/observability/alert-oauth";

export const Route = createFileRoute(
  "/api/$orgSlug/observability/alerts/$alertId/integrations/$provider",
)({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const provider = alertOAuthProvider(params.provider);
        if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });
        const access = await requireAlertManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const [updated] = await db.update(observabilityAlerts)
          .set(provider === "slack"
            ? { notificationSlackWebhook: null, updatedAt: new Date() }
            : { notificationDiscordWebhook: null, updatedAt: new Date() })
          .where(and(
            eq(observabilityAlerts.id, params.alertId),
            eq(observabilityAlerts.organizationId, access.organization.id),
            isNull(observabilityAlerts.deletedAt),
          ))
          .returning({ id: observabilityAlerts.id });
        if (!updated) return Response.json({ error: "Alert not found" }, { status: 404 });
        return Response.json({ success: true });
      },
    },
  },
});
