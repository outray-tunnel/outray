import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Activity03Icon,
  Alert02Icon,
  ArrowLeft01Icon,
  Clock01Icon,
  CloudIcon,
  CodeIcon,
  Pulse02Icon,
  ServerStack01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
  HealthPill,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
  TrendChart,
} from "@/components/observability/observability-ui";

type ServiceHealth = "healthy" | "degraded" | "critical";

interface ServiceTelemetry {
  id: string;
  name: string;
  namespace: string;
  version: string;
  environment: string;
  region: string;
  scopeName: string;
  lastSeen: string;
  operationCount: number;
  errorCount: number;
  errorRate: number;
  p95Duration: number;
  operationsPerMinute: number;
  usesServerSpans: boolean;
  health: ServiceHealth;
}

interface ServiceDetailResponse {
  services: ServiceTelemetry[];
  traffic: Array<{
    timestamp: string;
    operationCount: number;
    errorCount: number;
    errorRate: number;
    p95Duration: number | null;
    operationsPerMinute: number;
  }>;
}

export const Route = createFileRoute(
  "/$orgSlug/observability/services_/$serviceId",
)({
  head: () => ({ meta: [{ title: "Service - OutRay Observability" }] }),
  component: ServiceView,
});

function ServiceView() {
  const { orgSlug, serviceId } = Route.useParams();
  const [timeRange, setTimeRange] = useState("24h");
  const [data, setData] = useState<ServiceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let nextPoll: number | undefined;
    const parameters = new URLSearchParams({
      range: timeRange,
      service: serviceId,
    });

    const loadService = async () => {
      try {
        const response = await fetch(
          `/api/${orgSlug}/observability/services?${parameters}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load service telemetry");
        setData((await response.json()) as ServiceDetailResponse);
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
          nextPoll = window.setTimeout(() => void loadService(), 5_000);
        }
      }
    };

    void loadService();
    return () => {
      controller.abort();
      if (nextPoll) window.clearTimeout(nextPoll);
    };
  }, [orgSlug, serviceId, timeRange]);

  function changeTimeRange(value: string) {
    if (value === timeRange) return;
    setData(null);
    setLastSuccessAt(null);
    setLoading(true);
    setError(null);
    setTimeRange(value);
  }

  if (loading && !data) {
    return <ServiceSkeleton orgSlug={orgSlug} />;
  }

  if (error && !data) {
    return (
      <ServiceState
        orgSlug={orgSlug}
        title="Service telemetry unavailable"
        message={error}
        timeRange={timeRange}
        onTimeRangeChange={changeTimeRange}
      />
    );
  }

  const service = data?.services[0];
  if (!service && error)
    return (
      <ServiceState
        orgSlug={orgSlug}
        title="Service telemetry unavailable"
        message={`${error} The last successful result${
          lastSuccessAt ? ` from ${formatClockTime(lastSuccessAt)}` : ""
        } contained no spans for this service.`}
        timeRange={timeRange}
        onTimeRangeChange={changeTimeRange}
      />
    );
  if (!service)
    return (
      <ServiceNotFound
        orgSlug={orgSlug}
        timeRange={timeRange}
        onTimeRangeChange={changeTimeRange}
      />
    );
  const traffic = data?.traffic || [];
  const hasLatency = traffic.some((point) => point.p95Duration !== null);

  return (
    <ObservabilityPage>
      <header className="border-b border-white/[0.07] pb-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link
              to="/$orgSlug/observability/services"
              params={{ orgSlug }}
              className="mb-5 inline-flex items-center gap-2 text-[10px] text-zinc-700 transition-colors hover:text-zinc-300"
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                size={13}
                strokeWidth={1.7}
              />
              All services
            </Link>
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-zinc-400 ring-1 ring-white/[0.07]">
                <HugeiconsIcon
                  icon={ServerStack01Icon}
                  size={19}
                  strokeWidth={1.7}
                />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="truncate text-2xl font-semibold tracking-[-0.035em] text-white">
                    {service.name}
                  </h1>
                  <HealthPill health={service.health} />
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  {serviceContext(service)}
                </p>
              </div>
            </div>
          </div>
          <TimeRangeControl value={timeRange} onChange={changeTimeRange} />
        </div>
      </header>

      {error && data && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-[10px] text-amber-300">
          {error} Showing the last successful result
          {lastSuccessAt ? ` from ${formatClockTime(lastSuccessAt)}.` : "."}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ServiceMetric
          icon={Activity03Icon}
          label="Operations"
          value={service.operationCount.toLocaleString()}
          detail={`Observed in the last ${timeRange}`}
          tone="violet"
        />
        <ServiceMetric
          icon={Pulse02Icon}
          label="Throughput"
          value={`${formatNumber(service.operationsPerMinute)} opm`}
          detail={
            service.usesServerSpans
              ? "Calculated from server spans"
              : "Calculated from all reported spans"
          }
          tone="violet"
        />
        <ServiceMetric
          icon={Alert02Icon}
          label="Error rate"
          value={`${formatNumber(service.errorRate)}%`}
          detail={`${service.errorCount.toLocaleString()} errored operations`}
          tone={service.errorRate >= 2 ? "rose" : "emerald"}
        />
        <ServiceMetric
          icon={Clock01Icon}
          label="P95 latency"
          value={formatDuration(service.p95Duration)}
          detail="From observed operation duration"
          tone={service.p95Duration >= 750 ? "amber" : "violet"}
        />
      </section>

      <div className="grid gap-7 lg:grid-cols-3">
        <Panel
          title="Operation volume"
          description={
            service.usesServerSpans
              ? "Server operations per minute"
              : "Reported spans per minute; no server spans were found"
          }
          action={
            <span className="text-[10px] text-zinc-700">
              {error ? "Data may be stale" : formatLastSuccess(lastSuccessAt)}
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
            <div className="px-6 py-14 text-center text-[11px] text-zinc-700">
              No traffic points in this time range.
            </div>
          )}
        </Panel>

        <Panel title="Service details" description="Reported resource context">
          <div className="space-y-5 p-5 sm:p-6">
            <ServiceDetail
              icon={CodeIcon}
              label="Namespace"
              value={service.namespace || "Not reported"}
            />
            <ServiceDetail
              icon={CloudIcon}
              label="Environment"
              value={service.environment || "Not reported"}
            />
            <ServiceDetail
              icon={CloudIcon}
              label="Region"
              value={service.region || "Not reported"}
            />
            <ServiceDetail
              icon={ServerStack01Icon}
              label="Version"
              value={service.version || "Not reported"}
            />
            <ServiceDetail
              icon={Activity03Icon}
              label="Instrumentation scope"
              value={service.scopeName || "Not reported"}
            />
            <ServiceDetail
              icon={Clock01Icon}
              label="Last span"
              value={formatRelativeTime(service.lastSeen)}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-7 lg:grid-cols-2">
        <Panel title="Latency" description="P95 duration by traffic bucket">
          {hasLatency ? (
            <TrendChart
              values={traffic.map((point) => point.p95Duration)}
              tone={service.p95Duration >= 750 ? "amber" : "violet"}
              labels={chartLabels(traffic)}
            />
          ) : (
            <div className="px-6 py-14 text-center text-[11px] text-zinc-700">
              No latency points in this time range.
            </div>
          )}
        </Panel>

        <Panel
          title="Explore telemetry"
          description="Inspect the underlying signals"
        >
          <div className="grid gap-3 p-5 sm:p-6">
            <TelemetryLink
              to="/$orgSlug/observability/traces"
              orgSlug={orgSlug}
              title="Traces"
              description="Open the trace explorer and search for this service."
            />
            <TelemetryLink
              to="/$orgSlug/observability/logs"
              orgSlug={orgSlug}
              title="Logs"
              description="Open the logs explorer and filter by this service."
            />
          </div>
        </Panel>
      </div>

      <Panel
        title="Health policy"
        description="Applied to the selected time range"
      >
        <div className="grid gap-3 p-5 text-[10px] sm:grid-cols-3 sm:p-6">
          <HealthRule
            health="healthy"
            description="Error rate below 2% and P95 below 750ms"
          />
          <HealthRule
            health="degraded"
            description="Error rate at least 2% or P95 at least 750ms"
          />
          <HealthRule
            health="critical"
            description="Error rate at least 5% or P95 at least 1.5s"
          />
        </div>
      </Panel>
    </ObservabilityPage>
  );
}

function ServiceMetric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: IconSvgElement;
  label: string;
  value: string;
  detail: string;
  tone: "violet" | "emerald" | "amber" | "rose";
}) {
  const toneStyles = {
    violet: "bg-violet-400/[0.08] text-violet-300",
    emerald: "bg-emerald-400/[0.08] text-emerald-300",
    amber: "bg-amber-400/[0.08] text-amber-300",
    rose: "bg-rose-400/[0.08] text-rose-300",
  };

  return (
    <div className="rounded-xl border border-white/[0.07] px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-700">
            {label}
          </p>
          <p className="mt-2.5 text-xl font-semibold tracking-[-0.035em] text-zinc-100">
            {value}
          </p>
        </div>
        <span
          className={`flex size-8 items-center justify-center rounded-lg ${toneStyles[tone]}`}
        >
          <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-[9px] text-zinc-700">{detail}</p>
    </div>
  );
}

function ServiceDetail({
  icon,
  label,
  value,
}: {
  icon: IconSvgElement;
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

function TelemetryLink({
  to,
  orgSlug,
  title,
  description,
}: {
  to: "/$orgSlug/observability/traces" | "/$orgSlug/observability/logs";
  orgSlug: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      params={{ orgSlug }}
      className="rounded-lg border border-white/[0.07] px-4 py-4 transition-colors hover:border-white/[0.12] hover:bg-white/[0.02]"
    >
      <p className="text-xs font-medium text-zinc-300">{title}</p>
      <p className="mt-1 text-[10px] text-zinc-700">{description}</p>
    </Link>
  );
}

function HealthRule({
  health,
  description,
}: {
  health: ServiceHealth;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] px-4 py-4">
      <HealthPill health={health} />
      <p className="mt-3 leading-5 text-zinc-600">{description}</p>
    </div>
  );
}

function ServiceSkeleton({ orgSlug }: { orgSlug: string }) {
  return (
    <ObservabilityPage>
      <Link
        to="/$orgSlug/observability/services"
        params={{ orgSlug }}
        className="inline-flex items-center gap-2 text-[10px] text-zinc-700"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.7} />
        All services
      </Link>
      <div className="animate-pulse space-y-7" aria-busy="true">
        <div className="h-24 rounded-xl border border-white/[0.07] bg-white/[0.015]" />
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
    </ObservabilityPage>
  );
}

function ServiceNotFound({
  orgSlug,
  timeRange,
  onTimeRangeChange,
}: {
  orgSlug: string;
  timeRange: string;
  onTimeRangeChange: (value: string) => void;
}) {
  return (
    <ServiceState
      orgSlug={orgSlug}
      title="Service not found"
      message="This service did not report spans in the selected time range."
      timeRange={timeRange}
      onTimeRangeChange={onTimeRangeChange}
    />
  );
}

function ServiceState({
  orgSlug,
  title,
  message,
  timeRange,
  onTimeRangeChange,
}: {
  orgSlug: string;
  title: string;
  message: string;
  timeRange: string;
  onTimeRangeChange: (value: string) => void;
}) {
  return (
    <ObservabilityPage>
      <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-7 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/$orgSlug/observability/services"
          params={{ orgSlug }}
          className="inline-flex items-center gap-2 text-[10px] text-zinc-700 transition-colors hover:text-zinc-300"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.7} />
          All services
        </Link>
        <TimeRangeControl value={timeRange} onChange={onTimeRangeChange} />
      </header>
      <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-white/[0.07]">
        <div className="max-w-sm px-6 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-600">
            <HugeiconsIcon
              icon={ServerStack01Icon}
              size={18}
              strokeWidth={1.7}
            />
          </span>
          <h1 className="mt-5 text-lg font-semibold text-zinc-200">{title}</h1>
          <p className="mt-2 text-xs leading-5 text-zinc-600">{message}</p>
          <Link
            to="/$orgSlug/observability/services"
            params={{ orgSlug }}
            className="mt-5 inline-flex h-9 items-center rounded-lg bg-white px-4 text-[10px] font-medium text-black"
          >
            Back to services
          </Link>
        </div>
      </div>
    </ObservabilityPage>
  );
}

function serviceContext(service: ServiceTelemetry) {
  const context = [
    service.namespace,
    service.version,
    service.environment,
    service.region,
  ].filter(Boolean);
  return context.length ? context.join(" · ") : "No resource context reported";
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

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
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
