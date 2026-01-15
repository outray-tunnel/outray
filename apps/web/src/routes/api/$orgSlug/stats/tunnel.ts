import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { tigerData } from "../../../../lib/tigerdata";

export const Route = createFileRoute("/api/$orgSlug/stats/tunnel")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { orgSlug } = params;
        const url = new URL(request.url);
        const tunnelId = url.searchParams.get("tunnelId");
        const timeRange = url.searchParams.get("range") || "24h";

        const orgContext = await requireOrgFromSlug(request, orgSlug);
        if ("error" in orgContext) {
          return orgContext.error;
        }

        if (!tunnelId) {
          return Response.json(
            { error: "Tunnel ID required" },
            { status: 400 },
          );
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

        let intervalValue = "24 hours";
        if (timeRange === "1h") {
          intervalValue = "1 hour";
        } else if (timeRange === "7d") {
          intervalValue = "7 days";
        } else if (timeRange === "30d") {
          intervalValue = "30 days";
        }

        try {
          // Total requests
          const totalRequestsResult = await tigerData.query(
            `SELECT COUNT(*) as total FROM tunnel_events WHERE tunnel_id = $1`,
            [tunnelId],
          );
          const totalRequests = parseInt(
            totalRequestsResult.rows[0]?.total || "0",
          );

          // Average duration
          const durationResult = await tigerData.query(
            `SELECT AVG(request_duration_ms) as avg_duration
             FROM tunnel_events
             WHERE tunnel_id = $1 AND timestamp >= NOW() - $2::interval`,
            [tunnelId, intervalValue],
          );
          const avgDuration = parseFloat(
            durationResult.rows[0]?.avg_duration || "0",
          );

          // Total bandwidth
          const bandwidthResult = await tigerData.query(
            `SELECT SUM(bytes_in + bytes_out) as total_bytes
             FROM tunnel_events WHERE tunnel_id = $1`,
            [tunnelId],
          );
          const totalBandwidth = parseInt(
            bandwidthResult.rows[0]?.total_bytes || "0",
          );

          // Error rate
          const errorRateResult = await tigerData.query(
            `SELECT 
               COUNT(*) FILTER (WHERE status_code >= 400) as errors,
               COUNT(*) as total
             FROM tunnel_events
             WHERE tunnel_id = $1 AND timestamp >= NOW() - $2::interval`,
            [tunnelId, intervalValue],
          );
          const errorCount = parseInt(errorRateResult.rows[0]?.errors || "0");
          const totalCount = parseInt(errorRateResult.rows[0]?.total || "0");
          const errorRate =
            totalCount > 0 ? (errorCount / totalCount) * 100 : 0;

          // Chart data
          let chartQuery = "";
          let chartParams: (string | number)[] = [tunnelId];

          if (timeRange === "1h") {
            chartQuery = `
              WITH times AS (
                SELECT generate_series(
                  time_bucket('1 minute', NOW()) - INTERVAL '60 minutes',
                  time_bucket('1 minute', NOW()),
                  '1 minute'::interval
                ) AS time
              )
              SELECT 
                t.time as time,
                COUNT(e.tunnel_id) as requests,
                AVG(e.request_duration_ms) as duration
              FROM times t
              LEFT JOIN tunnel_events e ON time_bucket('1 minute', e.timestamp) = t.time
                AND e.tunnel_id = $1
              GROUP BY t.time
              ORDER BY t.time ASC
            `;
          } else if (timeRange === "24h") {
            chartQuery = `
              WITH times AS (
                SELECT generate_series(
                  time_bucket('1 hour', NOW()) - INTERVAL '24 hours',
                  time_bucket('1 hour', NOW()),
                  '1 hour'::interval
                ) AS time
              )
              SELECT 
                t.time as time,
                COUNT(e.tunnel_id) as requests,
                AVG(e.request_duration_ms) as duration
              FROM times t
              LEFT JOIN tunnel_events e ON time_bucket('1 hour', e.timestamp) = t.time
                AND e.tunnel_id = $1
              GROUP BY t.time
              ORDER BY t.time ASC
            `;
          } else {
            const days = timeRange === "7d" ? 7 : 30;
            chartQuery = `
              WITH times AS (
                SELECT generate_series(
                  time_bucket('1 day', NOW()) - $2::interval,
                  time_bucket('1 day', NOW()),
                  '1 day'::interval
                ) AS time
              )
              SELECT 
                t.time as time,
                COUNT(e.tunnel_id) as requests,
                AVG(e.request_duration_ms) as duration
              FROM times t
              LEFT JOIN tunnel_events e ON time_bucket('1 day', e.timestamp) = t.time
                AND e.tunnel_id = $1
              GROUP BY t.time
              ORDER BY t.time ASC
            `;
            chartParams = [tunnelId, `${days} days`];
          }

          const chartResult = await tigerData.query(chartQuery, chartParams);
          const chartData = chartResult.rows;

          // Recent requests
          const requestsResult = await tigerData.query(
            `SELECT 
               timestamp,
               method,
               path,
               status_code,
               request_duration_ms,
               bytes_in + bytes_out as size
             FROM tunnel_events
             WHERE tunnel_id = $1
             ORDER BY timestamp DESC
             LIMIT 50`,
            [tunnelId],
          );
          const requests = requestsResult.rows;

          return Response.json({
            stats: {
              totalRequests,
              avgDuration,
              totalBandwidth,
              errorRate,
            },
            chartData: chartData.map((d) => ({
              time: d.time,
              requests: parseInt(d.requests),
              duration: d.duration ? parseFloat(d.duration) : 0,
            })),
            requests: requests.map((r) => ({
              id: r.timestamp,
              method: r.method,
              path: r.path,
              status: r.status_code,
              duration: r.request_duration_ms,
              time: r.timestamp,
              size: r.size,
            })),
          });
        } catch (error) {
          console.error("Failed to fetch tunnel stats:", error);
          return Response.json(
            { error: "Failed to fetch stats" },
            { status: 500 },
          );
        }
      },
    },
  },
});
