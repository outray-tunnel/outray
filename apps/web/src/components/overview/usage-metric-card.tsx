import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { TunnelStatsRange } from "@/lib/tunnel-stats-range";
import { UsageNumber } from "./usage-number";
import type { UsageNumberConfig } from "./usage-number-format";
import { createUsageHoverScheduler } from "./usage-hover";
import {
  formatUsageInterval, hoverUsageBarIndex, inspectedUsageBar, nextUsageBarIndex,
} from "./usage-bars";

export type OverviewRange = TunnelStatsRange | "6h";

export interface UsageMetricBar {
  startTime: string;
  endTime: string;
  value: number | null;
}

export interface UsageCardMetric {
  key: string;
  label: string;
  description: string;
  value: number | null;
  format: (value: number | null) => string;
  numberConfig?: (value: number) => UsageNumberConfig;
  emptyLabel?: string;
  /** A measured zero rate is evidence, unlike an empty request-count series. */
  zeroIsActivity?: boolean;
}

const rangeLabels: Record<OverviewRange, string> = {
  "1h": "Last hour", "6h": "Last 6 hours", "24h": "Last 24 hours",
  "7d": "Last 7 days", "30d": "Last 30 days",
};

export function UsageMetricCard({
  metric,
  range,
  bars,
}: {
  metric: UsageCardMetric;
  range: OverviewRange;
  bars: UsageMetricBar[];
}) {
  const [inspection, setInspection] = useState<{
    bars: UsageMetricBar[];
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
  // Missing evidence in an inspected interval is not the whole-period total.
  const displayValue = activeBar ? activeBar.value : metric.value;

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
      className="flex h-[180px] min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#111112] p-4 transition-colors duration-150 hover:border-white/[0.13] hover:bg-[#141415] motion-reduce:transition-none"
    >
      <h3 className="text-[12px] font-normal text-zinc-400">{metric.label}</h3>
      <p
        data-usage-value={metric.format(displayValue)}
        className="mt-1.5 h-8 text-[24px] font-normal leading-8 tracking-[-0.035em] tabular-nums text-zinc-100"
      >
        <UsageNumber value={displayValue} metric={metric.key}
          numberConfig={metric.numberConfig} missingLabel={metric.format(null)} />
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
  metric: UsageCardMetric;
  range: OverviewRange;
  bars: UsageMetricBar[];
  hoverIndex: number | null;
  keyboardIndex: number | null;
  onHoverIndexChange: (index: number | null) => void;
  onKeyboardIndexChange: (index: number | null) => void;
  onResetInspection: () => void;
}) {
  const hintId = useId();
  const pointerFocus = useRef(false);
  const pointerInside = useRef(false);
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
  const leaveChart = () => {
    pointerInside.current = false;
    resetInspection();
  };
  const activeIndex = hoverIndex ?? keyboardIndex;
  const keyboardBar = keyboardIndex === null ? null : bars[keyboardIndex];
  const hasActivity = bars.some((bar) => bar.value !== null &&
    (metric.zeroIsActivity || bar.value > 0));
  const emptyLabel = metric.emptyLabel ?? "No activity in this period";

  if (!hasActivity) {
    return (
      <div
        className="relative mt-auto flex h-16 items-center justify-center"
        aria-label={`${metric.label}: ${emptyLabel.toLowerCase()}`}
      >
        <p className="text-center text-[10px] text-zinc-600">
          {emptyLabel}
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
        onPointerEnter={() => { pointerInside.current = true; }}
        onMouseEnter={() => { pointerInside.current = true; }}
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
        onMouseLeave={leaveChart}
        onPointerLeave={leaveChart}
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
            onMouseMove={(state) => {
              // Recharts schedules chart events; a queued move cannot revive a
              // hover after the pointer has already left the chart area.
              if (!pointerInside.current) return;
              hoverScheduler.inspect(state.isTooltipActive
                ? hoverUsageBarIndex(state.activeTooltipIndex, bars.length)
                : null);
            }}
          >
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              shared={true}
              filterNull={false}
              cursor={hoverIndex === null ? false : { fill: "rgba(255,255,255,0.06)", stroke: "none" }}
              wrapperStyle={{
                pointerEvents: "none",
                outline: "none",
                zIndex: 20,
              }}
              isAnimationActive={false}
              content={({ active }) => {
                const bar = hoverIndex === null ? undefined : bars[hoverIndex];
                return active && bar ? (
                  <UsageTooltip bar={bar} metric={metric} range={range} />
                ) : null;
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              minPointSize={metric.zeroIsActivity
                ? (value, index) => bars[index]?.value !== null && typeof value === "number" ? 2 : 0
                : 0}
              // Stable shapes keep hover hit targets from moving during number updates.
              isAnimationActive={false}
            >
              {bars.map((bar, index) => (
                <Cell
                  key={bar.startTime}
                  className="transition-[fill] duration-100 motion-reduce:transition-none"
                  fill={activeIndex === index ? "#d4d4d8" : "#52525b"}
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
  bar: UsageMetricBar;
  metric: UsageCardMetric;
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
