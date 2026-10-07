import { createContext, useContext, type RefObject } from "react";
import { Check, ChevronDown, CircleAlert, Eye, FilePenLine, ShieldCheck, Trash2 } from "lucide-react";
import type { SecretAuditEvent } from "@/lib/secrets-client";
import { SideSheet } from "../ui/side-sheet";
import { CopyButton } from "../arc/copy-button/copy-button";
import { auditActionLabel, auditActorDetail, auditActorLabel, auditCategory, auditLocation, auditMetadataRows, auditResourceLabel, auditResourceName } from "./audit-data";
import styles from "./audit-event-sheet.module.css";

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

  return <div className={`ph-no-capture ${styles.content}`} data-private-product="secrets">
    <section className={styles.summary} aria-label="Event summary">
      <span className={styles.summaryIcon} data-category={category}><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>
      <div className={styles.summaryText}>
        <h2>{auditActionLabel(event.action)}</h2>
        <p><span>{resourceLabel}</span>{resourceName !== resourceLabel ? <span>{resourceName}</span> : null}</p>
      </div>
      {outcome ? <span className={styles.outcome} data-outcome={event.result}><outcome.Icon size={12} strokeWidth={1.8} aria-hidden="true" />{outcome.label}</span> : null}
    </section>
    <section aria-label="Activity context">
      <dl className={styles.context}>
        <div><dt>Performed by</dt><dd><span>{auditActorLabel(event)}</span>{actorDetail ? <small>{actorDetail}</small> : null}</dd></div>
        {location ? <div><dt>Location</dt><dd>{location}</dd></div> : null}
        <div><dt>Recorded at</dt><dd><time dateTime={validDate ? recorded.toISOString() : undefined}>{timestamp}</time></dd></div>
      </dl>
    </section>
    {metadata.length ? <section className={styles.changes} aria-label="Change details">
      <h3>Change details</h3>
      <dl className={styles.metadata}>{metadata.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    </section> : null}
    <details className={styles.technical}>
      <summary><span><span>Technical details</span><small>Identifiers and request context</small></span><ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" /></summary>
      <dl className={styles.technicalRows}>{technical.map((row) => <div key={row.label}>
        <dt>{row.label}</dt>
        <dd><span>{row.value}</span>{row.label === "Event ID" ? <CopyButton value={event.id} label="Copy event ID" iconOnly variant="plain" className={styles.copyButton} /> : null}</dd>
      </div>)}</dl>
    </details>
    <p className={styles.privacy}><ShieldCheck size={13} strokeWidth={1.7} aria-hidden="true" /><span>Secret values and credentials are not shown in this record.</span></p>
  </div>;
}
