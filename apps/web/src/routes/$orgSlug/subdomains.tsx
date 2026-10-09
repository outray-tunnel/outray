import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyTunnelRedirectLocation } from "@/lib/tunnel-legacy-redirect";

export const Route = createFileRoute("/$orgSlug/subdomains")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/$orgSlug/tunnel/subdomains",
      params: { orgSlug: params.orgSlug },
      ...legacyTunnelRedirectLocation(location),
    });
  },
});
