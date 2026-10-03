import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { tigerData } from "../../../../lib/timescale";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../../../../lib/tunnel-stats-range";

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const Route = createFileRoute("/api/$orgSlug/stats/protocol")({
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

        const { start, end, bucket } = tunnelStatsWindow(timeRange);

        try {
          const statsResult = await tigerData.query(
            `SELECT
               COUNT(*) FILTER (WHERE event_type = 'connection') AS total_connections,
               COUNT(DISTINCT connection_id) AS unique_connections,
               COUNT(DISTINCT (client_ip || ':' || client_port::text)) AS unique_clients,
               COALESCE(SUM(bytes_in), 0) AS total_bytes_in,
               COALESCE(SUM(bytes_out), 0) AS total_bytes_out,
               COUNT(*) FILTER (WHERE event_type IN ('data', 'packet')) AS total_packets,
               COUNT(*) FILTER (WHERE event_type = 'close') AS total_closes,
               AVG(duration_ms) FILTER (WHERE event_type = 'close' AND duration_ms > 0) AS avg_duration_ms
             FROM protocol_events
             WHERE tunnel_id = $1
               AND timestamp >= $2::timestamptz
               AND timestamp < $3::timestamptz`,
            [tunnelId, start, end],
          );
          const aggregate = statsResult.rows[0];

          const chartResult = await tigerData.query(
            `WITH times AS (
               SELECT generate_series(
                 time_bucket($4::interval, $2::timestamptz),
                 time_bucket($4::interval, $3::timestamptz - INTERVAL '1 microsecond'),
                 $4::interval
               ) AS time
             )
             SELECT
               t.time,
               COUNT(*) FILTER (WHERE e.event_type = 'connection') AS connections,
               COUNT(DISTINCT e.connection_id) AS unique_connections,
               COUNT(DISTINCT (e.client_ip || ':' || e.client_port::text)) AS unique_clients,
               COUNT(*) FILTER (WHERE e.event_type IN ('data', 'packet')) AS packets,
               COUNT(*) FILTER (WHERE e.event_type = 'close') AS closes,
               COALESCE(SUM(e.bytes_in), 0) AS bytes_in,
               COALESCE(SUM(e.bytes_out), 0) AS bytes_out,
               AVG(e.duration_ms) FILTER (WHERE e.event_type = 'close' AND e.duration_ms > 0) AS avg_duration_ms
             FROM times t
             LEFT JOIN protocol_events e ON time_bucket($4::interval, e.timestamp) = t.time
               AND e.tunnel_id = $1
               AND e.timestamp >= $2::timestamptz
               AND e.timestamp < $3::timestamptz
             GROUP BY t.time
             ORDER BY t.time ASC`,
            [tunnelId, start, end, bucket],
          );

          const recentResult = await tigerData.query(
            `SELECT
               timestamp,
               event_type,
               connection_id,
               client_ip,
               client_port,
               bytes_in,
               bytes_out,
               duration_ms
             FROM protocol_events
             WHERE tunnel_id = $1
               AND timestamp >= $2::timestamptz
               AND timestamp < $3::timestamptz
             ORDER BY timestamp DESC
             LIMIT 50`,
            [tunnelId, start, end],
          );

          return Response.json({
            protocol: tunnel.protocol,
            stats: {
              totalConnections: number(aggregate?.total_connections),
              uniqueConnections: number(aggregate?.unique_connections),
              uniqueClients: number(aggregate?.unique_clients),
              totalBytesIn: number(aggregate?.total_bytes_in),
              totalBytesOut: number(aggregate?.total_bytes_out),
              totalPackets: number(aggregate?.total_packets),
              totalCloses: number(aggregate?.total_closes),
              avgDurationMs: number(aggregate?.avg_duration_ms),
            },
            chartData: chartResult.rows.map((row) => ({
              time: row.time,
              connections: number(row.connections),
              uniqueConnections: number(row.unique_connections),
              uniqueClients: number(row.unique_clients),
              packets: number(row.packets),
              closes: number(row.closes),
              bytesIn: number(row.bytes_in),
              bytesOut: number(row.bytes_out),
              avgDurationMs: number(row.avg_duration_ms),
            })),
            recentEvents: recentResult.rows,
            timeRange,
          });
        } catch (error) {
          console.error("Failed to fetch protocol stats:", error);
          return Response.json({ error: "Failed to fetch stats" }, { status: 500 });
        }
      },
    },
  },
});
