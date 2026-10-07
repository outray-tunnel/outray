import { useId, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Select } from "../arc/select/select";
import { WorkspaceInput, WorkspaceTextarea } from "../ui/workspace-input";
import { UptimeEmailRecipients } from "./email-recipients";
import { IncidentPublishingFields } from "./incident-publishing-fields";
import type { UptimeMonitor } from "./uptime-client";
import { UptimeCheckbox, UptimeError } from "./uptime-ui";
import { initialMonitorDraft, monitorPayload, type MonitorDraft } from "./monitor-data";
import styles from "./monitors.module.css";

export interface MonitorFormProps {
  orgSlug: string;
  formId: string;
  monitor?: UptimeMonitor;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: Record<string, unknown>) => void;
}

/** Mounted once per open editor: polling never overwrites an in-progress draft. */
export function MonitorForm({ orgSlug, formId, monitor, busy, error, onSubmit }: MonitorFormProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => initialMonitorDraft(monitor));
  const [validationError, setValidationError] = useState<string | null>(null);
  const change = <Key extends keyof MonitorDraft>(key: Key, value: MonitorDraft[Key]) => {
    if (busy) return;
    setDraft((previous) => ({ ...previous, [key]: value }));
    setValidationError(null);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    try { const payload = monitorPayload(draft, Boolean(monitor)); setValidationError(null); onSubmit(payload); }
    catch (cause) { setValidationError(cause instanceof Error ? cause.message : "Check your monitor settings."); }
  };
  return <form id={formId} onSubmit={submit} className={`ph-no-capture ${styles.form}`} data-private-product="uptime" aria-busy={busy}>
    <fieldset disabled={busy} className={styles.fields}>
      <div className={styles.field}><label htmlFor={`${id}-name`}>Name</label><WorkspaceInput id={`${id}-name`} data-autofocus value={draft.name} onChange={(event) => change("name", event.target.value)} required maxLength={120} placeholder="API" /></div>
      <div className={styles.field}><label htmlFor={`${id}-url`}>Public URL</label><WorkspaceInput id={`${id}-url`} value={draft.url} onChange={(event) => change("url", event.target.value)} required type="url" maxLength={2048} placeholder="https://api.example.com/health" /><p>Checked every minute from one region.</p></div>
      <Select label="Request method" value={draft.method} onValueChange={(value) => change("method", value as "GET" | "HEAD")} disabled={busy} options={[{ value: "GET", label: "GET" }, { value: "HEAD", label: "HEAD" }]} />
      <Select label="Expected status" value={draft.statusMode} onValueChange={(value) => change("statusMode", value as "range" | "exact")} disabled={busy} options={[{ value: "range", label: "Any 200–399" }, { value: "exact", label: "Exact status code" }]} />
      {draft.statusMode === "exact" ? <div className={styles.field}><label htmlFor={`${id}-status`}>HTTP status code</label><WorkspaceInput id={`${id}-status`} type="number" min={100} max={599} required value={draft.expectedStatus} onChange={(event) => change("expectedStatus", event.target.value)} /></div> : null}
      {draft.method === "GET" ? <div className={styles.field}><label htmlFor={`${id}-response`}>Response text <span>Optional</span></label><WorkspaceInput id={`${id}-response`} value={draft.responseText} onChange={(event) => change("responseText", event.target.value)} maxLength={500} placeholder="healthy" /><p>Literal, case-sensitive match. Response content is never stored.</p></div> : null}
      <details className={styles.headers}>
        <summary><KeyRound size={14} aria-hidden="true" /><span>Request headers</span><small>{monitor?.hasHeaders ? "Configured" : "Optional"}</small></summary>
        <div className={styles.headerFields}>
          <p>{monitor?.hasHeaders ? "Existing headers are encrypted and cannot be retrieved. Changing the URL clears them unless you enter replacements." : "Header values are encrypted at rest and never shown again after saving."}</p>
          {monitor ? <label className={styles.checkboxChoice}><UptimeCheckbox checked={draft.replaceHeaders} onChange={(event) => change("replaceHeaders", event.target.checked)} disabled={busy} /><span>Replace or clear existing headers</span></label> : null}
          {!monitor || draft.replaceHeaders ? <div className={styles.field}><label htmlFor={`${id}-headers`}>{monitor ? "New headers" : "Headers"}</label><WorkspaceTextarea id={`${id}-headers`} rows={3} value={draft.headerLines} onChange={(event) => change("headerLines", event.target.value)} className={styles.headerInput} placeholder="Authorization: Bearer …" /><p>One Name: Value per line. {monitor ? "Leave blank to clear existing headers." : "Proxy, Host, and connection-control headers are rejected."}</p></div> : null}
        </div>
      </details>
      <div className={styles.section}><UptimeEmailRecipients orgSlug={orgSlug} value={draft.notificationEmails} onChange={(value) => change("notificationEmails", value)} disabled={busy} /></div>
      <IncidentPublishingFields failureThreshold={draft.failureThreshold} onFailureThresholdChange={(value) => change("failureThreshold", value)} mode={draft.incidentPublishing} onModeChange={(value) => change("incidentPublishing", value)} publishAfterMinutes={draft.publishAfterMinutes} onPublishAfterMinutesChange={(value) => change("publishAfterMinutes", value)} disabled={busy} />
    </fieldset>
    {validationError || error ? <UptimeError message={validationError || error!} /> : null}
  </form>;
}
