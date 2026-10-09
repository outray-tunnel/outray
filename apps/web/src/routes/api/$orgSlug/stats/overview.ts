import { createFileRoute } from "@tanstack/react-router";
import { redis } from "../../../../lib/redis";
import { requireOrgFromSlug } from "../../../../lib/org";
import { queryTinybird } from "../../../../lib/tinybird";
import { cachedDashboardRead, dashboardCacheKey } from "../../../../lib/dashboard-cache";
import { cachedDashboardRedisRead } from "../../../../lib/dashboard-redis-cache";
import { mapOrgOverviewStats, type OrgOverviewAggregateRow, type OrgOverviewChartRow } from "../../../../lib/org-overview-stats";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../../../../lib/tunnel-stats-range";
import { fillTunnelBuckets, tunnelBucketSeconds } from "../../../../lib/tunnel-tinybird";

export const Route = createFileRoute("/api/$orgSlug/stats/overview")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const timeRange = parseTunnelStatsRange(new URL(request.url).searchParams.get("range"));
        if (!timeRange) return Response.json({ error: "Invalid time range" }, { status: 400 });
        const organizationId = orgResult.organization.id;
        const { start, end, bucket } = tunnelStatsWindow(timeRange);
        const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
        const bucketSeconds = tunnelBucketSeconds(bucket);

        try {
          const responseBody = await cachedDashboardRead(
            dashboardCacheKey("stats-overview", { organizationId, range: timeRange }),
            async () => {
              const window = { organization_id: organizationId, start: start.toISOString(), end: end.toISOString() };
              const [aggregate, chart, activeTunnels] = await Promise.all([
                queryTinybird<OrgOverviewAggregateRow>("tunnel_overview_stats", { ...window, previous_start: previousStart.toISOString() }),
                queryTinybird<OrgOverviewChartRow>("tunnel_overview_chart", { ...window, bucket_seconds: bucketSeconds }),
                cachedDashboardRedisRead(`online-tunnel-count:${organizationId}`, () => redis.scard(`org:${organizationId}:online_tunnels`)),
              ]);
              const chartRows = fillTunnelBuckets<OrgOverviewChartRow>(chart, start, end, bucketSeconds, (time) => ({
                time, http_requests: 0, protocol_events: 0, errors: 0, http_bytes: 0, protocol_bytes: 0,
              }));
              return { ...mapOrgOverviewStats(aggregate[0], chartRows, activeTunnels), timeRange, windowStart: start, windowEnd: end };
            },
          );
          return Response.json(responseBody);
        } catch (error) {
          console.error("Failed to fetch stats overview:", error);
          return Response.json({ error: "Failed to fetch stats" }, { status: 500 });
        }
      },
    },
  },
});
