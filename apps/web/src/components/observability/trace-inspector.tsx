import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import { ArrowUpRight, ChevronRight, Logs } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { JsonViewer } from "@/components/requests/json-viewer";
import { SideSheet } from "@/components/ui/side-sheet";
import { logAttributes } from "./logs-data";
import { TraceStatusBadge } from "./trace-status-badge";
import { orderedTraceSpans, traceTimelineDuration } from "./trace-waterfall-data";
import {
  formatTraceDateTime,
  formatTraceCount,
  formatTraceDuration,
  formatTraceISO,
  traceWaterfallGeometry,
  type TraceDetailsResponse,
  type TraceSpan,
  type TraceSummary,
  type TracesRange,
} from "./traces-data";
import { fetchTraceDetails } from "./traces-query";

type DetailTab = "waterfall" | "context" | "raw";
interface CopyFeedback { onCopyError?: () => void; onCopied?: () => void }
interface DetailsState { data: TraceDetailsResponse | null; loading: boolean; error: string | null; retry: () => void }
const linkClass = "inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-md text-[12px] text-zinc-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

export function TraceInspector({ trace, orgSlug, onClose, returnFocusRef, range = "1h" }: {
  trace: TraceSummary | null;
  orgSlug: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  range?: TracesRange;
}) {
  const details = useTraceDetails(orgSlug, trace?.id ?? null);
  return <SideSheet open={Boolean(trace)} onClose={onClose} title="Trace details" returnFocusRef={returnFocusRef}>
    {trace && <TraceInspectorSession key={JSON.stringify([orgSlug, trace.id, trace.startedAt])} trace={trace} orgSlug={orgSlug} range={range} details={details} />}
  </SideSheet>;
}

/** Every opened trace has its own abortable request; stale responses cannot replace it. */
function useTraceDetails(orgSlug: string, traceId: string | null): DetailsState {
  const [state, setState] = useState<{ scope: string; attempt: number; data: TraceDetailsResponse | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const scope = JSON.stringify([orgSlug, traceId]);
  useEffect(() => {
    if (traceId === null) return;
    const controller = new AbortController();
    let active = true;
    void fetchTraceDetails(orgSlug, traceId, controller.signal).then((data) => {
      if (active && !controller.signal.aborted) setState({ scope, attempt, data, error: null });
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted) return;
      setState({ scope, attempt, data: null, error: error instanceof Error ? error.message : "Trace details are temporarily unavailable." });
    });
    return () => { active = false; controller.abort(); };
  }, [orgSlug, traceId, scope, attempt]);
  const current = traceId !== null && state?.scope === scope && state.attempt === attempt ? state : null;
  return { data: current?.data ?? null, loading: traceId !== null && !current, error: current?.error ?? null, retry: () => setAttempt((value) => value + 1) };
}

function TraceInspectorSession({ trace, orgSlug, range, details }: { trace: TraceSummary; orgSlug: string; range: TracesRange; details: DetailsState }) {
  const [tab, setTab] = useState<DetailTab>("waterfall");
  const [selectedSpanKey, setSelectedSpanKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const selectedPanelId = useId();
  const rows = orderedTraceSpans(details.data?.spans ?? []);
  const selected = rows.find((row) => row.key === selectedSpanKey)?.span ?? null;
  const copyFeedback: CopyFeedback = { onCopyError: () => setCopyError(true), onCopied: () => setCopyError(false) };
  return <div className="min-w-0 space-y-5">
    <TraceInspectorSummary trace={trace} orgSlug={orgSlug} range={range} {...copyFeedback} />
    {copyError && <p role="alert" className="text-[12px] leading-5 text-amber-300">Could not copy to the clipboard. Check your browser permissions and try again.</p>}
    <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)} className="outray-arc outray-arc-tunnel-tabs">
      <TabsList aria-label="Trace detail sections" data-outray-tabs-list>
        <TabsTrigger value="waterfall" data-outray-tabs-trigger>Waterfall</TabsTrigger>
        <TabsTrigger value="context" data-outray-tabs-trigger>Context</TabsTrigger>
        <TabsTrigger value="raw" data-outray-tabs-trigger>Raw trace</TabsTrigger>
      </TabsList>
      <TabsContent value={tab} className="!mt-5">
        {tab === "context" ? <TraceContext trace={trace} {...copyFeedback} /> : details.loading ? <TraceWaterfallSkeleton /> : details.error ? <TraceDetailsError error={details.error} onRetry={details.retry} /> : details.data && tab === "raw" ? <RawTrace data={details.data} {...copyFeedback} /> : details.data ? <TraceWaterfall trace={trace} spans={details.data.spans} selectedKey={selectedSpanKey} onSelect={setSelectedSpanKey} selectedPanelId={selectedPanelId} /> : null}
        {tab === "waterfall" && selected && <div id={selectedPanelId} className="mt-6 border-t border-white/[0.06] pt-5"><TraceSpanContent span={selected} {...copyFeedback} /></div>}
      </TabsContent>
    </Tabs>
  </div>;
}

export function TraceInspectorSummary({ trace, orgSlug, range = "1h", ...copyFeedback }: CopyFeedback & { trace: TraceSummary; orgSlug: string; range?: TracesRange }) {
  const started = formatTraceISO(trace.startedAt);
  return <section aria-label="Trace summary" className="min-w-0">
    <div className="flex flex-wrap items-center gap-2.5"><TraceStatusBadge status={trace.status} /><time dateTime={started || undefined} title={started || undefined} className="text-[12px] tabular-nums text-zinc-400">{formatTraceDateTime(trace.startedAt)}</time></div>
    <h2 className="mt-3 whitespace-pre-wrap font-mono text-[14px] font-normal leading-6 text-zinc-200 [overflow-wrap:anywhere]">{trace.name || "Unnamed operation"}</h2>
    <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
      <Fact label="Root service">{trace.rootService ? <Link to="/$orgSlug/observability/services/$serviceId" params={{ orgSlug, serviceId: trace.rootService }} className={`${linkClass} !min-h-0 [overflow-wrap:anywhere]`}>{trace.rootService}<ArrowUpRight size={13} aria-hidden="true" className="shrink-0 text-zinc-500" /></Link> : "—"}</Fact>
      <Fact label="Duration">{formatTraceDuration(trace.duration)}</Fact>
      <Fact label="Recorded spans">{formatTraceCount(trace.spanCount)}</Fact>
    </dl>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
      <div className="flex min-w-0 items-center gap-1.5"><span title={trace.id} className="max-w-[240px] truncate font-mono text-[11px] text-zinc-500">{trace.id || "No trace ID"}</span>{trace.id && <CopyButton value={trace.id} label="Copy trace ID" iconOnly variant="plain" className="!size-7" {...copyFeedback} />}</div>
      {trace.id && <Link to="/$orgSlug/observability/logs" params={{ orgSlug }} search={{ search: trace.id, range }} className={linkClass}><Logs size={14} strokeWidth={1.75} aria-hidden="true" />View logs<ArrowUpRight size={13} aria-hidden="true" /></Link>}
    </div>
  </section>;
}

export function TraceWaterfall({ trace, spans, selectedKey = null, onSelect, selectedPanelId }: { trace: TraceSummary; spans: readonly TraceSpan[]; selectedKey?: string | null; onSelect: (key: string) => void; selectedPanelId?: string }) {
  const rows = orderedTraceSpans(spans);
  const duration = traceTimelineDuration(trace, spans);
  return <section aria-label="Span waterfall" className="min-w-0">
    <SectionHeading title="Span waterfall" accessory={<span className="text-[11px] tabular-nums text-zinc-500">{spans.length.toLocaleString()} {spans.length === 1 ? "span" : "spans"}</span>} />
    {rows.length === 0 ? <div className="py-8 text-center"><p className="text-[13px] text-zinc-300">No spans recorded.</p><p className="mt-1.5 text-[12px] leading-5 text-zinc-500">The trace summary is available, but this trace has no span details.</p></div> : <>
      <p className="mb-4 text-[12px] leading-5 text-zinc-500">Select an operation to inspect its context and attributes.</p>
      <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_64px] gap-3 px-3 text-[11px] text-zinc-500 md:grid"><span>Operation</span><span className="flex justify-between gap-2">{duration > 0 ? <><span>0</span><span>{formatTraceDuration(duration)}</span></> : <span>Timing unavailable</span>}</span><span className="text-right">Duration</span></div>
      <ul className="max-h-[320px] divide-y divide-white/[0.06] overflow-y-auto overscroll-contain rounded-lg border border-white/[0.06]">
        {rows.map(({ span, key, depth }) => {
          const geometry = traceWaterfallGeometry(span, duration);
          const selected = selectedKey === key;
          return <li key={key}><button type="button" aria-pressed={selected} aria-controls={selected ? selectedPanelId : undefined} onClick={() => onSelect(key)} className={`grid min-h-[72px] w-full min-w-0 grid-cols-[minmax(0,1fr)_64px] items-center gap-x-3 gap-y-3 px-3 py-3 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/60 motion-reduce:transition-none md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_64px] ${selected ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"}`}>
            <div className="flex min-w-0 items-start gap-1.5" style={{ paddingLeft: `${Math.min(depth, 4) * 10}px` }}>{depth > 0 && <ChevronRight size={12} aria-hidden="true" className="mt-1 shrink-0 text-zinc-600" />}<div className="min-w-0"><p className={`line-clamp-2 font-mono text-[12px] leading-5 [overflow-wrap:anywhere] ${span.status === "error" ? "text-rose-300" : "text-zinc-300"}`}>{span.name || "Unnamed operation"}</p><p className="mt-0.5 truncate text-[11px] text-zinc-500">{span.service || "Unknown service"}</p></div></div>
            <div aria-hidden="true" className="relative col-span-2 row-start-2 h-5 overflow-hidden rounded bg-white/[0.025] md:col-span-1 md:col-start-2 md:row-start-auto">{geometry ? <span className={`absolute top-1.5 h-2 rounded-sm ${span.status === "error" ? "bg-rose-400/65" : "bg-zinc-400/50"}`} style={{ left: `${geometry.left}%`, width: `${geometry.width}%`, minWidth: geometry.width === 0 ? "2px" : undefined }} /> : <span className="px-2 text-[10px] text-zinc-600">Timing unavailable</span>}</div>
            <span className={`col-start-2 row-start-1 text-right font-mono text-[11px] tabular-nums md:col-start-3 ${span.status === "error" ? "text-rose-300" : "text-zinc-400"}`}>{formatTraceDuration(span.duration)}</span>
            <span className="sr-only">{span.status === "error" ? "Error. " : ""}{depth > 0 ? `Nested span, level ${depth + 1}. ` : ""}{span.duration === 0 ? "Instant span. " : ""}Offset {formatTraceDuration(span.offset)}.</span>
          </button></li>;
        })}
      </ul>
    </>}
  </section>;
}

export function TraceSpanContent({ span, ...copyFeedback }: CopyFeedback & { span: TraceSpan }) {
  const kind = ({ 0: "Unspecified", 1: "Internal", 2: "Server", 3: "Client", 4: "Producer", 5: "Consumer" } as Record<number, string>)[span.kind] ?? "Unknown";
  return <section aria-label="Selected span" className="min-w-0 space-y-6">
    <div><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-[13px] font-medium text-zinc-300">Selected operation</h2><TraceStatusBadge status={span.status} /></div><p className="mt-2 whitespace-pre-wrap font-mono text-[13px] leading-5 text-zinc-200 [overflow-wrap:anywhere]">{span.name || "Unnamed operation"}</p></div>
    {span.statusMessage && <p className={`whitespace-pre-wrap rounded-md px-3 py-2 text-[12px] leading-5 [overflow-wrap:anywhere] ${span.status === "error" ? "bg-rose-400/[0.06] text-rose-300" : "bg-white/[0.03] text-zinc-400"}`}>{span.statusMessage}</p>}
    <dl className="divide-y divide-white/[0.05]">
      <ContextRow label="Span ID" value={span.id} copy {...copyFeedback} />
      <ContextRow label="Parent span" value={span.parentId} copy {...copyFeedback} />
      <ContextRow label="Service" value={span.service} />
      <ContextRow label="Kind" value={kind} />
      <ContextRow label="Started" value={formatTraceISO(span.startedAt) || null} />
      <ContextRow label="Duration" value={formatTraceDuration(span.duration)} />
      <ContextRow label="Offset" value={formatTraceDuration(span.offset)} />
    </dl>
    <Attributes title="Span attributes" value={span.attributes} {...copyFeedback} />
    <details className="group border-t border-white/[0.06] pt-4"><summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded text-[13px] font-medium text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"><ChevronRight size={14} aria-hidden="true" className="text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none" />Resource attributes<span className="ml-auto text-[11px] font-normal text-zinc-500">{logAttributes(span.resourceAttributes).length}</span></summary><div className="mt-3"><Attributes title="Resource attributes" value={span.resourceAttributes} {...copyFeedback} /></div></details>
    <RecordedItems title="Events" items={span.events} />
    <RecordedItems title="Links" items={span.links} />
  </section>;
}

export function TraceContext({ trace, ...copyFeedback }: CopyFeedback & { trace: TraceSummary }) {
  return <section aria-label="Trace context"><SectionHeading title="Trace context" /><dl className="divide-y divide-white/[0.05]"><ContextRow label="Trace ID" value={trace.id} copy {...copyFeedback} /><ContextRow label="Root service" value={trace.rootService} /><ContextRow label="Operation" value={trace.name} /><ContextRow label="HTTP method" value={trace.method} /><ContextRow label="Started" value={formatTraceISO(trace.startedAt) || null} /><ContextRow label="Duration" value={formatTraceDuration(trace.duration)} /><ContextRow label="Recorded spans" value={formatTraceCount(trace.spanCount)} /></dl></section>;
}

export function TraceDetailsError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div role="alert" className="rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-4 py-4"><p className="text-[13px] leading-5 text-amber-200">{error}</p><p className="mt-1.5 text-[12px] leading-5 text-zinc-500">The trace summary is still available. Try loading the span details again.</p><Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>Try again</Button></div>;
}

export function TraceWaterfallSkeleton() {
  return <div role="status" aria-label="Loading trace spans" aria-busy="true" className="space-y-4"><span className="sr-only">Loading trace spans</span><div className="h-4 w-28 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" /><div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06]">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="grid min-h-[72px] animate-pulse gap-3 px-3 py-3 motion-reduce:animate-none md:grid-cols-2"><div className="space-y-2" style={{ paddingLeft: `${Math.min(index, 2) * 10}px` }}><div className="h-3 w-32 max-w-full rounded bg-white/[0.07]" /><div className="h-2.5 w-20 max-w-full rounded bg-white/[0.04]" /></div><div className="my-2 h-2 w-3/4 rounded bg-white/[0.06]" /></div>)}</div></div>;
}

function RawTrace({ data, ...copyFeedback }: CopyFeedback & { data: TraceDetailsResponse }) {
  const json = JSON.stringify(data, null, 2);
  return <section aria-label="Raw trace"><SectionHeading title="Raw trace" accessory={<CopyButton value={json} label="Copy trace JSON" variant="plain" {...copyFeedback} />} /><p className="mb-3 text-[12px] text-zinc-500">The complete recorded spans returned by OutRay.</p><pre className="min-w-0 whitespace-pre-wrap break-words rounded-lg border border-white/[0.06] bg-black/15 p-3 font-mono text-[12px] leading-5 text-zinc-300 [overflow-wrap:anywhere]">{json}</pre></section>;
}

function Attributes({ title, value, ...copyFeedback }: CopyFeedback & { title: string; value: unknown }) {
  const entries = logAttributes(value);
  return <section aria-label={title}><SectionHeading title={title} accessory={entries.length ? <span className="text-[11px] tabular-nums text-zinc-500">{entries.length}</span> : undefined} />{entries.length ? <dl className="divide-y divide-white/[0.05]">{entries.map(({ key, value: item }) => <ContextRow key={key} label={key} value={item} preserveEmpty copy {...copyFeedback} />)}</dl> : <p className="text-[12px] leading-5 text-zinc-500">No attributes recorded.</p>}</section>;
}

function RecordedItems({ title, items }: { title: string; items: unknown[] }) {
  const recorded = Array.isArray(items) ? items : [];
  return <details className="group border-t border-white/[0.06] pt-4"><summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded text-[13px] font-medium text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"><ChevronRight size={14} aria-hidden="true" className="text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none" />{title}<span className="ml-auto text-[11px] font-normal tabular-nums text-zinc-500">{recorded.length}</span></summary><div className="mt-3 space-y-3">{recorded.length ? recorded.map((item, index) => <div key={index} className="min-w-0 rounded-lg border border-white/[0.06] bg-black/10 p-3"><JsonViewer data={item} /></div>) : <p className="text-[12px] text-zinc-500">No {title.toLowerCase()} recorded.</p>}</div></details>;
}

function ContextRow({ label, value, copy = false, preserveEmpty = false, ...copyFeedback }: CopyFeedback & { label: string; value: string | number | null | undefined; copy?: boolean; preserveEmpty?: boolean }) {
  const known = value !== null && value !== undefined && (typeof value !== "number" || Number.isFinite(value)) && (preserveEmpty || value !== "");
  return <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-3 py-2.5"><dt className="text-[12px] leading-5 text-zinc-500 [overflow-wrap:anywhere]">{label}</dt><dd className="flex min-w-0 items-start gap-1.5 font-mono text-[12px] leading-5 text-zinc-300"><span className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{known ? String(value) : "—"}</span>{copy && known && <CopyButton value={String(value)} label={`Copy ${label}`} iconOnly variant="plain" className="!-my-1 !size-7 shrink-0" {...copyFeedback} />}</dd></div>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[12px] text-zinc-500">{label}</dt><dd className="mt-1.5 text-[13px] leading-5 text-zinc-300 [overflow-wrap:anywhere]">{children}</dd></div>;
}

function SectionHeading({ title, accessory }: { title: string; accessory?: ReactNode }) {
  return <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2"><h2 className="text-[13px] font-medium text-zinc-300">{title}</h2>{accessory}</div>;
}
