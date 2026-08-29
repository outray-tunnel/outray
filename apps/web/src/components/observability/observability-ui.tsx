import { useId, type ReactNode } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  Clock01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ServiceHealth } from "./mock-data";

export function ObservabilityPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-7xl space-y-7">{children}</div>;
}

export function ObservabilityHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
          {description}
        </p>
      </div>
      {action && <div className="flex shrink-0 items-center">{action}</div>}
    </header>
  );
}

interface TimeRangeOption {
  value: string;
  label: string;
  live?: boolean;
}

const DEFAULT_TIME_RANGES: TimeRangeOption[] = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
];

export function TimeRangeControl({
  value = "24h",
  options = DEFAULT_TIME_RANGES,
  onChange,
}: {
  value?: string;
  options?: TimeRangeOption[];
  onChange?: (value: string) => void;
}) {
  return (
    <div className="flex h-9 items-center rounded-lg border border-white/[0.08] bg-white/[0.025] p-1">
      {options.map((range) => (
        <button
          key={range.value}
          type="button"
          onClick={() => onChange?.(range.value)}
          className={`h-7 rounded-md px-2.5 text-[10px] font-medium transition-colors ${
            value === range.value
              ? "bg-white/[0.09] text-zinc-200"
              : "text-zinc-700 hover:text-zinc-400"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {range.live && (
              <span
                className={`size-1.5 rounded-full ${
                  value === range.value ? "bg-emerald-400" : "bg-zinc-700"
                }`}
              />
            )}
            {range.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-white/[0.07] ${className}`}
    >
      {(title || action) && (
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div>
            {title && (
              <h2 className="text-[13px] font-medium text-zinc-200">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-[10px] text-zinc-700">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const toneStyles = {
  violet: "text-violet-300 bg-violet-400/[0.08]",
  emerald: "text-emerald-300 bg-emerald-400/[0.08]",
  amber: "text-amber-300 bg-amber-400/[0.08]",
  rose: "text-rose-300 bg-rose-400/[0.08]",
};

const chartColors = {
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

export function KpiCard({
  label,
  value,
  detail,
  change,
  direction = "up",
  icon,
  tone = "violet",
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  change: string;
  direction?: "up" | "down";
  icon: IconSvgElement;
  tone?: keyof typeof toneStyles;
  trend: number[];
}) {
  const positive = direction === "up";

  return (
    <div className="min-w-0 px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-700">
            {label}
          </p>
          <p className="mt-2.5 text-2xl font-semibold tracking-[-0.04em] text-zinc-100">
            {value}
          </p>
        </div>
        <span className={`flex size-8 items-center justify-center rounded-lg ${toneStyles[tone]}`}>
          <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div
            className={`flex items-center gap-1 text-[10px] ${
              positive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            <HugeiconsIcon
              icon={positive ? ArrowUpRight01Icon : ArrowDownRight01Icon}
              size={12}
              strokeWidth={1.8}
            />
            {change}
          </div>
          <p className="mt-1 text-[10px] text-zinc-700">{detail}</p>
        </div>
        <Sparkline values={trend} tone={tone} />
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  tone = "violet",
  width = 88,
  height = 30,
}: {
  values: number[];
  tone?: keyof typeof toneStyles;
  width?: number;
  height?: number;
}) {
  const data = values.map((value, index) => ({ index, value }));

  return (
    <LineChart
      width={width}
      height={height}
      data={data}
      margin={{ top: 2, right: 1, bottom: 2, left: 1 }}
      accessibilityLayer
    >
      <Line
        type="monotone"
        dataKey="value"
        stroke={chartColors[tone]}
        strokeWidth={1.5}
        dot={false}
        activeDot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

export function TrendChart({
  values,
  tone = "violet",
  labels = ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM", "Now"],
}: {
  values: number[];
  tone?: "violet" | "emerald" | "amber" | "rose";
  labels?: string[];
}) {
  const gradientId = `trend-${useId().replaceAll(":", "")}`;
  const data = values.map((value, index) => ({ index, value }));
  const ticks = labels.map((_, index) =>
    Math.round((index / Math.max(1, labels.length - 1)) * (values.length - 1)),
  );

  return (
    <div className="px-5 pb-5 pt-6 sm:px-6">
      <div className="h-60 w-full" role="img" aria-label="Telemetry trend over time">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 18, bottom: 0, left: 18 }}
            accessibilityLayer
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColors[tone]} stopOpacity={0.26} />
                <stop offset="100%" stopColor={chartColors[tone]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="rgba(255,255,255,0.045)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, Math.max(0, values.length - 1)]}
              ticks={ticks}
              tickFormatter={(index) => labels[ticks.indexOf(index)] ?? ""}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#3f3f46", fontSize: 9 }}
              dy={10}
              interval={0}
            />
            <YAxis hide domain={["dataMin - 5%", "dataMax + 5%"]} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.12)", strokeDasharray: "3 3" }}
              labelFormatter={(index) => {
                const nearestTick = ticks.reduce((nearest, tick) =>
                  Math.abs(tick - Number(index)) < Math.abs(nearest - Number(index))
                    ? tick
                    : nearest,
                ticks[0] ?? 0);
                return labels[ticks.indexOf(nearestTick)] ?? "Telemetry";
              }}
              contentStyle={{
                background: "#111111",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "#d4d4d8",
                fontSize: 11,
              }}
              itemStyle={{ color: chartColors[tone] }}
              labelStyle={{ color: "#71717a", marginBottom: 4 }}
              formatter={(value) => [Number(value).toLocaleString(), "Value"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={chartColors[tone]}
              strokeWidth={1.75}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 3, fill: chartColors[tone], stroke: "#090909", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const healthStyles: Record<ServiceHealth, string> = {
  healthy: "text-emerald-400",
  degraded: "text-amber-400",
  critical: "text-rose-400",
};

export function HealthPill({ health }: { health: ServiceHealth }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[10px] capitalize ${healthStyles[health]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {health}
    </span>
  );
}

export function Freshness() {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-zinc-700">
      <HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={1.7} />
      Updated now
    </span>
  );
}

export function ObservabilitySkeleton() {
  return (
    <ObservabilityPage>
      <div className="animate-pulse space-y-7" aria-busy="true">
        <header className="border-b border-white/[0.07] pb-7">
          <div className="h-7 w-36 rounded bg-white/[0.07]" />
          <div className="mt-3 h-3 w-80 max-w-full rounded bg-white/[0.04]" />
        </header>
        <div className="grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="border-b border-white/[0.07] px-6 py-6 xl:border-b-0 xl:border-r last:border-r-0">
              <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
              <div className="mt-4 h-7 w-24 rounded bg-white/[0.07]" />
              <div className="mt-5 h-2.5 w-16 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
        <div className="grid gap-7 lg:grid-cols-3">
          <div className="h-96 rounded-xl border border-white/[0.07] bg-white/[0.015] lg:col-span-2" />
          <div className="h-96 rounded-xl border border-white/[0.07] bg-white/[0.015]" />
        </div>
      </div>
    </ObservabilityPage>
  );
}
