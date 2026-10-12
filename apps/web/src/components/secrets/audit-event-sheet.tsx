import { createContext, useContext, type RefObject } from "react";
import { Check, ChevronDown, CircleAlert, Eye, FilePenLine, ShieldCheck, Trash2 } from "lucide-react";
import type { SecretAuditEvent } from "@/lib/secrets-client";
import { SideSheet } from "../ui/side-sheet";
import { CopyButton } from "../arc/copy-button/copy-button";
import { auditActionLabel, auditActorDetail, auditActorLabel, auditCategory, auditLocation, auditMetadataRows, auditResourceLabel, auditResourceName } from "./audit-data";

const detailRowsClassName = "m-0 flex min-w-0 flex-col gap-3 [&>div]:grid [&>div]:min-w-0 [&>div]:grid-cols-[120px_minmax(0,1fr)] [&>div]:gap-3 [&_dt]:text-xs [&_dt]:leading-[1.7] [&_dt]:text-zinc-500 [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-xs [&_dd]:leading-[1.7] [&_dd]:text-zinc-300 [&_dd]:[overflow-wrap:anywhere] max-[420px]:[&>div]:grid-cols-1 max-[420px]:[&>div]:gap-1";

type Props = {
  event: SecretAuditEvent | null;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

// AnimatePresence may retain a closing portal's previous children. Context still
// updates them, so event details disappear immediately when the selection clears.
const SelectedEvent = createContext<SecretAuditEvent | null>(null);

export function AuditEventSheet({ event, onClose, returnFocusRef }: Props) {
  return <SelectedEvent.Provider value={event}>
    <SideSheet open={Boolean(event)} onClose={onClose} title="Audit event" description="A read-only record of Secrets activity." returnFocusRef={returnFocusRef}>
      <AuditEventSession />
    </SideSheet>
  </SelectedEvent.Provider>;
}

function AuditEventSession() {
  const event = useContext(SelectedEvent);
  return event ? <AuditEventDetails key={event.id} event={event} /> : null;
}

export function AuditEventDetails({ event }: { event: SecretAuditEvent }) {
  const category = auditCategory(event.action);
  const Icon = category === "access" ? Eye : category === "delete" ? Trash2 : category === "security" ? ShieldCheck : FilePenLine;
  const outcome = event.result === "success" ? { label: "Success", Icon: Check }
    : event.result === "failure" ? { label: "Failed", Icon: CircleAlert }
    : event.result === "denied" ? { label: "Denied", Icon: ShieldCheck } : null;
  const actorDetail = auditActorDetail(event);
  const location = auditLocation(event);
  const resourceLabel = auditResourceLabel(event);
  const resourceName = auditResourceName(event);
  const metadata = auditMetadataRows(event);
  const recorded = new Date(event.createdAt);
  const validDate = Number.isFinite(recorded.getTime());
  const timestamp = validDate ? new Intl.DateTimeFormat("en", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC", timeZoneName: "short",
  }).format(recorded) : "Not recorded";
  const technical = [
    { label: "Event ID", value: event.id },
    { label: "Resource ID", value: event.resourceId },
    { label: "Vault ID", value: event.projectId },
    { label: "Environment ID", value: event.environmentId },
    { label: "Actor ID", value: event.actorId },
    { label: "Machine token ID", value: event.actorTokenId },
    { label: "Secret ID", value: event.entryId },
    { label: "Request ID", value: event.requestId },
    { label: "IP address", value: event.ipAddress },
    { label: "User agent", value: event.userAgent },
  ].filter((row): row is { label: string; value: string } => typeof row.value === "string" && row.value.trim().length > 0);

  return <div className="ph-no-capture flex min-w-0 flex-col gap-6" data-private-product="secrets">
    <section className="flex min-w-0 items-start gap-3 border-b border-white/[.07] pb-5 max-[420px]:flex-wrap max-[420px]:gap-2.5" aria-label="Event summary">
      <span className="grid size-[38px] basis-[38px] place-items-center rounded-[10px] border border-white/[.07] bg-white/[.025] text-zinc-400 data-[category=delete]:text-[#bd9199] data-[category=security]:text-[#c3ae87]" data-category={category}><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 [&>h2]:m-0 [&>h2]:text-sm [&>h2]:leading-[1.6] [&>h2]:font-medium [&>h2]:tracking-[-.015em] [&>h2]:text-zinc-200 [&>h2]:[overflow-wrap:anywhere] [&>p]:mt-1 [&>p]:mb-0 [&>p]:flex [&>p]:flex-wrap [&>p]:gap-x-[7px] [&>p]:gap-y-1 [&>p]:text-xs [&>p]:leading-[1.6] [&>p]:text-zinc-400 [&>p]:[overflow-wrap:anywhere] [&>p>span:first-child]:text-zinc-500">
        <h2>{auditActionLabel(event.action)}</h2>
        <p><span>{resourceLabel}</span>{resourceName !== resourceLabel ? <span>{resourceName}</span> : null}</p>
      </div>
      {outcome ? <span className="mt-0.5 inline-flex min-h-6 shrink-0 items-center gap-1.25 rounded-md border border-white/[.07] bg-white/[.02] px-[7px] py-[3px] text-[10px] leading-[1.4] data-[outcome=success]:text-[#84bfa7] data-[outcome=failure]:text-[#d3949f] data-[outcome=denied]:text-[#c9b18b] max-[420px]:ml-12" data-outcome={event.result}><outcome.Icon size={12} strokeWidth={1.8} aria-hidden="true" />{outcome.label}</span> : null}
    </section>
    <section aria-label="Activity context">
      <dl className={`${detailRowsClassName} gap-[18px] [&_dd>span]:block [&_dd>small]:mt-[3px] [&_dd>small]:block [&_dd>small]:text-[11px] [&_dd>small]:leading-[1.6] [&_dd>small]:text-zinc-500`}>
        <div><dt>Performed by</dt><dd><span>{auditActorLabel(event)}</span>{actorDetail ? <small>{actorDetail}</small> : null}</dd></div>
        {location ? <div><dt>Location</dt><dd>{location}</dd></div> : null}
        <div><dt>Recorded at</dt><dd><time dateTime={validDate ? recorded.toISOString() : undefined}>{timestamp}</time></dd></div>
      </dl>
    </section>
    {metadata.length ? <section className="border-t border-white/[.07] pt-5 [&>h3]:mt-0 [&>h3]:mb-3.5 [&>h3]:text-xs [&>h3]:leading-[1.6] [&>h3]:font-medium [&>h3]:text-zinc-300" aria-label="Change details">
      <h3>Change details</h3>
      <dl className={detailRowsClassName}>{metadata.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    </section> : null}
    <details className="group rounded-[10px] border border-white/[.07] bg-white/[.012] [&>summary]:flex [&>summary]:min-h-[58px] [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:rounded-[10px] [&>summary]:px-3.5 [&>summary]:py-3 [&>summary]:transition-colors [&>summary]:duration-120 [&>summary:hover]:bg-white/[.025] [&>summary:focus-visible]:outline-2 [&>summary:focus-visible]:outline-offset-3 [&>summary:focus-visible]:outline-zinc-400 [&>summary::-webkit-details-marker]:hidden [&>summary>span>span]:block [&>summary>span>span]:text-xs [&>summary>span>span]:leading-[1.6] [&>summary>span>span]:text-zinc-400 [&>summary_small]:mt-0.5 [&>summary_small]:block [&>summary_small]:text-[10px] [&>summary_small]:leading-[1.6] [&>summary_small]:text-zinc-500 [&>summary>svg]:shrink-0 [&>summary>svg]:text-zinc-500 [&>summary>svg]:transition-transform [&>summary>svg]:duration-120 group-open:[&>summary>svg]:rotate-180 motion-reduce:[&>summary]:transition-none motion-reduce:[&>summary>svg]:transition-none">
      <summary><span><span>Technical details</span><small>Identifiers and request context</small></span><ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" /></summary>
      <dl className="m-0 flex min-w-0 flex-col gap-3 border-t border-white/[.06] p-3.5 [&>div]:grid [&>div]:min-w-0 [&>div]:grid-cols-[120px_minmax(0,1fr)] [&>div]:gap-3 [&_dt]:text-[11px] [&_dt]:leading-[1.7] [&_dt]:text-zinc-500 [&_dd]:m-0 [&_dd]:flex [&_dd]:min-w-0 [&_dd]:items-start [&_dd]:gap-1.5 [&_dd]:font-mono [&_dd]:text-[10px] [&_dd]:leading-[1.7] [&_dd]:text-zinc-300 [&_dd]:[overflow-wrap:anywhere] [&_dd>span]:min-w-0 [&_dd>span]:flex-1 max-[420px]:[&>div]:grid-cols-[90px_minmax(0,1fr)] max-[420px]:[&>div]:gap-2">{technical.map((row) => <div key={row.label}>
        <dt>{row.label}</dt>
        <dd><span>{row.value}</span>{row.label === "Event ID" ? <CopyButton value={event.id} label="Copy event ID" iconOnly variant="plain" className="-mt-1.25 size-[30px] basis-[30px] rounded-md" /> : null}</dd>
      </div>)}</dl>
    </details>
    <p className="-mt-1 mb-0 flex items-start gap-[7px] text-[11px] leading-[1.7] text-zinc-500 [&>svg]:mt-0.5 [&>svg]:shrink-0"><ShieldCheck size={13} strokeWidth={1.7} aria-hidden="true" /><span>Secret values and credentials are not shown in this record.</span></p>
  </div>;
}
