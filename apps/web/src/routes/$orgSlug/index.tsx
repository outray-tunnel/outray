import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyTunnelRedirectLocation } from "@/lib/tunnel-legacy-redirect";

export const Route = createFileRoute("/$orgSlug/")({
  beforeLoad: ({ params, location, context }) => {
    const firstProduct = context.instance.products[0];
    throw redirect({
      to: firstProduct === "tunnels" ? "/$orgSlug/tunnel"
        : firstProduct === "observability" ? "/$orgSlug/observability"
        : firstProduct === "secrets" ? "/$orgSlug/secrets"
        : firstProduct === "uptime" ? "/$orgSlug/uptime" : "/$orgSlug/settings",
      params: { orgSlug: params.orgSlug },
      ...legacyTunnelRedirectLocation(location),
    });
  },
});
