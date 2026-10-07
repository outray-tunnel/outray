import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowRight, ChevronRight, CircleAlert, Plus, RefreshCw, Search, Workflow } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import PauseIcon from "@hugeicons-pro/core-solid-rounded/PauseIcon";
import PlayIcon from "@hugeicons-pro/core-solid-rounded/PlayIcon";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { SegmentedControl } from "../ui/segmented-control";
import { ConnectServiceSheet } from "./connect-service-sheet";
import { TraceStatusBadge } from "./trace-status-badge";
import {
  TRACE_RANGES, formatTraceCount, formatTraceDateTime, formatTraceDuration,
  formatTraceISO, formatTraceRate, formatTraceTime, parseTraceTimestamp, sortedTraces,
  traceIdentity, tracesSelectionMatches,
  type NormalizedTracesSearch, type TraceSummary, type TracesSearch, type TracesSnapshot,
} from "./traces-data";
import "../outray-arc-theme.css";

export interface TracesContentProps {
  orgSlug: string;
  data?: TracesSnapshot;
  filters: NormalizedTracesSearch;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onFiltersChange: (patch: Partial<TracesSearch>) => void;
  onClearFilters: () => void;
  isLive: boolean;
  onToggleLive: () => void;
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  onRetry: () => void;
  onInspect: (trace: TraceSummary, trigger: HTMLButtonElement) => void;
  selectedId?: string;
  searchRef?: RefObject<HTMLInputElement | null>;
}

const columns = "xl:grid-cols-[minmax(0,1fr)_90px_165px_115px_95px_55px_16px]";
const buckets = [
  ["<50", "<50ms"], ["50-100", "50–100ms"], ["100-250", "100–250ms"], ["250-500", "250–500ms"],
  ["500-750", "500–750ms"], ["750-1s", "750ms–1s"], ["1-2s", "1–2s"], [">2s", "≥2s"],
] as const;

export function TracesContent({ orgSlug, data, filters, searchInput, onSearchInputChange, onFiltersChange, onClearFilters, isLive, onToggleLive, loading, isFetching, error, onRetry, onInspect, selectedId, searchRef }: TracesContentProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const connectTrigger = useRef<HTMLButtonElement>(null);
  const traces = useMemo(() => sortedTraces(data?.traces ?? []), [data?.traces]);
  const hasFilters = !!filters.search || !!filters.errorsOnly;
  const displayed = data?.requestedSearch ?? filters;
  const matches = data ? tracesSelectionMatches(data, filters) : true;
  const initialLoading = !data && (loading || !error);
  const receivedDate = new Date(data?.receivedAt ?? NaN);
  const updatedTime = Number.isFinite(receivedDate.getTime()) ? formatTraceTime(receivedDate.toISOString()) : "—";

  return (
    <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="min-w-0"><h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Traces</h1><p className="mt-1 text-[12px] text-zinc-400">Follow operations across services and find where time is spent.</p></div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onToggleLive} aria-pressed={!isLive} title={isLive ? "Pause automatic refresh" : "Resume automatic refresh"}><HugeiconsIcon icon={isLive ? PauseIcon : PlayIcon} size={13} aria-hidden="true" />{isLive ? "Pause" : "Resume"}</Button>
          <SegmentedControl label="Trace time range" options={TRACE_RANGES.map((value) => ({ value, label: value }))} value={filters.range} onValueChange={(range) => onFiltersChange({ range })} />
        </div>
      </header>

      {(initialLoading || data) && <section aria-label="Trace statistics" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 text-[11px] text-zinc-400"><span>Across all traces</span><span>Last {data?.range ?? filters.range}</span></div>
        {initialLoading ? <TraceStatsSkeleton /> : data && <div className="grid grid-cols-2 divide-x divide-white/[0.06] xl:grid-cols-4">
          <TraceStat label="Total traces" value={formatTraceCount(data.statistics.totalTraces)} detail="Received in this period" />
          <TraceStat label="Error traces" value={formatTraceCount(data.statistics.errorTraces)} detail={data.statistics.totalTraces > 0 ? `${formatTraceRate(data.statistics.errorRate)} of all traces` : "No measured traces"} />
          <TraceStat label="P95 duration" value={data.statistics.totalTraces > 0 ? formatTraceDuration(data.statistics.p95Duration) : "—"} detail="End-to-end latency" />
          <TraceStat label="Longest trace" value={data.statistics.totalTraces > 0 ? formatTraceDuration(data.statistics.longestDuration) : "—"} detail="Slowest in this period" />
        </div>}
        {data && <DurationDistribution data={data} />}
      </section>}

      <section aria-label="Recorded traces" className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
        <div className="flex flex-wrap items-end gap-3 border-b border-white/[0.07] p-4">
          <div className="outray-arc-requests-search min-w-0 flex-1 basis-[260px]"><SearchField appearance="workspace" ref={searchRef} label="Search traces" placeholder="Operation, service or trace ID…" value={searchInput} onValueChange={onSearchInputChange} autoComplete="off" spellCheck={false} /></div>
          <div className="min-w-0 flex-1 basis-[170px] sm:max-w-[200px]"><Select label="Status" value={filters.errorsOnly ? "errors" : "all"} onValueChange={(value) => onFiltersChange({ errorsOnly: value === "errors" || undefined })} options={[{ value: "all", label: "All traces" }, { value: "errors", label: "Errors only" }]} /></div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={onClearFilters}>Clear filters</Button>}
        </div>
        {error && data && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/80"><span>Could not refresh traces. Showing the last available data.</span><Button variant="ghost" size="sm" onClick={onRetry} loading={isFetching}>Retry</Button></div>}
        {!matches && data && <div role="status" className="border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[11px] leading-5 text-zinc-400">{isFetching ? "Loading your selection" : "The new selection is unavailable"} · Showing {describeSelection(displayed)}.</div>}

        {(initialLoading || traces.length > 0) && <div aria-hidden="true" className={`hidden gap-4 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-400 xl:grid ${columns}`}><span>Operation</span><span>Status</span><span>Root service</span><span>Started</span><span className="text-right">Duration</span><span className="text-right">Spans</span><span /></div>}
        {initialLoading ? <TraceRowsSkeleton /> : error && !data ? (
          <TraceListMessage alert icon={<CircleAlert size={21} aria-hidden="true" />} title="Traces unavailable" detail="We could not load your traces. Try again to reconnect."><Button variant="secondary" className="mt-4" onClick={onRetry} loading={isFetching}><RefreshCw size={14} aria-hidden="true" />Try again</Button></TraceListMessage>
        ) : !traces.length && (displayed.search || displayed.errorsOnly) ? (
          <TraceListMessage icon={<Search size={21} aria-hidden="true" />} title="No matching traces" detail={`No traces match ${describeSelection(displayed)}. Try another query or clear your filters.`}><Button variant="secondary" className="mt-4" onClick={onClearFilters}>Clear filters</Button></TraceListMessage>
        ) : !traces.length ? (
          <TraceListMessage icon={<Workflow size={21} aria-hidden="true" />} title="No traces in this period" detail={`No traces were received in the last ${displayed.range}. Try a longer period, or connect an instrumented service.`}><Button ref={connectTrigger} variant="secondary" size="md" className="mt-4" aria-haspopup="dialog" aria-expanded={connectOpen} onClick={() => setConnectOpen(true)}><Plus size={14} aria-hidden="true" />Connect a service</Button></TraceListMessage>
        ) : <ul className="divide-y divide-white/[0.06]">{traces.map((trace) => <TraceRow key={traceIdentity(trace)} trace={trace} selected={selectedId === traceIdentity(trace)} onInspect={onInspect} />)}</ul>}

        {data && <footer className="flex min-h-11 flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-400"><span>{traces.length.toLocaleString()} {traces.length === 1 ? "trace" : "traces"} shown · Newest matching traces{traces.length >= 100 ? " · Limited to 100" : ""}</span><span role="status" className="inline-flex items-center gap-1.5">{isFetching ? <><RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Updating</> : !isLive ? "Refresh paused" : error ? "Refresh failed" : `Updated ${updatedTime}`}</span></footer>}
      </section>
      <ConnectServiceSheet key={orgSlug} orgSlug={orgSlug} open={connectOpen} onClose={() => setConnectOpen(false)} onRecheck={onRetry} returnFocusRef={connectTrigger} />
    </div>
  );
}

function TraceRow({ trace, selected, onInspect }: { trace: TraceSummary; selected: boolean; onInspect: TracesContentProps["onInspect"] }) {
  const timestamp = parseTraceTimestamp(trace.startedAt);
  const date = Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Unknown date";
  return <li><button type="button" aria-haspopup="dialog" aria-expanded={selected} onClick={(click) => onInspect(trace, click.currentTarget)} className={`group grid min-h-[72px] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${columns} ${selected ? "bg-white/[0.045]" : ""}`}>
    <span className="min-w-0"><span className="line-clamp-2 font-mono text-[12px] leading-5 text-zinc-200 [overflow-wrap:anywhere]">{trace.name || "Unnamed operation"}</span><span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500" title={trace.id}>{trace.id || "No trace ID"}</span></span>
    <span className="justify-self-end xl:justify-self-start"><TraceStatusBadge status={trace.status} /></span>
    <span className="col-span-2 min-w-0 truncate text-[12px] text-zinc-400 xl:col-span-1" title={trace.rootService}><span className="sr-only">Root service </span>{trace.rootService || "Unknown service"}</span>
    <time dateTime={formatTraceISO(trace.startedAt) || undefined} title={formatTraceDateTime(trace.startedAt)} className="col-span-2 min-w-0 text-[11px] tabular-nums text-zinc-400 xl:col-span-1"><span className="block font-mono">{formatTraceTime(trace.startedAt, true)}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{date}</span></time>
    <span className="min-w-0 text-[12px] tabular-nums text-zinc-300 xl:text-right"><span className="mr-1 text-[11px] text-zinc-500 xl:sr-only">Duration </span>{formatTraceDuration(trace.duration)}</span>
    <span className="justify-self-end text-[12px] tabular-nums text-zinc-400"><span className="mr-1 text-[11px] text-zinc-500 xl:sr-only">Spans </span>{formatTraceCount(trace.spanCount)}</span>
    <ArrowRight size={13} className="hidden text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none xl:block" aria-hidden="true" />
  </button></li>;
}

function TraceStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 px-4 py-4"><p className="text-[12px] text-zinc-400">{label}</p><p className="mt-1.5 text-[23px] font-normal tracking-[-0.035em] tabular-nums text-zinc-100">{value}</p><p className="mt-1 text-[11px] text-zinc-500">{detail}</p></div>;
}

function DurationDistribution({ data }: { data: TracesSnapshot }) {
  const values = new Map(data.distribution.map((item) => [item.bucket, item.count]));
  const counts = buckets.map(([key]) => values.get(key) ?? 0);
  const largest = Math.max(0, ...counts.filter((count) => Number.isFinite(count) && count >= 0));
  return <details className="group border-t border-white/[0.06]">
    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-[12px] text-zinc-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"><ChevronRight size={13} className="text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />Duration distribution<span className="ml-auto text-[11px] text-zinc-500">All traces · Last {data.range}</span></summary>
    {!largest ? <p className="px-4 pb-4 text-[12px] text-zinc-400">No measured duration distribution in this period.</p> : <ul aria-label="Trace counts by duration" className="grid grid-cols-4 gap-x-3 gap-y-4 px-4 pb-5 sm:grid-cols-8">{buckets.map(([key, label], index) => {
      const count = counts[index];
      const known = Number.isFinite(count) && count >= 0;
      return <li key={key} className="min-w-0 text-center"><span className="mb-2 block text-[11px] tabular-nums text-zinc-400">{formatTraceCount(count)}</span><span aria-hidden="true" className="flex h-14 items-end justify-center rounded-md bg-white/[0.02]"><span className="block w-full max-w-10 rounded-t-sm bg-zinc-500" style={{ height: known ? `${count / largest * 100}%` : "0%" }} /></span><span className="mt-2 block text-[10px] text-zinc-500">{label}</span></li>;
    })}</ul>}
  </details>;
}

export function TraceStatsSkeleton() {
  return <div role="status" aria-label="Loading trace statistics" aria-busy="true" className="grid animate-pulse grid-cols-2 divide-x divide-white/[0.06] motion-reduce:animate-none xl:grid-cols-4"><span className="sr-only">Loading trace statistics</span>{Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="space-y-3 px-4 py-4"><div className="h-3 w-20 max-w-full rounded bg-white/[0.05]" /><div className="h-7 w-24 max-w-full rounded bg-white/[0.07]" /><div className="h-2.5 w-28 max-w-full rounded bg-white/[0.03]" /></div>)}</div>;
}

export function TraceRowsSkeleton() {
  return <div role="status" aria-label="Loading traces" aria-busy="true" className="animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading traces</span><div aria-hidden="true" className="divide-y divide-white/[0.06]">{Array.from({ length: 7 }, (_, index) => <div key={index} className={`grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 ${columns}`}><div className="space-y-2"><div className="h-3 w-52 max-w-full rounded bg-white/[0.06]" /><div className="h-2.5 w-36 max-w-full rounded bg-white/[0.03]" /></div><div className="h-3 w-16 rounded bg-white/[0.05]" /><div className="col-span-2 h-3 w-28 rounded bg-white/[0.04] xl:col-span-1" /><div className="col-span-2 h-3 w-24 rounded bg-white/[0.035] xl:col-span-1" /><div className="h-3 w-12 rounded bg-white/[0.04] xl:justify-self-end" /><div className="h-3 w-6 justify-self-end rounded bg-white/[0.03]" /><div className="hidden size-3 rounded bg-white/[0.03] xl:block" /></div>)}</div></div>;
}

function TraceListMessage({ title, detail, icon, children, alert }: { title: string; detail: string; icon: ReactNode; children?: ReactNode; alert?: boolean }) {
  return <div role={alert ? "alert" : undefined} className="px-5 py-14 text-center"><span className="mx-auto flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-400">{icon}</span><h2 className="mt-3 text-[14px] font-medium text-zinc-200">{title}</h2><p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-zinc-400">{detail}</p>{children}</div>;
}

function describeSelection(filters: NormalizedTracesSearch) {
  return [filters.errorsOnly ? "error traces" : "all traces", `last ${filters.range}`, filters.search ? `matching “${filters.search}”` : ""].filter(Boolean).join(" · ");
}
