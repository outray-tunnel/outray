import { useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBytes, formatNumber } from "./format";
import { SegmentedControl } from "../ui/segmented-control";

const RANGES = ["1h", "24h", "7d", "30d"] as const;
export type OverviewRange = (typeof RANGES)[number];
type Range = OverviewRange;
type MetricKey = "httpRequests" | "protocolEvents" | "bandwidth" | "errors";

export interface TunnelsOverviewPoint {
  time: string;
  httpRequests: number;
  protocolEvents: number;
  bandwidth: number;
  errors: number;
}

export interface TunnelsOverviewStats {
  httpRequests: number;
  protocolEvents: number;
  totalDataTransfer: number;
  errors: number;
  activeTunnels: number | null;
  chartData: TunnelsOverviewPoint[];
  timeRange?: string;
}

interface Metric {
  key: MetricKey;
  label: string;
  description: string;
  value: string;
  format: (value: number) => string;
}

const rangeLabels: Record<Range, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

function formatTime(value: string, range: Range): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return range === "1h" || range === "24h"
    ? date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: range === "1h" ? "2-digit" : undefined,
      })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

export function TunnelsAnalytics({
  stats,
  range,
  onRangeChange,
  isFetching,
  error,
  onRetry,
}: {
  stats?: TunnelsOverviewStats | null;
  range: Range;
  onRangeChange: (range: Range) => void;
  isFetching?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<MetricKey>("httpRequests");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [keyboardIndex, setKeyboardIndex] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const chartId = useId();
  const fillId = `${chartId.replace(/[^a-zA-Z0-9_-]/g, "")}-fill`;
  const points = stats?.chartData ?? [];
  const displayedRange =
    RANGES.find((option) => option === stats?.timeRange) ?? range;
  const switchingRange = isFetching && displayedRange !== range;
  const metrics: Metric[] = [
    {
      key: "httpRequests",
      label: "HTTP requests",
      description: "Completed web requests",
      value: formatNumber(stats?.httpRequests ?? 0),
      format: (value) => formatNumber(Math.round(value)),
    },
    {
      key: "protocolEvents",
      label: "Protocol events",
      description: "TCP and UDP activity",
      value: formatNumber(stats?.protocolEvents ?? 0),
      format: (value) => formatNumber(Math.round(value)),
    },
    {
      key: "bandwidth",
      label: "Data transfer",
      description: "Across all tunnels",
      value: formatBytes(stats?.totalDataTransfer ?? 0),
      format: formatBytes,
    },
    {
      key: "errors",
      label: "HTTP errors",
      description: "4xx and 5xx responses",
      value: formatNumber(stats?.errors ?? 0),
      format: (value) => formatNumber(Math.round(value)),
    },
  ];
  const selectedMetric =
    metrics.find((metric) => metric.key === selectedKey) ?? metrics[0];
  const inspectedIndex = hoverIndex ?? keyboardIndex;
  const inspectedPoint =
    inspectedIndex === null ? null : points[inspectedIndex];

  if (error && !stats) {
    return (
      <section className="rounded-xl border border-rose-400/20 bg-rose-400/[0.035] px-6 py-14 text-center">
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
            className="mt-5 inline-flex min-h-9 items-center gap-2 rounded-md border border-white/[0.12] px-3 text-[12px] text-zinc-200 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <RefreshCw size={13} aria-hidden="true" /> Try again
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      className="min-w-0 overflow-hidden rounded-xl border border-white/[0.11] bg-[#151516]"
      aria-label="Tunnel analytics"
    >
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] font-normal tracking-[-0.035em] text-zinc-100">
              Analytics
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] tabular-nums text-zinc-400">
              <span
                className="size-1.5 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              {stats?.activeTunnels ?? 0} online
            </span>
          </div>
          <p className="mt-1 text-[12px] text-zinc-500">
            All tunnels <span className="px-1 text-zinc-700">·</span>{" "}
            {rangeLabels[displayedRange]}
            {switchingRange ? (
              <span role="status" className="ml-2 text-zinc-400">
                · Loading {rangeLabels[range].toLowerCase()}
              </span>
            ) : isFetching ? (
              <span role="status" className="ml-2 text-zinc-400">
                · Updating
              </span>
            ) : null}
          </p>
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
          className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-400/15 bg-amber-400/[0.045] px-6 py-2.5 text-[11px] text-amber-100/75"
        >
          <span>
            Could not refresh analytics. Showing the last available data.
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="font-medium underline underline-offset-4 hover:text-white"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div
        role="group"
        aria-label="Select a chart metric"
        className="grid grid-cols-2 border-y border-white/[0.09] lg:grid-cols-4"
      >
        {metrics.map((metric, index) => {
          const selected = metric.key === selectedKey;
          return (
            <button
              key={metric.key}
              type="button"
              aria-pressed={selected}
              aria-label={`${metric.label}: ${metric.value}. Show ${metric.label} chart`}
              onClick={() => {
                setSelectedKey(metric.key);
                setHoverIndex(null);
                setKeyboardIndex(null);
              }}
              className={`relative min-h-32 min-w-0 px-5 py-5 text-left transition-colors motion-reduce:transition-none hover:bg-white/[0.04] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent sm:px-6 ${index % 2 === 0 ? "border-r border-white/[0.09]" : ""} ${index < 2 ? "border-b border-white/[0.09] lg:border-b-0" : ""} ${index === 1 ? "lg:border-r lg:border-white/[0.09]" : ""} ${index === 2 ? "lg:border-r lg:border-white/[0.09]" : ""} ${selected ? "bg-white/[0.055]" : ""}`}
            >
              <span
                className={`block text-[12px] ${selected ? "text-zinc-200" : "text-zinc-400"}`}
              >
                {metric.label}
              </span>
              <span className="mt-2 block text-[30px] font-normal leading-none tracking-[-0.045em] text-zinc-100 tabular-nums sm:text-[34px]">
                {metric.value}
              </span>
              <span className="mt-2 block text-[11px] text-zinc-500">
                {metric.description}
              </span>
              {selected && (
                <span
                  className="absolute inset-x-0 bottom-0 h-[2px] bg-zinc-100"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="px-3 pb-5 pt-5 sm:px-6 sm:pb-6">
        <div className="flex min-h-7 flex-wrap items-center justify-between gap-2 px-1 text-[11px]">
          <span className="inline-flex items-center gap-2 text-zinc-300">
            <span
              className="h-[2px] w-4 rounded-full bg-zinc-200"
              aria-hidden="true"
            />
            {selectedMetric.label}
          </span>
          <span className="tabular-nums text-zinc-500">
            {inspectedPoint
              ? `${formatFullTime(inspectedPoint.time)} · ${selectedMetric.format(inspectedPoint[selectedMetric.key])}`
              : selectedMetric.description}
          </span>
        </div>
        {points.length ? (
          <>
            <p id={chartId} className="sr-only">
              Focus the chart and use the arrow keys to inspect values. Home and
              End jump to the first and last point.
            </p>
            <div
              role="group"
              tabIndex={0}
              aria-label={`${selectedMetric.label} over ${rangeLabels[displayedRange].toLowerCase()}`}
              aria-describedby={chartId}
              onFocus={() => {
                if (keyboardIndex === null) setKeyboardIndex(points.length - 1);
              }}
              onBlur={() => setKeyboardIndex(null)}
              onKeyDown={(event) => {
                const current = keyboardIndex ?? points.length - 1;
                const next =
                  event.key === "ArrowRight"
                    ? current + 1
                    : event.key === "ArrowLeft"
                      ? current - 1
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? points.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setKeyboardIndex(
                  Math.max(0, Math.min(points.length - 1, next)),
                );
              }}
              className="mt-2 h-[300px] w-full rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-[390px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={points}
                  accessibilityLayer={false}
                  margin={{ top: 12, right: 10, bottom: 0, left: -4 }}
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
                        index < points.length
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
                        stopColor="#d4d4d8"
                        stopOpacity={0.15}
                      />
                      <stop
                        offset="100%"
                        stopColor="#d4d4d8"
                        stopOpacity={0.015}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="rgba(255,255,255,0.07)"
                  />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={25}
                    tick={{ fill: "#89898f", fontSize: 11 }}
                    tickFormatter={(value: string) =>
                      formatTime(value, displayedRange)
                    }
                  />
                  <YAxis
                    width={68}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#89898f", fontSize: 11 }}
                    tickFormatter={(value: number) =>
                      selectedMetric.format(value)
                    }
                  />
                  <Tooltip
                    cursor={false}
                    wrapperStyle={{ pointerEvents: "none", outline: "none" }}
                    content={({ active, payload }) => {
                      const point = payload?.[0]?.payload as
                        TunnelsOverviewPoint | undefined;
                      if (!active || !point) return null;
                      return (
                        <div className="rounded-lg border border-white/[0.13] bg-[#222225] px-3 py-2 shadow-xl">
                          <p className="text-[11px] text-zinc-400">
                            {formatFullTime(point.time)}
                          </p>
                          <p className="mt-1 text-[12px] font-medium text-white">
                            {selectedMetric.label}:{" "}
                            {selectedMetric.format(point[selectedMetric.key])}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={selectedMetric.key}
                    stroke="#d4d4d8"
                    strokeWidth={2}
                    fill={`url(#${fillId})`}
                    fillOpacity={1}
                    dot={false}
                    activeDot={{ r: 3.5, strokeWidth: 0, fill: "#f4f4f5" }}
                    isAnimationActive={!reducedMotion}
                    animationDuration={220}
                  />
                  {inspectedPoint && (
                    <ReferenceLine
                      x={inspectedPoint.time}
                      stroke="rgba(228,228,231,0.35)"
                      strokeDasharray="3 3"
                    />
                  )}
                  {inspectedPoint && (
                    <ReferenceDot
                      x={inspectedPoint.time}
                      y={inspectedPoint[selectedMetric.key]}
                      r={4}
                      fill="#f4f4f5"
                      stroke="#151516"
                      strokeWidth={1.5}
                      ifOverflow="visible"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span className="sr-only" aria-live="polite">
              {keyboardIndex !== null && points[keyboardIndex]
                ? `${formatFullTime(points[keyboardIndex].time)}: ${selectedMetric.format(points[keyboardIndex][selectedMetric.key])}`
                : ""}
            </span>
            <table className="sr-only">
              <caption>{selectedMetric.label} by time</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">{selectedMetric.label}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.time}>
                    <td>{formatFullTime(point.time)}</td>
                    <td>{selectedMetric.format(point[selectedMetric.key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-[12px] text-zinc-500 sm:h-[390px]">
            No activity in this period
          </div>
        )}
      </div>
    </section>
  );
}
