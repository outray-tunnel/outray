import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uptimeIntegrations } from "@/db/uptime-schema";
import { alertOAuthProvider } from "@/lib/observability/alert-oauth";
import { requireUptimeManager } from "@/lib/uptime/api";

export const Route = createFileRoute("/api/$orgSlug/uptime/integrations/$provider")({
  server: { handlers: {
    DELETE: async ({ request, params }) => {
      const provider = alertOAuthProvider(params.provider);
      if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      await db.delete(uptimeIntegrations).where(and(
        eq(uptimeIntegrations.organizationId, access.organization.id),
        eq(uptimeIntegrations.provider, provider),
      ));
      return Response.json({ success: true });
    },
  } },
});
