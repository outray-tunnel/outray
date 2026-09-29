import { createFileRoute } from "@tanstack/react-router";
import { alertOAuthAuthorizeUrl, alertOAuthCredentials, alertOAuthProvider } from "@/lib/observability/alert-oauth";
import { requireUptimeManager } from "@/lib/uptime/api";
import { createUptimeOAuthState, uptimeOAuthCallbackUrl } from "@/lib/uptime/oauth";

export const Route = createFileRoute("/api/$orgSlug/uptime/integrations/$provider/start")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const provider = alertOAuthProvider(params.provider);
      if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const credentials = alertOAuthCredentials(provider);
      if (!credentials) return Response.json({ error: "This integration is not configured" }, { status: 503 });
      const callback = uptimeOAuthCallbackUrl(provider);
      const state = createUptimeOAuthState({
        orgSlug: params.orgSlug, organizationId: access.organization.id,
        provider, userId: access.session!.user.id,
      }, callback.protocol === "https:");
      const authorize = alertOAuthAuthorizeUrl(provider, credentials.clientId, callback, state.nonce);
      return new Response(null, { status: 302, headers: {
        Location: authorize.toString(), "Set-Cookie": state.cookie,
        "Cache-Control": "private, no-store",
      } });
    },
  } },
});
