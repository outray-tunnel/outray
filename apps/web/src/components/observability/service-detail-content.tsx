import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, ChevronDown, CircleAlert, CircleCheck,
  CircleDashed, CircleX, FileText, Info, RefreshCw, Server, Workflow,
} from "lucide-react";
import { Button } from "../arc/button/button";
import { SegmentedControl } from "../ui/segmented-control";
import { UsageMetricCard, type UsageCardMetric } from "../overview/usage-metric-card";
import { parseServiceLastSeen, serviceDisplayHealth, type ServiceInventoryHealth } from "./services-data";
import {
  SERVICE_DETAIL_RANGES, buildServiceDetailUsage,
  formatServiceDetailCount, formatServiceDetailDuration, formatServiceDetailRate,
  formatServiceDetailThroughput, getServiceDetailNumberConfig, normalizeServiceDetailRange,
  type ServiceDetailMetricKey, type ServiceDetailRange, type ServiceDetailSnapshot,
} from "./service-detail-data";
import "../outray-arc-theme.css";

export interface ServiceDetailContentProps {
  orgSlug: string;
  serviceId: string;
  data?: ServiceDetailSnapshot;
  range: ServiceDetailRange;
  onRangeChange: (range: ServiceDetailRange) => void;
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  onRetry: () => void;
}

const healthPresentation = {
  healthy: { label: "Healthy", Icon: CircleCheck, color: "text-emerald-400" },
  degraded: { label: "Degraded", Icon: CircleAlert, color: "text-amber-400" },
  critical: { label: "Critical", Icon: CircleX, color: "text-rose-400" },
  unknown: { label: "Unknown", Icon: CircleDashed, color: "text-zinc-400" },
};

const rangeLabels: Record<ServiceDetailRange, string> = {
  "1h": "Last hour", "6h": "Last 6 hours", "24h": "Last 24 hours",
  "7d": "Last 7 days", "30d": "Last 30 days",
};

export function ServiceDetailContent({
  orgSlug, serviceId, data, range, onRangeChange, loading, isFetching, error, onRetry,
}: ServiceDetailContentProps) {
  const service = data?.services.find((item) => item.id === serviceId || item.name === serviceId);
  const displayedRange = data ? normalizeServiceDetailRange(data.range) : range;
  const usage = useMemo(() => data ? buildServiceDetailUsage(data, data.receivedAt) : null, [data]);
  const measured = service !== undefined && Number.isFinite(service.operationCount) && service.operationCount > 0;
  const health = service ? serviceDisplayHealth(service) : "unknown";
  const lastSeen = service ? parseServiceLastSeen(service.lastSeen) : NaN;
  const context = service ? [service.environment, service.region, service.namespace].filter(Boolean).join(" · ") : "Service telemetry";
  const metrics: Array<UsageCardMetric & { key: ServiceDetailMetricKey }> = [
    {
      key: "operations", label: "Operations", value: validMeasurement(service?.operationCount),
      description: service?.usesServerSpans ? "Completed server operations" : "Completed reported spans",
      format: formatServiceDetailCount,
      numberConfig: (value) => getServiceDetailNumberConfig(value, "operations"),
      emptyLabel: "No activity in completed intervals",
    },
    {
      key: "throughput", label: "Throughput", value: measured ? validMeasurement(service?.operationsPerMinute) : null,
      description: service?.usesServerSpans ? "Server operations per minute" : "Reported spans per minute",
      format: formatServiceDetailThroughput,
      numberConfig: (value) => getServiceDetailNumberConfig(value, "throughput"),
      zeroIsActivity: true,
      emptyLabel: "No completed throughput observations",
    },
    {
      key: "errorRate", label: "Error rate", value: measured ? validMeasurement(service?.errorRate) : null,
      description: `${formatServiceDetailCount(validMeasurement(service?.errorCount))} errored operations`,
      format: formatServiceDetailRate,
      numberConfig: (value) => getServiceDetailNumberConfig(value, "errorRate"),
      zeroIsActivity: true,
      emptyLabel: "No operations in completed intervals",
    },
    {
      key: "p95", label: "P95 latency", value: measured ? validMeasurement(service?.p95Duration) : null,
      description: "Across measured operations in this period",
      format: formatServiceDetailDuration,
      numberConfig: (value) => getServiceDetailNumberConfig(value, "p95"),
      zeroIsActivity: true,
      emptyLabel: "No completed latency observations",
    },
  ];

  return (
    <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">
      <header className="space-y-3 pb-1">
        <Link to="/$orgSlug/observability/services" params={{ orgSlug }}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[12px] text-zinc-400 transition-colors hover:text-zinc-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <ArrowLeft size={13} aria-hidden="true" /> All services
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 max-w-full items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-zinc-400">
              <Server size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="min-w-0 break-all text-[20px] font-normal tracking-[-0.035em] text-white">{service?.name || serviceId}</h1>
                {!loading && <ServiceHealthBadge health={health} />}
              </div>
              <p className="mt-1 break-words text-[12px] text-zinc-400">{context || "No resource attributes reported"}</p>
            </div>
          </div>
          <div className="ml-auto max-w-full">
            <SegmentedControl label="Service analytics time range" options={SERVICE_DETAIL_RANGES.map((value) => ({ value, label: value }))} value={range} onValueChange={onRangeChange} />
          </div>
        </div>
      </header>

      {error && data && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75">
          <span>Could not refresh telemetry. Showing the last available data{data.receivedAt ? ` from ${formatClock(data.receivedAt)}` : ""}.</span>
          <Button variant="ghost" size="sm" onClick={onRetry} loading={isFetching}>Retry</Button>
        </div>
      )}

      {loading && !data ? <ServiceDetailSkeleton /> : error && !data ? (
        <ServiceMessage icon={<CircleAlert size={21} aria-hidden="true" />} title="Service telemetry unavailable" detail="We could not load this service. Its telemetry may still be arriving." alert>
          <Button variant="secondary" className="mt-4" onClick={onRetry} loading={isFetching}><RefreshCw size={14} aria-hidden="true" /> Try again</Button>
        </ServiceMessage>
      ) : !service ? (
        <ServiceMessage icon={<Server size={21} aria-hidden="true" />} title="No service activity in this period" detail={`This service did not report spans in ${rangeLabels[displayedRange].toLowerCase()}. Choose a longer range to look for earlier activity.`}>
          {isFetching && range !== displayedRange && <p role="status" className="mt-2 text-[11px] text-zinc-400">Loading {range} · Showing {displayedRange}</p>}
          <Button variant="secondary" className="mt-4" onClick={onRetry} loading={isFetching}><RefreshCw size={14} aria-hidden="true" /> Refresh telemetry</Button>
        </ServiceMessage>
      ) : (
        <>
          <section aria-label="Service analytics" className="min-w-0 space-y-3">
            <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-[14px] font-medium text-zinc-200">Activity</h2>
                <span className="text-[11px] text-zinc-400">{rangeLabels[displayedRange]}</span>
                {isFetching && <span role="status" className="text-[11px] text-zinc-400">{range !== displayedRange ? `Loading ${range} · Showing ${displayedRange}` : "Updating"}</span>}
              </div>
              {!isFetching && !error && data?.receivedAt ? <span className="text-[11px] tabular-nums text-zinc-400">Updated {formatClock(data.receivedAt)}</span> : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => <UsageMetricCard key={metric.key} metric={metric} range={displayedRange} bars={usage?.[metric.key] ?? []} />)}
            </div>
            <p className="text-[11px] leading-5 text-zinc-400">Inspect any chart interval to see its values. Latency bars show the latest observed P95 in each interval.</p>
          </section>

          {!measured && (
            <p className="flex items-start gap-2 text-[12px] leading-5 text-zinc-400"><CircleDashed size={14} className="mt-0.5 shrink-0" aria-hidden="true" />No measured operations in this period. Health, rates, and latency remain unknown.</p>
          )}

          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section aria-label="Service details" className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
              <div className="border-b border-white/[0.07] px-4 py-3.5">
                <h2 className="text-[14px] font-medium text-zinc-200">Service details</h2>
                <p className="mt-1 text-[12px] text-zinc-400">Resource attributes reported by your application.</p>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2">
                <ResourceDetail label="Environment">{service.environment || "Not reported"}</ResourceDetail>
                <ResourceDetail label="Region">{service.region || "Not reported"}</ResourceDetail>
                <ResourceDetail label="Namespace">{service.namespace || "Not reported"}</ResourceDetail>
                <ResourceDetail label="Version">{service.version || "Not reported"}</ResourceDetail>
                <ResourceDetail label="Instrumentation scope">{service.scopeName || "Not reported"}</ResourceDetail>
                <ResourceDetail label="Last span">{Number.isFinite(lastSeen) ? <time dateTime={new Date(lastSeen).toISOString()} title={new Date(lastSeen).toLocaleString()}>{relativeTime(lastSeen, data?.receivedAt ?? lastSeen)}</time> : "Unknown"}</ResourceDetail>
              </dl>
            </section>

            <section aria-label="Explore telemetry" className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
              <div className="border-b border-white/[0.07] px-4 py-3.5">
                <h2 className="text-[14px] font-medium text-zinc-200">Explore telemetry</h2>
                <p className="mt-1 text-[12px] text-zinc-400">Follow this service into its underlying signals.</p>
              </div>
              <div className="divide-y divide-white/[0.06]">
                <Link to="/$orgSlug/observability/requests" params={{ orgSlug }} search={{ service: service.id, range }} className={explorerRowClass}>
                  <ArrowLeftRight size={16} className="shrink-0 text-zinc-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-[13px] text-zinc-200">Requests</span><span className="mt-1 block text-[12px] leading-5 text-zinc-400 [overflow-wrap:anywhere]">View HTTP requests from {service.name}.</span></span>
                  <ArrowRight size={14} className="shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-200 motion-reduce:transition-none" aria-hidden="true" />
                </Link>
                <Link to="/$orgSlug/observability/traces" params={{ orgSlug }} search={{ search: service.id }} className={explorerRowClass}>
                  <Workflow size={16} className="shrink-0 text-zinc-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-[13px] text-zinc-200">Traces</span><span className="mt-1 block text-[12px] leading-5 text-zinc-400 [overflow-wrap:anywhere]">Search traces for {service.name}.</span></span>
                  <ArrowRight size={14} className="shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-200 motion-reduce:transition-none" aria-hidden="true" />
                </Link>
                <Link to="/$orgSlug/observability/logs" params={{ orgSlug }} search={{ search: service.id }} className={explorerRowClass}>
                  <FileText size={16} className="shrink-0 text-zinc-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-[13px] text-zinc-200">Logs</span><span className="mt-1 block text-[12px] leading-5 text-zinc-400 [overflow-wrap:anywhere]">Search log events for {service.name}.</span></span>
                  <ArrowRight size={14} className="shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-200 motion-reduce:transition-none" aria-hidden="true" />
                </Link>
              </div>
            </section>
          </div>

          <details className="group rounded-xl border border-white/[0.08] bg-[#111112]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-[12px] text-zinc-400 transition-colors hover:text-zinc-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              How service health is calculated
              <ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <div className="grid gap-4 border-t border-white/[0.07] px-4 py-4 text-[12px] sm:grid-cols-3">
              <HealthRule health="healthy">Error rate below 2% and P95 below 750 ms.</HealthRule>
              <HealthRule health="degraded">Error rate at least 2% or P95 at least 750 ms.</HealthRule>
              <HealthRule health="critical">Error rate at least 5% or P95 at least 1.5 s.</HealthRule>
              <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-zinc-400 sm:col-span-3"><Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Applied to observed operations in the selected period. No observations means Unknown, not Healthy.</span></p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

const explorerRowClass = "group flex min-h-20 min-w-0 items-center gap-3 px-4 py-4 transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

function ServiceHealthBadge({ health }: { health: ServiceInventoryHealth }) {
  const { label, Icon, color } = healthPresentation[health];
  return <span className={`inline-flex min-h-6 w-fit shrink-0 items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.025] px-2 text-[11px] ${color}`}><Icon size={12} aria-hidden="true" />{label}</span>;
}

function ResourceDetail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 border-b border-white/[0.055] px-4 py-3 last:border-0 sm:[&:nth-last-child(-n+2)]:border-b-0"><dt className="text-[11px] text-zinc-400">{label}</dt><dd className="mt-1 break-words text-[12px] leading-5 text-zinc-200">{children}</dd></div>;
}

function HealthRule({ health, children }: { health: ServiceInventoryHealth; children: ReactNode }) {
  return <div><ServiceHealthBadge health={health} /><p className="mt-2 leading-5 text-zinc-400">{children}</p></div>;
}

function ServiceMessage({ icon, title, detail, alert, children }: { icon: ReactNode; title: string; detail: string; alert?: boolean; children: ReactNode }) {
  return <section role={alert ? "alert" : "status"} className="rounded-xl border border-white/[0.08] bg-[#111112] px-5 py-14 text-center"><span className="mx-auto flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-400">{icon}</span><h2 className="mt-3 text-[14px] font-medium text-zinc-200">{title}</h2><p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-zinc-400">{detail}</p>{children}</section>;
}

function ServiceDetailSkeleton() {
  return <div role="status" aria-label="Loading service analytics" className="space-y-5"><span className="sr-only">Loading service analytics</span><div aria-hidden="true" className="space-y-3"><div className="h-8 w-36 animate-pulse rounded bg-zinc-800/50 motion-reduce:animate-none" /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="flex h-[180px] min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#111112] p-4"><div className="h-4 w-20 animate-pulse rounded bg-zinc-800/60 motion-reduce:animate-none" /><div className="mt-1.5 h-8 w-24 animate-pulse rounded bg-zinc-800/70 motion-reduce:animate-none" /><div className="mt-1 h-3 w-36 max-w-full animate-pulse rounded bg-zinc-800/40 motion-reduce:animate-none" /><div className="mt-auto flex h-16 items-end gap-1">{[14, 20, 32, 24, 40, 36, 30, 48, 44, 60, 55, 51, 58, 40].map((height, bar) => <span key={bar} className="min-w-0 flex-1 animate-pulse rounded-t bg-zinc-800/50 motion-reduce:animate-none" style={{ height }} />)}</div></div>)}</div></div><div aria-hidden="true" className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">{[0, 1].map((index) => <div key={index} className="space-y-5 rounded-xl border border-white/[0.08] bg-[#111112] p-4"><div className="h-4 w-28 animate-pulse rounded bg-zinc-800/60 motion-reduce:animate-none" /><div className="h-3 w-48 max-w-full animate-pulse rounded bg-zinc-800/40 motion-reduce:animate-none" /><div className="h-40 animate-pulse rounded-lg bg-zinc-800/25 motion-reduce:animate-none" /></div>)}</div></div>;
}

function validMeasurement(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function relativeTime(timestamp: number, referenceTime: number) {
  const seconds = Math.max(0, Math.floor((referenceTime - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatClock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
