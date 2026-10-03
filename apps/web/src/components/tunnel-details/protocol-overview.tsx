import {
  TunnelOverviewShell,
  type OverviewChartPoint,
  type OverviewMetric,
} from "./tunnel-overview-ui";
import { formatBytes, formatDuration } from "./tunnel-overview-format";

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
  if (eventType === "close" || eventType === "error")
    return "bg-rose-400/[0.08] text-rose-300";
  if (eventType === "connection") return "bg-accent/[0.1] text-purple-300";
  return "bg-emerald-400/[0.08] text-emerald-300";
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
  const metrics: OverviewMetric[] = [
    ...(isTcp
      ? [
          {
            id: "connections",
            label: "Connections",
            description: "New TCP connections over time",
            value: stats ? stats.totalConnections.toLocaleString() : "—",
            chartKey: "connections" as const,
            format: (value: number) => Math.round(value).toLocaleString(),
          },
        ]
      : []),
    {
      id: "clients",
      label: "Unique clients",
      description: "Distinct clients per interval",
      value: stats ? stats.uniqueClients.toLocaleString() : "—",
      chartKey: "uniqueClients",
      format: (value) => Math.round(value).toLocaleString(),
    },
    ...(!isTcp
      ? [
          {
            id: "packets",
            label: "Packets",
            description: "UDP packets over time",
            value: stats ? stats.totalPackets.toLocaleString() : "—",
            chartKey: "packets" as const,
            format: (value: number) => Math.round(value).toLocaleString(),
          },
        ]
      : []),
    {
      id: "bytes-in",
      label: "Data in",
      description: "Incoming bytes per interval",
      value: stats ? formatBytes(stats.totalBytesIn) : "—",
      chartKey: "bytesIn",
      format: formatBytes,
    },
    {
      id: "bytes-out",
      label: "Data out",
      description: "Outgoing bytes per interval",
      value: stats ? formatBytes(stats.totalBytesOut) : "—",
      chartKey: "bytesOut",
      format: formatBytes,
    },
    ...(isTcp
      ? [
          {
            id: "duration",
            label: "Avg. duration",
            description: "Average closed-connection duration per interval",
            value: stats ? formatDuration(stats.avgDurationMs) : "—",
            chartKey: "avgDurationMs" as const,
            format: formatDuration,
          },
          {
            id: "packets",
            label: "Data packets",
            description: "TCP data events over time",
            value: stats ? stats.totalPackets.toLocaleString() : "—",
            chartKey: "packets" as const,
            format: (value: number) => Math.round(value).toLocaleString(),
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
          <ul className="divide-y divide-white/[0.055]">
            {recentEvents.slice(0, 5).map((event, index) => (
              <li
                key={`${event.connection_id}-${event.timestamp}-${index}`}
                className="px-4 py-3 transition-colors hover:bg-white/[0.025] sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:px-5"
              >
                <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                  <span
                    className={`rounded px-1.5 py-1 text-center text-[10px] font-medium capitalize ${eventTone(event.event_type)}`}
                  >
                    {event.event_type}
                  </span>
                  <span
                    className="min-w-0 truncate font-mono text-[12px] text-zinc-300"
                    title={`${event.client_ip}:${event.client_port}`}
                  >
                    {event.client_ip}:{event.client_port}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 pl-[6.25rem] text-[11px] tabular-nums text-zinc-500 sm:mt-0 sm:grid-cols-[11rem_5rem] sm:pl-0">
                  <span className="sm:text-right">
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
        ) : (
          <p className="px-5 py-9 text-center text-[12px] text-zinc-600">
            No events in this period.
          </p>
        )
      }
    />
  );
}
