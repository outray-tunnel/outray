import { useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, ChartColumn, ChevronDown, CircleAlert, Gauge, Info, Plus, RefreshCw, Search, Server, Sigma } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import PauseIcon from "@outray/icons/solid/PauseIcon";
import PlayIcon from "@outray/icons/solid/PlayIcon";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { SegmentedControl } from "../ui/segmented-control";
import { ConnectServiceSheet } from "./connect-service-sheet";
import { MetricsChart } from "./metrics-chart";
import {
  METRICS_RANGES, formatMetricCount, formatMetricType, formatMetricValue, formatMetricDateTime,
  latestMetricPoint, metricAggregationLabel, metricOptionDescription, metricOptionLabel,
  metricSampleCount, metricValueUnit, metricsSelectionMatches, normalizeMetricsSearch,
  sortedMetricPoints, sortedMetricServiceValues,
  type MetricMetadata, type MetricsSearch, type MetricsSnapshot,
} from "./metrics-data";
import "../outray-arc-theme.css";

export interface MetricsContentProps {
  orgSlug: string;
  data?: MetricsSnapshot;
  search: MetricsSearch;
  onSearchChange: (search: MetricsSearch) => void;
  isLive: boolean;
  onToggleLive: () => void;
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  onRetry: () => void;
}

const emptyMetrics: MetricMetadata[] = [];

/** An instrument library and one focused explorer, rather than a wall of cards. */
export function MetricsContent({
  orgSlug, data, search, onSearchChange, isLive, onToggleLive, loading, isFetching, error, onRetry,
}: MetricsContentProps) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalogTrigger = useRef<HTMLButtonElement>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const connectTrigger = useRef<HTMLButtonElement>(null);
  const selected = data?.selectedMetric ?? null;
  const matches = data ? metricsSelectionMatches(data, search) : true;
  const metrics = useMemo(() => [...(data?.metrics ?? emptyMetrics)].sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key)), [data?.metrics]);
  const visibleMetrics = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return metrics.filter((metric) => !query || [metric.name, metric.description, metric.type, metric.unit].some((value) => value.toLowerCase().includes(query)));
  }, [metrics, catalogSearch]);
  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const metric of metrics) counts.set(metric.name, (counts.get(metric.name) ?? 0) + 1);
    return counts;
  }, [metrics]);
  const initialLoading = !data && (loading || !error);

  return (
    <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Metrics</h1>
          <p className="mt-1 text-[12px] text-zinc-400">Explore the measurements your services report.</p>
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onToggleLive} aria-pressed={!isLive} title={isLive ? "Pause automatic refresh" : "Resume automatic refresh"}>
            <HugeiconsIcon icon={isLive ? PauseIcon : PlayIcon} size={13} aria-hidden="true" />{isLive ? "Pause" : "Resume"}
          </Button>
          <SegmentedControl label="Metric time range" options={METRICS_RANGES.map((value) => ({ value, label: value }))} value={search.range} onValueChange={(range) => onSearchChange({ ...search, range })} />
        </div>
      </header>

      {error && data && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/80">
          <span>Could not refresh metrics. Showing the last available data.</span>
          <Button variant="ghost" size="sm" loading={isFetching} onClick={onRetry}>Retry</Button>
        </div>
      )}

      <section aria-label="Metric explorer" className="grid min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Metric library" className="min-w-0 border-b border-white/[0.07] lg:border-b-0 lg:border-r">
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-medium text-zinc-200">Instruments</h2>
              <div className="flex items-center gap-2">
                {data && <span className="text-[11px] tabular-nums text-zinc-400">{metrics.length}</span>}
                <Button ref={catalogTrigger} variant="ghost" size="sm" className="lg:!hidden" aria-label="Browse instruments" aria-expanded={catalogOpen} aria-controls="metric-instrument-library" onClick={() => setCatalogOpen((previous) => !previous)}>
                  Browse <ChevronDown size={13} className={`transition-transform motion-reduce:transition-none ${catalogOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
          <div id="metric-instrument-library" className={catalogOpen ? "block" : "hidden lg:block"}>
            <div className="outray-arc-requests-search px-4 pb-4">
              <SearchField appearance="workspace" label="Search metrics" placeholder="Find a metric…" value={catalogSearch} onValueChange={setCatalogSearch} disabled={!data || !metrics.length} autoComplete="off" spellCheck={false} />
            </div>
          {initialLoading ? <MetricLibrarySkeleton /> : !data ? (
            <p className="px-4 pb-5 text-[12px] text-zinc-400">The metric library is unavailable.</p>
          ) : !metrics.length ? (
            <p className="px-4 pb-5 text-[12px] leading-5 text-zinc-400">No instruments reported in this period.</p>
          ) : !visibleMetrics.length ? (
            <div className="px-4 py-5 text-[12px] text-zinc-400"><Search size={16} aria-hidden="true" /><p className="mt-2">No matching instruments.</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => setCatalogSearch("")}>Clear search</Button></div>
          ) : (
            <ul className="max-h-[220px] overflow-y-auto overscroll-contain p-2 pt-0 lg:max-h-[580px]" aria-label="Available metrics">
              {visibleMetrics.map((metric) => {
                const active = metric.key === (search.metric || selected?.key);
                const label = metricOptionLabel(metric, (nameCounts.get(metric.name) ?? 0) > 1);
                return (
                  <li key={metric.key}>
                    <button type="button" aria-pressed={active} title={metricOptionDescription(metric)} onClick={() => {
                      onSearchChange({ range: search.range, metric: metric.key });
                      setCatalogOpen(false);
                      if (catalogTrigger.current?.offsetParent !== null) catalogTrigger.current?.focus();
                    }}
                      className={`group flex w-full min-w-0 items-start gap-2.5 rounded-lg px-3 py-3 text-left transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${active ? "bg-white/[0.075] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200"}`}>
                      <MetricInstrumentIcon type={metric.type} className="mt-0.5 shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1"><span className="block break-words font-mono text-[12px] leading-5 [overflow-wrap:anywhere]">{label}</span><span className="mt-1 block truncate text-[11px] text-zinc-400">{formatMetricType(metric.type)}{metric.unit ? ` · ${metric.unit}` : " · Unitless"}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {data && <p className="border-t border-white/[0.06] px-4 py-3 text-[11px] text-zinc-400">{visibleMetrics.length} of {metrics.length} instruments · Last {data.range}</p>}
          </div>
        </aside>

        <div className="min-w-0">
          {initialLoading ? <MetricExplorerSkeleton /> : error && !data ? (
            <MetricsMessage alert icon={<CircleAlert size={21} aria-hidden="true" />} title="Metrics unavailable" detail="We could not load your measurements. Your services may still be reporting.">
              <Button variant="secondary" className="mt-4" loading={isFetching} onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /> Try again</Button>
            </MetricsMessage>
          ) : !selected || !data ? (
            <MetricsMessage icon={<Activity size={21} aria-hidden="true" />} title={data ? `No metrics in the last ${data.range}` : "No metrics in this period"} detail="Metrics appear when an instrumented service sends OpenTelemetry measurements. Try a longer range or connect a service.">
              {data && !matches && <p role="status" className="mt-2 text-[11px] text-zinc-400">{isFetching ? `Loading ${search.range}` : "The new selection is unavailable"} · Showing the last available {data.range} period.</p>}
              <Button ref={connectTrigger} variant="secondary" size="md" className="mt-4" aria-haspopup="dialog" aria-expanded={connectOpen} onClick={() => setConnectOpen(true)}><Plus size={14} aria-hidden="true" /> Connect a service</Button>
            </MetricsMessage>
          ) : (
            <MetricExplorer
              data={data} selected={selected} search={search} matches={matches} isLive={isLive} isFetching={isFetching} error={error}
              onSearchChange={onSearchChange}
            />
          )}
        </div>
      </section>
      <ConnectServiceSheet key={orgSlug} orgSlug={orgSlug} open={connectOpen} onClose={() => setConnectOpen(false)} onRecheck={onRetry} returnFocusRef={connectTrigger} />
    </div>
  );
}

function MetricExplorer({ data, selected, search, matches, isLive, isFetching, error, onSearchChange }: {
  data: MetricsSnapshot; selected: MetricMetadata; search: MetricsSearch; matches: boolean;
  isLive: boolean; isFetching?: boolean; error?: string | null; onSearchChange: (search: MetricsSearch) => void;
}) {
  const points = useMemo(() => sortedMetricPoints(data.points), [data.points]);
  const latest = latestMetricPoint(points);
  const sampleCount = metricSampleCount(points);
  const breakdown = useMemo(() => sortedMetricServiceValues(data.breakdown), [data.breakdown]);
  const displayedService = data.requestedService;
  const unavailableMetric = data.requestedMetricKey && data.requestedMetricKey !== selected.key;
  const serviceNames = data.services.includes(search.service ?? "") || !search.service ? data.services : [search.service, ...data.services];
  const updateService = (service: string) => onSearchChange({ ...search, service: service === "all" ? undefined : service.slice("service:".length) });
  const reportedRange = normalizeMetricsSearch({ range: data.range }).range;
  // A count fallback and a mean reading do not share a scale or comparable magnitude.
  const sameUnit = breakdown.every((row) => metricValueUnit(selected.unit, row.aggregation) === metricValueUnit(selected.unit, breakdown[0]?.aggregation ?? ""));
  const largest = sameUnit ? Math.max(0, ...breakdown.map((row) => row.value)) : 0;

  return (
    <>
      <div className="space-y-4 border-b border-white/[0.07] p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-[220px]">
            <div className="flex flex-wrap items-center gap-2">
              <MetricInstrumentIcon type={selected.type} size={15} className="shrink-0 text-zinc-400" />
              <h2 className="min-w-0 break-all font-mono text-[14px] font-medium text-zinc-200">{selected.name}</h2>
              <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-400">{formatMetricType(selected.type)}</span>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-zinc-400">{selected.description || "Measurements reported by your OpenTelemetry instrument."}</p>
          </div>
          <div className="w-full min-w-0 sm:w-[200px]">
            <Select label="Service" value={search.service ? `service:${search.service}` : "all"} onValueChange={updateService}
              options={[{ value: "all", label: "All services" }, ...serviceNames.map((value) => ({ value: `service:${value}`, label: value }))]} />
          </div>
        </div>
        {!matches && <p role="status" className="text-[11px] leading-5 text-zinc-400">{isFetching ? "Loading your selection" : "The new selection is unavailable"} · Showing {selected.name} for {displayedService || "all services"}, last {data.range}.</p>}
        {unavailableMetric && matches && <p role="status" className="flex items-start gap-1.5 text-[11px] leading-5 text-amber-200"><Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />The linked instrument has no reports in this period. Showing {selected.name} instead.</p>}
        <dl className="grid grid-cols-1 gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <MetricStat label="Latest reading" value={latest ? formatMetricValue(latest.value, metricValueUnit(selected.unit, latest.aggregation)) : "—"} detail={latest ? `${metricAggregationLabel(latest.aggregation)} · ${formatMetricDateTime(latest.timestamp)}` : "No measured intervals"} primary />
          <MetricStat label="Reported data points" value={formatMetricCount(sampleCount)} detail={`${points.length} measured ${points.length === 1 ? "interval" : "intervals"} · ${displayedService || "All services"}`} />
          <MetricStat label="Reporting services" value={formatMetricCount(selected.serviceCount)} detail={`Across all services · Last ${data.range}`} />
        </dl>
      </div>

      <div className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span className="inline-flex min-w-0 items-center gap-1.5"><span className="size-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden="true" /><span className="truncate" title={displayedService || "All services"}>{displayedService || "All services"}</span><span className="shrink-0">· Last {data.range}</span></span>
          <span role="status" className="inline-flex shrink-0 items-center gap-1.5">{isFetching ? <><RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Updating</> : !isLive ? "Refresh paused" : error ? "Refresh failed" : `Updated ${formatClock(data.receivedAt)}`}</span>
        </div>
        {points.length ? <MetricsChart key={`${selected.key}:${displayedService ?? "all"}:${reportedRange}`} points={points} unit={selected.unit} range={reportedRange} metricName={selected.name} /> : (
          <div className="flex min-h-[220px] flex-col items-center justify-center px-3 py-8 text-center">
            <ChartColumn size={21} className="text-zinc-500" aria-hidden="true" />
            <h3 className="mt-3 text-[13px] font-medium text-zinc-300">No measurements in this selection</h3>
            <p className="mt-1 text-[12px] leading-5 text-zinc-400">{displayedService ? `${displayedService} has not reported this instrument in the selected period.` : "Choose a longer period to look for earlier measurements."}</p>
            {displayedService && <Button variant="ghost" size="sm" className="mt-3" onClick={() => onSearchChange({ ...search, service: undefined })}>Show all services</Button>}
          </div>
        )}
      </div>

      <section aria-label="Metric service breakdown" className="border-t border-white/[0.07]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
          <div><h3 className="text-[13px] font-medium text-zinc-200">By service</h3><p className="mt-1 text-[11px] text-zinc-400">All reporting services · Last {data.range}. Select a service to inspect its chart.</p></div>
          {displayedService && <Button variant="ghost" size="sm" onClick={() => onSearchChange({ ...search, service: undefined })}>Clear service</Button>}
        </div>
        {breakdown.length ? (
          <div className="max-h-[320px] overflow-y-auto overscroll-contain">
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px] gap-3 border-y border-white/[0.06] bg-white/[0.015] px-4 py-2 text-[11px] text-zinc-400 sm:grid sm:px-5"><span>Service</span><span className="text-right">Reported value</span><span className="text-right">Data points</span></div>
            <ul className="divide-y divide-white/[0.06]">
              {breakdown.map((row) => (
                <li key={row.service}>
                  <button type="button" aria-pressed={displayedService === row.service} onClick={() => onSearchChange({ ...search, metric: selected.key, service: row.service })}
                    className={`group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px] sm:px-5 ${displayedService === row.service ? "bg-white/[0.04]" : ""}`}>
                    <span className="flex min-w-0 items-center gap-2.5"><Server size={14} className="shrink-0 text-zinc-500" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] text-zinc-200" title={row.service}>{row.service}</span><span className="mt-0.5 block text-[11px] text-zinc-400">{metricAggregationLabel(row.aggregation)} · Seen {formatMetricDateTime(row.lastSeen)}</span></span><ArrowUpRight size={12} className="shrink-0 text-zinc-600 group-hover:text-zinc-300" aria-hidden="true" /></span>
                    <span className="flex min-w-0 items-center justify-end gap-3"><span aria-hidden="true" className="hidden h-1 w-12 overflow-hidden rounded-full bg-white/[0.06] xl:block">{sameUnit && row.value >= 0 && largest > 0 && <span className="block h-full rounded-full bg-zinc-500" style={{ width: `${row.value / largest * 100}%` }} />}</span><span className="break-words text-right text-[12px] tabular-nums text-zinc-300">{formatMetricValue(row.value, metricValueUnit(selected.unit, row.aggregation))}</span></span>
                    <span className="col-span-2 text-[11px] tabular-nums text-zinc-400 sm:col-span-1 sm:text-right"><span className="sm:sr-only">Data points </span>{formatMetricCount(row.sampleCount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="px-4 pb-5 text-[12px] text-zinc-400 sm:px-5">No service values were reported in this period.</p>}
      </section>

      <details className="group border-t border-white/[0.07]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12px] text-zinc-400 transition-colors hover:bg-white/[0.025] hover:text-zinc-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:px-5 [&::-webkit-details-marker]:hidden">Instrument details<ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary>
        <div className="space-y-4 border-t border-white/[0.06] px-4 py-4 sm:px-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <InstrumentFact label="Instrument">{formatMetricType(selected.type)}</InstrumentFact>
            <InstrumentFact label="Unit">{selected.unit || "Unitless"}</InstrumentFact>
            <InstrumentFact label="Temporality">{formatMetricType(selected.aggregationTemporality) || "Unspecified"}</InstrumentFact>
            <InstrumentFact label="First report">{formatMetricDateTime(selected.firstSeen)}</InstrumentFact>
            <InstrumentFact label="Last report">{formatMetricDateTime(selected.lastSeen)}</InstrumentFact>
            <InstrumentFact label="Monotonic">{selected.type === "sum" ? selected.isMonotonic ? "Yes" : "No" : "Not applicable"}</InstrumentFact>
            <InstrumentFact label="Catalog data points">{formatMetricCount(selected.dataPointCount)}</InstrumentFact>
          </dl>
          <p className="text-[11px] text-zinc-400">Catalog metadata covers all services in the last {data.range}; it is not narrowed by the chart’s service filter.</p>
          {selected.dimensions.length > 0 && <div><p className="mb-2 text-[11px] text-zinc-400">Dimensions</p><div className="flex flex-wrap gap-1.5">{selected.dimensions.map((dimension) => <span key={dimension} className="max-w-full break-all rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 font-mono text-[11px] text-zinc-400">{dimension}</span>)}</div></div>}
        </div>
      </details>
    </>
  );
}

function MetricStat({ label, value, detail, primary = false }: { label: string; value: string; detail: string; primary?: boolean }) {
  return <div className="min-w-0"><dt className="text-[11px] text-zinc-400">{label}</dt><dd className={`mt-1.5 break-words font-normal tabular-nums tracking-[-0.025em] text-zinc-100 ${primary ? "text-[24px]" : "text-[20px]"}`}>{value}</dd><p className="mt-1 break-words text-[11px] leading-4 text-zinc-400">{detail}</p></div>;
}

function InstrumentFact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[11px] text-zinc-400">{label}</dt><dd className="mt-1 break-words text-[12px] leading-5 text-zinc-200">{children}</dd></div>;
}

function MetricsMessage({ title, detail, icon, children, alert }: { title: string; detail: string; icon: ReactNode; children?: ReactNode; alert?: boolean }) {
  return <div role={alert ? "alert" : undefined} className="flex min-h-[440px] flex-col items-center justify-center px-6 py-12 text-center"><span className="flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-400">{icon}</span><h2 className="mt-3 text-[14px] font-medium text-zinc-200">{title}</h2><p className="mt-1 max-w-sm text-[12px] leading-5 text-zinc-400">{detail}</p>{children}</div>;
}

function MetricLibrarySkeleton() {
  return <div aria-hidden="true" className="space-y-2 px-4 pb-4 animate-pulse motion-reduce:animate-none">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex gap-3 py-3"><div className="mt-1 size-3.5 rounded bg-white/[0.05]" /><div className="min-w-0 flex-1 space-y-2"><div className="h-3 w-32 max-w-full rounded bg-white/[0.06]" /><div className="h-2.5 w-20 rounded bg-white/[0.035]" /></div></div>)}</div>;
}

export function MetricExplorerSkeleton() {
  return <div role="status" aria-label="Loading metrics" aria-busy="true" className="animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading metrics</span><div aria-hidden="true"><div className="space-y-5 border-b border-white/[0.07] p-4 sm:p-5"><div className="flex flex-wrap justify-between gap-4"><div className="space-y-2"><div className="h-4 w-48 max-w-full rounded bg-white/[0.06]" /><div className="h-3 w-64 max-w-full rounded bg-white/[0.035]" /></div><div className="h-9 w-[200px] max-w-full rounded-lg bg-white/[0.04]" /></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-2"><div className="h-3 w-24 rounded bg-white/[0.04]" /><div className="h-6 w-20 rounded bg-white/[0.06]" /><div className="h-2.5 w-32 max-w-full rounded bg-white/[0.03]" /></div>)}</div></div><div className="p-4 sm:p-5"><div className="mb-3 h-3 w-32 rounded bg-white/[0.04]" /><div className="h-[220px] rounded-lg bg-white/[0.025]" /></div><div className="border-t border-white/[0.07] p-4 sm:p-5"><div className="mb-4 h-3 w-24 rounded bg-white/[0.05]" />{Array.from({ length: 3 }, (_, index) => <div key={index} className="flex justify-between gap-5 border-t border-white/[0.05] py-4"><div className="h-3 w-28 rounded bg-white/[0.04]" /><div className="h-3 w-16 rounded bg-white/[0.04]" /></div>)}</div></div></div>;
}

function MetricInstrumentIcon({ type, size = 14, className }: { type: string; size?: number; className?: string }) {
  const props = { size, className, "aria-hidden": true as const };
  if (type === "gauge") return <Gauge {...props} />;
  if (type === "sum") return <Sigma {...props} />;
  if (type === "histogram" || type === "exponential_histogram") return <ChartColumn {...props} />;
  return <Activity {...props} />;
}
function formatClock(value: number) { return Number.isFinite(value) ? new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "Unknown"; }
