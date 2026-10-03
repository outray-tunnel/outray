import {
  TunnelOverviewShell,
  type OverviewChartPoint,
  type OverviewMetric,
} from "./tunnel-overview-ui";
import {
  formatBytes,
  formatDuration,
  formatPercent,
} from "./tunnel-overview-format";

interface HttpStats {
  totalRequests: number;
  avgDuration: number;
  totalBandwidth: number;
  errorRate: number;
}

interface RecentRequest {
  id?: string;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  duration?: number | null;
  size?: number | null;
  time: string;
}

interface TunnelOverviewProps {
  stats: HttpStats | null;
  chartData: OverviewChartPoint[];
  recentRequests?: RecentRequest[];
  timeRange: string;
  dataRange?: string;
  setTimeRange: (range: string) => void;
  isLoading: boolean;
  isPlaceholderData?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onViewActivity?: () => void;
}

function requestStatusTone(status: number | null | undefined): string {
  if (!status) return "text-zinc-500 bg-white/[0.04]";
  if (status >= 500) return "text-rose-300 bg-rose-400/[0.08]";
  if (status >= 400) return "text-amber-300 bg-amber-400/[0.08]";
  if (status >= 200 && status < 400)
    return "text-emerald-300 bg-emerald-400/[0.08]";
  return "text-zinc-400 bg-white/[0.04]";
}

function requestTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
}

export function TunnelOverview({
  stats,
  chartData,
  recentRequests = [],
  timeRange,
  dataRange,
  setTimeRange,
  isLoading,
  isPlaceholderData,
  error,
  onRetry,
  onViewActivity,
}: TunnelOverviewProps) {
  const metrics: OverviewMetric[] = [
    {
      id: "requests",
      label: "Requests",
      description: "Completed requests over time",
      value: stats ? stats.totalRequests.toLocaleString() : "—",
      chartKey: "requests",
      format: (value) => Math.round(value).toLocaleString(),
    },
    {
      id: "duration",
      label: "Avg. duration",
      description: "Average request time per interval",
      value: stats ? formatDuration(stats.avgDuration) : "—",
      chartKey: "duration",
      format: formatDuration,
    },
    {
      id: "bandwidth",
      label: "Bandwidth",
      description: "Data transferred per interval",
      value: stats ? formatBytes(stats.totalBandwidth) : "—",
      chartKey: "bandwidth",
      format: formatBytes,
    },
    {
      id: "errors",
      label: "Error rate",
      description: "Share of requests with 4xx or 5xx responses",
      value: stats ? formatPercent(stats.errorRate) : "—",
      chartKey: "errorRate",
      format: formatPercent,
    },
  ];

  return (
    <TunnelOverviewShell
      metrics={metrics}
      chartData={chartData}
      hasActivity={Boolean(stats && stats.totalRequests > 0)}
      timeRange={timeRange}
      dataRange={dataRange}
      setTimeRange={setTimeRange}
      isLoading={isLoading}
      isPlaceholderData={isPlaceholderData}
      error={error}
      onRetry={onRetry}
      onViewActivity={onViewActivity}
      activityTitle="Recent requests"
      activityDescription="Latest traffic in this period"
      activity={
        recentRequests.length ? (
          <ul className="divide-y divide-white/[0.055]">
            {recentRequests.slice(0, 5).map((request, index) => (
              <li
                key={`${request.id ?? request.time}-${index}`}
                className="px-4 py-3 transition-colors hover:bg-white/[0.025] sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:px-5"
              >
                <div className="grid min-w-0 grid-cols-[2.5rem_3rem_minmax(0,1fr)] items-center gap-3">
                  <span
                    className={`rounded px-1.5 py-1 text-center text-[10px] font-medium tabular-nums ${requestStatusTone(request.status)}`}
                  >
                    {request.status ?? "—"}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-500">
                    {request.method ?? "—"}
                  </span>
                  <span
                    className="min-w-0 truncate font-mono text-[12px] text-zinc-300"
                    title={request.path ?? undefined}
                  >
                    {request.path || "/"}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 pl-[5.5rem] text-[11px] tabular-nums text-zinc-500 sm:mt-0 sm:grid-cols-[6rem_5rem] sm:pl-0">
                  <span className="sm:text-right">
                    {request.duration != null
                      ? formatDuration(request.duration)
                      : "—"}
                  </span>
                  <time
                    className="text-right"
                    dateTime={request.time}
                    title={request.time}
                  >
                    {requestTime(request.time)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-9 text-center text-[12px] text-zinc-600">
            No requests in this period.
          </p>
        )
      }
    />
  );
}
