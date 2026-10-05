import { useId, useMemo, useRef, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, type MouseHandlerDataParam,
} from "recharts";
import {
  formatMetricChartTime, formatMetricCount, formatMetricDateTime,
  formatMetricValue, metricAggregationLabel, metricValueUnit,
  parseMetricTimestamp, type MetricPoint, type MetricsRange,
  buildMetricChartSeries, metricChartInspectionIndex, metricChartValueDomain, METRIC_BUCKET_MS,
} from "./metrics-data";

function sampleLabel(point: MetricPoint) {
  if (!Number.isSafeInteger(point.sampleCount) || point.sampleCount < 0) return "Sample count unavailable";
  return `${formatMetricCount(point.sampleCount)} ${point.sampleCount === 1 ? "sample" : "samples"}`;
}

function pointIdentity(point: MetricPoint) {
  return JSON.stringify([parseMetricTimestamp(point.timestamp), point.aggregation, point.type]);
}

export function MetricChartReadout({ point, unit, plottedAggregation }: {
  point: MetricPoint | null;
  unit: string;
  plottedAggregation: string;
}) {
  if (!point) {
    return <p className="text-[11px] text-zinc-500">Hover or use arrow keys to inspect values.</p>;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
      <time dateTime={new Date(parseMetricTimestamp(point.timestamp)).toISOString()} className="text-zinc-400">
        {formatMetricDateTime(point.timestamp)}
      </time>
      <span className="font-medium tabular-nums text-zinc-200">
        {formatMetricValue(point.value, metricValueUnit(unit, point.aggregation))}
      </span>
      <span className="text-zinc-500">{sampleLabel(point)} · {metricAggregationLabel(point.aggregation)}</span>
      {point.aggregation !== plottedAggregation && <span className="text-zinc-500">Not plotted on this scale</span>}
    </div>
  );
}

export function MetricsChart({ points, unit, range, metricName }: {
  points: MetricPoint[];
  unit: string;
  range: MetricsRange;
  metricName: string;
}) {
  const series = useMemo(() => buildMetricChartSeries(points, range), [points, range]);
  const scope = JSON.stringify([metricName, unit, range]);
  const [inspection, setInspection] = useState<{
    scope: string;
    hover: string | null;
    keyboard: string | null;
  }>(() => ({ scope, hover: null, keyboard: null }));
  const current = inspection.scope === scope;
  const findPoint = (identity: string | null) => {
    if (!identity) return null;
    const index = series.observations.findIndex((point) => pointIdentity(point) === identity);
    return index < 0 ? null : index;
  };
  const hover = current ? findPoint(inspection.hover) : null;
  const keyboard = current ? findPoint(inspection.keyboard) : null;
  const selected = series.observations[hover ?? keyboard ?? -1] ?? null;
  // Keep a stationary inspection on the same real bucket during refreshes.
  // Removing that bucket clears its identity so later data cannot resurrect it.
  if (!current || (inspection.hover !== null && hover === null) || (inspection.keyboard !== null && keyboard === null)) {
    setInspection({
      scope,
      hover: hover === null ? null : inspection.hover,
      keyboard: keyboard === null ? null : inspection.keyboard,
    });
  }
  const pointerFocus = useRef(false);
  const hintId = useId();
  const gradientId = `metric-${useId().replaceAll(":", "")}`;
  const valueUnit = metricValueUnit(unit, series.aggregation);
  const firstTime = series.data.at(0)?.time ?? 0;
  const lastTime = series.data.at(-1)?.time ?? firstTime;
  const timeDomain: [number, number] = firstTime === lastTime
    ? [firstTime - METRIC_BUCKET_MS[range] / 2, lastTime + METRIC_BUCKET_MS[range] / 2]
    : [firstTime, lastTime];
  const inspect = (kind: "hover" | "keyboard", index: number | null) => {
    const point = index === null ? undefined : series.observations[index];
    const identity = point ? pointIdentity(point) : null;
    setInspection((previous) => {
      const next = { scope, hover: kind === "hover" ? identity : null, keyboard: kind === "keyboard" ? identity : null };
      return previous.scope === scope && previous.hover === next.hover && previous.keyboard === next.keyboard ? previous : next;
    });
  };
  const clearInspection = () => inspect("hover", null);
  const handleChartHover = (event: MouseHandlerDataParam) => {
    const index = event.isTooltipActive ? Number(event.activeTooltipIndex) : NaN;
    const datum = Number.isInteger(index) ? series.data[index] : undefined;
    inspect("hover", datum?.pointIndex ?? null);
  };

  if (!series.observations.length) {
    return <div role="status" className="flex h-[220px] items-center justify-center px-4 text-[12px] text-zinc-500">No observations in this period.</div>;
  }

  return (
    <section aria-label={`${metricName} metric history`} className="min-w-0">
      <div className="flex h-[60px] items-center border-b border-white/[0.05] px-4 py-2 sm:h-11 sm:px-5">
        <MetricChartReadout point={selected} unit={unit} plottedAggregation={series.aggregation} />
      </div>
      <p id={hintId} className="sr-only">
        {series.observations.length} recorded points. Use Left and Right arrow keys to inspect points.
        Home and End jump to the first and last observation. Escape clears inspection.
        Missing intervals are gaps, not zeroes.
      </p>
      <div
        role="group" tabIndex={series.observations.length ? 0 : undefined}
        aria-label={`Inspect ${metricName} values`} aria-describedby={hintId}
        className="relative mx-3 mt-4 h-[220px] rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:mx-4"
        onPointerDown={() => { pointerFocus.current = true; }}
        onFocus={() => { if (!pointerFocus.current) inspect("keyboard", series.observations.length - 1); }}
        onBlur={() => { pointerFocus.current = false; clearInspection(); }}
        onPointerLeave={clearInspection}
        onMouseLeave={clearInspection}
        onKeyDown={(event) => {
          const next = metricChartInspectionIndex(hover ?? keyboard, event.key, series.observations.length);
          if (next === undefined) return;
          event.preventDefault();
          pointerFocus.current = false;
          inspect("keyboard", next);
        }}
      >
        <div className="h-full w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} initialDimension={{ width: 640, height: 220 }}>
            <AreaChart data={series.data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
              accessibilityLayer={false} onMouseMove={handleChartHover} onMouseLeave={clearInspection}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a1a1aa" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#a1a1aa" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.055)" />
              <XAxis dataKey="time" type="number" domain={timeDomain} tickCount={5} minTickGap={28}
                tickFormatter={(value: number) => formatMetricChartTime(new Date(value).toISOString(), range)}
                axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 10 }} tickMargin={10} />
              <YAxis domain={metricChartValueDomain(series.data)} width={65} tickCount={4}
                tickFormatter={(value: number) => formatMetricValue(value, valueUnit)}
                axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 10 }} tickMargin={8} />
              <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
              <Area type="linear" dataKey="value" stroke="#a1a1aa" strokeWidth={1.75}
                fill={`url(#${gradientId})`} connectNulls={false} isAnimationActive={false}
                dot={({ index, cx, cy }) => {
                  const datum = series.data[index];
                  if (datum?.value == null || cx === undefined || cy === undefined) return null;
                  const hasNeighbour = series.data[index - 1]?.value != null || series.data[index + 1]?.value != null;
                  return hasNeighbour ? null : <circle cx={cx} cy={cy} r={3} fill="#d4d4d8" stroke="#111112" />;
                }} activeDot={false} />
              {selected && <ReferenceLine x={parseMetricTimestamp(selected.timestamp)} stroke="#71717a" strokeDasharray="3 3" />}
              {selected?.aggregation === series.aggregation && <ReferenceDot
                x={parseMetricTimestamp(selected.timestamp)} y={selected.value} r={4}
                fill="#e4e4e7" stroke="#111112" strokeWidth={2} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {keyboard !== null && selected
            ? `${formatMetricDateTime(selected.timestamp)}: ${formatMetricValue(selected.value, metricValueUnit(unit, selected.aggregation))}. ${sampleLabel(selected)}. ${metricAggregationLabel(selected.aggregation)}.`
            : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-4 pt-2 text-[10px] text-zinc-500 sm:px-5">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-px w-3 bg-zinc-400" />{metricAggregationLabel(series.aggregation)}{valueUnit ? ` · ${valueUnit}` : ""}</span>
        {series.excludedAggregations.length > 0 && <span>
          Showing {metricAggregationLabel(series.aggregation).toLowerCase()}; buckets reported as {series.excludedAggregations.map((aggregation) => metricAggregationLabel(aggregation).toLowerCase()).join(", ")} are not plotted on this scale.
        </span>}
        <span>Missing intervals stay empty.</span>
      </div>
    </section>
  );
}
