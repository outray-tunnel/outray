import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { observabilityAlerts } from "@/db/alerts-schema";
import { requireAlertManager } from "@/lib/observability/alert-access";
import {
  alertNotificationsUrl,
  alertOAuthCallbackUrl,
  alertOAuthCredentials,
  alertOAuthProvider,
  clearAlertOAuthCookie,
  exchangeAlertOAuthCode,
  verifyAlertOAuthState,
} from "@/lib/observability/alert-oauth";
import { activeOrganizationKey } from "@/lib/secrets/database";
import { encryptAlertWebhook } from "@/lib/secrets/crypto";

export const Route = createFileRoute(
  "/api/observability/alerts/integrations/$provider/callback",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const provider = alertOAuthProvider(params.provider);
        if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });
        const callbackUrl = alertOAuthCallbackUrl(provider);
        const clearCookie = clearAlertOAuthCookie(provider, callbackUrl.protocol === "https:");
        const url = new URL(request.url);
        const state = verifyAlertOAuthState(request, provider, url.searchParams.get("state") || "");
        if (!state) return Response.json({ error: "OAuth state is invalid or expired. Start the connection again." }, {
          status: 400,
          headers: { "Set-Cookie": clearCookie, "Cache-Control": "private, no-store" },
        });
        const access = await requireAlertManager(request, state.orgSlug);
        if ("error" in access) return access.error;
        if (access.organization.id !== state.organizationId || access.session!.user.id !== state.userId) {
          return Response.json({ error: "OAuth session changed. Start the connection again." }, {
            status: 403,
            headers: { "Set-Cookie": clearCookie, "Cache-Control": "private, no-store" },
          });
        }
        const redirect = (result: string) => new Response(null, {
          status: 303,
          headers: {
            Location: alertNotificationsUrl(state.orgSlug, state.alertId, result).toString(),
            "Set-Cookie": clearCookie,
            "Cache-Control": "private, no-store",
          },
        });
        if (url.searchParams.has("error")) return redirect("cancelled");
        const code = url.searchParams.get("code");
        const credentials = alertOAuthCredentials(provider);
        if (!code || !credentials) return redirect("failed");

        try {
          const destination = await exchangeAlertOAuthCode(provider, code, callbackUrl, credentials);
          const connected = await db.transaction(async (tx) => {
            const [alert] = await tx.select({ id: observabilityAlerts.id })
              .from(observabilityAlerts)
              .where(and(
                eq(observabilityAlerts.id, state.alertId),
                eq(observabilityAlerts.organizationId, state.organizationId),
                isNull(observabilityAlerts.deletedAt),
              )).for("update").limit(1);
            if (!alert) return false;
            const organizationKey = await activeOrganizationKey(tx, state.organizationId);
            try {
              const encrypted = {
                ...encryptAlertWebhook(organizationKey.key, {
                  organizationId: state.organizationId,
                  alertId: alert.id,
                  channel: provider,
                  organizationKeyVersion: organizationKey.version,
                  url: destination.url,
                }),
                target: destination.target,
              };
              await tx.update(observabilityAlerts)
                .set(provider === "slack"
                  ? { notificationSlackWebhook: encrypted, updatedAt: new Date() }
                  : { notificationDiscordWebhook: encrypted, updatedAt: new Date() })
                .where(eq(observabilityAlerts.id, alert.id));
              return true;
            } finally {
              organizationKey.key.fill(0);
            }
          });
          return redirect(connected ? "connected" : "failed");
        } catch {
          return redirect("failed");
        }
      },
    },
  },
});
