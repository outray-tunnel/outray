import { useId, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ChartNoAxesCombined,
  RefreshCw,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/arc/button/button";
import { SegmentedControl } from "../ui/segmented-control";
import "../outray-arc-theme.css";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatChartTime,
  OVERVIEW_RANGES,
  selectOverviewMetric,
} from "./tunnel-overview-format";

export interface OverviewChartPoint {
  time: string;
  requests?: number;
  duration?: number;
  bandwidth?: number;
  errorRate?: number;
  connections?: number;
  uniqueClients?: number;
  packets?: number;
  bytesIn?: number;
  bytesOut?: number;
  avgDurationMs?: number;
}

export interface OverviewMetric {
  id: string;
  label: string;
  description: string;
  value: string;
  chartKey: Exclude<keyof OverviewChartPoint, "time">;
  format: (value: number) => string;
}

function formatFullTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function rangeDescription(range: string): string {
  switch (range) {
    case "1h":
      return "Last hour";
    case "24h":
      return "Last 24 hours";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    default:
      return `Last ${range}`;
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
  metrics,
  chartData,
  hasActivity,
  timeRange,
  dataRange,
  setTimeRange,
  isLoading,
  isPlaceholderData = false,
  error,
  onRetry,
  activityTitle,
  activityDescription,
  onViewActivity,
  activity,
}: TunnelOverviewShellProps) {
  const [selectedMetricId, setSelectedMetricId] = useState(metrics[0]?.id);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [keyboardIndex, setKeyboardIndex] = useState<number | null>(null);
  const selectedMetric = selectOverviewMetric(metrics, selectedMetricId);
  const inspectIndex = hoverIndex ?? keyboardIndex;
  const inspectedPoint = inspectIndex === null ? null : chartData[inspectIndex];
  const chartInstructionsId = useId();
  const fillId = `${chartInstructionsId.replace(/[^a-zA-Z0-9_-]/g, "")}-fill`;
  const reducedMotion = useReducedMotion();
  const displayedRange = isPlaceholderData && dataRange ? dataRange : timeRange;
  const switchingRange = isPlaceholderData && displayedRange !== timeRange;

  if (isLoading && metrics.length === 0)
    return <TunnelOverviewSkeleton metricCount={4} />;
  if (isLoading && !chartData.length && !error)
    return <TunnelOverviewSkeleton metricCount={metrics.length} />;
  if (!selectedMetric) return null;

  if (error && metrics.every((metric) => metric.value === "—")) {
    return (
      <div className="outray-arc rounded-xl border border-rose-400/15 bg-rose-400/[0.035] px-6 py-12 text-center">
        <p className="text-[13px] text-zinc-200">
          Overview could not be loaded.
        </p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Your tunnel may still be online. Try loading its activity again.
        </p>
        {onRetry && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRetry}
            className="mt-5"
          >
            <RefreshCw size={13} aria-hidden="true" /> Retry
          </Button>
        )}
      </div>
    );
  }

  const setInspectedIndex = (index: number) => {
    setKeyboardIndex(Math.max(0, Math.min(chartData.length - 1, index)));
  };

  return (
    <div className="outray-arc space-y-4">
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-[12px] text-amber-100/75"
        >
          <span>
            Could not refresh this overview. Showing the last available data.
          </span>
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </div>
      )}

      <section
        className="min-w-0 overflow-hidden rounded-xl border border-white/[0.1] bg-[#141416]"
        aria-label="Tunnel analytics"
      >
        <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <h2 className="text-[20px] font-normal tracking-[-0.03em] text-zinc-100">
              Analytics
            </h2>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Tunnel activity · {rangeDescription(displayedRange)}
              {switchingRange && (
                <span role="status" className="ml-2 text-zinc-400">
                  · Loading {timeRange}
                </span>
              )}
            </p>
          </div>
          <SegmentedControl
            label="Chart time range"
            options={OVERVIEW_RANGES.map((range) => ({ value: range, label: range }))}
            value={timeRange}
            onValueChange={setTimeRange}
          />
        </div>

        <div
          role="group"
          className={`grid border-t border-white/[0.09] ${metrics.length > 4 ? "grid-cols-2 md:grid-cols-3 2xl:grid-cols-6" : "grid-cols-2 xl:grid-cols-4"}`}
          aria-label="Select a metric"
        >
          {metrics.map((metric) => {
            const selected = metric.id === selectedMetric.id;
            return (
              <button
                key={metric.id}
                type="button"
                aria-pressed={selected}
                aria-label={`${metric.label}: ${metric.value}. Show ${metric.label} chart`}
                onClick={() => {
                  setSelectedMetricId(metric.id);
                  setHoverIndex(null);
                  setKeyboardIndex(null);
                }}
                className={`relative min-h-28 min-w-0 border-b border-r border-white/[0.09] px-4 py-4 text-left transition-colors hover:bg-white/[0.025] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent motion-reduce:transition-none sm:px-6 ${selected ? "bg-white/[0.02]" : ""}`}
              >
                <span className="block text-[12px] text-zinc-400">
                  {metric.label}
                </span>
                <span className="mt-1.5 block text-[27px] font-normal leading-none tracking-[-0.04em] text-zinc-100 tabular-nums">
                  {metric.value}
                </span>
                <span className="mt-2 block truncate text-[10px] text-zinc-600">
                  {metric.description}
                </span>
                {selected && (
                  <span
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-zinc-200"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        {hasActivity ? (
          <div className="px-3 pb-5 pt-4 sm:px-6 sm:pb-6">
            <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[11px]">
              <span className="inline-flex items-center gap-2 text-zinc-400">
                <span
                  className="h-[2px] w-4 rounded-full bg-zinc-300"
                  aria-hidden="true"
                />
                {selectedMetric.label}
              </span>
              <span className="tabular-nums text-zinc-500">
                {inspectedPoint
                  ? `${formatFullTime(inspectedPoint.time)} · ${selectedMetric.format(Number(inspectedPoint[selectedMetric.chartKey] ?? 0))}`
                  : selectedMetric.description}
              </span>
            </div>
            <p id={chartInstructionsId} className="sr-only">
              Focus the chart and use the left and right arrow keys to inspect
              each point. Home and End jump to the first and last point.
            </p>
            <div
              role="group"
              tabIndex={0}
              aria-label={`${selectedMetric.label} · ${rangeDescription(displayedRange)}`}
              aria-describedby={chartInstructionsId}
              onFocus={() => {
                if (keyboardIndex === null && chartData.length)
                  setInspectedIndex(chartData.length - 1);
              }}
              onBlur={() => setKeyboardIndex(null)}
              onKeyDown={(event) => {
                if (!chartData.length) return;
                const current = keyboardIndex ?? chartData.length - 1;
                const nextIndex =
                  event.key === "ArrowRight"
                    ? current + 1
                    : event.key === "ArrowLeft"
                      ? current - 1
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? chartData.length - 1
                          : null;
                if (nextIndex === null) return;
                event.preventDefault();
                setInspectedIndex(nextIndex);
              }}
              className="mt-2 h-[310px] w-full rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-[390px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  accessibilityLayer={false}
                  margin={{ top: 10, right: 8, bottom: 0, left: -10 }}
                  onMouseMove={(state) => {
                    const activeIndex = state?.activeTooltipIndex;
                    if (activeIndex === null || activeIndex === undefined) {
                      setHoverIndex(null);
                      return;
                    }
                    const index = Number(activeIndex);
                    setHoverIndex(
                      Number.isInteger(index) &&
                        index >= 0 &&
                        index < chartData.length
                        ? index
                        : null,
                    );
                  }}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <defs>
                    <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#ffffff"
                        stopOpacity={0.075}
                      />
                      <stop
                        offset="100%"
                        stopColor="#ffffff"
                        stopOpacity={0.015}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="rgba(255,255,255,0.055)"
                  />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#85858b", fontSize: 11 }}
                    minTickGap={24}
                    tickFormatter={(value: string) =>
                      formatChartTime(value, displayedRange)
                    }
                  />
                  <YAxis
                    width={66}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#85858b", fontSize: 11 }}
                    tickFormatter={(value: number) =>
                      selectedMetric.format(value)
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey={selectedMetric.chartKey}
                    stroke="#c4c4c8"
                    strokeWidth={2}
                    fill={`url(#${fillId})`}
                    fillOpacity={1}
                    dot={false}
                    activeDot={{ r: 3.5, strokeWidth: 0, fill: "#e4e4e7" }}
                    isAnimationActive={!reducedMotion}
                    animationDuration={220}
                  />
                  {inspectedPoint && (
                    <ReferenceLine
                      x={inspectedPoint.time}
                      stroke="rgba(228,228,231,0.38)"
                      strokeDasharray="3 3"
                    />
                  )}
                  {inspectedPoint && (
                    <ReferenceDot
                      x={inspectedPoint.time}
                      y={Number(inspectedPoint[selectedMetric.chartKey] ?? 0)}
                      r={4}
                      fill="#e4e4e7"
                      stroke="#141416"
                      strokeWidth={1.5}
                      ifOverflow="visible"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span className="sr-only" aria-live="polite">
              {keyboardIndex !== null && chartData[keyboardIndex]
                ? `${formatFullTime(chartData[keyboardIndex].time)}: ${selectedMetric.format(Number(chartData[keyboardIndex][selectedMetric.chartKey] ?? 0))}`
                : ""}
            </span>
            <table className="sr-only">
              <caption>
                {selectedMetric.label} by time for the last {displayedRange}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">{selectedMetric.label}</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((point) => (
                  <tr key={point.time}>
                    <td>{formatFullTime(point.time)}</td>
                    <td>
                      {selectedMetric.format(
                        Number(point[selectedMetric.chartKey] ?? 0),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center px-5 py-12 text-center">
            <ChartNoAxesCombined
              size={21}
              strokeWidth={1.4}
              className="text-zinc-700"
              aria-hidden="true"
            />
            <p className="mt-3 text-[13px] text-zinc-300">
              No activity in this period
            </p>
            <p className="mt-1 max-w-xs text-[11px] leading-5 text-zinc-600">
              Try a longer time range to see earlier traffic.
            </p>
          </div>
        )}
      </section>

      <section
        className="overflow-hidden rounded-xl border border-white/[0.08]"
        aria-label={activityTitle}
      >
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[13px] font-medium text-zinc-200">
              {activityTitle}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-600">
              {activityDescription}
            </p>
          </div>
          {onViewActivity && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onViewActivity}
              className="shrink-0"
            >
              View all <ArrowRight size={13} aria-hidden="true" />
            </Button>
          )}
        </div>
        {activity}
      </section>
    </div>
  );
}

export function TunnelOverviewSkeleton({
  metricCount = 4,
}: {
  metricCount?: number;
}) {
  return (
    <div
      className="space-y-4"
      aria-label="Loading tunnel overview"
      aria-busy="true"
    >
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#141416]">
        <div className="flex items-center justify-between gap-4 px-5 py-5">
          <div className="space-y-2">
            <div className="h-5 w-26 animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none" />
            <div className="h-3 w-40 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
          </div>
          <div className="h-9 w-40 animate-pulse rounded-lg bg-white/[0.04] motion-reduce:animate-none" />
        </div>
        <div
          className={`grid border-t border-white/[0.08] ${metricCount > 4 ? "grid-cols-2 md:grid-cols-3 2xl:grid-cols-6" : "grid-cols-2 xl:grid-cols-4"}`}
        >
          {Array.from({ length: metricCount }).map((_, index) => (
            <div
              key={index}
              className="min-h-28 min-w-0 border-b border-r border-white/[0.07] px-5 py-4"
            >
              <div className="h-3 w-18 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
              <div className="mt-3 h-7 w-24 animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none" />
            </div>
          ))}
        </div>
        <div className="px-5 py-6">
          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
          <div className="mt-5 h-[310px] animate-pulse rounded-md bg-white/[0.025] motion-reduce:animate-none sm:h-[390px]" />
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.07] p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
        <div className="mt-5 space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-5 animate-pulse rounded bg-white/[0.025] motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
