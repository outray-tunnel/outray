import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Activity03Icon,
  Alert02Icon,
  Clock01Icon,
  Pulse02Icon,
  ServerStack01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  HealthPill,
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
  TrendChart,
} from "@/components/observability/observability-ui";

type ServiceHealth = "healthy" | "degraded" | "critical";

interface ServiceSummary {
  id: string;
  name: string;
  environment: string;
  region: string;
  operationCount: number;
  errorRate: number;
  p95Duration: number;
  operationsPerMinute: number;
  usesServerSpans: boolean;
  health: ServiceHealth;
}

interface ServiceOverviewResponse {
  services: ServiceSummary[];
  traffic: Array<{
    timestamp: string;
    operationCount: number;
    errorRate: number;
    p95Duration: number | null;
    operationsPerMinute: number;
  }>;
  summary: {
    serviceCount: number;
    totalOperations: number;
    totalErrors: number;
    errorRate: number;
    operationsPerMinute: number;
    attentionCount: number;
  };
}

export const Route = createFileRoute("/$orgSlug/observability/")({
  head: () => ({ meta: [{ title: "Observability - OutRay" }] }),
  component: ObservabilityOverview,
});

function ObservabilityOverview() {
  const { orgSlug } = Route.useParams();
  const [timeRange, setTimeRange] = useState("24h");
  const [data, setData] = useState<ServiceOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let nextPoll: number | undefined;

    const loadOverview = async () => {
      try {
        const response = await fetch(
          `/api/${orgSlug}/observability/services?range=${timeRange}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load service telemetry");
        setData((await response.json()) as ServiceOverviewResponse);
        setLastSuccessAt(Date.now());
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        )
          return;
        setError("Service telemetry is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          nextPoll = window.setTimeout(() => void loadOverview(), 5_000);
        }
      }
    };

    void loadOverview();
    return () => {
      controller.abort();
      if (nextPoll) window.clearTimeout(nextPoll);
    };
  }, [orgSlug, timeRange]);

  function changeTimeRange(value: string) {
    if (value === timeRange) return;
    setData(null);
    setLastSuccessAt(null);
    setLoading(true);
    setError(null);
    setTimeRange(value);
  }

  const services = data?.services || [];
  const traffic = data?.traffic || [];
  const attentionServices = services.filter(
    (service) => service.health !== "healthy",
  );
  const latestTraffic = traffic
    .filter((point) => point.operationCount > 0 && point.p95Duration !== null)
    .at(-1);

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Overview"
        description="Trace-derived health, throughput, and latency across every reporting service."
        action={
          <TimeRangeControl value={timeRange} onChange={changeTimeRange} />
        }
      />

      {error && data && (
        <StaleNotice error={error} lastSuccessAt={lastSuccessAt} />
      )}

      {loading && !data ? (
        <OverviewSkeleton />
      ) : error && !data ? (
        <div className="rounded-xl border border-rose-400/15 px-6 py-14 text-center text-xs text-rose-400">
          {error}
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-white/[0.07] px-6 py-16 text-center">
          <p className="text-sm font-medium text-zinc-300">
            No services reported in this range
          </p>
          <p className="mt-2 text-xs text-zinc-700">
            Services appear here after OutRay receives their spans.
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewMetric
              icon={Pulse02Icon}
              label="Operations"
              value={(data?.summary.totalOperations || 0).toLocaleString()}
              detail={`Observed in the last ${timeRange}`}
            />
            <OverviewMetric
              icon={Alert02Icon}
              label="Error rate"
              value={`${formatNumber(data?.summary.errorRate || 0)}%`}
              detail={`${(data?.summary.totalErrors || 0).toLocaleString()} errored operations`}
              tone={(data?.summary.errorRate || 0) >= 2 ? "rose" : "emerald"}
            />
            <OverviewMetric
              icon={Clock01Icon}
              label="Latest P95"
              value={
                latestTraffic?.p95Duration === null || !latestTraffic
                  ? "—"
                  : formatDuration(latestTraffic.p95Duration)
              }
              detail="Across the latest traffic bucket"
              tone={
                (latestTraffic?.p95Duration || 0) >= 750 ? "amber" : "violet"
              }
            />
            <OverviewMetric
              icon={ServerStack01Icon}
              label="Reporting services"
              value={(data?.summary.serviceCount || 0).toLocaleString()}
              detail={`${data?.summary.attentionCount || 0} need attention`}
              tone={
                (data?.summary.attentionCount || 0) > 0 ? "amber" : "emerald"
              }
            />
          </section>

          <div className="grid gap-7 lg:grid-cols-3">
            <Panel
              title="Operation volume"
              description="Average operations per minute from received spans"
              action={
                <span className="text-[10px] text-zinc-700">
                  {error
                    ? "Data may be stale"
                    : formatLastSuccess(lastSuccessAt)}
                </span>
              }
              className="lg:col-span-2"
            >
              {traffic.length ? (
                <TrendChart
                  values={traffic.map((point) => point.operationsPerMinute)}
                  labels={chartLabels(traffic)}
                />
              ) : (
                <EmptyPanel message="No traffic points in this range." />
              )}
            </Panel>

            <Panel
              title="Service health"
              description={`${services.length} reporting ${services.length === 1 ? "service" : "services"}`}
              action={
                <Link
                  to="/$orgSlug/observability/services"
                  params={{ orgSlug }}
                  className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-300"
                >
                  View all
                </Link>
              }
            >
              <div className="divide-y divide-white/[0.06]">
                {services.slice(0, 5).map((service) => (
                  <Link
                    key={service.id}
                    to="/$orgSlug/observability/services/$serviceId"
                    params={{ orgSlug, serviceId: service.id }}
                    className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:px-6"
                  >
                    <span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-600">
                      <HugeiconsIcon
                        icon={ServerStack01Icon}
                        size={16}
                        strokeWidth={1.7}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-300">
                        {service.name}
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-700">
                        {formatDuration(service.p95Duration)} p95 ·{" "}
                        {formatNumber(service.operationsPerMinute)} opm
                      </p>
                    </div>
                    <HealthPill health={service.health} />
                  </Link>
                ))}
              </div>
            </Panel>
          </div>

          <Panel
            title="Needs attention"
            description="Services crossing the trace-derived health thresholds"
          >
            {attentionServices.length ? (
              <div className="divide-y divide-white/[0.06]">
                {attentionServices.map((service) => (
                  <Link
                    key={service.id}
                    to="/$orgSlug/observability/services/$serviceId"
                    params={{ orgSlug, serviceId: service.id }}
                    className="flex items-center justify-between gap-4 px-5 py-5 transition-colors hover:bg-white/[0.02] sm:px-6"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <HugeiconsIcon
                        icon={Activity03Icon}
                        size={16}
                        strokeWidth={1.7}
                        className="text-zinc-600"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-zinc-300">
                          {service.name}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-700">
                          Error rate {formatNumber(service.errorRate)}% · p95{" "}
                          {formatDuration(service.p95Duration)}
                        </p>
                      </div>
                    </div>
                    <HealthPill health={service.health} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyPanel message="All reporting services are within the current health thresholds." />
            )}
          </Panel>
        </>
      )}
    </ObservabilityPage>
  );
}

function OverviewMetric({
  icon,
  label,
  value,
  detail,
  tone = "violet",
}: {
  icon: IconSvgElement;
  label: string;
  value: string;
  detail: string;
  tone?: "violet" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    violet: "bg-violet-400/[0.08] text-violet-300",
    emerald: "bg-emerald-400/[0.08] text-emerald-300",
    amber: "bg-amber-400/[0.08] text-amber-300",
    rose: "bg-rose-400/[0.08] text-rose-300",
  };

  return (
    <div className="rounded-xl border border-white/[0.07] px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-700">
            {label}
          </p>
          <p className="mt-2.5 text-2xl font-semibold tracking-[-0.04em] text-zinc-100">
            {value}
          </p>
        </div>
        <span
          className={`flex size-8 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-4 text-[10px] text-zinc-700">{detail}</p>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-7" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-32 rounded-xl border border-white/[0.07] bg-white/[0.015]"
          />
        ))}
      </div>
      <div className="h-80 rounded-xl border border-white/[0.07] bg-white/[0.015]" />
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="px-6 py-12 text-center text-[11px] text-zinc-700">
      {message}
    </div>
  );
}

function StaleNotice({
  error,
  lastSuccessAt,
}: {
  error: string;
  lastSuccessAt: number | null;
}) {
  return (
    <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-[10px] text-amber-300">
      {error} Showing the last successful result
      {lastSuccessAt ? ` from ${formatClockTime(lastSuccessAt)}.` : "."}
    </div>
  );
}

function chartLabels(points: Array<{ timestamp: string }>): string[] {
  if (!points.length) return [];
  const indexes = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
    Math.round((points.length - 1) * ratio),
  );
  return indexes.map((index) =>
    new Date(points[index].timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
  );
}

function formatDuration(milliseconds: number) {
  return milliseconds >= 1000
    ? `${formatNumber(milliseconds / 1000)}s`
    : `${formatNumber(milliseconds)}ms`;
}

function formatNumber(value: number) {
  return Number(value.toFixed(value >= 100 ? 0 : 2)).toLocaleString();
}

function formatLastSuccess(value: number | null) {
  return value ? `Updated at ${formatClockTime(value)}` : "Updating…";
}

function formatClockTime(value: number) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
