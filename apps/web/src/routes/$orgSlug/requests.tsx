import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyTunnelRedirectLocation } from "@/lib/tunnel-legacy-redirect";

export const Route = createFileRoute("/$orgSlug/requests")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/$orgSlug/tunnel/requests",
      params: { orgSlug: params.orgSlug },
      ...legacyTunnelRedirectLocation(location),
    });
  },
});
