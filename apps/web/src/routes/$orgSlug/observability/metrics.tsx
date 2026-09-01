import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Activity03Icon from "@hugeicons-pro/core-stroke-rounded/Activity03Icon";
import ChartHistogramIcon from "@hugeicons-pro/core-stroke-rounded/ChartHistogramIcon";
import Clock01Icon from "@hugeicons-pro/core-stroke-rounded/Clock01Icon";
import Database02Icon from "@hugeicons-pro/core-stroke-rounded/Database02Icon";
import FilterIcon from "@hugeicons-pro/core-stroke-rounded/FilterIcon";
import PauseIcon from "@hugeicons-pro/core-stroke-rounded/PauseIcon";
import PlayIcon from "@hugeicons-pro/core-stroke-rounded/PlayIcon";
import {
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
  TrendChart,
} from "@/components/observability/observability-ui";
import { Select } from "@/components/ui/select";

interface MetricMetadata {
  key: string;
  name: string;
  description: string;
  unit: string;
  type: string;
  aggregationTemporality: string;
  isMonotonic: boolean;
  firstSeen: string;
  lastSeen: string;
  dataPointCount: number;
  serviceCount: number;
  dimensions: string[];
}

interface MetricPoint {
  timestamp: string;
  type: string;
  value: number;
  sampleCount: number;
  aggregation: string;
}

interface MetricServiceValue {
  service: string;
  type: string;
  value: number;
  sampleCount: number;
  lastSeen: string;
  aggregation: string;
}

interface MetricsResponse {
  metrics: MetricMetadata[];
  selectedMetric: MetricMetadata | null;
  services: string[];
  points: MetricPoint[];
  breakdown: MetricServiceValue[];
  range: string;
}

export const Route = createFileRoute("/$orgSlug/observability/metrics")({
  head: () => ({ meta: [{ title: "Metrics - OutRay Observability" }] }),
  component: MetricsView,
});

const timeRanges = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

function MetricsView() {
  const { orgSlug } = Route.useParams();
  const [metricKey, setMetricKey] = useState("");
  const [service, setService] = useState("all");
  const [timeRange, setTimeRange] = useState("1h");
  const [isLive, setIsLive] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let requestGeneration = 0;
    let refreshTimeout: number | undefined;
    const parameters = new URLSearchParams({ range: timeRange });
    if (metricKey) parameters.set("metric_key", metricKey);
    if (service !== "all") parameters.set("service", service);

    const loadMetrics = async () => {
      const generation = ++requestGeneration;
      try {
        const response = await fetch(
          `/api/${orgSlug}/observability/metrics?${parameters}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load metrics");

        const nextData = (await response.json()) as MetricsResponse;
        if (disposed || generation !== requestGeneration) return;
        setData(nextData);
        setMetricKey((current) => {
          const selected = nextData.selectedMetric?.key || "";
          return current === selected ? current : selected;
        });
        setService((current) =>
          current === "all" || nextData.services.includes(current)
            ? current
            : "all",
        );
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        if (disposed || generation !== requestGeneration) return;
        setError("Metric data is temporarily unavailable.");
      } finally {
        if (!disposed && generation === requestGeneration) {
          setLoading(false);
          if (isLive) {
            refreshTimeout = window.setTimeout(() => void loadMetrics(), 4_000);
          }
        }
      }
    };

    void loadMetrics();

    return () => {
      disposed = true;
      requestGeneration += 1;
      controller.abort();
      if (refreshTimeout !== undefined) {
        window.clearTimeout(refreshTimeout);
      }
    };
  }, [isLive, metricKey, orgSlug, reloadKey, service, timeRange]);

  const selectedMetric = data?.selectedMetric || null;
  const values = useMemo(
    () => data?.points.map((point) => point.value) || [],
    [data?.points],
  );
  const chartLabels = useMemo(
    () => buildChartLabels(data?.points || [], timeRange),
    [data?.points, timeRange],
  );
  const latestPoint = data?.points.at(-1);
  const sampleCount =
    data?.points.reduce((total, point) => total + point.sampleCount, 0) || 0;
  const metricNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data?.metrics || []) {
      counts.set(item.name, (counts.get(item.name) || 0) + 1);
    }
    return counts;
  }, [data?.metrics]);

  function beginQuery() {
    setData(null);
    setError(null);
    setLoading(true);
  }

  function changeMetric(value: string) {
    if (value === metricKey && service === "all") return;
    beginQuery();
    setMetricKey(value);
    setService("all");
  }

  function changeService(value: string) {
    if (value === service) return;
    beginQuery();
    setService(value);
  }

  function changeTimeRange(value: string) {
    if (value === timeRange) return;
    beginQuery();
    setTimeRange(value);
  }

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Metrics"
        description="Explore measurements reported by your services and compare their values over time."
        action={
          <div className="flex items-center gap-2">
            <TimeRangeControl
              value={timeRange}
              options={timeRanges}
              onChange={changeTimeRange}
            />
            <button
              type="button"
              onClick={() => setIsLive((value) => !value)}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-medium transition-colors ${
                isLive
                  ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-400"
                  : "border-white/[0.08] text-zinc-600"
              }`}
            >
              <HugeiconsIcon
                icon={isLive ? PauseIcon : PlayIcon}
                size={13}
                strokeWidth={1.8}
              />
              {isLive ? "Live" : "Paused"}
            </button>
          </div>
        }
      />

      <Panel>
        <div className="grid gap-px bg-white/[0.06] md:grid-cols-2">
          <div className="bg-[#090909] px-5 py-4 sm:px-6">
            <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">
              Metric
            </span>
            <Select
              value={metricKey || selectedMetric?.key || ""}
              onChange={changeMetric}
              ariaLabel="Metric"
              disabled={!data?.metrics.length}
              icon={
                <HugeiconsIcon
                  icon={Activity03Icon}
                  size={15}
                  strokeWidth={1.7}
                  className="text-violet-400"
                />
              }
              options={(data?.metrics || []).map((item) => ({
                value: item.key,
                label: metricOptionLabel(
                  item,
                  (metricNameCounts.get(item.name) || 0) > 1,
                ),
                description: metricOptionDescription(item),
                className: "font-mono text-zinc-300",
              }))}
              className="mt-1"
              triggerClassName="h-9 border-0 bg-transparent px-0 hover:bg-transparent"
            />
          </div>
          <div className="bg-[#090909] px-5 py-4 sm:px-6">
            <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">
              Filter by service
            </span>
            <Select
              value={service}
              onChange={changeService}
              ariaLabel="Filter metrics by service"
              disabled={!data?.services.length}
              icon={
                <HugeiconsIcon
                  icon={FilterIcon}
                  size={15}
                  strokeWidth={1.7}
                  className="text-zinc-600"
                />
              }
              options={[
                { value: "all", label: "All services" },
                ...(data?.services || []).map((item) => ({
                  value: item,
                  label: item,
                })),
              ]}
              className="mt-1"
              triggerClassName="h-9 border-0 bg-transparent px-0 hover:bg-transparent"
            />
          </div>
        </div>
      </Panel>

      {loading && !data ? (
        <MetricsSkeleton />
      ) : error && !data ? (
        <MetricsMessage
          title="Metrics unavailable"
          detail={error}
          action={
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                setReloadKey((value) => value + 1);
              }}
              className="mt-5 h-9 rounded-lg bg-white px-4 text-[10px] font-medium text-black hover:bg-zinc-200"
            >
              Try again
            </button>
          }
        />
      ) : !selectedMetric ? (
        <MetricsMessage
          title="No metrics found"
          detail="Metrics sent through OTLP will appear here as soon as they are received."
        />
      ) : (
        <>
          {error && (
            <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-5 py-3 text-[10px] text-amber-400/80">
              Live refresh failed. Showing the most recently loaded data.
            </div>
          )}

          <Panel
            title={selectedMetric.name}
            description={
              selectedMetric.description ||
              `${formatMetricType(selectedMetric.type)} metric${selectedMetric.unit ? ` · ${selectedMetric.unit}` : ""}`
            }
            action={
              latestPoint ? (
                <span className="font-mono text-[10px] text-zinc-500">
                  {formatMetricValue(
                    latestPoint.value,
                    metricValueUnit(
                      selectedMetric.unit,
                      latestPoint.aggregation,
                    ),
                  )}
                </span>
              ) : null
            }
          >
            {values.length ? (
              <>
                <div className="flex flex-wrap items-center gap-5 px-5 pt-5 text-[10px] sm:px-6">
                  <span className="flex items-center gap-2 text-zinc-600">
                    <span className="size-1.5 rounded-full bg-violet-400" />
                    {service === "all" ? "All services" : service}
                  </span>
                  <span className="font-mono text-zinc-700">
                    {sampleCount.toLocaleString()} data points
                  </span>
                </div>
                <TrendChart
                  values={values}
                  labels={chartLabels}
                  tone={metricTone(selectedMetric.type)}
                />
              </>
            ) : (
              <div className="px-6 py-20 text-center">
                <p className="text-[12px] font-medium text-zinc-400">
                  No data points in this range
                </p>
                <p className="mt-2 text-[10px] text-zinc-700">
                  Choose another time range or service to continue.
                </p>
              </div>
            )}
          </Panel>

          <div className="grid gap-7 lg:grid-cols-3">
            <Panel
              title="Service breakdown"
              description="Values aggregated across the selected time range"
              className="lg:col-span-2"
            >
              {data.breakdown.length ? (
                <div className="divide-y divide-white/[0.06]">
                  {data.breakdown.map((item, index) => {
                    const largestValue = Math.max(
                      ...data.breakdown.map((row) => Math.abs(row.value)),
                      0,
                    );
                    const width = largestValue
                      ? (Math.abs(item.value) / largestValue) * 100
                      : 0;
                    return (
                      <div
                        key={item.service}
                        className="grid gap-3 px-5 py-4 sm:px-6 md:grid-cols-[24px_160px_minmax(0,1fr)_120px] md:items-center"
                      >
                        <span className="text-[10px] tabular-nums text-zinc-800">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate text-[11px] text-zinc-400">
                          {item.service}
                        </span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                          <div
                            className="h-full rounded-full bg-violet-400/70"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className="text-right font-mono text-[10px] text-zinc-500">
                          {formatMetricValue(
                            item.value,
                            metricValueUnit(
                              selectedMetric.unit,
                              item.aggregation,
                            ),
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-6 py-16 text-center text-[10px] text-zinc-700">
                  No service values were reported in this range.
                </div>
              )}
            </Panel>

            <Panel
              title="Metric details"
              description="OpenTelemetry instrument metadata"
            >
              <div className="space-y-5 p-5 sm:p-6">
                <MetricDetail
                  icon={Database02Icon}
                  label="Instrument"
                  value={formatMetricType(selectedMetric.type)}
                />
                <MetricDetail
                  icon={ChartHistogramIcon}
                  label="Temporality"
                  value={
                    formatMetricType(selectedMetric.aggregationTemporality) ||
                    "—"
                  }
                />
                <MetricDetail
                  icon={Activity03Icon}
                  label="Unit"
                  value={selectedMetric.unit || "—"}
                />
                <MetricDetail
                  icon={Clock01Icon}
                  label="Last seen"
                  value={formatDateTime(selectedMetric.lastSeen)}
                />
                {selectedMetric.type === "sum" && (
                  <MetricDetail
                    icon={Activity03Icon}
                    label="Monotonic"
                    value={selectedMetric.isMonotonic ? "Yes" : "No"}
                  />
                )}
                <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-5">
                  <MetricCount
                    label="Data points"
                    value={selectedMetric.dataPointCount}
                  />
                  <MetricCount
                    label="Services"
                    value={selectedMetric.serviceCount}
                  />
                </div>
                {selectedMetric.dimensions.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-5">
                    <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-700">
                      Dimensions
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedMetric.dimensions.map((dimension) => (
                        <span
                          key={dimension}
                          className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-zinc-600"
                        >
                          {dimension}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
    </ObservabilityPage>
  );
}

function MetricsSkeleton() {
  return (
    <div className="animate-pulse space-y-7" aria-busy="true">
      <div className="h-[340px] rounded-xl border border-white/[0.07] bg-white/[0.012] p-6">
        <div className="h-3 w-52 rounded bg-white/[0.07]" />
        <div className="mt-3 h-2.5 w-72 max-w-full rounded bg-white/[0.04]" />
        <div className="mt-16 h-48 rounded-lg bg-white/[0.025]" />
      </div>
      <div className="grid gap-7 lg:grid-cols-3">
        <div className="h-80 rounded-xl border border-white/[0.07] bg-white/[0.012] lg:col-span-2" />
        <div className="h-80 rounded-xl border border-white/[0.07] bg-white/[0.012]" />
      </div>
    </div>
  );
}

function MetricsMessage({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel>
      <div className="px-6 py-24 text-center">
        <p className="text-[13px] font-medium text-zinc-300">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-[10px] leading-5 text-zinc-700">
          {detail}
        </p>
        {action}
      </div>
    </Panel>
  );
}

function MetricDetail({
  icon,
  label,
  value,
}: {
  icon: typeof Database02Icon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-600">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-700">
          {label}
        </p>
        <p className="mt-1 truncate text-[11px] text-zinc-400">{value}</p>
      </div>
    </div>
  );
}

function MetricCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/[0.025] p-3">
      <p className="text-[9px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </p>
      <p className="mt-2 font-mono text-[11px] text-zinc-400">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function buildChartLabels(points: MetricPoint[], range: string) {
  if (!points.length) return [];
  const labelCount = Math.min(7, points.length);
  return Array.from({ length: labelCount }, (_, index) => {
    const pointIndex = Math.round(
      (index / Math.max(1, labelCount - 1)) * (points.length - 1),
    );
    return formatChartTime(points[pointIndex]?.timestamp || "", range);
  });
}

function formatChartTime(value: string, range: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (range === "7d" || range === "30d") {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleString();
}

function formatMetricType(value: string) {
  if (!value) return "";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function metricOptionLabel(metric: MetricMetadata, duplicateName: boolean) {
  if (!duplicateName) return metric.name;
  return `${metric.name} · ${metricDescriptor(metric).join(" · ")}`;
}

function metricOptionDescription(metric: MetricMetadata) {
  const descriptor = metricDescriptor(metric).join(" · ");
  return metric.description
    ? `${metric.description} · ${descriptor}`
    : descriptor;
}

function metricDescriptor(metric: MetricMetadata) {
  return [
    formatMetricType(metric.type),
    metric.unit || "unitless",
    formatMetricType(metric.aggregationTemporality),
    metric.isMonotonic ? "monotonic" : "non-monotonic",
  ];
}

function formatMetricValue(value: number, unit: string) {
  const absolute = Math.abs(value);
  const formatted = value.toLocaleString(undefined, {
    maximumFractionDigits: absolute > 0 && absolute < 0.01 ? 6 : 3,
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

function metricValueUnit(unit: string, aggregation: string) {
  return aggregation === "count" ? "observations" : unit;
}

function metricTone(type: string): "violet" | "emerald" | "amber" | "rose" {
  if (type === "gauge") return "emerald";
  if (type === "histogram" || type === "exponential_histogram") return "amber";
  if (type === "summary") return "rose";
  return "violet";
}
