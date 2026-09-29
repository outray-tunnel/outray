import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { uptimeIntegrations } from "@/db/uptime-schema";
import { alertOAuthCredentials, alertOAuthProvider, exchangeAlertOAuthCode } from "@/lib/observability/alert-oauth";
import { activeOrganizationKey } from "@/lib/secrets/database";
import { encryptUptimeWebhook } from "@/lib/secrets/crypto";
import { requireUptimeManager } from "@/lib/uptime/api";
import { clearUptimeOAuthCookie, uptimeIntegrationReturnUrl, uptimeOAuthCallbackUrl, verifyUptimeOAuthState } from "@/lib/uptime/oauth";

export const Route = createFileRoute("/api/uptime/integrations/$provider/callback")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const provider = alertOAuthProvider(params.provider);
      if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });
      const callback = uptimeOAuthCallbackUrl(provider);
      const clearCookie = clearUptimeOAuthCookie(provider, callback.protocol === "https:");
      const url = new URL(request.url);
      const state = verifyUptimeOAuthState(request, provider, url.searchParams.get("state") || "");
      if (!state) return Response.json({ error: "OAuth state is invalid or expired" }, {
        status: 400, headers: { "Set-Cookie": clearCookie, "Cache-Control": "private, no-store" },
      });
      const access = await requireUptimeManager(request, state.orgSlug);
      if ("error" in access) return access.error;
      if (access.organization.id !== state.organizationId || access.session!.user.id !== state.userId) {
        return Response.json({ error: "OAuth session changed" }, { status: 403,
          headers: { "Set-Cookie": clearCookie, "Cache-Control": "private, no-store" } });
      }
      const redirect = (result: string) => new Response(null, { status: 303, headers: {
        Location: uptimeIntegrationReturnUrl(state.orgSlug, result).toString(),
        "Set-Cookie": clearCookie, "Cache-Control": "private, no-store",
      } });
      if (url.searchParams.has("error")) return redirect("cancelled");
      const code = url.searchParams.get("code");
      const credentials = alertOAuthCredentials(provider);
      if (!code || !credentials) return redirect("failed");
      try {
        const destination = await exchangeAlertOAuthCode(provider, code, callback, credentials);
        await db.transaction(async (tx) => {
          const key = await activeOrganizationKey(tx, state.organizationId);
          try {
            const ciphertext = {
              ...encryptUptimeWebhook(key.key, {
                organizationId: state.organizationId, channel: provider,
                organizationKeyVersion: key.version, url: destination.url,
              }),
              target: destination.target,
            };
            await tx.insert(uptimeIntegrations).values({
              id: crypto.randomUUID(), organizationId: state.organizationId,
              provider, webhookCiphertext: ciphertext,
            }).onConflictDoUpdate({
              target: [uptimeIntegrations.organizationId, uptimeIntegrations.provider],
              set: { webhookCiphertext: ciphertext, updatedAt: new Date() },
            });
          } finally { key.key.fill(0); }
        });
        return redirect("connected");
      } catch {
        return redirect("failed");
      }
    },
  } },
});
