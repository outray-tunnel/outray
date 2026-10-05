import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCw, Server } from "lucide-react";
import { HealthPill } from "./observability-ui";
import { Button } from "../ui/button";
import { SegmentedControl } from "../ui/segmented-control";
import { UsageMetricCard, type UsageCardMetric } from "../overview/usage-metric-card";
import {
  buildObservabilityUsage,
  formatCount,
  formatDuration,
  formatErrorRate,
  getLatestP95,
  getObservabilityNumberConfig,
  normalizeObservabilityRange,
  type ObservabilityRange,
  type ObservabilityMetricKey,
  type ServiceOverviewResponse,
  type ServiceSummary,
} from "./overview-data";

const RANGES: ObservabilityRange[] = ["1h", "24h", "7d", "30d"];
const rangeLabels: Record<ObservabilityRange, string> = {
  "1h": "last hour",
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
};
const priority = { critical: 0, degraded: 1, healthy: 2 };

export interface ObservabilityOverviewContentProps {
  orgSlug: string;
  data?: ServiceOverviewResponse;
  range: ObservabilityRange;
  onRangeChange: (range: ObservabilityRange) => void;
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  onRetry: () => void;
  referenceTime: number;
}

export function ObservabilityOverviewContent({
  orgSlug,
  data,
  range,
  onRangeChange,
  loading,
  isFetching,
  error,
  onRetry,
  referenceTime,
}: ObservabilityOverviewContentProps) {
  const [attentionOnly, setAttentionOnly] = useState(false);
  const displayedRange = data ? normalizeObservabilityRange(data.range) : range;
  const usage = useMemo(() => {
    if (!data) return null;
    return { bars: buildObservabilityUsage(data, referenceTime), latestP95: getLatestP95(data, referenceTime) };
  }, [data, referenceTime]);
  const metrics: Array<UsageCardMetric & { key: ObservabilityMetricKey }> = [
    {
      key: "operations",
      label: "Operations",
      value: data?.summary.totalOperations ?? 0,
      description: "Completed operations from received spans",
      format: formatCount,
      numberConfig: (value) => getObservabilityNumberConfig(value, "operations"),
    },
    {
      key: "errorRate",
      label: "Error rate",
      value: data?.summary.totalOperations ? data.summary.errorRate : null,
      description: `${formatCount(data?.summary.totalErrors ?? 0)} errored operations`,
      format: formatErrorRate,
      numberConfig: (value) => getObservabilityNumberConfig(value, "errorRate"),
      emptyLabel: data?.summary.totalOperations ? "No errors in this period" : "No operations in this period",
      zeroIsActivity: true,
    },
    {
      key: "p95",
      label: "Latest P95",
      value: usage?.latestP95 ?? null,
      description: "Latest completed interval with traffic",
      format: formatDuration,
      numberConfig: (value) => getObservabilityNumberConfig(value, "p95"),
      emptyLabel: "No latency observations in this period",
      zeroIsActivity: true,
    },
  ];
  const services = data?.services ?? [];
  const attentionCount = services.filter((service) => service.health !== "healthy").length;
  const visibleServices = services
    .filter((service) => !attentionOnly || service.health !== "healthy")
    .slice()
    .sort((left, right) => priority[left.health] - priority[right.health] || right.operationCount - left.operationCount || left.name.localeCompare(right.name))
    .slice(0, 5);
  const switchingRange = isFetching && displayedRange !== range;

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Overview</h1>
          <p className="mt-1 text-[12px] text-zinc-500">Health and activity across your services.</p>
        </div>
        <Link
          to="/$orgSlug/setup"
          params={{ orgSlug }}
          search={{ product: "observability" }}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.055] px-3.5 text-[12px] text-zinc-200 transition-colors hover:bg-white/[0.09] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Connect a service <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </header>

      <section className="min-w-0 space-y-3" aria-label="Service analytics">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[14px] font-medium text-zinc-200">Usage</h2>
            {data && (
              <span className="text-[11px] tabular-nums text-zinc-500">
                {formatCount(data.summary.serviceCount)} reporting {data.summary.serviceCount === 1 ? "service" : "services"}
              </span>
            )}
            {isFetching && data && (
              <span role="status" className="text-[11px] text-zinc-400">
                {switchingRange ? `Loading ${rangeLabels[range]}` : "Updating"}
              </span>
            )}
          </div>
          <SegmentedControl
            label="Analytics time range"
            options={RANGES.map((value) => ({ value, label: value }))}
            value={range}
            onValueChange={onRangeChange}
          />
        </div>

        {error && data && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[11px] text-amber-100/75">
            <span>Could not refresh telemetry. Showing the last available data.</span>
            <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
          </div>
        )}

        {loading && !data ? (
          <OverviewMetricsSkeleton />
        ) : error && !data ? (
          <section role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.035] px-5 py-8 text-center">
            <h2 className="text-[14px] font-medium text-zinc-200">Telemetry unavailable</h2>
            <p className="mt-1 text-[12px] text-zinc-500">We could not load service activity. Your services may still be running.</p>
            <Button variant="secondary" size="sm" className="mt-4" leftIcon={<RefreshCw size={13} />} onClick={onRetry}>Try again</Button>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {metrics.map((metric) => (
              <UsageMetricCard key={metric.key} metric={metric} range={displayedRange} bars={usage?.bars[metric.key] ?? []} />
            ))}
          </div>
        )}
      </section>

      {loading && !data ? (
        <ServiceTableSkeleton />
      ) : data ? (
        <section aria-label="Service activity" className="min-w-0 space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[14px] font-medium text-zinc-200">Services</h2>
              {attentionCount > 0 && (
                <button
                  type="button"
                  aria-pressed={attentionOnly}
                  onClick={() => setAttentionOnly((value) => !value)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${attentionOnly ? "bg-amber-400/10 text-amber-300" : "text-zinc-500 hover:bg-white/[0.04] hover:text-amber-200"}`}
                >
                  <span className="size-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                  {attentionCount} need attention
                </button>
              )}
            </div>
            <Link to="/$orgSlug/observability/services" params={{ orgSlug }} className="inline-flex min-h-8 items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-zinc-200 motion-reduce:transition-none focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              View all <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>

          {services.length === 0 ? (
            <div className="rounded-xl border border-white/[0.08] px-5 py-10 text-center">
              <Server size={22} className="mx-auto text-zinc-600" aria-hidden="true" />
              <h3 className="mt-3 text-[13px] font-medium text-zinc-200">No services reported in this range</h3>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-zinc-500">Connect a service to start collecting spans, or choose a longer range to find earlier activity.</p>
            </div>
          ) : visibleServices.length === 0 ? (
            <div className="rounded-xl border border-white/[0.08] px-5 py-8 text-center">
              <p className="text-[12px] text-zinc-400">No services need attention in this range.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAttentionOnly(false)}>Show all services</Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_100px_90px_90px_90px_16px] gap-4 border-b border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-500 lg:grid">
                <span>Service</span><span className="text-right">Operations</span><span className="text-right">Error rate</span><span className="text-right">P95 latency</span><span className="pl-2">Health</span><span />
              </div>
              <div className="divide-y divide-white/[0.06]">
                {visibleServices.map((service) => <ServiceRow key={service.id} service={service} orgSlug={orgSlug} />)}
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function ServiceRow({ service, orgSlug }: { service: ServiceSummary; orgSlug: string }) {
  return (
    <Link
      to="/$orgSlug/observability/services/$serviceId"
      params={{ orgSlug, serviceId: service.id }}
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent lg:grid-cols-[minmax(0,1fr)_100px_90px_90px_90px_16px]"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] text-zinc-200 transition-colors group-hover:text-white motion-reduce:transition-none">{service.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">{[service.environment, service.region].filter(Boolean).join(" · ") || "Received spans"}</p>
      </div>
      <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-zinc-400 lg:contents">
        <span className="lg:text-right"><span className="text-zinc-500 lg:sr-only">Operations </span>{formatCount(service.operationCount)}</span>
        <span className="lg:text-right"><span className="text-zinc-500 lg:sr-only">Errors </span>{formatErrorRate(service.operationCount ? service.errorRate : null)}</span>
        <span className="lg:text-right"><span className="text-zinc-500 lg:sr-only">P95 </span>{formatDuration(service.operationCount ? service.p95Duration : null)}</span>
      </div>
      <span className="col-start-2 row-start-1 lg:col-start-auto lg:row-start-auto lg:pl-2"><HealthPill health={service.health} /></span>
      <ArrowRight size={13} className="hidden text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none lg:block" aria-hidden="true" />
    </Link>
  );
}

function OverviewMetricsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading service analytics" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} data-observability-skeleton-metric={index} aria-hidden="true" className="flex h-[180px] min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#111112] p-4">
          <div className="h-3 w-22 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
          <div className="mt-2 h-7 w-24 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
          <div className="mt-1.5 h-2.5 w-30 animate-pulse rounded bg-white/[0.035] motion-reduce:animate-none" />
          <div className="mt-auto flex h-16 items-end gap-1" data-observability-skeleton-chart="">
            {[23, 31, 28, 42, 36, 50, 43, 57, 47, 60, 53, 56].map((height, bar) => (
              <div key={bar} className="min-w-0 flex-1 animate-pulse rounded-t-[4px] bg-white/[0.045] motion-reduce:animate-none" style={{ height }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ServiceTableSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading services" className="space-y-3 pt-2">
      <div aria-hidden="true" className="flex h-8 items-center justify-between"><span className="h-4 w-20 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" /><span className="h-3 w-16 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" /></div>
      <div aria-hidden="true" className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08]">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex h-[70px] items-center justify-between gap-5 px-4">
            <div className="space-y-2"><div className="h-3 w-28 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" /><div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" /></div>
            <div className="h-3 w-16 animate-pulse rounded bg-white/[0.04] motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </section>
  );
}
