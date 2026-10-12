import { memo, type ReactNode } from "react";
import { Activity, ArrowUpRight, CheckCircle2, ChevronDown, CircleHelp, Clock3, FileText, Network, XCircle } from "lucide-react";
import type { AgentEvidencePresentation, AgentEvidenceReference } from "../../lib/agent/protocol";
import { safeAgentEvidenceHref } from "./agent-chat-data";

type Presentation<K extends AgentEvidencePresentation["kind"]> = Extract<AgentEvidencePresentation, { kind: K }>;
type PresentedEvidence<K extends AgentEvidencePresentation["kind"]> = AgentEvidenceReference & { presentation: Presentation<K> };
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const percentageFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const visibleSpanLimit = 6;
const visibleLogLimit = 4;
const cardClassName = "min-w-0 overflow-hidden rounded-xl border border-white/[.07] bg-white/[.015] px-3.5 py-[13px] max-[540px]:p-3";
const headerClassName = "mb-3 flex items-center justify-between gap-2.5";
const headingClassName = "flex min-w-0 flex-wrap items-center gap-[7px] text-xs font-medium text-zinc-300 [&>svg]:text-zinc-400";
const noteClassName = "mt-[7px] mb-0 flex items-start gap-1.5 text-[10px] leading-[1.6] text-zinc-500 [&>svg]:mt-0.5 [&>svg]:shrink-0";
const spansClassName = "m-0 list-none p-0";
const factsClassName = "mt-0 mb-3 grid grid-cols-2 gap-x-5 gap-y-3.5";

function number(value: number | null): string {
  return value !== null && Number.isFinite(value) ? numberFormat.format(value) : "Unknown";
}

function duration(value: number | null): string {
  return value !== null && Number.isFinite(value) && value >= 0 ? `${numberFormat.format(value)} ms` : "Unknown";
}

function bytes(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return "Unknown";
  if (value < 1_024) return `${numberFormat.format(value)} B`;
  return `${numberFormat.format(value / 1_024)} KiB`;
}

function timestamp(value: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : `${dateFormat.format(date)} UTC`;
}

function InspectLink({ evidence, label = "Inspect" }: { evidence: AgentEvidenceReference; label?: string }) {
  return <a href={evidence.href} className="inline-flex shrink-0 items-center gap-[3px] rounded-[5px] px-1 py-[3px] text-[10px] text-zinc-400 no-underline transition-[background,color] duration-120 hover:bg-white/[.04] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-zinc-400 max-[540px]:min-h-8 motion-reduce:transition-none" aria-label={`${label} ${evidence.label}`} title={evidence.observedAt ? `Retrieved ${timestamp(evidence.observedAt)}` : undefined}>{label}<ArrowUpRight size={12} aria-hidden="true" /></a>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 [&_dt]:text-[10px] [&_dt]:text-zinc-500 [&_dd]:mt-[3px] [&_dd]:mb-0 [&_dd]:text-xs [&_dd]:text-zinc-300 [&_dd]:tabular-nums [&_dd]:[overflow-wrap:anywhere]"><dt>{label}</dt><dd>{children}</dd></div>;
}

function HttpStatus({ code }: { code: number | null }) {
  const tone = code === null ? "unknown" : code >= 400 ? "error" : code >= 300 ? "redirect" : code >= 200 ? "ok" : "unknown";
  const Icon = tone === "error" ? XCircle : tone === "ok" ? CheckCircle2 : CircleHelp;
  return <span className="inline-flex shrink-0 items-center gap-1.25 whitespace-nowrap rounded-md bg-white/[.04] px-1.5 py-0.5 text-[10px] text-zinc-400 data-[tone=ok]:bg-emerald-300/[.06] data-[tone=ok]:text-emerald-300 data-[tone=error]:bg-rose-400/[.06] data-[tone=error]:text-rose-300 data-[tone=redirect]:bg-amber-300/[.06] data-[tone=redirect]:text-amber-300" data-tone={tone}><Icon size={12} aria-hidden="true" />{code === null ? "Status unknown" : `HTTP ${code}`}</span>;
}

function RequestCard({ evidence }: { evidence: PresentedEvidence<"request"> }) {
  const request = evidence.presentation;
  const capture = {
    metadata: "Only metadata was captured.",
    redacted: "Payloads are redacted. Their contents aren’t available to Agent.",
    full: "Payload contents aren’t read by Agent.",
    unknown: "Payload capture availability is unknown.",
  }[request.captureState];
  return <section aria-label="Observed request" className={cardClassName}>
    <header className={headerClassName}><span className={headingClassName}><Activity size={13} aria-hidden="true" />Request</span><InspectLink evidence={evidence} /></header>
    <div className="mt-0.5 mb-[15px] flex flex-wrap items-center gap-2 [&>code]:min-w-0 [&>code]:flex-1 [&>code]:text-xs [&>code]:text-zinc-200 [&>code]:[overflow-wrap:anywhere]"><span className="text-[11px] text-zinc-400">{request.method ?? "Unknown method"}</span><code>{request.route ?? "Unknown route"}</code><HttpStatus code={request.statusCode} /></div>
    <dl className={factsClassName}>
      <Fact label="Service">{request.service ?? "Unknown"}</Fact>
      <Fact label="Duration">{duration(request.durationMs)}</Fact>
      <Fact label="Request size">{bytes(request.requestSizeBytes)}</Fact>
      <Fact label="Response size">{bytes(request.responseSizeBytes)}</Fact>
    </dl>
    <div className={noteClassName}><Clock3 size={12} aria-hidden="true" /><span>Event time: {timestamp(request.timestamp)}</span></div>
    <p className={noteClassName}>{capture}</p>
  </section>;
}

const spanKinds: Record<number, string> = { 1: "Internal", 2: "Server", 3: "Client", 4: "Producer", 5: "Consumer" };

function SpanRow({ span, extent }: { span: Presentation<"trace">["spans"][number]; extent: number }) {
  const knownTiming = span.offsetMs !== null && span.durationMs !== null && Number.isFinite(span.offsetMs) && Number.isFinite(span.durationMs) && span.durationMs >= 0;
  const left = knownTiming ? Math.min(100, Math.max(0, span.offsetMs! / extent * 100)) : 0;
  const width = knownTiming ? Math.min(100 - left, Math.max(0.8, span.durationMs! / extent * 100)) : 0;
  const Icon = span.status === "error" ? XCircle : span.status === "ok" ? CheckCircle2 : CircleHelp;
  const kind = span.kind !== null ? spanKinds[span.kind] : null;
  return <li className="grid grid-cols-[minmax(100px,1fr)_minmax(80px,.9fr)_70px] items-center gap-3 border-t border-white/[.04] py-2 max-[540px]:grid-cols-[minmax(0,1fr)_70px] max-[540px]:gap-[7px]" aria-label={`${span.operationName ?? "Unknown operation"}; ${kind ?? "Unknown kind"} span; status ${span.status}; offset ${span.offsetMs === null ? "unknown" : `${number(span.offsetMs)} ms`}; duration ${duration(span.durationMs)}`}>
    <div className="flex min-w-0 items-start gap-1.5 [&>div]:min-w-0"><Icon size={12} className="mt-[3px] shrink-0 text-zinc-500 data-[tone=ok]:text-emerald-300 data-[tone=error]:text-rose-300" data-tone={span.status} aria-hidden="true" /><div><span className="block text-[11px] text-zinc-300 [overflow-wrap:anywhere]">{span.operationName ?? "Unknown operation"}</span><span className="block text-[9px] text-zinc-500 [overflow-wrap:anywhere]">{[kind ?? "Unknown kind", span.service].filter(Boolean).join(" · ")}</span></div></div>
    <div className="relative h-3.5 min-w-0 rounded-[3px] bg-white/[.02] max-[540px]:col-[1/-1] max-[540px]:row-2" aria-hidden="true">{knownTiming ? <span className="absolute top-[3px] h-2 rounded-sm bg-zinc-500 data-[tone=ok]:bg-zinc-400 data-[tone=error]:bg-rose-400" data-tone={span.status} style={{ left: `${left}%`, width: `${width}%` }} /> : <span className="block text-center text-[9px] leading-3.5 text-zinc-500">Timing unknown</span>}</div>
    <span className="text-right text-[10px] text-zinc-400 tabular-nums max-[540px]:col-2 max-[540px]:row-1">{duration(span.durationMs)}</span>
  </li>;
}

function TraceCard({ evidence }: { evidence: PresentedEvidence<"trace"> }) {
  const trace = evidence.presentation;
  const timings = trace.spans.flatMap((span) => span.offsetMs !== null && span.durationMs !== null && Number.isFinite(span.offsetMs) && Number.isFinite(span.durationMs) && span.durationMs >= 0 ? [Math.max(0, span.offsetMs) + span.durationMs] : []);
  const extent = timings.length ? Math.max(...timings) : null;
  const denominator = Math.max(1, extent ?? 0);
  const visible = trace.spans.slice(0, visibleSpanLimit);
  const remaining = trace.spans.slice(visibleSpanLimit);
  return <section aria-label="Observed trace timing" className={cardClassName}>
    <header className={headerClassName}><span className={headingClassName}><Network size={13} aria-hidden="true" />Trace timing<span className="text-[10px] font-normal text-zinc-500">{number(trace.spanCount)} spans</span></span><InspectLink evidence={evidence} /></header>
    <div className="flex justify-between gap-3 pb-1.5 text-[10px] text-zinc-500 tabular-nums" aria-hidden="true"><span>Relative to trace start</span><span>{extent === null ? "Timing unavailable" : duration(extent)}</span></div>
    {visible.length ? <ol className={spansClassName} aria-label="Trace spans">{visible.map((span) => <SpanRow key={span.spanId} span={span} extent={denominator} />)}</ol> : <p className={noteClassName}>No span timing was returned.</p>}
    {remaining.length > 0 && <details className="group border-t border-white/[.05]"><summary className="mt-1.25 flex cursor-pointer list-none items-center justify-between gap-2 rounded-[5px] py-1.5 text-[10px] text-zinc-400 transition-colors duration-120 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-zinc-400 group-open:[&>svg]:rotate-180 [&::-webkit-details-marker]:hidden [&>svg]:transition-transform [&>svg]:duration-120 max-[540px]:min-h-8 motion-reduce:transition-none">Show {remaining.length} more {remaining.length === 1 ? "span" : "spans"}<ChevronDown size={12} aria-hidden="true" /></summary><ol className={spansClassName} aria-label="Additional trace spans">{remaining.map((span) => <SpanRow key={span.spanId} span={span} extent={denominator} />)}</ol></details>}
    {trace.truncated && <p className={noteClassName}>Showing {number(trace.returnedSpanCount)} of {number(trace.spanCount)} spans. This trace view is incomplete.</p>}
  </section>;
}

function ComparisonCard({ evidence }: { evidence: PresentedEvidence<"comparison"> }) {
  const comparison = evidence.presentation;
  const available = comparison.totalRequests !== null ? comparison.totalRequests > 0 : comparison.sampleSize !== null && comparison.sampleSize > 0;
  const noRequests = comparison.totalRequests === 0 || comparison.measurement === "sample" && comparison.sampleSize === 0;
  const metric = (value: number | null) => noRequests || value === null ? "Unavailable" : duration(value);
  return <section aria-label={`${comparison.hours}-hour request ${comparison.measurement === "sample" ? "sample" : "comparison"}`} className={`${cardClassName} [&>header]:mb-1`}>
    <header className={headerClassName}><span className={headingClassName}>Last {comparison.hours === 1 ? "hour" : "24 hours"}</span><InspectLink evidence={evidence} /></header>
    <p className="mt-0 mb-3 text-[10px] text-zinc-500 [overflow-wrap:anywhere]">{[comparison.service ?? "All services", comparison.path ?? "All paths"].join(" · ")}</p>
    <dl className={`${factsClassName} gap-x-2 [&_dd]:text-[13px]`}>
      <Fact label={comparison.measurement === "sample" ? "Matching samples" : "Requests"}>{number(comparison.measurement === "sample" ? comparison.sampleSize : comparison.totalRequests)}</Fact>
      <Fact label="Error rate">{noRequests || comparison.errorRate === null ? "Unavailable" : `${percentageFormat.format(comparison.errorRate)}%`}</Fact>
      <Fact label="p95 duration">{metric(comparison.p95DurationMs)}</Fact>
      <Fact label="Error requests">{number(comparison.errorRequests)}</Fact>
    </dl>
    {noRequests && <p className={noteClassName}>No matching requests in this window. Duration and error-rate measurements are unavailable.</p>}
    {!noRequests && !available && <p className={noteClassName}>Request volume is unavailable for this window.</p>}
    <p className={noteClassName}>{comparison.measurement === "sample" ? "Bounded sample, not a complete period total." : "Aggregate measurements, not a root-cause diagnosis."}{comparison.truncated ? " Results are truncated." : ""}</p>
  </section>;
}

function LogRow({ evidence }: { evidence: PresentedEvidence<"log"> }) {
  const log = evidence.presentation;
  const level = log.level.toLowerCase();
  const tone = ["error", "fatal"].includes(level) ? "error" : ["warn", "warning"].includes(level) ? "redirect" : "unknown";
  return <li className="flex gap-2.25 border-t border-white/[.04] py-2"><span className="mt-1.5 size-[5px] basis-[5px] rounded-full bg-zinc-500 data-[tone=error]:bg-rose-400 data-[tone=redirect]:bg-amber-300" data-tone={tone} aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500 [&>time]:ml-auto [&>time]:tabular-nums max-[540px]:[&>time]:ml-0 max-[540px]:[&>time]:w-full"><span className="text-[9px] text-zinc-400 uppercase">{log.level}</span><span>{log.service ?? "Unknown service"}</span><time dateTime={log.timestamp ?? undefined}>{timestamp(log.timestamp)}</time></div><p className="mt-1 mb-0 text-[11px] text-zinc-400 [overflow-wrap:anywhere]">{log.messageSummary}</p></div></li>;
}

function LogsCard({ evidence }: { evidence: PresentedEvidence<"log">[] }) {
  const visible = evidence.slice(0, visibleLogLimit);
  const remaining = evidence.slice(visibleLogLimit);
  return <section aria-label="Observed correlated logs" className={cardClassName}>
    <header className={headerClassName}><span className={headingClassName}><FileText size={13} aria-hidden="true" />Correlated logs<span className="text-[10px] font-normal text-zinc-500">{evidence.length} returned</span></span><InspectLink evidence={evidence[0]} label="View logs" /></header>
    <ol className="m-0 list-none p-0">{visible.map((item) => <LogRow key={item.id} evidence={item} />)}</ol>
    {remaining.length > 0 && <details className="group border-t border-white/[.05]"><summary className="mt-1.25 flex cursor-pointer list-none items-center justify-between gap-2 rounded-[5px] py-1.5 text-[10px] text-zinc-400 transition-colors duration-120 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-zinc-400 group-open:[&>svg]:rotate-180 [&::-webkit-details-marker]:hidden [&>svg]:transition-transform [&>svg]:duration-120 max-[540px]:min-h-8 motion-reduce:transition-none">Show {remaining.length} more logs<ChevronDown size={12} aria-hidden="true" /></summary><ol className="m-0 list-none p-0">{remaining.map((item) => <LogRow key={item.id} evidence={item} />)}</ol></details>}
    <p className={noteClassName}>Raw log messages are withheld. These are metadata and safe category hints, not evidence of a cause.</p>
  </section>;
}

/** Facts only: presentation is a validated, server-derived projection, never model-generated UI. */
export const AgentEvidenceCards = memo(function AgentEvidenceCards({ evidence, orgSlug }: { evidence: AgentEvidenceReference[]; orgSlug: string }) {
  const safe = evidence.flatMap((item) => {
    const href = safeAgentEvidenceHref(item.href, orgSlug);
    return href && item.presentation ? [{ ...item, href }] : [];
  });
  const requests = safe.filter((item): item is PresentedEvidence<"request"> => item.presentation?.kind === "request");
  const traces = safe.filter((item): item is PresentedEvidence<"trace"> => item.presentation?.kind === "trace");
  const comparisons = safe.filter((item): item is PresentedEvidence<"comparison"> => item.presentation?.kind === "comparison").sort((a, b) => a.presentation.hours - b.presentation.hours);
  const logs = safe.filter((item): item is PresentedEvidence<"log"> => item.presentation?.kind === "log");
  if (!safe.length) return null;
  return <section className="mt-6 text-xs leading-[1.6]" aria-label="Evidence details">
    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-zinc-300 [&>span]:text-[10px] [&>span]:text-zinc-500"><h3>Observed evidence</h3><span>From workspace telemetry</span></div>
    <div className="grid gap-3">
      {requests.map((item) => <RequestCard key={item.id} evidence={item} />)}
      {traces.map((item) => <TraceCard key={item.id} evidence={item} />)}
      {comparisons.length > 0 && <div className="grid grid-cols-2 gap-3 max-[540px]:grid-cols-1">{comparisons.map((item) => <ComparisonCard key={item.id} evidence={item} />)}</div>}
      {logs.length > 0 && <LogsCard evidence={logs} />}
    </div>
    <p className="mt-2.5 mb-0 text-[10px] leading-[1.7] text-zinc-500">Retrieval times are available on Inspect links. Ingestion lag is unknown; this is not a guaranteed live view.</p>
  </section>;
});
