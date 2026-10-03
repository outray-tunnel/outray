import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { tigerData } from "../../../../lib/timescale";
import { getTunnelEventIdentifiers } from "../../../../lib/tunnel-event-identifiers";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../../../../lib/tunnel-stats-range";

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const Route = createFileRoute("/api/$orgSlug/stats/tunnel")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { orgSlug } = params;
        const url = new URL(request.url);
        const tunnelId = url.searchParams.get("tunnelId");
        const timeRange = parseTunnelStatsRange(url.searchParams.get("range"));

        const orgContext = await requireOrgFromSlug(request, orgSlug);
        if ("error" in orgContext) return orgContext.error;

        if (!tunnelId) {
          return Response.json({ error: "Tunnel ID required" }, { status: 400 });
        }
        if (!timeRange) {
          return Response.json({ error: "Invalid time range" }, { status: 400 });
        }

        const [tunnel] = await db
          .select()
          .from(tunnels)
          .where(eq(tunnels.id, tunnelId));

        if (!tunnel) {
          return Response.json({ error: "Tunnel not found" }, { status: 404 });
        }
        if (tunnel.organizationId !== orgContext.organization.id) {
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        const tunnelIdentifiers = getTunnelEventIdentifiers(tunnel);
        const organizationId = orgContext.organization.id;
        const { start, end, bucket } = tunnelStatsWindow(timeRange);

        try {
          // One captured window is shared by the headline, chart and activity preview.
          const statsResult = await tigerData.query(
            `SELECT
               COUNT(*) AS total_requests,
               AVG(request_duration_ms) AS avg_duration,
               COALESCE(SUM(COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0)), 0) AS total_bytes,
               COUNT(*) FILTER (WHERE status_code >= 400) AS errors
             FROM tunnel_events
             WHERE tunnel_id = ANY($1::text[])
               AND organization_id = $2
               AND timestamp >= $3::timestamptz
               AND timestamp < $4::timestamptz`,
            [tunnelIdentifiers, organizationId, start, end],
          );
          const aggregate = statsResult.rows[0];
          const totalRequests = number(aggregate?.total_requests);
          const errors = number(aggregate?.errors);

          // Bucket boundaries cover the rolling window; the join excludes the
          // portions of the first and last buckets outside that exact window.
          const chartResult = await tigerData.query(
            `WITH times AS (
               SELECT generate_series(
                 time_bucket($5::interval, $3::timestamptz),
                 time_bucket($5::interval, $4::timestamptz - INTERVAL '1 microsecond'),
                 $5::interval
               ) AS time
             )
             SELECT
               t.time,
               COUNT(e.tunnel_id) AS requests,
               AVG(e.request_duration_ms) AS duration,
               COALESCE(SUM(COALESCE(e.bytes_in, 0) + COALESCE(e.bytes_out, 0)), 0) AS bandwidth,
               COUNT(e.tunnel_id) FILTER (WHERE e.status_code >= 400) AS errors
             FROM times t
             LEFT JOIN tunnel_events e ON time_bucket($5::interval, e.timestamp) = t.time
               AND e.tunnel_id = ANY($1::text[])
               AND e.organization_id = $2
               AND e.timestamp >= $3::timestamptz
               AND e.timestamp < $4::timestamptz
             GROUP BY t.time
             ORDER BY t.time ASC`,
            [tunnelIdentifiers, organizationId, start, end, bucket],
          );

          const requestsResult = await tigerData.query(
            `SELECT
               timestamp,
               method,
               path,
               status_code,
               request_duration_ms,
               COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0) AS size
             FROM tunnel_events
             WHERE tunnel_id = ANY($1::text[])
               AND organization_id = $2
               AND timestamp >= $3::timestamptz
               AND timestamp < $4::timestamptz
             ORDER BY timestamp DESC
             LIMIT 50`,
            [tunnelIdentifiers, organizationId, start, end],
          );

          return Response.json({
            stats: {
              totalRequests,
              avgDuration: number(aggregate?.avg_duration),
              totalBandwidth: number(aggregate?.total_bytes),
              errorRate: totalRequests > 0 ? (errors / totalRequests) * 100 : 0,
            },
            chartData: chartResult.rows.map((row) => {
              const requests = number(row.requests);
              const errors = number(row.errors);
              return {
                time: row.time,
                requests,
                duration: number(row.duration),
                bandwidth: number(row.bandwidth),
                errors,
                errorRate: requests > 0 ? (errors / requests) * 100 : 0,
              };
            }),
            requests: requestsResult.rows.map((row) => ({
              id: row.timestamp,
              method: row.method,
              path: row.path,
              status: row.status_code,
              duration: row.request_duration_ms,
              time: row.timestamp,
              size: row.size,
            })),
            timeRange,
          });
        } catch (error) {
          console.error("Failed to fetch tunnel stats:", error);
          return Response.json({ error: "Failed to fetch stats" }, { status: 500 });
        }
      },
    },
  },
});
