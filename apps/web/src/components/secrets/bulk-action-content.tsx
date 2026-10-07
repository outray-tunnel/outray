import { useId, type FormEvent } from "react";
import { ArrowRight, Check, CheckCheck, KeyRound, Link2, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "../arc/button/button";
import { CopyButton } from "../arc/copy-button/copy-button";
import { Select } from "../arc/select/select";
import { WorkspaceInput } from "../ui/workspace-input";
import { HoldToDelete } from "./hold-to-delete";
import type { SecretEnvironment } from "@/lib/secrets-client";
import styles from "./bulk-actions.module.css";

const expiryChoices = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
];

export interface BulkActionContentProps {
  action: "move" | "delete" | "share";
  selectedKeys: string[];
  environment: SecretEnvironment;
  targets: SecretEnvironment[];
  targetSlug: string;
  conflictMode: "skip" | "overwrite";
  expiry: string;
  maxViews: string;
  productionConfirmed: boolean;
  needsProduction: boolean;
  busy: boolean;
  error: string | null;
  link: string | null;
  canSubmit: boolean;
  fieldErrors?: { maxViews?: string; expiry?: string; target?: string };
  onTargetChange: (value: string) => void;
  onConflictChange: (value: "skip" | "overwrite") => void;
  onExpiryChange: (value: string) => void;
  onMaxViewsChange: (value: string) => void;
  onProductionChange: (value: boolean) => void;
  onCopyError: (message: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteConfirmed: () => void;
  onClose: () => void;
}

export function BulkActionContent({ action, selectedKeys, environment, targets, targetSlug, conflictMode, expiry, maxViews, productionConfirmed, needsProduction, busy, error, link, canSubmit, fieldErrors = {}, onTargetChange, onConflictChange, onExpiryChange, onMaxViewsChange, onProductionChange, onCopyError, onSubmit, onDeleteConfirmed, onClose }: BulkActionContentProps) {
  const id = useId();
  const fieldId = (field: string) => `${id}-${field}`;
  const count = selectedKeys.length;
  const selectedLabel = `${count} ${count === 1 ? "secret" : "secrets"}`;
  const target = targets.find((item) => item.slug === targetSlug);

  if (link) return <div className={styles.form}>
    <div className={styles.fields}>
      <div className={styles.success}>
        <span className={styles.successIcon}><CheckCheck size={20} aria-hidden="true" /></span>
        <div><h3>Your share link is ready</h3><p>{selectedLabel} saved as an encrypted snapshot.</p></div>
      </div>
      <div className={styles.field}>
        <label htmlFor={fieldId("link")}>Private viewing link</label>
        <div className={styles.linkRow}>
          <WorkspaceInput id={fieldId("link")} className={styles.monospace} value={link} readOnly autoFocus data-bulk-autofocus dir="ltr" onFocus={(event) => {
            const input = event.currentTarget;
            // Keep the complete link selected, with its active end at the start.
            input.setSelectionRange(0, input.value.length, "backward");
            input.scrollLeft = 0;
          }} aria-describedby={fieldId("link-hint")} autoComplete="off" spellCheck={false} />
          <CopyButton value={link} label="Copy link" iconOnly variant="plain" className={styles.copyButton} onCopyError={() => onCopyError("Could not copy the link. Select it above and copy it manually.")} />
        </div>
        <p id={fieldId("link-hint")} className={styles.hint}>Copy it before closing. The complete link cannot be recovered later.</p>
      </div>
      <div className={styles.note}><ShieldCheck size={16} aria-hidden="true" /><p>Anyone with this link can reveal the selected secrets until its expiry or view limit. Keep the full link, including the part after #.</p></div>
      {error && <div className={styles.error} role="alert">{error}</div>}
    </div>
    <footer className={styles.footer}><div className={styles.actions}><Button type="button" size="sm" onClick={onClose}>Done</Button></div></footer>
  </div>;

  return <form className={styles.form} onSubmit={(event) => { if (action === "delete") event.preventDefault(); else onSubmit(event); }} noValidate aria-busy={busy || undefined}>
    <div className={styles.fields}>
      <details className={styles.selection}>
        <summary><span className={styles.selectionIcon}><KeyRound size={15} aria-hidden="true" /></span><span className={styles.selectionText}><span>{selectedLabel} selected</span><span>{environment.name}</span></span><span className={styles.reviewLabel}>Review selection</span></summary>
        <ul className={styles.keys} aria-label="Selected secret keys">{selectedKeys.map((key) => <li key={key}>{key}</li>)}</ul>
      </details>

      {action === "move" && <>
        {targets.length ? <div className={styles.field}>
          <Select id={fieldId("target")} label="Move to" value={targetSlug} onValueChange={onTargetChange} disabled={busy} className={styles.select} description={fieldErrors.target} placeholder="Choose an environment" options={targets.map((item) => ({ value: item.slug, label: `${item.name}${item.isProduction && !/^production$/i.test(item.name.trim()) ? " · Production" : ""}` }))} />
          <p className={styles.hint}>Another environment in this vault. The original keys are removed after a successful move.</p>
          {target && <div className={styles.route} aria-label={`Move from ${environment.name} to ${target.name}`}><span>{environment.name}</span><ArrowRight size={13} aria-hidden="true" /><span>{target.name}</span></div>}
        </div> : <div className={styles.note}><KeyRound size={16} aria-hidden="true" /><p>Create another environment in this vault before moving secrets.</p></div>}

        <fieldset className={styles.choices} disabled={busy}>
          <legend>If a key already exists</legend>
          <label className={styles.choice} data-selected={conflictMode === "skip" || undefined}>
            <span className={styles.radio}><input type="radio" name={fieldId("duplicates")} value="skip" checked={conflictMode === "skip"} onChange={() => onConflictChange("skip")} /><span className={styles.radioMark} aria-hidden="true" /></span>
            <span><span className={styles.choiceTitle}>Skip duplicates</span><span className={styles.choiceDescription}>Keep the destination value. Leave the duplicate in {environment.name}.</span></span>
          </label>
          <label className={styles.choice} data-selected={conflictMode === "overwrite" || undefined}>
            <span className={styles.radio}><input type="radio" name={fieldId("duplicates")} value="overwrite" checked={conflictMode === "overwrite"} onChange={() => onConflictChange("overwrite")} /><span className={styles.radioMark} aria-hidden="true" /></span>
            <span><span className={styles.choiceTitle}>Overwrite destination values</span><span className={styles.choiceDescription}>Replace matching keys with the selected values.</span></span>
          </label>
        </fieldset>
      </>}

      {action === "share" && <>
        <div className={styles.note}><Link2 size={16} aria-hidden="true" /><p>Create one encrypted link for the selected values. Later edits, moves, or deletions won’t change this snapshot.</p></div>
        <div className={styles.field}>
          <Select id={fieldId("expiry")} label="Expires in" value={expiry} onValueChange={onExpiryChange} disabled={busy} options={expiryChoices} className={styles.select} description={fieldErrors.expiry} />
        </div>
        <div className={styles.field}>
          <label htmlFor={fieldId("views")}>Maximum reveals</label>
          <WorkspaceInput id={fieldId("views")} type="number" inputMode="numeric" min={1} max={100} step={1} required value={maxViews} onChange={(event) => onMaxViewsChange(event.target.value)} disabled={busy} aria-invalid={Boolean(fieldErrors.maxViews) || undefined} aria-describedby={[fieldId("views-hint"), fieldErrors.maxViews ? fieldId("views-error") : null].filter(Boolean).join(" ")} />
          <p id={fieldId("views-hint")} className={styles.hint}>Each reveal uses one view. Choose between 1 and 100.</p>
          {fieldErrors.maxViews && <p id={fieldId("views-error")} className={styles.fieldError}>{fieldErrors.maxViews}</p>}
        </div>
        <p className={styles.privacy}>Anyone with the complete link can view these secrets. Only share it with people you trust.</p>
      </>}

      {action === "delete" && <div className={`${styles.note} ${styles.deleteNote}`}><Trash2 size={17} aria-hidden="true" /><div><h3>Move to Trash, not permanent deletion</h3><p>The selected secrets will be removed from {environment.name}. You can restore them together as one batch from Trash.</p></div></div>}

      {needsProduction && <section className={styles.production} aria-labelledby={fieldId("production-title")}>
        <h3 id={fieldId("production-title")}><LockKeyhole size={14} aria-hidden="true" />Production environment</h3>
        <p id={fieldId("production-hint")} className={styles.productionHint}>{action === "share" ? "This link gives access to production secret values." : action === "move" ? "This move affects a production environment." : "Removing these values may affect services using this environment."}</p>
        <label className={styles.productionChoice}>
          <span className={styles.checkbox}><input type="checkbox" checked={productionConfirmed} onChange={(event) => onProductionChange(event.target.checked)} disabled={busy} required aria-describedby={fieldId("production-hint")} /><span className={styles.checkboxMark} aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span></span>
          <span>{action === "share" ? "I confirm sharing these production secrets." : "I confirm this production change."}</span>
        </label>
      </section>}

      {error && <div className={styles.error} role="alert">{error}</div>}
    </div>

    <footer className={styles.footer}>
      {action === "share" && <p className={styles.footerHint}><ShieldCheck size={12} aria-hidden="true" />Encrypted in your browser.</p>}
      <div className={`${styles.actions}${action === "delete" ? ` ${styles.deleteActions}` : ""}`}>
        {action !== "delete" && <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>}
        {action === "delete" ? <HoldToDelete onConfirm={onDeleteConfirmed} disabled={!canSubmit} loading={busy} label="Hold to delete" /> : <Button type="submit" size="sm" disabled={!canSubmit && !busy} loading={busy}>{action === "share" ? "Create share link" : `Move ${selectedLabel}`}</Button>}
      </div>
    </footer>
  </form>;
}
