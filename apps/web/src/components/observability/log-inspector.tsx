import { Link } from "@tanstack/react-router";
import { useState, type ReactNode, type RefObject } from "react";
import { ArrowUpRight, ChevronRight, Network } from "lucide-react";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { JsonViewer, formatBody } from "@/components/requests/json-viewer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SideSheet } from "@/components/ui/side-sheet";
import { LogLevelBadge } from "./log-level-badge";
import {
  formatLogDateTime,
  formatLogISO,
  logAttributes,
  logIdentity,
  logRawJson,
  type LogEvent,
} from "./logs-data";

type LogDetailTab = "message" | "context" | "raw";
interface CopyFeedback {
  onCopyError?: () => void;
  onCopied?: () => void;
}
const formatOptions = [{ value: "pretty", label: "Pretty" }, { value: "raw", label: "Raw" }] as const;
const linkClass = "inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-md text-[12px] text-zinc-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

export function LogInspector({
  event,
  orgSlug,
  onClose,
  returnFocusRef,
}: {
  event: LogEvent | null;
  orgSlug: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <SideSheet open={Boolean(event)} onClose={onClose} title="Log details" returnFocusRef={returnFocusRef}>
      {event && <LogInspectorSession key={`${orgSlug}:${logIdentity(event)}`} event={event} orgSlug={orgSlug} />}
    </SideSheet>
  );
}

function LogInspectorSession({ event, orgSlug }: { event: LogEvent; orgSlug: string }) {
  const [tab, setTab] = useState<LogDetailTab>("message");
  const [copyError, setCopyError] = useState(false);
  const copyFeedback: CopyFeedback = {
    onCopyError: () => setCopyError(true),
    onCopied: () => setCopyError(false),
  };

  return (
    <div className="min-w-0 space-y-5">
      <LogInspectorSummary event={event} orgSlug={orgSlug} {...copyFeedback} />
      {copyError && <p role="alert" className="text-[12px] leading-5 text-amber-300">Could not copy to the clipboard. Check your browser permissions and try again.</p>}
      <Tabs value={tab} onValueChange={(value) => setTab(value as LogDetailTab)} className="outray-arc outray-arc-tunnel-tabs">
        <TabsList aria-label="Log detail sections" data-outray-tabs-list>
          <TabsTrigger value="message" data-outray-tabs-trigger>Message</TabsTrigger>
          <TabsTrigger value="context" data-outray-tabs-trigger>Context</TabsTrigger>
          <TabsTrigger value="raw" data-outray-tabs-trigger>Raw event</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="!mt-5">
          <LogInspectorContent event={event} tab={tab} {...copyFeedback} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function LogInspectorSummary({ event, orgSlug, ...copyFeedback }: CopyFeedback & { event: LogEvent; orgSlug: string }) {
  const iso = formatLogISO(event.timestamp);
  return (
    <section aria-label="Log summary" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <LogLevelBadge event={event} />
        <time dateTime={iso || undefined} title={iso || undefined} className="text-[12px] tabular-nums text-zinc-400">{formatLogDateTime(event.timestamp)}</time>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
        <Fact label="Service">
          {event.service ? <Link to="/$orgSlug/observability/services/$serviceId" params={{ orgSlug, serviceId: event.service }} className={`${linkClass} !min-h-0 [overflow-wrap:anywhere]`}>
            {event.service}<ArrowUpRight size={13} className="shrink-0 text-zinc-500" aria-hidden="true" />
          </Link> : "—"}
        </Fact>
        <Fact label="Environment">{event.environment || "—"}</Fact>
        <Fact label="Region">{event.region || "—"}</Fact>
        <Fact label="Event name">{event.eventName || "—"}</Fact>
      </dl>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span title={event.id} className="max-w-[220px] truncate font-mono text-[11px] text-zinc-500">{event.id || "No event ID"}</span>
          {event.id && <CopyButton value={event.id} label="Copy event ID" iconOnly variant="plain" className="!size-7" {...copyFeedback} />}
        </div>
        {event.traceId && <Link to="/$orgSlug/observability/traces" params={{ orgSlug }} search={{ search: event.traceId }} className={linkClass}>
          <Network size={14} strokeWidth={1.75} aria-hidden="true" />View trace<ArrowUpRight size={13} aria-hidden="true" />
        </Link>}
      </div>
    </section>
  );
}

/** Data already accompanies the stream row, so inspection never waits on another request. */
export function LogInspectorContent({
  event,
  tab = "message",
  ...copyFeedback
}: CopyFeedback & { event: LogEvent; tab?: LogDetailTab }) {
  if (tab === "message") return <LogMessage key={logIdentity(event)} message={event.message} {...copyFeedback} />;
  if (tab === "raw") {
    return (
      <section aria-label="Raw event" className="min-w-0">
        <SectionHeading title="Raw event" accessory={<CopyButton value={logRawJson(event)} label="Copy event JSON" variant="plain" {...copyFeedback} />} />
        <p className="mb-3 text-[12px] leading-5 text-zinc-500">The complete event as received by OutRay.</p>
        <pre className="min-w-0 whitespace-pre-wrap break-words rounded-lg border border-white/[0.06] bg-black/15 p-3 font-mono text-[12px] leading-5 text-zinc-300 [overflow-wrap:anywhere]">{logRawJson(event)}</pre>
      </section>
    );
  }
  return (
    <div className="min-w-0 space-y-6">
      <section aria-label="Event context">
        <SectionHeading title="Event" />
        <dl className="divide-y divide-white/[0.05]">
          <ContextRow label="Event ID" value={event.id} {...copyFeedback} copy />
          <ContextRow label="Severity text" value={event.severityText} />
          <ContextRow label="Severity number" value={event.severityNumber} />
          <ContextRow label="Occurred" value={formatLogISO(event.timestamp) || "Unknown time"} {...copyFeedback} copy />
          <ContextRow label="Observed" value={formatLogISO(event.observedTimestamp) || "Unknown time"} />
        </dl>
      </section>
      <section aria-label="Trace context">
        <SectionHeading title="Trace context" />
        <dl className="divide-y divide-white/[0.05]">
          <ContextRow label="Trace ID" value={event.traceId} {...copyFeedback} copy />
          <ContextRow label="Span ID" value={event.spanId} {...copyFeedback} copy />
          <ContextRow label="Trace flags" value={event.flags} />
        </dl>
      </section>
      <AttributesSection title="Log attributes" attributes={event.attributes} {...copyFeedback} />
      <details className="group border-t border-white/[0.06] pt-4">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded text-[13px] font-medium text-zinc-300 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} aria-hidden="true" className="text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none" />Resource
          <span className="ml-auto text-[11px] font-normal text-zinc-500">{logAttributes(event.resourceAttributes).length} attributes</span>
        </summary>
        <div className="mt-3 space-y-5">
          <dl className="divide-y divide-white/[0.05]">
            <ContextRow label="Service" value={event.service} />
            <ContextRow label="Namespace" value={event.serviceNamespace} />
            <ContextRow label="Version" value={event.serviceVersion} />
            <ContextRow label="Environment" value={event.environment} />
            <ContextRow label="Region" value={event.region} />
          </dl>
          <AttributesSection title="Resource attributes" attributes={event.resourceAttributes} {...copyFeedback} />
        </div>
      </details>
      <details className="group border-t border-white/[0.06] pt-4">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded text-[13px] font-medium text-zinc-300 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} aria-hidden="true" className="text-zinc-500 transition-transform group-open:rotate-90 motion-reduce:transition-none" />Instrumentation
          <span className="ml-auto text-[11px] font-normal text-zinc-500">{logAttributes(event.scopeAttributes).length} attributes</span>
        </summary>
        <div className="mt-3 space-y-5">
          <dl className="divide-y divide-white/[0.05]">
            <ContextRow label="Scope name" value={event.scopeName} />
            <ContextRow label="Scope version" value={event.scopeVersion} />
          </dl>
          <AttributesSection title="Scope attributes" attributes={event.scopeAttributes} {...copyFeedback} />
        </div>
      </details>
    </div>
  );
}

function LogMessage({ message, ...copyFeedback }: CopyFeedback & { message: string }) {
  const [format, setFormat] = useState<"pretty" | "raw">("pretty");
  const body = formatBody(typeof message === "string" ? message : null);
  return (
    <section aria-label="Log message" className="min-w-0">
      <SectionHeading title="Message" accessory={<div className="flex items-center gap-2">
        {body.isJson && <SegmentedControl options={formatOptions} value={format} onValueChange={setFormat} label="Message format" />}
        <CopyButton value={message || ""} label="Copy message" iconOnly variant="plain" disabled={!message} {...copyFeedback} />
      </div>} />
      {!message ? <p className="py-5 text-[13px] text-zinc-500">No message recorded.</p> : body.isJson && format === "pretty" ? <div className="min-w-0 rounded-lg border border-white/[0.06] bg-black/15 p-3"><JsonViewer data={body.parsed} /></div> : <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-zinc-200 [overflow-wrap:anywhere]">{message}</pre>}
    </section>
  );
}

function AttributesSection({ title, attributes, ...copyFeedback }: CopyFeedback & { title: string; attributes: unknown }) {
  const entries = logAttributes(attributes);
  return (
    <section aria-label={title}>
      <SectionHeading title={title} accessory={entries.length > 0 ? <span className="text-[11px] tabular-nums text-zinc-500">{entries.length}</span> : undefined} />
      {entries.length ? <dl className="divide-y divide-white/[0.05]">{entries.map(({ key, value }) => <ContextRow key={key} label={key} value={value} preserveEmpty copy {...copyFeedback} />)}</dl> : <p className="text-[12px] leading-5 text-zinc-500">No attributes recorded.</p>}
    </section>
  );
}

function ContextRow({ label, value, copy = false, preserveEmpty = false, ...copyFeedback }: CopyFeedback & { label: string; value: string | number | null | undefined; copy?: boolean; preserveEmpty?: boolean }) {
  const known = value !== null && value !== undefined && (typeof value !== "number" || Number.isFinite(value)) && (preserveEmpty || value !== "");
  const text = known ? String(value) : "—";
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-3 py-2.5">
      <dt className="text-[12px] leading-5 text-zinc-500 [overflow-wrap:anywhere]">{label}</dt>
      <dd className="flex min-w-0 items-start gap-1.5 font-mono text-[12px] leading-5 text-zinc-300">
        <span className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</span>
        {copy && known && <CopyButton value={String(value)} label={`Copy ${label}`} iconOnly variant="plain" className="!-my-1 !size-7 shrink-0" {...copyFeedback} />}
      </dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[12px] text-zinc-500">{label}</dt><dd className="mt-1.5 text-[13px] leading-5 text-zinc-300 [overflow-wrap:anywhere]">{children}</dd></div>;
}

function SectionHeading({ title, accessory }: { title: string; accessory?: ReactNode }) {
  return <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2"><h2 className="text-[13px] font-medium text-zinc-300">{title}</h2>{accessory}</div>;
}
