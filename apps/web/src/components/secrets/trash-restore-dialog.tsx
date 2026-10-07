import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, Info, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import type { SecretTrashItem } from "@/lib/secrets-client";
import { Button } from "../arc/button/button";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { WorkspaceInput } from "../ui/workspace-input";
import { canConfirmTrashRestore, trashCountLabel, trashKind, trashLocation, trashRestoreDescription } from "./trash-data";
import styles from "./trash-restore-dialog.module.css";
import "../outray-arc-theme.css";

type Props = {
  item: SecretTrashItem | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (confirmProduction: boolean) => void;
};

export type TrashRestoreContentProps = {
  item: SecretTrashItem;
  confirmation: string;
  productionConfirmed: boolean;
  loading: boolean;
  error: string | null;
  onConfirmationChange: (value: string) => void;
  onProductionChange: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export function TrashRestoreContent({ item, confirmation, productionConfirmed, loading, error, onConfirmationChange, onProductionChange, onSubmit, onClose }: TrashRestoreContentProps) {
  const id = useId();
  const location = trashLocation(item);
  const canSubmit = canConfirmTrashRestore(item, confirmation, productionConfirmed, loading);
  return <form className={styles.form} onSubmit={onSubmit} aria-busy={loading}>
    <div className={styles.fields}>
      <div className={styles.summary}>
        <span className={styles.summaryIcon}><RotateCcw size={17} strokeWidth={1.7} aria-hidden="true" /></span>
        <div className={styles.summaryText}>
          <p>{item.name}</p>
          <span>{trashKind(item)} · {trashCountLabel(item)}</span>
          {location ? <span>{location}</span> : null}
        </div>
      </div>
      <div className={styles.note}>
        <Info size={15} strokeWidth={1.7} aria-hidden="true" />
        <div>
          <p>{trashRestoreDescription(item)}</p>
          <p>Existing keys won’t be overwritten. If names or keys conflict, nothing is restored.</p>
          {item.type === "secret" || item.type === "bulk" ? <p>If its vault or environment is also in Trash, restore that first.</p> : item.type === "environment" ? <p>If its vault is also in Trash, restore that first.</p> : null}
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-confirmation`}>Confirm what you’re restoring</label>
        <p id={`${id}-confirmation-hint`} className={styles.hint}>Type <strong>{item.name}</strong> to continue.</p>
        <WorkspaceInput id={`${id}-confirmation`} value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)}
          aria-describedby={`${id}-confirmation-hint`} autoComplete="off" spellCheck={false} required disabled={loading}
          maxLength={Math.max(200, item.name.length)} data-trash-restore-autofocus="true" />
      </div>
      {item.isProduction ? <div className={styles.production}>
        <h3><ShieldCheck size={15} strokeWidth={1.7} aria-hidden="true" /> Production recovery</h3>
        <p id={`${id}-production-hint`}>Restoring this batch changes production secret configuration.</p>
        <label className={styles.productionChoice}>
          <span className={styles.checkbox}>
            <input type="checkbox" required checked={productionConfirmed} disabled={loading}
              onChange={(event) => onProductionChange(event.target.checked)} aria-describedby={`${id}-production-hint`} />
            <span className={styles.checkboxMark} aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span>
          </span>
          <span>I confirm restoring this production configuration</span>
        </label>
      </div> : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </div>
    <footer className={styles.footer}>
      <p className={styles.footerHint}><LockKeyhole size={12} strokeWidth={1.7} aria-hidden="true" /> Values stay encrypted</p>
      <div className={styles.actions}>
        <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm" disabled={!loading && !canSubmit} loading={loading}>
          <RotateCcw size={14} strokeWidth={1.7} aria-hidden="true" /> Restore
        </Button>
      </div>
    </footer>
  </form>;
}

export function TrashRestoreDialog(props: Props) {
  return props.item ? <TrashRestoreSession key={props.item.batchId} {...props} item={props.item} /> : null;
}

function TrashRestoreSession({ item, loading, error, onClose, onConfirm }: Omit<Props, "item"> & { item: SecretTrashItem }) {
  const [confirmation, setConfirmation] = useState("");
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const pending = useRef(false);
  useEffect(() => { if (!loading) pending.current = false; }, [loading, error]);
  const busy = () => loading || pending.current;
  const dismiss = () => { if (!busy()) onClose(); };
  const preventPendingClose = (event: { preventDefault: () => void }) => { if (busy()) event.preventDefault(); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy() || !canConfirmTrashRestore(item, confirmation, productionConfirmed, loading)) return;
    pending.current = true;
    onConfirm(productionConfirmed);
  };
  return <Dialog open onOpenChange={(next) => { if (!next) dismiss(); }}>
    <DialogContent title="Restore from Trash" description="Recover this batch without replacing existing values."
      className={`workspace-ui outray-arc outray-arc-dialog ph-no-capture ${styles.dialog}`} data-private-product="secrets"
      aria-busy={loading} closeDisabled={loading} onEscapeKeyDown={preventPendingClose}
      onPointerDownOutside={preventPendingClose} onInteractOutside={preventPendingClose}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        if (typeof HTMLElement === "undefined" || !(event.target instanceof HTMLElement)) return;
        const current = document.activeElement;
        if (current instanceof HTMLElement && current !== document.body && !event.target.contains(current)) opener.current = current;
        event.target.querySelector<HTMLElement>("[data-trash-restore-autofocus]")?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (opener.current?.isConnected) opener.current.focus();
        else document.querySelector<HTMLElement>("[data-trash-heading]")?.focus();
        opener.current = null;
      }}>
      <TrashRestoreContent item={item} confirmation={confirmation} productionConfirmed={productionConfirmed} loading={loading} error={error}
        onConfirmationChange={(value) => { if (!busy()) setConfirmation(value); }}
        onProductionChange={(value) => { if (!busy()) setProductionConfirmed(value); }} onSubmit={submit} onClose={dismiss} />
    </DialogContent>
  </Dialog>;
}
