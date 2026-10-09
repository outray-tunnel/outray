import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { tunnels } from "../../../db/app-schema";
import { requireOrgFromSlug } from "../../../lib/org";
import { queryTinybird } from "../../../lib/tinybird";
import { getTunnelEventIdentifiers } from "../../../lib/tunnel-event-identifiers";
import { cachedDashboardRead, dashboardCacheKey } from "../../../lib/dashboard-cache";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../../../lib/tunnel-stats-range";
import { normalizeTunnelRequest } from "../../../lib/tunnel-tinybird";

type RequestRow = { timestamp: string } & Record<string, unknown>;

export const Route = createFileRoute("/api/$orgSlug/requests")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const organizationId = orgResult.organization.id;
        const url = new URL(request.url);
        const tunnelId = url.searchParams.get("tunnelId");
        const timeRange = parseTunnelStatsRange(url.searchParams.get("range") || "1h");
        const limit = Number(url.searchParams.get("limit") ?? "100");
        const search = url.searchParams.get("search") || undefined;
        if (!timeRange) return Response.json({ error: "Invalid time range" }, { status: 400 });
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) return Response.json({ error: "Limit must be between 1 and 500" }, { status: 400 });
        if (search && search.length > 1_000) return Response.json({ error: "Search is too long" }, { status: 400 });

        try {
          let tunnelIdentifiers: string[] | undefined;
          if (tunnelId) {
            const [tunnel] = await db.select().from(tunnels).where(eq(tunnels.id, tunnelId));
            if (!tunnel || tunnel.organizationId !== organizationId) return Response.json({ error: "Tunnel not found" }, { status: 404 });
            tunnelIdentifiers = getTunnelEventIdentifiers(tunnel);
          }
          const responseBody = await cachedDashboardRead(
            dashboardCacheKey("requests", { organizationId, tunnelId: tunnelId || undefined, range: timeRange, limit, search }),
            async () => {
              const { start, end } = tunnelStatsWindow(timeRange);
              const result = await queryTinybird<RequestRow>("tunnel_requests", {
                organization_id: organizationId, start: start.toISOString(), end: end.toISOString(),
                tunnel_ids: tunnelIdentifiers ? JSON.stringify(tunnelIdentifiers) : undefined, search, limit,
              });
              const requests = result.map(normalizeTunnelRequest);
              return { requests, timeRange, count: requests.length };
            },
          );
          return Response.json(responseBody);
        } catch (error) {
          console.error("Failed to fetch requests:", error);
          return Response.json({ error: "Failed to fetch requests" }, { status: 500 });
        }
      },
    },
  },
});
