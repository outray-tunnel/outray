import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowRight, CircleAlert, FileText, Plus, RefreshCw, Search, Workflow } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import PauseIcon from "@hugeicons-pro/core-solid-rounded/PauseIcon";
import PlayIcon from "@hugeicons-pro/core-solid-rounded/PlayIcon";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { SegmentedControl } from "../ui/segmented-control";
import { ConnectServiceSheet } from "./connect-service-sheet";
import { LogLevelBadge } from "./log-level-badge";
import {
  LOG_RANGES, formatLogDateTime, formatLogISO, formatLogTime, logIdentity,
  logsSelectionMatches, parseLogTimestamp, sortedLogs,
  type LogEvent, type LogsSearch, type LogsSnapshot,
} from "./logs-data";
import "../outray-arc-theme.css";

export interface LogsContentProps {
  orgSlug: string;
  data?: LogsSnapshot;
  filters: LogsSearch;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onFiltersChange: (patch: Partial<LogsSearch>) => void;
  onClearFilters: () => void;
  isLive: boolean;
  onToggleLive: () => void;
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  onRetry: () => void;
  onInspect: (event: LogEvent, trigger: HTMLButtonElement) => void;
  selectedId?: string;
  searchRef?: RefObject<HTMLInputElement | null>;
}

const columns = "xl:grid-cols-[115px_100px_170px_minmax(0,1fr)_100px_16px]";
const logLimit = 250;

export function LogsContent({
  orgSlug, data, filters, searchInput, onSearchInputChange, onFiltersChange, onClearFilters,
  isLive, onToggleLive, loading, isFetching, error, onRetry, onInspect, selectedId, searchRef,
}: LogsContentProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const connectTrigger = useRef<HTMLButtonElement>(null);
  const logs = useMemo(() => sortedLogs(data?.logs ?? []), [data?.logs]);
  const hasFilters = !!filters.search || !!filters.service || !!filters.level;
  const matches = data ? logsSelectionMatches(data, filters) : true;
  const displayed = data?.requestedSearch ?? filters;
  const receivedDate = new Date(data?.receivedAt ?? NaN);
  const updatedTime = Number.isFinite(receivedDate.getTime()) ? formatLogTime(receivedDate.toISOString()) : "—";
  const initialLoading = !data && (loading || !error);
  const serviceNames = useMemo(() => {
    const names = new Set(data?.services ?? []);
    if (filters.service) names.add(filters.service);
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [data?.services, filters.service]);

  return (
    <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Logs</h1>
          <p className="mt-1 text-[12px] text-zinc-400">Structured events from your applications, with their trace context.</p>
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onToggleLive} aria-pressed={!isLive} title={isLive ? "Pause automatic refresh" : "Resume automatic refresh"}>
            <HugeiconsIcon icon={isLive ? PauseIcon : PlayIcon} size={13} aria-hidden="true" />{isLive ? "Pause" : "Resume"}
          </Button>
          <SegmentedControl label="Log time range" options={LOG_RANGES.map((value) => ({ value, label: value }))} value={filters.range} onValueChange={(range) => onFiltersChange({ range })} />
        </div>
      </header>

      <section aria-label="Application logs" className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
        <div className="flex flex-wrap items-end gap-3 border-b border-white/[0.07] p-4">
          <div className="outray-arc-requests-search min-w-0 flex-1 basis-full sm:basis-[260px]">
            <SearchField appearance="workspace" ref={searchRef} label="Search logs" placeholder="Message, service, event name or trace ID…" value={searchInput} onValueChange={onSearchInputChange} autoComplete="off" spellCheck={false} />
          </div>
          <div className="min-w-0 flex-1 basis-[180px] sm:max-w-[220px]">
            <Select label="Service" value={filters.service ? `service:${filters.service}` : "all"} onValueChange={(value) => onFiltersChange({ service: value === "all" ? undefined : value.slice("service:".length) })}
              options={[{ value: "all", label: "All services" }, ...serviceNames.map((value) => ({ value: `service:${value}`, label: value }))]} />
          </div>
          <div className="min-w-0 flex-1 basis-[145px] sm:max-w-[165px]">
            <Select label="Severity" value={filters.level ?? "all"} onValueChange={(value) => onFiltersChange({ level: value === "all" ? undefined : value as LogsSearch["level"] })}
              options={[{ value: "all", label: "All severities" }, { value: "debug", label: "Debug" }, { value: "info", label: "Info" }, { value: "warn", label: "Warning" }, { value: "error", label: "Error" }]} />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={onClearFilters}>Clear filters</Button>}
        </div>

        {error && data && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/80">
            <span>Could not refresh logs. Showing the last available events.</span>
            <Button variant="ghost" size="sm" onClick={onRetry} loading={isFetching}>Retry</Button>
          </div>
        )}
        {!matches && data && (
          <div role="status" className="border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[11px] leading-5 text-zinc-400">
            {isFetching ? "Loading your selection" : "The new selection is unavailable"} · Showing {describeLogSelection(displayed)}.
          </div>
        )}

        {(initialLoading || logs.length > 0) && <div aria-hidden="true" className={`hidden gap-4 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-400 xl:grid ${columns}`}>
          <span>Time</span><span>Severity</span><span>Service</span><span>Message</span><span>Trace</span><span />
        </div>}

        {initialLoading ? <LogRowsSkeleton /> : error && !data ? (
          <LogListMessage icon={<CircleAlert size={21} aria-hidden="true" />} title="Logs unavailable" detail="We could not load your application events. Try again to reconnect." alert>
            <Button variant="secondary" className="mt-4" onClick={onRetry} loading={isFetching}><RefreshCw size={14} aria-hidden="true" /> Try again</Button>
          </LogListMessage>
        ) : !logs.length && (displayed.search || displayed.service || displayed.level) ? (
          <LogListMessage icon={<Search size={21} aria-hidden="true" />} title="No matching logs" detail={`No events match ${describeLogSelection(displayed)}. Try another query or loosen your filters.`}>
            <Button variant="secondary" className="mt-4" onClick={onClearFilters}>Clear filters</Button>
          </LogListMessage>
        ) : !logs.length ? (
          <LogListMessage icon={<FileText size={21} aria-hidden="true" />} title="No logs in this period" detail={`No application logs were received in the last ${displayed.range}. Choose a longer range, or connect a service that sends logs through OTLP.`}>
            <Button ref={connectTrigger} variant="secondary" size="md" className="mt-4" aria-haspopup="dialog" aria-expanded={connectOpen} onClick={() => setConnectOpen(true)}><Plus size={14} aria-hidden="true" /> Connect a service</Button>
          </LogListMessage>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {logs.map((event) => <LogRow key={logIdentity(event)} event={event} selected={selectedId === logIdentity(event)} onInspect={onInspect} />)}
          </ul>
        )}

        {data && <footer className="flex min-h-11 flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-400">
          <span>{logs.length.toLocaleString()} {logs.length === 1 ? "event" : "events"} shown · Newest matching logs{logs.length >= logLimit ? " · Limited to 250" : ""}</span>
          <span role="status" className="inline-flex items-center gap-1.5">{isFetching ? <><RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Updating</> : !isLive ? "Refresh paused" : error ? "Refresh failed" : `Updated ${updatedTime}`}</span>
        </footer>}
      </section>
      <ConnectServiceSheet key={orgSlug} orgSlug={orgSlug} open={connectOpen} onClose={() => setConnectOpen(false)} onRecheck={onRetry} returnFocusRef={connectTrigger} />
    </div>
  );
}

function LogRow({ event, selected, onInspect }: { event: LogEvent; selected: boolean; onInspect: (event: LogEvent, trigger: HTMLButtonElement) => void }) {
  const serviceContext = [event.environment, event.serviceVersion].filter(Boolean).join(" · ");
  const timestamp = parseLogTimestamp(event.timestamp);
  const dateLabel = Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Unknown date";
  return (
    <li>
      <button type="button" onClick={(click) => onInspect(event, click.currentTarget)} aria-haspopup="dialog" aria-expanded={selected}
        className={`group grid min-h-[76px] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent xl:min-h-[72px] ${columns} ${selected ? "bg-white/[0.045]" : ""}`}>
        <time dateTime={formatLogISO(event.timestamp) || undefined} title={formatLogDateTime(event.timestamp)} className="min-w-0 text-[11px] tabular-nums text-zinc-400">
          <span className="block font-mono">{formatLogTime(event.timestamp, true)}</span><span className="mt-0.5 block text-[10px] text-zinc-500">{dateLabel}</span>
        </time>
        <span className="justify-self-end xl:justify-self-start"><LogLevelBadge event={event} /></span>
        <span className="col-span-2 min-w-0 xl:col-span-1"><span className="block truncate text-[12px] text-zinc-300" title={event.service}>{event.service || "Unknown service"}</span>{serviceContext && <span className="mt-0.5 block truncate text-[11px] text-zinc-500" title={serviceContext}>{serviceContext}</span>}</span>
        <span className="col-span-2 min-w-0 xl:col-span-1"><span className="line-clamp-2 whitespace-pre-wrap font-mono text-[12px] leading-5 text-zinc-200 [overflow-wrap:anywhere]">{event.message || "Empty log message"}</span>{event.eventName && <span className="mt-1 block truncate text-[11px] text-zinc-500" title={event.eventName}>{event.eventName}</span>}</span>
        <span className="col-span-2 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-zinc-500 xl:col-span-1" title={event.traceId || "No trace context"}>{event.traceId ? <><Workflow size={12} className="shrink-0" aria-hidden="true" /><span className="truncate">{event.traceId.slice(0, 10)}</span><span className="sr-only"> · Open event to view its trace</span></> : <><span className="xl:sr-only">Trace </span>—</>}</span>
        <ArrowRight size={13} className="hidden text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none xl:block" aria-hidden="true" />
      </button>
    </li>
  );
}

export function LogRowsSkeleton() {
  return (
    <div role="status" aria-label="Loading logs" aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading logs</span>
      <div aria-hidden="true" className="divide-y divide-white/[0.06]">
        {Array.from({ length: 7 }, (_, index) => <div key={index} className={`grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 xl:min-h-[72px] ${columns}`}>
          <div className="space-y-2"><div className="h-3 w-24 max-w-full rounded bg-white/[0.06]" /><div className="h-2.5 w-9 rounded bg-white/[0.03]" /></div><div className="h-3 w-16 rounded bg-white/[0.05]" />
          <div className="col-span-2 h-3 w-28 max-w-full rounded bg-white/[0.045] xl:col-span-1" /><div className="col-span-2 h-3 w-80 max-w-full rounded bg-white/[0.06] xl:col-span-1" /><div className="col-span-2 h-3 w-16 rounded bg-white/[0.03] xl:col-span-1" /><div className="hidden size-3 rounded bg-white/[0.03] xl:block" />
        </div>)}
      </div>
    </div>
  );
}

function LogListMessage({ title, detail, icon, children, alert }: { title: string; detail: string; icon: ReactNode; children?: ReactNode; alert?: boolean }) {
  return <div role={alert ? "alert" : undefined} className="px-5 py-14 text-center"><span className="mx-auto flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-400">{icon}</span><h2 className="mt-3 text-[14px] font-medium text-zinc-200">{title}</h2><p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-zinc-400">{detail}</p>{children}</div>;
}

function describeLogSelection(filters: LogsSearch) {
  return [filters.service ? `logs from ${filters.service}` : "logs from all services", filters.level ? `${filters.level === "warn" ? "warning" : filters.level} severity` : "all severities", `last ${filters.range}`, filters.search ? `matching “${filters.search}”` : ""].filter(Boolean).join(" · ");
}
