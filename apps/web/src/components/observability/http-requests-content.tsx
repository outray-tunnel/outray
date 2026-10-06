import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, Radio, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import PauseIcon from "@hugeicons-pro/core-solid-rounded/PauseIcon";
import PlayIcon from "@hugeicons-pro/core-solid-rounded/PlayIcon";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { SegmentedControl } from "../ui/segmented-control";
import { ConnectServiceSheet } from "./connect-service-sheet";
import { HttpRequestCaptureBadge, HttpRequestStatusBadge } from "./http-request-badges";
import { formatHttpRequestDuration, formatHttpRequestNumber, formatHttpRequestTime, parseHttpRequestTimestamp, type CaptureFilter, type HttpRequestSummary, type RequestFacets, type RequestsResponse, type StatusFilter } from "./http-requests-data";
import { formatBytes } from "../requests/utils";
import "../outray-arc-theme.css";

export interface HttpRequestsContentProps {
  orgSlug: string;
  data?: RequestsResponse | null;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  lastSuccessAt?: number | null;
  search: string;
  service: string;
  method: string;
  status: StatusFilter;
  capture: CaptureFilter;
  range: string;
  live: boolean;
  facets: RequestFacets;
  selectedId?: string;
  page: number;
  total: number;
  onSearchChange: (value: string) => void;
  onServiceChange: (value: string) => void;
  onMethodChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  onCaptureChange: (value: CaptureFilter) => void;
  onRangeChange: (value: string) => void;
  onToggleLive: () => void;
  onRetry: () => void;
  onResetFilters: () => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onInspect: (request: HttpRequestSummary, trigger?: HTMLButtonElement) => void;
}

const ranges = ["1h", "6h", "24h", "7d", "30d"].map((value) => ({ value, label: value }));
const columns = "xl:grid-cols-[minmax(0,1fr)_145px_70px_90px_100px_120px_16px]";
const pageSize = 50;

export function HttpRequestsContent(props: HttpRequestsContentProps) {
  const { orgSlug, data, loading, refreshing, error, lastSuccessAt, search, service, method, status, capture, range, live, facets, selectedId, page, total, onSearchChange, onServiceChange, onMethodChange, onStatusChange, onCaptureChange, onRangeChange, onToggleLive, onRetry, onResetFilters, onNextPage, onPreviousPage, onInspect } = props;
  const [connectOpen, setConnectOpen] = useState(false);
  const connectTrigger = useRef<HTMLButtonElement>(null);
  const hasFilters = !!search.trim() || service !== "" || method !== "all" || status !== "all" || capture !== "all";
  const hasRequests = Number.isFinite(data?.statistics.totalRequests) && (data?.statistics.totalRequests ?? 0) > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requests = data?.requests ?? [];
  const measured = data && hasRequests;
  const retry = <Button variant="secondary" className="mt-4" onClick={onRetry} loading={refreshing}>Try again</Button>;

  return (
    <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Requests</h1>
          <p className="mt-1 text-[12px] text-zinc-400">HTTP traffic from your instrumented services.</p>
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onToggleLive} aria-pressed={!live} title={live ? "Pause automatic refresh" : "Resume automatic refresh"}>
            <HugeiconsIcon icon={live ? PauseIcon : PlayIcon} size={13} aria-hidden="true" />{live ? "Pause" : "Resume"}
          </Button>
          <SegmentedControl label="Request time range" options={ranges} value={range} onValueChange={onRangeChange} />
        </div>
      </header>

      {loading && !data ? <StatisticsSkeleton /> : data ? (
        <section aria-label="Request summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.06] xl:grid-cols-4">
          <RequestMetric label="Requests" value={formatHttpRequestNumber(data.statistics.totalRequests)} detail={`Matching requests · Last ${range}`} />
          <RequestMetric label="Error rate" value={measured && Number.isFinite(data.statistics.errorRate) && data.statistics.errorRate >= 0 ? `${formatHttpRequestNumber(data.statistics.errorRate)}%` : "—"} detail={`${formatHttpRequestNumber(data.statistics.errorCount)} errors`} />
          <RequestMetric label="P95 latency" value={measured ? formatHttpRequestDuration(data.statistics.p95Duration) : "—"} detail="Across matching requests" />
          <RequestMetric label="Payload captures" value={formatHttpRequestNumber(data.statistics.payloadCaptureCount)} detail={`${formatHttpRequestNumber(data.statistics.metadataCount)} metadata only`} />
        </section>
      ) : null}

      <section aria-label="HTTP request inventory" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
        <div className="space-y-4 border-b border-white/[0.07] p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="outray-arc-requests-search w-full min-w-0 sm:max-w-[360px]">
              <SearchField appearance="workspace" label="Search requests" placeholder="Path, service, request or trace ID" value={search} onValueChange={onSearchChange} autoComplete="off" spellCheck={false} />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
            <Select label="Service" value={service ? `service:${service}` : "all"} onValueChange={(value) => onServiceChange(value === "all" ? "" : value.slice("service:".length))} disabled={!facets.services.length && service === ""} options={serviceOptions(facets.services, service)} />
            <Select label="Method" value={method} onValueChange={onMethodChange} disabled={!facets.methods.length && method === "all"} options={facetOptions(facets.methods, method, "All methods")} />
            <Select label="Status" value={status} onValueChange={(value) => onStatusChange(value as StatusFilter)} options={[{ value: "all", label: "All responses" }, { value: "success", label: "Successful" }, { value: "errors", label: "Errors" }]} />
            <Select label="Capture" value={capture} onValueChange={(value) => onCaptureChange(value as CaptureFilter)} options={[{ value: "all", label: "All capture states" }, { value: "full", label: "Captured" }, { value: "redacted", label: "Redacted" }, { value: "metadata", label: "Metadata only" }]} />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={onResetFilters}>Clear filters</Button>}
        </div>

        {error && data && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/[0.12] bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-200">
            <span>Could not refresh requests. Showing the last available data{lastSuccessAt ? ` from ${new Date(lastSuccessAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}.</span>
            <Button variant="ghost" size="sm" onClick={onRetry} loading={refreshing}>Retry</Button>
          </div>
        )}

        {((loading && !data) || requests.length > 0) && <div aria-hidden="true" className={`hidden gap-4 border-b border-white/[0.06] bg-[#151516] px-4 py-2.5 text-[11px] text-zinc-400 xl:grid ${columns}`}>
          <span>Request</span><span>Service</span><span>Status</span><span className="text-right">Duration</span><span className="text-right">Transferred</span><span>Capture</span><span />
        </div>}
        {loading && !data ? <RequestRowsSkeleton /> : error && !data ? (
          <ListMessage icon={<CircleAlert size={20} aria-hidden="true" />} title="Requests unavailable" detail="We could not load request telemetry. Try again to reconnect." alert action={retry} />
        ) : !requests.length ? (
          <ListMessage icon={hasFilters ? <Search size={20} aria-hidden="true" /> : <Radio size={20} aria-hidden="true" />}
            title={hasFilters ? "No matching requests" : page > 0 ? "No requests on this page" : "No requests in this period"}
            detail={hasFilters ? "Try a different search or clear the active filters." : page > 0 ? "The requests on this page may have expired. Return to the previous page." : "HTTP requests appear here when your service sends server spans. Try a longer range to find earlier traffic."}
            action={hasFilters ? <Button variant="secondary" className="mt-4" onClick={onResetFilters}>Clear filters</Button> : page > 0 ? <Button variant="secondary" className="mt-4" onClick={onPreviousPage}>Previous page</Button> : <Button ref={connectTrigger} variant="secondary" className="mt-4" aria-haspopup="dialog" aria-expanded={connectOpen} onClick={() => setConnectOpen(true)}>Connect a service <ArrowRight size={13} aria-hidden="true" /></Button>} />
        ) : (
          <>
            <ul className="divide-y divide-white/[0.06]">
              {requests.map((request) => {
                const path = request.path || request.route || "/";
                const timestamp = parseHttpRequestTimestamp(request.timestamp);
                const selected = selectedId === request.id;
                return (
                  <li key={request.id}>
                    <button type="button" aria-haspopup="dialog" aria-expanded={selected} aria-label={`Inspect ${request.method} ${path}, ${request.service}, status ${request.statusCode || "unknown"}`}
                      onClick={(event) => onInspect(request, event.currentTarget)}
                      className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 text-left transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/60 ${selected ? "bg-white/[0.055]" : "hover:bg-white/[0.035]"} ${columns}`}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex min-w-[54px] shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-0.5 font-mono text-[11px] text-zinc-300">{request.method}</span>
                        <span className="min-w-0"><span className="block truncate font-mono text-[12px] text-zinc-200" title={path}>{path}</span><span className="mt-0.5 block truncate text-[11px] text-zinc-400" title={request.requestId || request.id}>{timestamp !== null ? <time dateTime={new Date(timestamp).toISOString()}>{formatHttpRequestTime(request.timestamp)}</time> : "Unknown time"} · {request.requestId || request.id}</span></span>
                      </span>
                      <span className="hidden truncate text-[12px] text-zinc-400 xl:block" title={[request.service, request.environment, request.region].filter(Boolean).join(" · ")}>{request.service || "—"}<span className="mt-0.5 block truncate text-[11px]">{[request.environment, request.region].filter(Boolean).join(" · ")}</span></span>
                      <HttpRequestStatusBadge code={request.statusCode} />
                      <span className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] tabular-nums text-zinc-400 xl:contents">
                        <span className="max-w-full truncate text-[11px] xl:hidden">{[request.service, request.environment, request.region].filter(Boolean).join(" · ") || "Unknown service"}</span>
                        <span className="xl:text-right"><span className="text-[11px] xl:sr-only">Duration </span>{formatHttpRequestDuration(request.duration)}</span>
                        <span className="xl:text-right"><span className="text-[11px] xl:sr-only">Transferred </span>{safeBytes(request.requestSize + request.responseSize)}</span>
                        <HttpRequestCaptureBadge state={request.captureState} />
                      </span>
                      <ArrowRight size={13} className="hidden text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none xl:block" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <footer className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-400">
          <span role="status">{loading && !data ? "Loading requests…" : error && !data ? "Request data unavailable" : requests.length ? `${page * pageSize + 1}–${Math.min(page * pageSize + requests.length, total)} of ${formatHttpRequestNumber(total)} requests${refreshing ? " · Updating…" : error ? " · Last loaded" : ""}` : `${formatHttpRequestNumber(total)} requests${refreshing ? " · Updating…" : ""}`}</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`size-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-zinc-500"}`} />{live ? "Auto-refresh on" : "Auto-refresh paused"}</span>
            {(page > 0 || data?.hasMore || total > pageSize) && <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" aria-label="Previous page" onClick={onPreviousPage} disabled={page === 0 || loading}><ArrowLeft size={14} aria-hidden="true" /></Button>
              <span className="min-w-12 text-center tabular-nums">{page + 1} / {totalPages}</span>
              <Button variant="ghost" size="sm" aria-label="Next page" onClick={onNextPage} disabled={!data?.hasMore || !data.nextCursor || loading}><ArrowRight size={14} aria-hidden="true" /></Button>
            </div>}
          </div>
        </footer>
      </section>
      <ConnectServiceSheet key={orgSlug} orgSlug={orgSlug} open={connectOpen} onClose={() => setConnectOpen(false)} onRecheck={onRetry} returnFocusRef={connectTrigger} />
    </div>
  );
}

function RequestMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 bg-[#111112] px-4 py-3.5"><p className="text-[12px] text-zinc-400">{label}</p><p className="mt-1.5 text-[23px] font-normal tracking-[-0.035em] tabular-nums text-zinc-100">{value}</p><p className="mt-1 truncate text-[11px] text-zinc-400" title={detail}>{detail}</p></div>;
}

function StatisticsSkeleton() {
  return <section aria-label="Loading request summary" aria-busy="true" className="grid animate-pulse grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.06] motion-reduce:animate-none xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="bg-[#111112] px-4 py-3.5"><div className="h-4 w-20 rounded bg-zinc-800/70" /><div className="mt-1.5 h-8 w-24 rounded bg-zinc-800/70" /><div className="mt-1 h-4 w-28 max-w-full rounded bg-zinc-800/50" /></div>)}</section>;
}

function RequestRowsSkeleton() {
  return <div role="status" aria-label="Loading requests" className="animate-pulse divide-y divide-white/[0.06] motion-reduce:animate-none"><span className="sr-only">Loading requests</span>{Array.from({ length: 6 }, (_, index) => <div key={index} aria-hidden="true" className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 ${columns}`}><span className="flex min-w-0 items-center gap-3"><span className="h-6 w-[54px] shrink-0 rounded-md bg-zinc-800/70" /><span className="min-w-0 space-y-2"><span className="block h-3 w-40 max-w-full rounded bg-zinc-800/70" /><span className="block h-3 w-52 max-w-full rounded bg-zinc-800/40" /></span></span><span className="hidden h-3 w-24 rounded bg-zinc-800/60 xl:block" /><span className="h-6 w-11 rounded-md bg-zinc-800/70" /><span className="col-span-2 flex gap-5 xl:contents">{Array.from({ length: 3 }, (_, metric) => <span key={metric} className="h-3 w-14 rounded bg-zinc-800/50" />)}</span><span className="hidden size-3 rounded bg-zinc-800/40 xl:block" /></div>)}</div>;
}

function ListMessage({ icon, title, detail, action, alert }: { icon: ReactNode; title: string; detail: string; action?: ReactNode; alert?: boolean }) {
  return <div role={alert ? "alert" : "status"} className="px-5 py-14 text-center"><span className="mx-auto flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-400">{icon}</span><h2 className="mt-3 text-[14px] font-medium text-zinc-200">{title}</h2><p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-zinc-400">{detail}</p>{action}</div>;
}

function facetOptions(values: string[], current: string, allLabel: string) {
  return [{ value: "all", label: allLabel }, ...Array.from(new Set([...values, ...(current !== "all" ? [current] : [])])).filter((value) => value && value !== "all").sort().map((value) => ({ value, label: value }))];
}

function serviceOptions(values: string[], current: string) {
  // Prefix actual identities so a service named "all" stays distinct from the
  // unfiltered option, and Radix never needs an empty item value.
  return [{ value: "all", label: "All services" }, ...Array.from(new Set([...values, ...(current ? [current] : [])])).filter(Boolean).sort().map((value) => ({ value: `service:${value}`, label: value }))];
}
function safeBytes(value: number) { return Number.isFinite(value) && value >= 0 ? formatBytes(value, 1) : "—"; }
