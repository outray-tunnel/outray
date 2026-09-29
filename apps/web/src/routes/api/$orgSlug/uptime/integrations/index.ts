import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uptimeIntegrations } from "@/db/uptime-schema";
import { alertOAuthCredentials } from "@/lib/observability/alert-oauth";
import { requireUptimeRead } from "@/lib/uptime/api";

export const Route = createFileRoute("/api/$orgSlug/uptime/integrations/")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const access = await requireUptimeRead(request, params.orgSlug);
      if ("error" in access) return access.error;
      const rows = await db.select().from(uptimeIntegrations)
        .where(eq(uptimeIntegrations.organizationId, access.organization.id));
      return Response.json({
        integrations: rows.map((row) => ({ provider: row.provider, connectedAt: row.createdAt,
          target: row.webhookCiphertext.target ?? null })),
        availability: {
          slack: Boolean(alertOAuthCredentials("slack")),
          discord: Boolean(alertOAuthCredentials("discord")),
        },
      });
    },
  } },
});
