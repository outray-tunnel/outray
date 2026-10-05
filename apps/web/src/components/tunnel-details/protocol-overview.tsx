import {
  TunnelOverviewShell,
  type OverviewChartPoint,
  type OverviewMetric,
} from "./tunnel-overview-ui";
import { formatBytes, formatDuration } from "./tunnel-overview-format";
import {
  finiteTunnelMetricValue,
  formatTunnelCount,
  getTunnelMetricNumberConfig,
} from "./tunnel-overview-data";

interface ProtocolStats {
  totalConnections: number;
  uniqueConnections: number;
  uniqueClients: number;
  totalBytesIn: number;
  totalBytesOut: number;
  totalPackets: number;
  totalCloses: number;
  avgDurationMs: number;
}

interface RecentEvent {
  timestamp: string;
  event_type: string;
  connection_id: string;
  client_ip: string;
  client_port: number;
  bytes_in: number;
  bytes_out: number;
  duration_ms: number;
}

interface ProtocolOverviewProps {
  protocol: "tcp" | "udp";
  stats: ProtocolStats | null;
  chartData: OverviewChartPoint[];
  recentEvents: RecentEvent[];
  timeRange: string;
  dataRange?: string;
  setTimeRange: (range: string) => void;
  isLoading: boolean;
  isPlaceholderData?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onViewActivity?: () => void;
}

function eventTone(eventType: string): string {
  if (eventType === "error")
    return "border-rose-400/[0.12] bg-rose-400/[0.05] text-rose-300";
  if (eventType === "connection")
    return "border-sky-400/[0.12] bg-sky-400/[0.05] text-sky-300";
  if (eventType === "packet" || eventType === "data")
    return "border-emerald-400/[0.12] bg-emerald-400/[0.05] text-emerald-300";
  return "border-white/[0.08] bg-white/[0.025] text-zinc-400";
}

function eventTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
}

export function ProtocolOverview({
  protocol,
  stats,
  chartData,
  recentEvents,
  timeRange,
  dataRange,
  setTimeRange,
  isLoading,
  isPlaceholderData,
  error,
  onRetry,
  onViewActivity,
}: ProtocolOverviewProps) {
  const isTcp = protocol === "tcp";
  const connections = finiteTunnelMetricValue(stats?.totalConnections);
  const clients = finiteTunnelMetricValue(stats?.uniqueClients);
  const packets = finiteTunnelMetricValue(stats?.totalPackets);
  const bytesIn = finiteTunnelMetricValue(stats?.totalBytesIn);
  const bytesOut = finiteTunnelMetricValue(stats?.totalBytesOut);
  const closes = finiteTunnelMetricValue(stats?.totalCloses);
  const averageDuration = finiteTunnelMetricValue(stats?.avgDurationMs);
  const duration = closes !== null && closes > 0 && averageDuration !== null && averageDuration > 0
    ? averageDuration
    : null;
  const metrics: OverviewMetric[] = [
    ...(isTcp
      ? [
          {
            id: "connections",
            label: "Connections",
            description: "New TCP connections over time",
            value: connections !== null ? formatTunnelCount(connections) : "—",
            numericValue: connections,
            chartKey: "connections" as const,
            format: formatTunnelCount,
            numberConfig: (value: number) => getTunnelMetricNumberConfig(value, "count"),
          },
        ]
      : []),
    {
      id: "clients",
      label: "Unique clients",
      description: "Distinct clients per interval",
      value: clients !== null ? formatTunnelCount(clients) : "—",
      numericValue: clients,
      chartKey: "uniqueClients",
      format: formatTunnelCount,
      numberConfig: (value) => getTunnelMetricNumberConfig(value, "count"),
    },
    ...(!isTcp
      ? [
          {
            id: "packets",
            label: "Packets",
            description: "UDP packets over time",
            value: packets !== null ? formatTunnelCount(packets) : "—",
            numericValue: packets,
            chartKey: "packets" as const,
            format: formatTunnelCount,
            numberConfig: (value: number) => getTunnelMetricNumberConfig(value, "count"),
          },
        ]
      : []),
    {
      id: "bytes-in",
      label: "Data in",
      description: "Incoming bytes per interval",
      value: bytesIn !== null ? formatBytes(bytesIn) : "—",
      numericValue: bytesIn,
      chartKey: "bytesIn",
      format: formatBytes,
      numberConfig: (value) => getTunnelMetricNumberConfig(value, "bytes"),
    },
    {
      id: "bytes-out",
      label: "Data out",
      description: "Outgoing bytes per interval",
      value: bytesOut !== null ? formatBytes(bytesOut) : "—",
      numericValue: bytesOut,
      chartKey: "bytesOut",
      format: formatBytes,
      numberConfig: (value) => getTunnelMetricNumberConfig(value, "bytes"),
    },
    ...(isTcp
      ? [
          {
            id: "duration",
            label: "Avg. duration",
            description: "Average closed-connection duration per interval",
            value: duration !== null ? formatDuration(duration) : "—",
            numericValue: duration,
            chartKey: "avgDurationMs" as const,
            format: formatDuration,
            numberConfig: (value: number) => getTunnelMetricNumberConfig(value, "duration"),
          },
          {
            id: "packets",
            label: "Data packets",
            description: "TCP data events over time",
            value: packets !== null ? formatTunnelCount(packets) : "—",
            numericValue: packets,
            chartKey: "packets" as const,
            format: formatTunnelCount,
            numberConfig: (value: number) => getTunnelMetricNumberConfig(value, "count"),
          },
        ]
      : []),
  ];

  const hasActivity = Boolean(
    stats &&
    (stats.totalConnections > 0 ||
      stats.totalPackets > 0 ||
      stats.totalBytesIn > 0 ||
      stats.totalBytesOut > 0 ||
      stats.totalCloses > 0),
  );

  return (
    <TunnelOverviewShell
      metrics={metrics}
      chartData={chartData}
      hasActivity={hasActivity}
      timeRange={timeRange}
      dataRange={dataRange}
      setTimeRange={setTimeRange}
      isLoading={isLoading}
      isPlaceholderData={isPlaceholderData}
      error={error}
      onRetry={onRetry}
      onViewActivity={onViewActivity}
      activityTitle="Recent events"
      activityDescription={`Latest ${protocol.toUpperCase()} activity in this period`}
      activity={
        recentEvents.length ? (
          <>
          <div aria-hidden="true" className="hidden grid-cols-[90px_minmax(0,1fr)_180px_74px] items-center gap-4 border-b border-white/[0.06] bg-white/[0.015] px-5 py-2.5 text-[11px] text-zinc-400 md:grid">
            <span>Event</span><span>Client</span><span className="text-right">Transferred</span><span className="text-right">Time</span>
          </div>
          <ul aria-label="Recent events" className="divide-y divide-white/[0.06]">
            {recentEvents.slice(0, 5).map((event, index) => (
              <li
                key={`${event.connection_id}-${event.timestamp}-${index}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-white/[0.025] motion-reduce:transition-none md:grid-cols-[90px_minmax(0,1fr)_180px_74px] md:gap-x-4 sm:px-5"
              >
                  <span
                    className={`inline-flex min-h-6 w-fit max-w-full shrink-0 items-center justify-self-start rounded-md border px-2 text-[11px] font-medium capitalize ${eventTone(event.event_type)}`}
                  >
                    {event.event_type}
                  </span>
                  <span
                    className="min-w-0 truncate font-mono text-[12px] text-zinc-200"
                    title={`${event.client_ip}:${event.client_port}`}
                  >
                    {event.client_ip}:{event.client_port}
                  </span>
                <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] tabular-nums text-zinc-400 md:contents">
                  <span className="md:text-right">
                    {formatBytes(event.bytes_in || 0)} in ·{" "}
                    {formatBytes(event.bytes_out || 0)} out
                  </span>
                  <time
                    className="text-right"
                    dateTime={event.timestamp}
                    title={event.timestamp}
                  >
                    {eventTime(event.timestamp)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
          </>
        ) : (
          <p className="px-5 py-9 text-center text-[12px] text-zinc-600">
            No events in this period.
          </p>
        )
      }
    />
  );
}
