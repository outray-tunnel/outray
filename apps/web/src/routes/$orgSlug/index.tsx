import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyTunnelRedirectLocation } from "@/lib/tunnel-legacy-redirect";

export const Route = createFileRoute("/$orgSlug/")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/$orgSlug/tunnel",
      params: { orgSlug: params.orgSlug },
      ...legacyTunnelRedirectLocation(location),
    });
  },
});
