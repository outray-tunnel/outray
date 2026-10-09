import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyTunnelRedirectLocation } from "@/lib/tunnel-legacy-redirect";

export const Route = createFileRoute("/$orgSlug/tunnels/")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/$orgSlug/tunnel/tunnels",
      params: { orgSlug: params.orgSlug },
      ...legacyTunnelRedirectLocation(location),
    });
  },
});
