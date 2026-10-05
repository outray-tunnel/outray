import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { formatBytes } from "./format";
import { SegmentedControl } from "../ui/segmented-control";
import { UsageMetricCard as SharedUsageMetricCard } from "./usage-metric-card";
import {
  createUsageBars,
  type UsageBar,
  type UsageMetricKey,
  type UsagePoint,
} from "./usage-bars";

const RANGES = ["1h", "24h", "7d", "30d"] as const;
const EMPTY_POINTS: UsagePoint[] = [];
const countFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
export type OverviewRange = (typeof RANGES)[number];
export type TunnelsOverviewPoint = UsagePoint;

export interface TunnelsOverviewStats {
  httpRequests: number;
  protocolEvents: number;
  totalDataTransfer: number;
  errors: number;
  activeTunnels: number | null;
  chartData: TunnelsOverviewPoint[];
  timeRange?: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface Metric {
  key: Exclude<UsageMetricKey, "errors">;
  label: string;
  description: string;
  value: number;
  format: (value: number) => string;
}

const rangeLabels: Record<OverviewRange, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

export function TunnelsAnalytics({
  stats,
  range,
  onRangeChange,
  isFetching,
  error,
  onRetry,
}: {
  stats?: TunnelsOverviewStats | null;
  range: OverviewRange;
  onRangeChange: (range: OverviewRange) => void;
  isFetching?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const displayedRange =
    RANGES.find((option) => option === stats?.timeRange) ?? range;
  const switchingRange = isFetching && displayedRange !== range;
  const count = (value: number) => countFormatter.format(value);
  const metrics: Metric[] = [
    {
      key: "httpRequests",
      label: "HTTP requests",
      description: "Completed web requests",
      value: stats?.httpRequests ?? 0,
      format: count,
    },
    {
      key: "protocolEvents",
      label: "Protocol events",
      description: "TCP and UDP activity",
      value: stats?.protocolEvents ?? 0,
      format: count,
    },
    {
      key: "bandwidth",
      label: "Data transfer",
      description: "Across all tunnels",
      value: stats?.totalDataTransfer ?? 0,
      format: formatBytes,
    },
  ];
  const points = stats?.chartData ?? EMPTY_POINTS;
  const windowStart = stats?.windowStart;
  const windowEnd = stats?.windowEnd;
  const series = useMemo(() => {
    const bars = (metric: Metric["key"]) =>
      createUsageBars(points, metric, displayedRange, windowStart, windowEnd);
    return {
      httpRequests: bars("httpRequests"),
      protocolEvents: bars("protocolEvents"),
      bandwidth: bars("bandwidth"),
    };
  }, [points, displayedRange, windowStart, windowEnd]);

  if (error && !stats) {
    return (
      <section className="rounded-xl border border-rose-400/20 bg-rose-400/[0.035] px-5 py-8 text-center">
        <h2 className="text-[14px] font-medium text-zinc-200">
          Analytics unavailable
        </h2>
        <p className="mt-1 text-[12px] text-zinc-500">
          We could not load tunnel activity. Your tunnels may still be online.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md border border-white/[0.12] px-3 text-[12px] text-zinc-200 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <RefreshCw size={13} aria-hidden="true" /> Try again
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-3" aria-label="Tunnel analytics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[14px] font-medium text-zinc-200">Usage</h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-zinc-500">
              <span
                className={`size-1.5 rounded-full ${stats?.activeTunnels ? "bg-emerald-400" : "bg-zinc-600"}`}
                aria-hidden="true"
              />
              {stats?.activeTunnels ?? "—"} online
            </span>
            {switchingRange ? (
              <span role="status" className="text-[11px] text-zinc-400">
                Loading {rangeLabels[range].toLowerCase()}
              </span>
            ) : isFetching ? (
              <span role="status" className="text-[11px] text-zinc-400">
                Updating
              </span>
            ) : null}
          </div>
        </div>
        <SegmentedControl
          label="Analytics time range"
          options={RANGES.map((option) => ({ value: option, label: option }))}
          value={range}
          onValueChange={onRangeChange}
        />
      </div>

      {error && stats && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[11px] text-amber-100/75"
        >
          <span>
            Could not refresh analytics. Showing the last available data.
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-7 font-medium underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {metrics.map((metric) => (
          <UsageMetricCard
            key={metric.key}
            metric={metric}
            range={displayedRange}
            bars={series[metric.key]}
          />
        ))}
      </div>
    </section>
  );
}

export function UsageMetricCard({
  metric, range, bars,
}: {
  metric: Metric;
  range: OverviewRange;
  bars: UsageBar[];
}) {
  return <SharedUsageMetricCard
    metric={{ ...metric, format: (value) => value === null ? "—" : metric.format(value) }}
    range={range}
    bars={bars}
  />;
}
