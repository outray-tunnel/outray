import { useMemo, type ReactNode } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { UsageMetricCard } from "@/components/overview/usage-metric-card";
import type { UsageNumberConfig } from "@/components/overview/usage-number-format";
import { parseTunnelStatsRange } from "@/lib/tunnel-stats-range";
import { SegmentedControl } from "../ui/segmented-control";
import { OVERVIEW_RANGES } from "./tunnel-overview-format";
import { buildTunnelMetricBars } from "./tunnel-overview-data";
import "../outray-arc-theme.css";

export interface OverviewChartPoint {
  time: string;
  requests?: number;
  duration?: number;
  bandwidth?: number;
  errors?: number;
  errorRate?: number;
  connections?: number;
  uniqueConnections?: number;
  uniqueClients?: number;
  packets?: number;
  closes?: number;
  bytesIn?: number;
  bytesOut?: number;
  avgDurationMs?: number;
}

export interface OverviewMetric {
  id: string;
  label: string;
  description: string;
  value: string;
  numericValue: number | null;
  chartKey: Exclude<keyof OverviewChartPoint, "time">;
  format: (value: number) => string;
  numberConfig?: (value: number) => UsageNumberConfig;
  zeroIsActivity?: boolean;
}

function rangeDescription(range: string): string {
  switch (range) {
    case "1h": return "Last hour";
    case "7d": return "Last 7 days";
    case "30d": return "Last 30 days";
    default: return "Last 24 hours";
  }
}

interface TunnelOverviewShellProps {
  metrics: OverviewMetric[];
  chartData: OverviewChartPoint[];
  hasActivity: boolean;
  timeRange: string;
  dataRange?: string;
  setTimeRange: (range: string) => void;
  isLoading: boolean;
  isPlaceholderData?: boolean;
  error?: string | null;
  onRetry?: () => void;
  activityTitle: string;
  activityDescription: string;
  onViewActivity?: () => void;
  activity: ReactNode;
}

export function TunnelOverviewShell({
  metrics, chartData, hasActivity, timeRange, dataRange, setTimeRange,
  isLoading, isPlaceholderData = false, error, onRetry,
  activityTitle, activityDescription, onViewActivity, activity,
}: TunnelOverviewShellProps) {
  const displayedRange = parseTunnelStatsRange(
    isPlaceholderData && dataRange ? dataRange : timeRange,
  ) ?? "24h";
  const switchingRange = isPlaceholderData && displayedRange !== timeRange;
  const metricKeys = metrics.map((metric) => metric.chartKey).join(",");
  const barsByMetric = useMemo(() => {
    const keys = metricKeys.split(",") as OverviewMetric["chartKey"][];
    return new Map(keys.map((key) => [
      key, buildTunnelMetricBars(chartData, key, displayedRange),
    ]));
  }, [chartData, displayedRange, metricKeys]);

  if (isLoading && !chartData.length && !error) {
    return <TunnelOverviewSkeleton metricCount={metrics.length || 4} />;
  }

  if (error && metrics.every((metric) => metric.numericValue === null)) {
    return (
      <div role="alert" className="outray-arc rounded-xl border border-white/[0.08] bg-[#111112] px-6 py-12 text-center">
        <p className="text-[13px] text-zinc-200">Overview could not be loaded.</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Your tunnel may still be online. Try loading its activity again.
        </p>
        {onRetry && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry} className="mt-5">
            <RefreshCw size={13} aria-hidden="true" /> Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="outray-arc space-y-7">
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-[12px] text-amber-100/75">
          <span>Could not refresh this overview. Showing the last available data.</span>
          {onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Retry</Button>}
        </div>
      )}

      <section aria-label="Tunnel analytics" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-medium text-zinc-200">Traffic</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {rangeDescription(displayedRange)}
              {switchingRange && <span role="status" className="ml-2 text-zinc-400">· Loading {timeRange}</span>}
            </p>
          </div>
          <SegmentedControl
            label="Chart time range"
            options={OVERVIEW_RANGES.map((range) => ({ value: range, label: range }))}
            value={timeRange}
            onValueChange={setTimeRange}
          />
        </div>

        <div className={`grid min-w-0 gap-3 ${metrics.length > 4 ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"}`}>
          {metrics.map((metric) => (
            <UsageMetricCard
              key={metric.id}
              range={displayedRange}
              bars={barsByMetric.get(metric.chartKey) ?? []}
              metric={{
                key: metric.id,
                label: metric.label,
                description: metric.description,
                value: metric.numericValue,
                format: (value) => value === null ? "—" : metric.format(value),
                numberConfig: metric.numberConfig,
                zeroIsActivity: metric.zeroIsActivity,
                emptyLabel: metric.numericValue === null
                  ? "No observations in these intervals"
                  : "No activity in these intervals",
              }}
            />
          ))}
        </div>
        {!hasActivity && (
          <p className="mt-3 text-[11px] text-zinc-500">
            No activity in this period. Try a longer time range to see earlier traffic.
          </p>
        )}
      </section>

      <section aria-label={activityTitle} className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-medium text-zinc-200">{activityTitle}</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">{activityDescription}</p>
          </div>
          {onViewActivity && (
            <Button type="button" variant="ghost" size="sm" onClick={onViewActivity} className="shrink-0">
              View all <ArrowRight size={13} aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
          {activity}
        </div>
      </section>
    </div>
  );
}

export function TunnelOverviewSkeleton({ metricCount = 4 }: { metricCount?: number }) {
  return (
    <div aria-label="Loading tunnel overview" aria-busy="true" className="space-y-7 animate-pulse motion-reduce:animate-none">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-white/[0.06]" />
            <div className="h-3 w-24 rounded bg-white/[0.04]" />
          </div>
          <div className="h-9 w-44 rounded-lg bg-white/[0.04]" />
        </div>
        <div className={`grid gap-3 ${metricCount > 4 ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"}`}>
          {Array.from({ length: metricCount }, (_, index) => (
            <div key={index} className="flex h-[180px] min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#111112] p-4">
              <div className="h-3 w-20 rounded bg-white/[0.05]" />
              <div className="mt-3 h-7 w-24 rounded bg-white/[0.07]" />
              <div className="mt-2 h-3 w-40 max-w-full rounded bg-white/[0.04]" />
              <div className="mt-auto flex h-16 items-end gap-1" aria-hidden="true">
                {Array.from({ length: 14 }, (_, bar) => <div key={bar} className={`flex-1 rounded-t bg-white/[0.04] ${bar % 3 === 0 ? "h-6" : bar % 3 === 1 ? "h-10" : "h-14"}`} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-4 h-3 w-28 rounded bg-white/[0.06]" />
        <div className="divide-y divide-white/[0.055] rounded-xl border border-white/[0.08] bg-[#111112]">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex h-12 items-center gap-4 px-4">
              <div className="h-5 w-9 shrink-0 rounded bg-white/[0.05]" />
              <div className="h-3 w-56 max-w-[60%] rounded bg-white/[0.04]" />
              <div className="ml-auto h-3 w-14 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
