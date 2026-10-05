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
import {
  finiteTunnelMetricValue,
  formatTunnelCount,
  getTunnelMetricNumberConfig,
} from "./tunnel-overview-data";

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
  if (status == null || !Number.isFinite(status) || status < 100)
    return "border-white/[0.08] bg-white/[0.025] text-zinc-400";
  if (status >= 500)
    return "border-rose-400/[0.12] bg-rose-400/[0.05] text-rose-300";
  if (status >= 400)
    return "border-amber-400/[0.12] bg-amber-400/[0.05] text-amber-300";
  if (status >= 300)
    return "border-white/[0.08] bg-white/[0.025] text-zinc-300";
  if (status < 200)
    return "border-sky-400/[0.12] bg-sky-400/[0.05] text-sky-300";
  return "border-emerald-400/[0.12] bg-emerald-400/[0.05] text-emerald-300";
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
  const requestCount = finiteTunnelMetricValue(stats?.totalRequests);
  const duration = requestCount !== null && requestCount > 0
    ? finiteTunnelMetricValue(stats?.avgDuration)
    : null;
  const bandwidth = finiteTunnelMetricValue(stats?.totalBandwidth);
  const errorRate = requestCount !== null && requestCount > 0
    ? finiteTunnelMetricValue(stats?.errorRate)
    : null;
  const metrics: OverviewMetric[] = [
    {
      id: "requests",
      label: "Requests",
      description: "Completed requests over time",
      value: requestCount !== null ? formatTunnelCount(requestCount) : "—",
      numericValue: requestCount,
      chartKey: "requests",
      format: formatTunnelCount,
      numberConfig: (value) => getTunnelMetricNumberConfig(value, "count"),
    },
    {
      id: "duration",
      label: "Avg. duration",
      description: "Average request time per interval",
      value: duration !== null ? formatDuration(duration) : "—",
      numericValue: duration,
      chartKey: "duration",
      format: formatDuration,
      numberConfig: (value) => getTunnelMetricNumberConfig(value, "duration"),
      zeroIsActivity: true,
    },
    {
      id: "bandwidth",
      label: "Bandwidth",
      description: "Data transferred per interval",
      value: bandwidth !== null ? formatBytes(bandwidth) : "—",
      numericValue: bandwidth,
      chartKey: "bandwidth",
      format: formatBytes,
      numberConfig: (value) => getTunnelMetricNumberConfig(value, "bytes"),
    },
    {
      id: "errors",
      label: "Error rate",
      description: "Share of requests with 4xx or 5xx responses",
      value: errorRate !== null ? formatPercent(errorRate) : "—",
      numericValue: errorRate,
      chartKey: "errorRate",
      format: formatPercent,
      numberConfig: (value) => getTunnelMetricNumberConfig(value, "percent"),
      zeroIsActivity: true,
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
          <>
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_64px_78px_74px] items-center gap-4 border-b border-white/[0.06] bg-white/[0.015] px-5 py-2.5 text-[11px] text-zinc-400 md:grid">
            <span>Request</span><span>Status</span><span className="text-right">Duration</span><span className="text-right">Time</span>
          </div>
          <ul aria-label="Recent requests" className="divide-y divide-white/[0.06]">
            {recentRequests.slice(0, 5).map((request, index) => (
              <li
                key={`${request.id ?? request.time}-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-white/[0.025] motion-reduce:transition-none md:grid-cols-[minmax(0,1fr)_64px_78px_74px] sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex min-w-[49px] shrink-0 justify-center rounded-md border border-white/[0.06] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                    {request.method ?? "—"}
                  </span>
                  <span
                    className="min-w-0 truncate font-mono text-[12px] text-zinc-200"
                    title={request.path || "/"}
                  >
                    {request.path || "/"}
                  </span>
                </div>
                <span
                  aria-label={`HTTP status ${request.status != null && Number.isFinite(request.status) && request.status >= 100 ? request.status : "unknown"}`}
                  className={`inline-flex min-h-6 w-fit min-w-[44px] shrink-0 items-center justify-self-end justify-center rounded-md border px-2 text-[11px] font-medium tabular-nums md:justify-self-start ${requestStatusTone(request.status)}`}
                >
                  {request.status != null && Number.isFinite(request.status) && request.status >= 100 ? request.status : "—"}
                </span>
                <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] tabular-nums text-zinc-400 md:contents">
                  <span className="md:text-right">
                    <span className="text-zinc-500 md:sr-only">Duration </span>
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
          </>
        ) : (
          <p className="px-5 py-9 text-center text-[12px] text-zinc-600">
            No requests in this period.
          </p>
        )
      }
    />
  );
}
