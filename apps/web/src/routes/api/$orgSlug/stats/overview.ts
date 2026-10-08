import { createFileRoute } from "@tanstack/react-router";

import { redis } from "../../../../lib/redis";
import { requireOrgFromSlug } from "../../../../lib/org";
import { tigerData } from "../../../../lib/timescale";
import { cachedDashboardRead, dashboardCacheKey } from "../../../../lib/dashboard-cache";
import { cachedDashboardRedisRead } from "../../../../lib/dashboard-redis-cache";
import {
  mapOrgOverviewStats,
  type OrgOverviewAggregateRow,
  type OrgOverviewChartRow,
} from "../../../../lib/org-overview-stats";
import {
  parseTunnelStatsRange,
  tunnelStatsWindow,
} from "../../../../lib/tunnel-stats-range";

export const Route = createFileRoute("/api/$orgSlug/stats/overview")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const url = new URL(request.url);
        const timeRange = parseTunnelStatsRange(url.searchParams.get("range"));
        if (!timeRange) {
          return Response.json({ error: "Invalid time range" }, { status: 400 });
        }

        const organizationId = orgResult.organization.id;
        const { start, end, bucket } = tunnelStatsWindow(timeRange);
        const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));

        try {
          const responseBody = await cachedDashboardRead(
            dashboardCacheKey("stats-overview", { organizationId, range: timeRange }),
            async () => {
          // A single captured boundary is shared by headlines, comparisons and
          // chart buckets. HTTP errors/rates use HTTP traffic only; protocol
          // events do not have an HTTP status code.
          const [aggregateResult, chartResult, activeTunnels] = await Promise.all([
            tigerData.query<OrgOverviewAggregateRow>(
              `WITH http AS (
               SELECT
                 COUNT(*) FILTER (WHERE timestamp >= $3::timestamptz) AS http_requests,
                 COUNT(*) FILTER (WHERE timestamp < $3::timestamptz) AS previous_http_requests,
                 COUNT(*) FILTER (WHERE timestamp >= $3::timestamptz AND status_code >= 400) AS http_errors,
                 COUNT(*) FILTER (WHERE timestamp < $3::timestamptz AND status_code >= 400) AS previous_http_errors,
                 COALESCE(SUM(COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0)) FILTER (WHERE timestamp >= $3::timestamptz), 0) AS http_bytes,
                 COALESCE(SUM(COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0)) FILTER (WHERE timestamp < $3::timestamptz), 0) AS previous_http_bytes
               FROM tunnel_events
               WHERE organization_id = $1
                 AND timestamp >= $2::timestamptz
                 AND timestamp < $4::timestamptz
             ), protocol AS (
               SELECT
                 COUNT(*) FILTER (WHERE timestamp >= $3::timestamptz) AS protocol_events,
                 COUNT(*) FILTER (WHERE timestamp < $3::timestamptz) AS previous_protocol_events,
                 COALESCE(SUM(COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0)) FILTER (WHERE timestamp >= $3::timestamptz), 0) AS protocol_bytes,
                 COALESCE(SUM(COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0)) FILTER (WHERE timestamp < $3::timestamptz), 0) AS previous_protocol_bytes
               FROM protocol_events
               WHERE organization_id = $1
                 AND timestamp >= $2::timestamptz
                 AND timestamp < $4::timestamptz
             )
             SELECT * FROM http CROSS JOIN protocol`,
              [organizationId, previousStart, start, end],
            ),
            tigerData.query<OrgOverviewChartRow>(
              `WITH times AS (
               SELECT generate_series(
                 time_bucket($4::interval, $2::timestamptz),
                 time_bucket($4::interval, $3::timestamptz - INTERVAL '1 microsecond'),
                 $4::interval
               ) AS time
             ), http AS (
               SELECT
                 time_bucket($4::interval, timestamp) AS time,
                 COUNT(*) AS http_requests,
                 COUNT(*) FILTER (WHERE status_code >= 400) AS errors,
                 COALESCE(SUM(COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0)), 0) AS http_bytes
               FROM tunnel_events
               WHERE organization_id = $1
                 AND timestamp >= $2::timestamptz
                 AND timestamp < $3::timestamptz
               GROUP BY 1
             ), protocol AS (
               SELECT
                 time_bucket($4::interval, timestamp) AS time,
                 COUNT(*) AS protocol_events,
                 COALESCE(SUM(COALESCE(bytes_in, 0) + COALESCE(bytes_out, 0)), 0) AS protocol_bytes
               FROM protocol_events
               WHERE organization_id = $1
                 AND timestamp >= $2::timestamptz
                 AND timestamp < $3::timestamptz
               GROUP BY 1
             )
             SELECT
               times.time,
               COALESCE(http.http_requests, 0) AS http_requests,
               COALESCE(protocol.protocol_events, 0) AS protocol_events,
               COALESCE(http.errors, 0) AS errors,
               COALESCE(http.http_bytes, 0) AS http_bytes,
               COALESCE(protocol.protocol_bytes, 0) AS protocol_bytes
             FROM times
             LEFT JOIN http ON http.time = times.time
             LEFT JOIN protocol ON protocol.time = times.time
             ORDER BY times.time ASC`,
              [organizationId, start, end, bucket],
            ),
            cachedDashboardRedisRead(
              `online-tunnel-count:${organizationId}`,
              () => redis.scard(`org:${organizationId}:online_tunnels`),
            ),
          ]);

          return {
            ...mapOrgOverviewStats(
              aggregateResult.rows[0],
              chartResult.rows,
              activeTunnels,
            ),
            timeRange,
            windowStart: start,
            windowEnd: end,
          };
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
