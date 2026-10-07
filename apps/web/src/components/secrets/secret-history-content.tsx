import { useId } from "react";
import { Check, CheckCheck, CircleAlert, Clock3, Copy, Eye, EyeOff, History, KeyRound, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "../arc/button/button";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import type { SecretEnvironment, SecretMetadata, SecretVersion } from "@/lib/secrets-client";
import { formatSecretDate } from "./utils";
import styles from "./secret-history.module.css";

export interface PendingHistoryAction { type: "reveal" | "copy" | "restore"; version: number }
export interface RevealedHistoryValue { version: number; value: string; expiresAt: number }
type HistoryVersion = SecretVersion & { source?: string | null; sourceVersion?: number | null; createdByType?: string | null };

export interface SecretHistoryContentProps {
  secret: SecretMetadata | null;
  environment: SecretEnvironment;
  versions: HistoryVersion[];
  loading: boolean;
  error: string | null;
  actionError: { version: number; message: string } | null;
  pending: PendingHistoryAction | null;
  revealed: RevealedHistoryValue | null;
  secondsRemaining: number;
  copiedVersion: number | null;
  onReveal: (version: number) => void;
  onCopy: (version: number) => void;
  onRestore: (version: number) => void;
  onHide: () => void;
  onRetry: () => void;
}

function versionSource(version: HistoryVersion): string {
  const source = (version.source || version.action || "").toLowerCase();
  if (source === "create" || source === "created" || source === "secret.created") return "Created";
  if (source === "import" || source === "imported" || source === "secrets.imported") return "Imported";
  if (source === "rollback" || source === "restore" || source === "secret.rolled_back") {
    return version.sourceVersion ? `Restored from v${version.sourceVersion}` : "Restored";
  }
  return "Edited";
}

function versionActor(version: HistoryVersion): string | null {
  if (version.createdBy) return version.createdBy;
  if (version.createdByType === "machine") return "Machine token";
  if (version.createdByType === "system") return "System";
  return null;
}

function HistorySkeleton() {
  return <div className={styles.skeleton} role="status" aria-label="Loading version history">
    <span className={styles.srOnly}>Loading version history</span>
    {[0, 1, 2, 3].map((item) => <div className={styles.skeletonRow} key={item} aria-hidden="true">
      <span className={styles.skeletonDot} />
      <div className={styles.skeletonText}><span /><span /><div className={styles.skeletonActions}><span /><span /><span /></div></div>
    </div>)}
  </div>;
}

export function SecretHistoryContent({ secret, environment, versions, loading, error, actionError, pending, revealed, secondsRemaining, copiedVersion, onReveal, onCopy, onRestore, onHide, onRetry }: SecretHistoryContentProps) {
  const id = useId();
  const hasMarkedCurrent = versions.some((version) => version.isCurrent === true);
  const currentVersion = versions.find((version) => version.isCurrent === true)?.version ?? secret?.version;
  const initialLoading = loading && versions.length === 0;
  return <div className={styles.content} aria-busy={loading || undefined}>
    <section className={styles.context} aria-label="Secret details">
      <span className={styles.keyIcon}><KeyRound size={16} aria-hidden="true" /></span>
      <div className={styles.contextText}><h3>{secret?.key ?? "Secret"}</h3><div className={styles.contextMeta}>
        <span className={styles.environment} data-production={environment.isProduction || undefined}>{environment.isProduction ? <LockKeyhole size={11} aria-hidden="true" /> : null}{environment.name}</span>
        {currentVersion !== undefined ? <span>Current v{currentVersion}</span> : null}
      </div></div>
    </section>

    <div className={styles.sectionHeading}><h3>Version history</h3>{!initialLoading && !error ? <span>{versions.length} {versions.length === 1 ? "version" : "versions"}</span> : null}</div>

    {initialLoading ? <HistorySkeleton /> : error && versions.length === 0 ? <div className={styles.empty} role="alert">
      <span className={styles.errorIcon}><CircleAlert size={20} aria-hidden="true" /></span><h4>Couldn’t load history</h4><p>{error}</p><Button type="button" variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
    </div> : <>
      {error ? <div className={styles.refreshError} role="alert"><p>{error}</p><Button type="button" variant="ghost" size="sm" onClick={onRetry} disabled={loading}>Retry</Button></div> : null}
      {versions.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}><History size={20} aria-hidden="true" /></span><h4>No version history yet</h4><p>Saved versions will appear here. Values stay hidden until you choose to reveal one.</p></div> : <ol className={styles.timeline} aria-label="Secret versions">
        {versions.map((version) => {
          const current = hasMarkedCurrent ? version.isCurrent === true : version.version === secret?.version;
          const visible = revealed?.version === version.version;
          const actor = versionActor(version);
          const errorId = `${id}-error-${version.version}`;
          const titleId = `${id}-version-${version.version}`;
          const failed = actionError?.version === version.version;
          const actionPending = (type: PendingHistoryAction["type"]) => pending?.version === version.version && pending.type === type;
          return <li className={styles.versionRow} key={version.id} data-current={current || undefined}>
            <span className={styles.timelineDot} aria-hidden="true">{current ? <Check size={11} strokeWidth={2} /> : <Clock3 size={11} strokeWidth={1.7} />}</span>
            <article className={styles.version} aria-labelledby={titleId}>
              <header className={styles.versionHeading}><h4 id={titleId}>Version {version.version}</h4>{current ? <span className={styles.currentBadge}><span />Current</span> : null}</header>
              <p className={styles.versionMeta}><span className={styles.source}>{versionSource(version)}</span><span className={styles.separator} aria-hidden="true">·</span><time dateTime={version.createdAt}>{formatSecretDate(version.createdAt)}</time>{actor ? <><span className={styles.separator} aria-hidden="true">·</span><span>{actor}</span></> : null}</p>
              <div className={styles.rowActions}>
                <Button type="button" variant="ghost" size="sm" className={styles.action} aria-label={`${visible ? "Hide" : "Reveal"} version ${version.version}`} aria-expanded={visible} aria-controls={visible ? `${id}-value-${version.version}` : undefined} aria-describedby={failed ? errorId : undefined} loading={actionPending("reveal")} disabled={Boolean(pending) && !actionPending("reveal")} onClick={() => { if (visible) onHide(); else onReveal(version.version); }}>{visible ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{visible ? "Hide" : "Reveal"}</Button>
                <Button type="button" variant="ghost" size="sm" className={styles.action} aria-label={`Copy version ${version.version}`} aria-describedby={failed ? errorId : undefined} loading={actionPending("copy")} disabled={Boolean(pending) && !actionPending("copy")} onClick={() => onCopy(version.version)}>{copiedVersion === version.version ? <CheckCheck size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copiedVersion === version.version ? "Copied" : "Copy"}</Button>
                {!current ? <Button type="button" variant="ghost" size="sm" className={styles.action} aria-label={`Restore version ${version.version}`} aria-haspopup="dialog" disabled={Boolean(pending)} onClick={() => onRestore(version.version)}><RotateCcw size={13} aria-hidden="true" />Restore</Button> : null}
              </div>
              {copiedVersion === version.version ? <span className={styles.srOnly} role="status" aria-live="polite">Version {version.version} copied.</span> : null}
              {visible ? <section id={`${id}-value-${version.version}`} className={styles.revealed} aria-label={`Revealed value for version ${version.version}`}>
                <div className={styles.revealHeading}><span><Eye size={12} aria-hidden="true" />Value revealed</span><span className={styles.countdown} aria-label={`Hides in ${secondsRemaining} seconds`}>{secondsRemaining}s remaining</span></div>
                <pre className={styles.value} tabIndex={0} aria-label={`Version ${version.version} secret value`}><code>{revealed.value}</code></pre>
                <p className={styles.revealHint}>Hidden automatically after 30 seconds. <button type="button" onClick={onHide}>Hide now</button></p>
              </section> : null}
              {failed ? <p className={styles.actionError} id={errorId} role="alert"><CircleAlert size={13} aria-hidden="true" />{actionError.message}</p> : null}
            </article>
          </li>;
        })}
      </ol>}
    </>}
  </div>;
}

export interface SecretHistoryRestoreDialogProps {
  open: boolean;
  secretKey: string;
  version: number | null;
  currentVersion: number;
  production: boolean;
  productionConfirmed: boolean;
  onProductionChange: (confirmed: boolean) => void;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function SecretHistoryRestoreDialog({ open, secretKey, version, currentVersion, production, productionConfirmed, onProductionChange, pending, error, onClose, onConfirm }: SecretHistoryRestoreDialogProps) {
  const id = useId();
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose(); }}>
    <DialogContent className={`workspace-ui outray-arc ph-no-capture ${styles.restoreDialog}`} overlayClassName={styles.restoreOverlay} data-private-product="secrets" title={`Restore version ${version ?? ""}?`} description="Use an earlier value as the current secret." closeDisabled={pending} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}>
      <form className={styles.restoreForm} aria-busy={pending || undefined} onSubmit={(event) => { event.preventDefault(); if (!pending && version !== null && (!production || productionConfirmed)) onConfirm(); }}>
        <div className={styles.restoreFields}>
          <div className={styles.restoreSummary}><span className={styles.restoreIcon}><RotateCcw size={17} aria-hidden="true" /></span><div><p className={styles.restoreKey}>{secretKey}</p><p>Version {version ?? "—"} → new version {currentVersion + 1}</p></div></div>
          <p className={styles.restoreHint}><ShieldCheck size={14} aria-hidden="true" /><span>Restoring creates a new version. Existing versions are kept, so no history is deleted.</span></p>
          {production ? <section className={styles.production} aria-labelledby={`${id}-production-title`}><h3 id={`${id}-production-title`}><LockKeyhole size={14} aria-hidden="true" />Production environment</h3><p id={`${id}-production-hint`}>This changes the value used by services reading this secret.</p><label className={styles.productionChoice}><span className={styles.checkbox}><input type="checkbox" checked={productionConfirmed} onChange={(event) => onProductionChange(event.target.checked)} disabled={pending} required aria-describedby={`${id}-production-hint`} /><span className={styles.checkboxMark} aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span></span><span>I confirm this production change.</span></label></section> : null}
          {error ? <p className={styles.restoreError} role="alert">{error}</p> : null}
        </div>
        <footer className={styles.restoreFooter}><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" size="sm" loading={pending} disabled={!pending && (version === null || (production && !productionConfirmed))}><RotateCcw size={14} aria-hidden="true" />Restore version</Button></footer>
      </form>
    </DialogContent>
  </Dialog>;
}
