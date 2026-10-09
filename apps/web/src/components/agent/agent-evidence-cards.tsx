import { memo, type ReactNode } from "react";
import { Activity, ArrowUpRight, CheckCircle2, ChevronDown, CircleHelp, Clock3, FileText, Network, XCircle } from "lucide-react";
import type { AgentEvidencePresentation, AgentEvidenceReference } from "../../lib/agent/protocol";
import { safeAgentEvidenceHref } from "./agent-chat-data";
import styles from "./agent-evidence-cards.module.css";

type Presentation<K extends AgentEvidencePresentation["kind"]> = Extract<AgentEvidencePresentation, { kind: K }>;
type PresentedEvidence<K extends AgentEvidencePresentation["kind"]> = AgentEvidenceReference & { presentation: Presentation<K> };
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const percentageFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const visibleSpanLimit = 6;
const visibleLogLimit = 4;

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
  return <a href={evidence.href} className={styles.inspect} aria-label={`${label} ${evidence.label}`} title={evidence.observedAt ? `Retrieved ${timestamp(evidence.observedAt)}` : undefined}>{label}<ArrowUpRight size={12} aria-hidden="true" /></a>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.fact}><dt>{label}</dt><dd>{children}</dd></div>;
}

function HttpStatus({ code }: { code: number | null }) {
  const tone = code === null ? "unknown" : code >= 400 ? "error" : code >= 300 ? "redirect" : code >= 200 ? "ok" : "unknown";
  const Icon = tone === "error" ? XCircle : tone === "ok" ? CheckCircle2 : CircleHelp;
  return <span className={styles.status} data-tone={tone}><Icon size={12} aria-hidden="true" />{code === null ? "Status unknown" : `HTTP ${code}`}</span>;
}

function RequestCard({ evidence }: { evidence: PresentedEvidence<"request"> }) {
  const request = evidence.presentation;
  const capture = {
    metadata: "Only metadata was captured.",
    redacted: "Payloads are redacted. Their contents aren’t available to Agent.",
    full: "Payload contents aren’t read by Agent.",
    unknown: "Payload capture availability is unknown.",
  }[request.captureState];
  return <section aria-label="Observed request" className={styles.card}>
    <header className={styles.header}><span className={styles.heading}><Activity size={13} aria-hidden="true" />Request</span><InspectLink evidence={evidence} /></header>
    <div className={styles.requestIdentity}><span className={styles.method}>{request.method ?? "Unknown method"}</span><code>{request.route ?? "Unknown route"}</code><HttpStatus code={request.statusCode} /></div>
    <dl className={styles.facts}>
      <Fact label="Service">{request.service ?? "Unknown"}</Fact>
      <Fact label="Duration">{duration(request.durationMs)}</Fact>
      <Fact label="Request size">{bytes(request.requestSizeBytes)}</Fact>
      <Fact label="Response size">{bytes(request.responseSizeBytes)}</Fact>
    </dl>
    <div className={styles.note}><Clock3 size={12} aria-hidden="true" /><span>Event time: {timestamp(request.timestamp)}</span></div>
    <p className={styles.note}>{capture}</p>
  </section>;
}

const spanKinds: Record<number, string> = { 1: "Internal", 2: "Server", 3: "Client", 4: "Producer", 5: "Consumer" };

function SpanRow({ span, extent }: { span: Presentation<"trace">["spans"][number]; extent: number }) {
  const knownTiming = span.offsetMs !== null && span.durationMs !== null && Number.isFinite(span.offsetMs) && Number.isFinite(span.durationMs) && span.durationMs >= 0;
  const left = knownTiming ? Math.min(100, Math.max(0, span.offsetMs! / extent * 100)) : 0;
  const width = knownTiming ? Math.min(100 - left, Math.max(0.8, span.durationMs! / extent * 100)) : 0;
  const Icon = span.status === "error" ? XCircle : span.status === "ok" ? CheckCircle2 : CircleHelp;
  const kind = span.kind !== null ? spanKinds[span.kind] : null;
  return <li className={styles.span} aria-label={`${span.operationName ?? "Unknown operation"}; ${kind ?? "Unknown kind"} span; status ${span.status}; offset ${span.offsetMs === null ? "unknown" : `${number(span.offsetMs)} ms`}; duration ${duration(span.durationMs)}`}>
    <div className={styles.spanIdentity}><Icon size={12} className={styles.spanStatus} data-tone={span.status} aria-hidden="true" /><div><span className={styles.spanName}>{span.operationName ?? "Unknown operation"}</span><span className={styles.spanKind}>{[kind ?? "Unknown kind", span.service].filter(Boolean).join(" · ")}</span></div></div>
    <div className={styles.timing} aria-hidden="true">{knownTiming ? <span className={styles.timingBar} data-tone={span.status} style={{ left: `${left}%`, width: `${width}%` }} /> : <span className={styles.unknownTiming}>Timing unknown</span>}</div>
    <span className={styles.spanDuration}>{duration(span.durationMs)}</span>
  </li>;
}

function TraceCard({ evidence }: { evidence: PresentedEvidence<"trace"> }) {
  const trace = evidence.presentation;
  const timings = trace.spans.flatMap((span) => span.offsetMs !== null && span.durationMs !== null && Number.isFinite(span.offsetMs) && Number.isFinite(span.durationMs) && span.durationMs >= 0 ? [Math.max(0, span.offsetMs) + span.durationMs] : []);
  const extent = timings.length ? Math.max(...timings) : null;
  const denominator = Math.max(1, extent ?? 0);
  const visible = trace.spans.slice(0, visibleSpanLimit);
  const remaining = trace.spans.slice(visibleSpanLimit);
  return <section aria-label="Observed trace timing" className={styles.card}>
    <header className={styles.header}><span className={styles.heading}><Network size={13} aria-hidden="true" />Trace timing<span className={styles.count}>{number(trace.spanCount)} spans</span></span><InspectLink evidence={evidence} /></header>
    <div className={styles.traceScale} aria-hidden="true"><span>Relative to trace start</span><span>{extent === null ? "Timing unavailable" : duration(extent)}</span></div>
    {visible.length ? <ol className={styles.spans} aria-label="Trace spans">{visible.map((span) => <SpanRow key={span.spanId} span={span} extent={denominator} />)}</ol> : <p className={styles.note}>No span timing was returned.</p>}
    {remaining.length > 0 && <details className={styles.more}><summary>Show {remaining.length} more {remaining.length === 1 ? "span" : "spans"}<ChevronDown size={12} aria-hidden="true" /></summary><ol className={styles.spans} aria-label="Additional trace spans">{remaining.map((span) => <SpanRow key={span.spanId} span={span} extent={denominator} />)}</ol></details>}
    {trace.truncated && <p className={styles.note}>Showing {number(trace.returnedSpanCount)} of {number(trace.spanCount)} spans. This trace view is incomplete.</p>}
  </section>;
}

function ComparisonCard({ evidence }: { evidence: PresentedEvidence<"comparison"> }) {
  const comparison = evidence.presentation;
  const available = comparison.totalRequests !== null ? comparison.totalRequests > 0 : comparison.sampleSize !== null && comparison.sampleSize > 0;
  const noRequests = comparison.totalRequests === 0 || comparison.measurement === "sample" && comparison.sampleSize === 0;
  const metric = (value: number | null) => noRequests || value === null ? "Unavailable" : duration(value);
  return <section aria-label={`${comparison.hours}-hour request ${comparison.measurement === "sample" ? "sample" : "comparison"}`} className={`${styles.card} ${styles.comparison}`}>
    <header className={styles.header}><span className={styles.heading}>Last {comparison.hours === 1 ? "hour" : "24 hours"}</span><InspectLink evidence={evidence} /></header>
    <p className={styles.scope}>{[comparison.service ?? "All services", comparison.path ?? "All paths"].join(" · ")}</p>
    <dl className={styles.comparisonFacts}>
      <Fact label={comparison.measurement === "sample" ? "Matching samples" : "Requests"}>{number(comparison.measurement === "sample" ? comparison.sampleSize : comparison.totalRequests)}</Fact>
      <Fact label="Error rate">{noRequests || comparison.errorRate === null ? "Unavailable" : `${percentageFormat.format(comparison.errorRate)}%`}</Fact>
      <Fact label="p95 duration">{metric(comparison.p95DurationMs)}</Fact>
      <Fact label="Error requests">{number(comparison.errorRequests)}</Fact>
    </dl>
    {noRequests && <p className={styles.note}>No matching requests in this window. Duration and error-rate measurements are unavailable.</p>}
    {!noRequests && !available && <p className={styles.note}>Request volume is unavailable for this window.</p>}
    <p className={styles.note}>{comparison.measurement === "sample" ? "Bounded sample, not a complete period total." : "Aggregate measurements, not a root-cause diagnosis."}{comparison.truncated ? " Results are truncated." : ""}</p>
  </section>;
}

function LogRow({ evidence }: { evidence: PresentedEvidence<"log"> }) {
  const log = evidence.presentation;
  const level = log.level.toLowerCase();
  const tone = ["error", "fatal"].includes(level) ? "error" : ["warn", "warning"].includes(level) ? "redirect" : "unknown";
  return <li className={styles.logRow}><span className={styles.logDot} data-tone={tone} aria-hidden="true" /><div><div className={styles.logMeta}><span className={styles.logLevel}>{log.level}</span><span>{log.service ?? "Unknown service"}</span><time dateTime={log.timestamp ?? undefined}>{timestamp(log.timestamp)}</time></div><p>{log.messageSummary}</p></div></li>;
}

function LogsCard({ evidence }: { evidence: PresentedEvidence<"log">[] }) {
  const visible = evidence.slice(0, visibleLogLimit);
  const remaining = evidence.slice(visibleLogLimit);
  return <section aria-label="Observed correlated logs" className={styles.card}>
    <header className={styles.header}><span className={styles.heading}><FileText size={13} aria-hidden="true" />Correlated logs<span className={styles.count}>{evidence.length} returned</span></span><InspectLink evidence={evidence[0]} label="View logs" /></header>
    <ol className={styles.logs}>{visible.map((item) => <LogRow key={item.id} evidence={item} />)}</ol>
    {remaining.length > 0 && <details className={styles.more}><summary>Show {remaining.length} more logs<ChevronDown size={12} aria-hidden="true" /></summary><ol className={styles.logs}>{remaining.map((item) => <LogRow key={item.id} evidence={item} />)}</ol></details>}
    <p className={styles.note}>Raw log messages are withheld. These are metadata and safe category hints, not evidence of a cause.</p>
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
  return <section className={styles.evidence} aria-label="Evidence details">
    <div className={styles.sectionHeading}><h3>Observed evidence</h3><span>From workspace telemetry</span></div>
    <div className={styles.cards}>
      {requests.map((item) => <RequestCard key={item.id} evidence={item} />)}
      {traces.map((item) => <TraceCard key={item.id} evidence={item} />)}
      {comparisons.length > 0 && <div className={styles.comparisons}>{comparisons.map((item) => <ComparisonCard key={item.id} evidence={item} />)}</div>}
      {logs.length > 0 && <LogsCard evidence={logs} />}
    </div>
    <p className={styles.freshness}>Retrieval times are available on Inspect links. Ingestion lag is unknown; this is not a guaranteed live view.</p>
  </section>;
});
