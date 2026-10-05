import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { formatBytes } from "./format";
import { SegmentedControl } from "../ui/segmented-control";
import { UsageNumber } from "./usage-number";
import { createUsageHoverScheduler } from "./usage-hover";
import {
  createUsageBars,
  formatUsageInterval,
  hoverUsageBarIndex,
  inspectedUsageBar,
  nextUsageBarIndex,
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
  metric,
  range,
  bars,
}: {
  metric: Metric;
  range: OverviewRange;
  bars: UsageBar[];
}) {
  const [inspection, setInspection] = useState<{
    bars: UsageBar[];
    range: OverviewRange;
    hoverIndex: number | null;
    keyboardIndex: number | null;
  }>(() => ({ bars, range, hoverIndex: null, keyboardIndex: null }));
  const isCurrent = inspection.bars === bars && inspection.range === range;
  const hoverIndex = isCurrent ? inspection.hoverIndex : null;
  const keyboardIndex = isCurrent ? inspection.keyboardIndex : null;
  const activeBar = inspectedUsageBar(
    bars,
    inspection.bars,
    hoverIndex,
    keyboardIndex,
  );
  const displayValue = activeBar?.value ?? metric.value;

  const inspect = useCallback((
    kind: "hoverIndex" | "keyboardIndex",
    index: number | null,
  ) => {
    const nextHoverIndex = kind === "hoverIndex" ? index : null;
    const nextKeyboardIndex = kind === "keyboardIndex" ? index : null;
    setInspection((previous) =>
      previous.bars === bars &&
      previous.range === range &&
      previous.hoverIndex === nextHoverIndex &&
      previous.keyboardIndex === nextKeyboardIndex
        ? previous
        : {
            bars,
            range,
            hoverIndex: nextHoverIndex,
            keyboardIndex: nextKeyboardIndex,
          },
    );
  }, [bars, range]);
  const inspectHover = useCallback((index: number | null) => inspect("hoverIndex", index), [inspect]);
  const inspectKeyboard = useCallback((index: number | null) => inspect("keyboardIndex", index), [inspect]);
  const resetInspection = useCallback(() => inspect("hoverIndex", null), [inspect]);

  return (
    <article
      aria-label={metric.label}
      data-metric={metric.key}
      className="flex h-[180px] min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#111112] p-4"
    >
      <h3 className="text-[12px] font-normal text-zinc-400">{metric.label}</h3>
      <p
        data-usage-value={metric.format(displayValue)}
        className="mt-1.5 h-8 text-[24px] font-normal leading-8 tracking-[-0.035em] tabular-nums text-zinc-100"
      >
        <UsageNumber value={displayValue} metric={metric.key} />
      </p>
      <p className="mt-0.5 truncate text-[11px] text-zinc-500">
        {activeBar ? formatUsageInterval(activeBar, range) : metric.description}
      </p>
      <UsageMiniChart
        key={range}
        metric={metric}
        range={range}
        bars={bars}
        hoverIndex={hoverIndex}
        keyboardIndex={keyboardIndex}
        onHoverIndexChange={inspectHover}
        onKeyboardIndexChange={inspectKeyboard}
        onResetInspection={resetInspection}
      />
    </article>
  );
}

function UsageMiniChart({
  metric,
  range,
  bars,
  hoverIndex,
  keyboardIndex,
  onHoverIndexChange,
  onKeyboardIndexChange,
  onResetInspection,
}: {
  metric: Metric;
  range: OverviewRange;
  bars: UsageBar[];
  hoverIndex: number | null;
  keyboardIndex: number | null;
  onHoverIndexChange: (index: number | null) => void;
  onKeyboardIndexChange: (index: number | null) => void;
  onResetInspection: () => void;
}) {
  const hintId = useId();
  const pointerFocus = useRef(false);
  const hoverScheduler = useMemo(() => createUsageHoverScheduler({
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (frame) => window.cancelAnimationFrame(frame),
    onInspect: onHoverIndexChange,
  }), [onHoverIndexChange]);
  useEffect(() => () => hoverScheduler.cancel(), [hoverScheduler, bars]);
  const resetInspection = () => {
    hoverScheduler.cancel();
    onResetInspection();
  };
  const activeIndex = hoverIndex ?? keyboardIndex;
  const keyboardBar = keyboardIndex === null ? null : bars[keyboardIndex];
  const hasActivity = bars.some((bar) => bar.value > 0);

  if (!hasActivity) {
    return (
      <div
        className="relative mt-auto flex h-16 items-center justify-center"
        aria-label={`${metric.label}: no activity in this period`}
      >
        <p className="text-center text-[10px] text-zinc-600">
          No activity in this period
        </p>
        <div
          className="absolute inset-x-0 bottom-0 flex gap-1"
          aria-hidden="true"
        >
          {Array.from({ length: 14 }, (_, index) => (
            <span
              key={index}
              className="h-0.5 flex-1 rounded-sm bg-white/[0.08]"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <p id={hintId} className="sr-only">
        Use Left and Right arrow keys to inspect each bar. Home and End jump to
        the first and last interval.
      </p>
      <div
        role="group"
        tabIndex={0}
        aria-label={`${metric.label} over ${rangeLabels[range].toLowerCase()}`}
        aria-describedby={hintId}
        className="relative mt-auto h-16 w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        onPointerDown={() => {
          pointerFocus.current = true;
        }}
        onFocus={() => {
          if (!pointerFocus.current) onKeyboardIndexChange(bars.length - 1);
        }}
        onBlur={() => {
          pointerFocus.current = false;
          resetInspection();
        }}
        onMouseLeave={resetInspection}
        onPointerLeave={resetInspection}
        onKeyDown={(event) => {
          const next = nextUsageBarIndex(keyboardIndex, event.key, bars.length);
          if (next === undefined) return;
          event.preventDefault();
          hoverScheduler.cancel();
          pointerFocus.current = false;
          onKeyboardIndexChange(next);
        }}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 240, height: 64 }}
        >
          <BarChart
            data={bars}
            accessibilityLayer={false}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            barCategoryGap="12%"
          >
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              shared={false}
              cursor={{ fill: "rgba(255,255,255,0.035)" }}
              wrapperStyle={{
                pointerEvents: "none",
                outline: "none",
                zIndex: 20,
              }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const bar = payload?.[0]?.payload as UsageBar | undefined;
                return active && bar ? (
                  <UsageTooltip bar={bar} metric={metric} range={range} />
                ) : null;
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              // Stable shapes keep hover hit targets from moving during number updates.
              isAnimationActive={false}
              onMouseEnter={(_, index) => {
                hoverScheduler.inspect(hoverUsageBarIndex(index, bars.length));
              }}
              onMouseMove={(_, index) => {
                hoverScheduler.inspect(hoverUsageBarIndex(index, bars.length));
              }}
              onMouseLeave={() => hoverScheduler.inspect(null)}
            >
              {bars.map((bar, index) => (
                <Cell
                  key={bar.startTime}
                  className="transition-[fill] duration-100 motion-reduce:transition-none"
                  fill={activeIndex === index ? "#a1a1aa" : "#52525b"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {keyboardBar && hoverIndex === null && (
          <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2">
            <UsageTooltip bar={keyboardBar} metric={metric} range={range} />
          </div>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {keyboardBar
          ? `${formatUsageInterval(keyboardBar, range)}: ${metric.format(keyboardBar.value)} ${metric.label}`
          : ""}
      </span>
      <table className="sr-only">
        <caption>{metric.label} by interval</caption>
        <thead>
          <tr>
            <th scope="col">Interval</th>
            <th scope="col">{metric.label}</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.startTime}>
              <td>{formatUsageInterval(bar, range)}</td>
              <td>{metric.format(bar.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function UsageTooltip({
  bar,
  metric,
  range,
}: {
  bar: UsageBar;
  metric: Metric;
  range: OverviewRange;
}) {
  return (
    <div className="whitespace-nowrap rounded-lg border border-white/[0.12] bg-[#222225] px-3 py-2 shadow-xl">
      <p className="text-[10px] text-zinc-400">
        {formatUsageInterval(bar, range)}
      </p>
      <p className="mt-1 text-[12px] tabular-nums text-zinc-100">
        {metric.format(bar.value)}{" "}
        <span className="text-zinc-400">{metric.label.toLowerCase()}</span>
      </p>
    </div>
  );
}
