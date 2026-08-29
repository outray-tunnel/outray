import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity03Icon,
  ArrowDown01Icon,
  ChartHistogramIcon,
  Clock01Icon,
  Database02Icon,
  FilterIcon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
  TrendChart,
} from "@/components/observability/observability-ui";
import {
  errorTrend,
  latencyTrend,
  services,
  trafficTrend,
} from "@/components/observability/mock-data";

export const Route = createFileRoute("/$orgSlug/observability/metrics")({
  head: () => ({ meta: [{ title: "Metrics - OutRay Observability" }] }),
  component: MetricsView,
});

const metricOptions = [
  { value: "latency", label: "http.server.duration · p95", unit: "ms", tone: "amber" as const },
  { value: "requests", label: "http.server.requests · rate", unit: "rpm", tone: "violet" as const },
  { value: "errors", label: "http.server.errors · rate", unit: "%", tone: "rose" as const },
];

function MetricsView() {
  const [metric, setMetric] = useState("latency");
  const [service, setService] = useState("all");
  const selectedMetric = metricOptions.find((item) => item.value === metric)!;
  const values = metric === "latency" ? latencyTrend : metric === "errors" ? errorTrend : trafficTrend;

  const serviceRows = useMemo(
    () =>
      services
        .filter((item) => service === "all" || item.id === service)
        .sort((a, b) => b.p95 - a.p95),
    [service],
  );

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Metrics"
        description="Explore service measurements, compare dimensions, and find changes outside the normal baseline."
        action={<TimeRangeControl />}
      />

      <Panel>
        <div className="grid gap-px bg-white/[0.06] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <label className="bg-[#090909] px-5 py-4 sm:px-6">
            <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">
              Metric
            </span>
            <div className="mt-2 flex items-center gap-2">
              <HugeiconsIcon icon={Activity03Icon} size={15} strokeWidth={1.7} className="text-violet-400" />
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value)}
                className="min-w-0 flex-1 appearance-none bg-transparent text-[12px] font-mono text-zinc-300 outline-none"
              >
                {metricOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={1.7} className="text-zinc-700" />
            </div>
          </label>
          <label className="bg-[#090909] px-5 py-4 sm:px-6">
            <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">
              Filter by service
            </span>
            <div className="mt-2 flex items-center gap-2">
              <HugeiconsIcon icon={FilterIcon} size={15} strokeWidth={1.7} className="text-zinc-600" />
              <select
                value={service}
                onChange={(event) => setService(event.target.value)}
                className="min-w-0 flex-1 appearance-none bg-transparent text-[12px] text-zinc-400 outline-none"
              >
                <option value="all">All services</option>
                {services.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={1.7} className="text-zinc-700" />
            </div>
          </label>
          <div className="flex items-center bg-[#090909] px-5 py-4 sm:px-6">
            <button type="button" className="h-9 rounded-lg bg-white px-4 text-[11px] font-medium text-black hover:bg-zinc-200">
              Run query
            </button>
          </div>
        </div>
      </Panel>

      <Panel
        title={selectedMetric.label}
        description={`Aggregated across ${service === "all" ? "all services" : service}`}
        action={<span className="font-mono text-[10px] text-zinc-600">avg {values.at(-1)} {selectedMetric.unit}</span>}
      >
        <div className="flex flex-wrap items-center gap-5 px-5 pt-5 text-[10px] sm:px-6">
          {serviceRows.slice(0, 4).map((item, index) => (
            <span key={item.id} className="flex items-center gap-2 text-zinc-600">
              <span
                className={`size-1.5 rounded-full ${
                  ["bg-violet-400", "bg-cyan-400", "bg-amber-400", "bg-emerald-400"][index]
                }`}
              />
              {item.name}
            </span>
          ))}
        </div>
        <TrendChart values={values} tone={selectedMetric.tone} />
      </Panel>

      <div className="grid gap-7 lg:grid-cols-3">
        <Panel title="Service breakdown" description="Ranked by current value" className="lg:col-span-2">
          <div className="divide-y divide-white/[0.06]">
            {serviceRows.map((item, index) => {
              const value = metric === "latency" ? item.p95 : metric === "errors" ? item.errorRate : item.requestsPerMinute;
              const max = metric === "latency" ? 2000 : metric === "errors" ? 8 : 2500;
              return (
                <div key={item.id} className="grid gap-3 px-5 py-4 sm:px-6 md:grid-cols-[24px_160px_minmax(0,1fr)_90px] md:items-center">
                  <span className="text-[10px] tabular-nums text-zinc-800">{String(index + 1).padStart(2, "0")}</span>
                  <span className="truncate text-[11px] text-zinc-400">{item.name}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className={`h-full rounded-full ${metric === "errors" ? "bg-rose-400/70" : metric === "latency" ? "bg-amber-400/70" : "bg-violet-400/70"}`}
                      style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                    />
                  </div>
                  <span className="text-right font-mono text-[10px] text-zinc-500">
                    {value.toLocaleString()} {selectedMetric.unit}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Metric details" description="OpenTelemetry instrument metadata">
          <div className="space-y-5 p-5 sm:p-6">
            <MetricDetail icon={Database02Icon} label="Source" value="OTLP metrics" />
            <MetricDetail icon={ChartHistogramIcon} label="Instrument" value="Histogram" />
            <MetricDetail icon={Clock01Icon} label="Resolution" value="30 seconds" />
            <div className="border-t border-white/[0.06] pt-5">
              <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">Dimensions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["service.name", "deployment.environment", "http.method", "http.route", "status.code"].map((dimension) => (
                  <span key={dimension} className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-zinc-600">
                    {dimension}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </ObservabilityPage>
  );
}
function MetricDetail({ icon, label, value }: { icon: typeof Database02Icon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-600">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.7} />
      </span>
      <div>
        <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-700">{label}</p>
        <p className="mt-1 text-[11px] text-zinc-400">{value}</p>
      </div>
    </div>
  );
}
