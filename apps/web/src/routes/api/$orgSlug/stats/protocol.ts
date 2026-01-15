import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { tigerData } from "../../../../lib/tigerdata";

export const Route = createFileRoute("/api/$orgSlug/stats/protocol")({
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
          // Connections stats
          const connectionsResult = await tigerData.query(
            `SELECT 
              COUNT(*) FILTER (WHERE event_type = 'connection') as total_connections,
              COUNT(DISTINCT connection_id) as unique_connections,
              COUNT(DISTINCT (client_ip || ':' || client_port::text)) as unique_clients
            FROM protocol_events
            WHERE tunnel_id = $1 AND timestamp >= NOW() - $2::interval`,
            [tunnelId, intervalValue],
          );
          const connectionsData = connectionsResult.rows[0];

          // Bandwidth stats
          const bandwidthResult = await tigerData.query(
            `SELECT 
              COALESCE(SUM(bytes_in), 0) as total_bytes_in,
              COALESCE(SUM(bytes_out), 0) as total_bytes_out
            FROM protocol_events
            WHERE tunnel_id = $1`,
            [tunnelId],
          );
          const bandwidthData = bandwidthResult.rows[0];

          // Packets stats
          const packetsResult = await tigerData.query(
            `SELECT 
              COUNT(*) FILTER (WHERE event_type IN ('data', 'packet')) as total_packets,
              COUNT(*) FILTER (WHERE event_type = 'close') as total_closes
            FROM protocol_events
            WHERE tunnel_id = $1 AND timestamp >= NOW() - $2::interval`,
            [tunnelId, intervalValue],
          );
          const packetsData = packetsResult.rows[0];

          // Duration stats
          const durationResult = await tigerData.query(
            `SELECT AVG(duration_ms) as avg_duration_ms
            FROM protocol_events
            WHERE tunnel_id = $1
              AND event_type = 'close'
              AND duration_ms > 0
              AND timestamp >= NOW() - $2::interval`,
            [tunnelId, intervalValue],
          );
          const durationData = durationResult.rows[0];

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
                COUNT(*) FILTER (WHERE e.event_type = 'connection') as connections,
                COUNT(*) FILTER (WHERE e.event_type IN ('data', 'packet')) as packets,
                COALESCE(SUM(e.bytes_in), 0) as bytes_in,
                COALESCE(SUM(e.bytes_out), 0) as bytes_out
              FROM times t
              LEFT JOIN protocol_events e ON time_bucket('1 minute', e.timestamp) = t.time
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
                COUNT(*) FILTER (WHERE e.event_type = 'connection') as connections,
                COUNT(*) FILTER (WHERE e.event_type IN ('data', 'packet')) as packets,
                COALESCE(SUM(e.bytes_in), 0) as bytes_in,
                COALESCE(SUM(e.bytes_out), 0) as bytes_out
              FROM times t
              LEFT JOIN protocol_events e ON time_bucket('1 hour', e.timestamp) = t.time
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
                COUNT(*) FILTER (WHERE e.event_type = 'connection') as connections,
                COUNT(*) FILTER (WHERE e.event_type IN ('data', 'packet')) as packets,
                COALESCE(SUM(e.bytes_in), 0) as bytes_in,
                COALESCE(SUM(e.bytes_out), 0) as bytes_out
              FROM times t
              LEFT JOIN protocol_events e ON time_bucket('1 day', e.timestamp) = t.time
                AND e.tunnel_id = $1
              GROUP BY t.time
              ORDER BY t.time ASC
            `;
            chartParams = [tunnelId, `${days} days`];
          }

          const chartResult = await tigerData.query(chartQuery, chartParams);
          const chartData = chartResult.rows;

          // Recent events
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
            ORDER BY timestamp DESC
            LIMIT 50`,
            [tunnelId],
          );
          const recentEvents = recentResult.rows;

          return Response.json({
            protocol: tunnel.protocol,
            stats: {
              totalConnections: parseInt(
                connectionsData?.total_connections || "0",
              ),
              uniqueConnections: parseInt(
                connectionsData?.unique_connections || "0",
              ),
              uniqueClients: parseInt(connectionsData?.unique_clients || "0"),
              totalBytesIn: parseInt(bandwidthData?.total_bytes_in || "0"),
              totalBytesOut: parseInt(bandwidthData?.total_bytes_out || "0"),
              totalPackets: parseInt(packetsData?.total_packets || "0"),
              totalCloses: parseInt(packetsData?.total_closes || "0"),
              avgDurationMs: parseFloat(durationData?.avg_duration_ms || "0"),
            },
            chartData: chartData.map((row) => ({
              time: row.time,
              connections: parseInt(row.connections || "0"),
              packets: parseInt(row.packets || "0"),
              bytesIn: parseInt(row.bytes_in || "0"),
              bytesOut: parseInt(row.bytes_out || "0"),
            })),
            recentEvents,
            timeRange,
          });
        } catch (error) {
          console.error("Failed to fetch protocol stats:", error);
          return Response.json(
            { error: "Failed to fetch stats" },
            { status: 500 },
          );
        }
      },
    },
  },
});
