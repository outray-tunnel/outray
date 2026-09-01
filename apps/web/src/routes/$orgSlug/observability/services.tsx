import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import Search01Icon from "@hugeicons-pro/core-stroke-rounded/Search01Icon";
import ServerStack01Icon from "@hugeicons-pro/core-stroke-rounded/ServerStack01Icon";
import {
  HealthPill,
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
  TimeRangeControl,
} from "@/components/observability/observability-ui";

type ServiceHealth = "healthy" | "degraded" | "critical";

interface ServiceTelemetry {
  id: string;
  name: string;
  namespace: string;
  version: string;
  environment: string;
  region: string;
  lastSeen: string;
  operationCount: number;
  errorCount: number;
  errorRate: number;
  p95Duration: number;
  operationsPerMinute: number;
  usesServerSpans: boolean;
  health: ServiceHealth;
}

interface ServicesResponse {
  services: ServiceTelemetry[];
}

export const Route = createFileRoute("/$orgSlug/observability/services")({
  head: () => ({ meta: [{ title: "Services - OutRay Observability" }] }),
  component: ServicesView,
});

function ServicesView() {
  const { orgSlug } = Route.useParams();
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("all");
  const [timeRange, setTimeRange] = useState("24h");
  const [services, setServices] = useState<ServiceTelemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let nextPoll: number | undefined;

    const loadServices = async () => {
      try {
        const response = await fetch(
          `/api/${orgSlug}/observability/services?range=${timeRange}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load services");
        const data = (await response.json()) as ServicesResponse;
        setServices(data.services);
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
          nextPoll = window.setTimeout(() => void loadServices(), 5_000);
        }
      }
    };

    void loadServices();
    return () => {
      controller.abort();
      if (nextPoll) window.clearTimeout(nextPoll);
    };
  }, [orgSlug, timeRange]);

  const environments = useMemo(
    () =>
      Array.from(
        new Set(services.map((service) => service.environment).filter(Boolean)),
      ).sort(),
    [services],
  );
  const visibleServices = useMemo(
    () =>
      services.filter(
        (service) =>
          service.name.toLowerCase().includes(query.toLowerCase()) &&
          (environment === "all" || service.environment === environment),
      ),
    [environment, query, services],
  );

  function changeTimeRange(value: string) {
    if (value === timeRange) return;
    setServices([]);
    setEnvironment("all");
    setLastSuccessAt(null);
    setLoading(true);
    setError(null);
    setTimeRange(value);
  }

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Services"
        description="Trace-derived throughput, latency, and health for every reporting service."
        action={
          <TimeRangeControl value={timeRange} onChange={changeTimeRange} />
        }
      />

      {error && services.length > 0 && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-[10px] text-amber-300">
          {error} Showing the last successful result
          {lastSuccessAt ? ` from ${formatClockTime(lastSuccessAt)}.` : "."}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-zinc-600 focus-within:border-white/[0.16] focus-within:text-zinc-400">
          <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.7} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a service"
            className="min-w-0 flex-1 bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-700"
          />
        </label>
        {(environments.length > 0 || lastSuccessAt) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-1 text-[9px] text-zinc-800">
              {error ? "Data may be stale" : formatLastSuccess(lastSuccessAt)}
            </span>
            {environments.length > 0 &&
              ["all", ...environments].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEnvironment(value)}
                  className={`h-9 rounded-lg border px-3 text-[10px] capitalize transition-colors ${
                    environment === value
                      ? "border-white/[0.12] bg-white/[0.08] text-zinc-200"
                      : "border-white/[0.06] text-zinc-700 hover:text-zinc-400"
                  }`}
                >
                  {value}
                </button>
              ))}
          </div>
        )}
      </div>

      <Panel>
        <div className="hidden grid-cols-[minmax(0,1fr)_120px_105px_90px_105px_100px_24px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[9px] font-medium uppercase tracking-[0.09em] text-zinc-700 sm:px-6 lg:grid">
          <span>Service</span>
          <span>Health</span>
          <span>Throughput</span>
          <span>Errors</span>
          <span>Latency p95</span>
          <span>Last seen</span>
          <span />
        </div>
        <div className="divide-y divide-white/[0.06]">
          {loading && services.length === 0 && <ServicesSkeleton />}
          {!loading && error && services.length === 0 && (
            <div className="px-6 py-14 text-center text-xs text-rose-400">
              {error}
            </div>
          )}
          {!loading && !error && visibleServices.length === 0 && (
            <div className="px-6 py-14 text-center">
              <p className="text-xs text-zinc-500">
                {services.length
                  ? "No services match these filters."
                  : "No services reported in this time range."}
              </p>
              {!services.length && (
                <p className="mt-2 text-[10px] text-zinc-700">
                  Services appear here after OutRay receives their spans.
                </p>
              )}
            </div>
          )}
          {visibleServices.map((service) => (
            <Link
              key={service.id}
              to="/$orgSlug/observability/services/$serviceId"
              params={{ orgSlug, serviceId: service.id }}
              className="grid w-full gap-4 px-5 py-5 text-left transition-colors hover:bg-white/[0.02] sm:px-6 lg:grid-cols-[minmax(0,1fr)_120px_105px_90px_105px_100px_24px] lg:items-center"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-500 ring-1 ring-white/[0.06]">
                  <HugeiconsIcon
                    icon={ServerStack01Icon}
                    size={17}
                    strokeWidth={1.7}
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-200">
                    {service.name}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-zinc-700">
                    {compactContext(service)}
                  </p>
                </div>
              </div>
              <HealthPill health={service.health} />
              <div>
                <p className="text-[11px] tabular-nums text-zinc-400">
                  {formatNumber(service.operationsPerMinute)}
                </p>
                <p className="mt-1 text-[9px] text-zinc-700">
                  {service.usesServerSpans ? "server opm" : "span opm"}
                </p>
              </div>
              <p
                className={`text-[11px] tabular-nums ${
                  service.errorRate >= 2 ? "text-rose-400" : "text-zinc-500"
                }`}
              >
                {formatNumber(service.errorRate)}%
              </p>
              <span
                className={`text-[11px] tabular-nums ${
                  service.p95Duration >= 750
                    ? "text-amber-400"
                    : "text-zinc-500"
                }`}
              >
                {formatDuration(service.p95Duration)}
              </span>
              <span className="text-[10px] text-zinc-700">
                {formatRelativeTime(service.lastSeen)}
              </span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={1.7}
                className="hidden text-zinc-800 lg:block"
              />
            </Link>
          ))}
        </div>
      </Panel>
    </ObservabilityPage>
  );
}

function ServicesSkeleton() {
  return (
    <div
      className="animate-pulse divide-y divide-white/[0.06]"
      aria-busy="true"
    >
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-4 px-5 py-5 sm:px-6">
          <div className="size-10 rounded-lg bg-white/[0.05]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-36 rounded bg-white/[0.06]" />
            <div className="h-2.5 w-52 max-w-full rounded bg-white/[0.035]" />
          </div>
          <div className="h-3 w-16 rounded bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

function compactContext(service: ServiceTelemetry) {
  const context = [
    service.namespace,
    service.version,
    service.environment,
    service.region,
  ].filter(Boolean);
  return context.length ? context.join(" · ") : "No resource context reported";
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
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
