import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { observabilityAlerts } from "@/db/alerts-schema";
import { requireAlertManager } from "@/lib/observability/alert-access";
import {
  alertOAuthAuthorizeUrl,
  alertOAuthCallbackUrl,
  alertOAuthCredentials,
  alertOAuthProvider,
  createAlertOAuthState,
} from "@/lib/observability/alert-oauth";
import { readSecretsKeyring } from "@/lib/secrets/crypto";

export const Route = createFileRoute(
  "/api/$orgSlug/observability/alerts/$alertId/integrations/$provider/start",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const provider = alertOAuthProvider(params.provider);
        if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });
        const access = await requireAlertManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const [alert] = await db.select({ id: observabilityAlerts.id })
          .from(observabilityAlerts)
          .where(and(
            eq(observabilityAlerts.id, params.alertId),
            eq(observabilityAlerts.organizationId, access.organization.id),
            isNull(observabilityAlerts.deletedAt),
          )).limit(1);
        if (!alert) return Response.json({ error: "Alert not found" }, { status: 404 });
        const credentials = alertOAuthCredentials(provider);
        if (!credentials) return Response.json({ error: `${provider} is not configured` }, { status: 503 });
        let callbackUrl: URL;
        try {
          readSecretsKeyring();
          callbackUrl = alertOAuthCallbackUrl(provider);
        } catch {
          return Response.json({ error: "Alert integrations are unavailable" }, { status: 503 });
        }
        const state = createAlertOAuthState({
          organizationId: access.organization.id,
          alertId: alert.id,
          provider,
          userId: access.session!.user.id,
          orgSlug: params.orgSlug,
          secure: callbackUrl.protocol === "https:",
        });
        const authorizeUrl = alertOAuthAuthorizeUrl(provider, credentials.clientId, callbackUrl, state.state);
        return new Response(null, {
          status: 302,
          headers: {
            Location: authorizeUrl.toString(),
            "Set-Cookie": state.cookie,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
