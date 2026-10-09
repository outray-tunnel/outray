import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { queryTinybird } from "../../../../lib/tinybird";
import { getTunnelEventIdentifiers } from "../../../../lib/tunnel-event-identifiers";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../../../../lib/tunnel-stats-range";
import { cachedDashboardRead, dashboardCacheKey } from "../../../../lib/dashboard-cache";
import { fillTunnelBuckets, tunnelBucketSeconds, tunnelEventTime } from "../../../../lib/tunnel-tinybird";

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
type Aggregate = { total_requests: unknown; avg_duration: unknown; total_bytes: unknown; errors: unknown };
type ChartRow = { time: string; requests: unknown; duration: unknown; bandwidth: unknown; errors: unknown };
type RequestRow = { timestamp: string; method: string; path: string; status_code: unknown; request_duration_ms: unknown; bytes_in: unknown; bytes_out: unknown; size?: unknown };

export const Route = createFileRoute("/api/$orgSlug/stats/tunnel")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const tunnelId = url.searchParams.get("tunnelId");
        const timeRange = parseTunnelStatsRange(url.searchParams.get("range"));
        const orgContext = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgContext) return orgContext.error;
        if (!tunnelId) return Response.json({ error: "Tunnel ID required" }, { status: 400 });
        if (!timeRange) return Response.json({ error: "Invalid time range" }, { status: 400 });
        const [tunnel] = await db.select().from(tunnels).where(eq(tunnels.id, tunnelId));
        if (!tunnel) return Response.json({ error: "Tunnel not found" }, { status: 404 });
        if (tunnel.organizationId !== orgContext.organization.id) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const organizationId = orgContext.organization.id;
        const { start, end, bucket } = tunnelStatsWindow(timeRange);
        const bucketSeconds = tunnelBucketSeconds(bucket);

        try {
          const responseBody = await cachedDashboardRead(
            dashboardCacheKey("stats-tunnel", { organizationId, tunnelId, range: timeRange }),
            async () => {
              const window = { organization_id: organizationId, tunnel_ids: JSON.stringify(getTunnelEventIdentifiers(tunnel)), start: start.toISOString(), end: end.toISOString() };
              const [stats, chart, requests] = await Promise.all([
                queryTinybird<Aggregate>("tunnel_http_stats", window),
                queryTinybird<ChartRow>("tunnel_http_chart", { ...window, bucket_seconds: bucketSeconds }),
                queryTinybird<RequestRow>("tunnel_requests", { ...window, limit: 50 }),
              ]);
              const totalRequests = number(stats[0]?.total_requests);
              const errors = number(stats[0]?.errors);
              const chartRows = fillTunnelBuckets<ChartRow>(chart, start, end, bucketSeconds, (time) => ({ time, requests: 0, duration: 0, bandwidth: 0, errors: 0 }));
              return {
                stats: { totalRequests, avgDuration: number(stats[0]?.avg_duration), totalBandwidth: number(stats[0]?.total_bytes), errorRate: totalRequests > 0 ? (errors / totalRequests) * 100 : 0 },
                chartData: chartRows.map((row) => {
                  const requests = number(row.requests);
                  const errors = number(row.errors);
                  return { time: row.time, requests, duration: number(row.duration), bandwidth: number(row.bandwidth), errors, errorRate: requests > 0 ? (errors / requests) * 100 : 0 };
                }),
                requests: requests.map((row) => ({ id: tunnelEventTime(row.timestamp), method: row.method, path: row.path, status: number(row.status_code), duration: number(row.request_duration_ms), time: tunnelEventTime(row.timestamp), size: row.size == null ? number(row.bytes_in) + number(row.bytes_out) : number(row.size) })),
                timeRange,
              };
            },
          );
          return Response.json(responseBody);
        } catch (error) {
          console.error("Failed to fetch tunnel stats:", error);
          return Response.json({ error: "Failed to fetch stats" }, { status: 500 });
        }
      },
    },
  },
});
