import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { queryTinybird } from "../../../../lib/tinybird";
import { getTunnelEventIdentifiers } from "../../../../lib/tunnel-event-identifiers";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../../../../lib/tunnel-stats-range";
import { fillTunnelBuckets, tunnelBucketSeconds, tunnelEventTime } from "../../../../lib/tunnel-tinybird";

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
type Aggregate = Record<string, unknown>;
type ChartRow = { time: string } & Aggregate;
type EventRow = { timestamp: string } & Aggregate;

export const Route = createFileRoute("/api/$orgSlug/stats/protocol")({
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
        const { start, end, bucket } = tunnelStatsWindow(timeRange);
        const bucketSeconds = tunnelBucketSeconds(bucket);

        try {
          const window = { organization_id: orgContext.organization.id, tunnel_ids: JSON.stringify(getTunnelEventIdentifiers(tunnel)), start: start.toISOString(), end: end.toISOString() };
          const [stats, chart, recent] = await Promise.all([
            queryTinybird<Aggregate>("tunnel_protocol_stats", window),
            queryTinybird<ChartRow>("tunnel_protocol_chart", { ...window, bucket_seconds: bucketSeconds }),
            queryTinybird<EventRow>("tunnel_protocol_recent", { ...window, limit: 50 }),
          ]);
          const aggregate = stats[0];
          const chartRows = fillTunnelBuckets<ChartRow>(chart, start, end, bucketSeconds, (time) => ({ time }));
          return Response.json({
            protocol: tunnel.protocol,
            stats: {
              totalConnections: number(aggregate?.total_connections), uniqueConnections: number(aggregate?.unique_connections), uniqueClients: number(aggregate?.unique_clients),
              totalBytesIn: number(aggregate?.total_bytes_in), totalBytesOut: number(aggregate?.total_bytes_out), totalPackets: number(aggregate?.total_packets), totalCloses: number(aggregate?.total_closes), avgDurationMs: number(aggregate?.avg_duration_ms),
            },
            chartData: chartRows.map((row) => ({ time: row.time, connections: number(row.connections), uniqueConnections: number(row.unique_connections), uniqueClients: number(row.unique_clients), packets: number(row.packets), closes: number(row.closes), bytesIn: number(row.bytes_in), bytesOut: number(row.bytes_out), avgDurationMs: number(row.avg_duration_ms) })),
            recentEvents: recent.map((row) => ({ ...row, timestamp: tunnelEventTime(row.timestamp), client_port: number(row.client_port), bytes_in: number(row.bytes_in), bytes_out: number(row.bytes_out), duration_ms: number(row.duration_ms) })),
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
