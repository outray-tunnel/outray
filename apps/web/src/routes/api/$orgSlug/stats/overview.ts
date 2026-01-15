import { createFileRoute } from "@tanstack/react-router";

import { redis } from "../../../../lib/redis";
import { requireOrgFromSlug } from "../../../../lib/org";
import { tigerData } from "../../../../lib/tigerdata";

export const Route = createFileRoute("/api/$orgSlug/stats/overview")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const url = new URL(request.url);
        const timeRange = url.searchParams.get("range") || "24h";
        const organizationId = organization.id;

        try {
          let intervalValue = "24 hours";
          let prevIntervalStart = "48 hours";
          let prevIntervalEnd = "24 hours";

          switch (timeRange) {
            case "1h":
              intervalValue = "1 hour";
              prevIntervalStart = "2 hours";
              prevIntervalEnd = "1 hour";
              break;
            case "7d":
              intervalValue = "7 days";
              prevIntervalStart = "14 days";
              prevIntervalEnd = "7 days";
              break;
            case "30d":
              intervalValue = "30 days";
              prevIntervalStart = "60 days";
              prevIntervalEnd = "30 days";
              break;
          }

          // Total requests (current period)
          const totalRequestsResult = await tigerData.query(
            `SELECT 
              (SELECT COUNT(*) FROM tunnel_events WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval) +
              (SELECT COUNT(*) FROM protocol_events WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval) as total`,
            [organizationId, intervalValue],
          );
          const totalRequests = parseInt(
            totalRequestsResult.rows[0]?.total || "0",
          );

          // Requests from previous period
          const requestsYesterdayResult = await tigerData.query(
            `SELECT 
              (SELECT COUNT(*) FROM tunnel_events WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval AND timestamp < NOW() - $3::interval) +
              (SELECT COUNT(*) FROM protocol_events WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval AND timestamp < NOW() - $3::interval) as total`,
            [organizationId, prevIntervalStart, prevIntervalEnd],
          );
          const requestsYesterday = parseInt(
            requestsYesterdayResult.rows[0]?.total || "0",
          );

          const requestsChangeRaw =
            requestsYesterday > 0
              ? ((totalRequests - requestsYesterday) / requestsYesterday) * 100
              : totalRequests > 0
                ? 100
                : 0;
          const requestsChange = Number.isFinite(requestsChangeRaw)
            ? Math.round(requestsChangeRaw * 100) / 100
            : 0;

          // Data transfer (current period)
          const dataTransferResult = await tigerData.query(
            `SELECT 
              COALESCE((SELECT SUM(bytes_in) + SUM(bytes_out) FROM tunnel_events WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval), 0) +
              COALESCE((SELECT SUM(bytes_in) + SUM(bytes_out) FROM protocol_events WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval), 0) as total`,
            [organizationId, intervalValue],
          );
          const totalBytes = Number(dataTransferResult.rows[0]?.total || 0);

          // Data transfer (previous period)
          const dataYesterdayResult = await tigerData.query(
            `SELECT 
              COALESCE((SELECT SUM(bytes_in) + SUM(bytes_out) FROM tunnel_events WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval AND timestamp < NOW() - $3::interval), 0) +
              COALESCE((SELECT SUM(bytes_in) + SUM(bytes_out) FROM protocol_events WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval AND timestamp < NOW() - $3::interval), 0) as total`,
            [organizationId, prevIntervalStart, prevIntervalEnd],
          );
          const bytesYesterday = Number(
            dataYesterdayResult.rows[0]?.total || 0,
          );

          const dataTransferChangeRaw =
            bytesYesterday > 0
              ? ((totalBytes - bytesYesterday) / bytesYesterday) * 100
              : totalBytes > 0
                ? 100
                : 0;
          const dataTransferChange = Number.isFinite(dataTransferChangeRaw)
            ? Math.round(dataTransferChangeRaw * 100) / 100
            : 0;

          const activeTunnelsCount = await redis.scard(
            `org:${organizationId}:online_tunnels`,
          );

          // Chart data
          let chartQuery = "";
          let chartParams: (string | number)[] = [organizationId];

          if (timeRange === "1h") {
            chartQuery = `
              WITH times AS (
                SELECT generate_series(
                  time_bucket('1 minute', NOW()) - INTERVAL '60 minutes',
                  time_bucket('1 minute', NOW()),
                  '1 minute'::interval
                ) AS time
              ),
              http_counts AS (
                SELECT time_bucket('1 minute', timestamp) as time, COUNT(*) as cnt
                FROM tunnel_events
                WHERE organization_id = $1 AND timestamp >= NOW() - INTERVAL '1 hour'
                GROUP BY 1
              ),
              protocol_counts AS (
                SELECT time_bucket('1 minute', timestamp) as time, COUNT(*) as cnt
                FROM protocol_events
                WHERE organization_id = $1 AND timestamp >= NOW() - INTERVAL '1 hour'
                GROUP BY 1
              )
              SELECT 
                t.time as time,
                COALESCE(h.cnt, 0) + COALESCE(p.cnt, 0) as requests
              FROM times t
              LEFT JOIN http_counts h ON t.time = h.time
              LEFT JOIN protocol_counts p ON t.time = p.time
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
              ),
              http_counts AS (
                SELECT time_bucket('1 hour', timestamp) as time, COUNT(*) as cnt
                FROM tunnel_events
                WHERE organization_id = $1 AND timestamp >= NOW() - INTERVAL '24 hours'
                GROUP BY 1
              ),
              protocol_counts AS (
                SELECT time_bucket('1 hour', timestamp) as time, COUNT(*) as cnt
                FROM protocol_events
                WHERE organization_id = $1 AND timestamp >= NOW() - INTERVAL '24 hours'
                GROUP BY 1
              )
              SELECT 
                t.time as time,
                COALESCE(h.cnt, 0) + COALESCE(p.cnt, 0) as requests
              FROM times t
              LEFT JOIN http_counts h ON t.time = h.time
              LEFT JOIN protocol_counts p ON t.time = p.time
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
              ),
              http_counts AS (
                SELECT time_bucket('1 day', timestamp) as time, COUNT(*) as cnt
                FROM tunnel_events
                WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval
                GROUP BY 1
              ),
              protocol_counts AS (
                SELECT time_bucket('1 day', timestamp) as time, COUNT(*) as cnt
                FROM protocol_events
                WHERE organization_id = $1 AND timestamp >= NOW() - $2::interval
                GROUP BY 1
              )
              SELECT 
                t.time as time,
                COALESCE(h.cnt, 0) + COALESCE(p.cnt, 0) as requests
              FROM times t
              LEFT JOIN http_counts h ON t.time = h.time
              LEFT JOIN protocol_counts p ON t.time = p.time
              ORDER BY t.time ASC
            `;
            chartParams = [organizationId, `${days} days`];
          }

          const chartDataResult = await tigerData.query(
            chartQuery,
            chartParams,
          );
          const chartData = chartDataResult.rows;

          return Response.json({
            totalRequests,
            requestsChange,
            activeTunnels: activeTunnelsCount,
            activeTunnelsChange: 0,
            totalDataTransfer: totalBytes,
            dataTransferChange,
            chartData: chartData.map((d) => ({
              time: d.time,
              requests: parseInt(d.requests || "0"),
            })),
          });
        } catch (error) {
          console.error("Failed to fetch stats overview:", error);
          return Response.json(
            { error: "Failed to fetch stats" },
            { status: 500 },
          );
        }
      },
    },
  },
});
