import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyTunnelRedirectLocation } from "@/lib/tunnel-legacy-redirect";
import { parseTunnelDetailSearch } from "@/lib/tunnel-detail-search";

export const Route = createFileRoute("/$orgSlug/tunnels/$tunnelId")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/$orgSlug/tunnel/tunnels/$tunnelId",
      params: { orgSlug: params.orgSlug, tunnelId: params.tunnelId },
      search: parseTunnelDetailSearch(location.search),
      ...legacyTunnelRedirectLocation(location),
    });
  },
});
