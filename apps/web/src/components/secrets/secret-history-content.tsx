import { useId } from "react";
import { Check, CheckCheck, CircleAlert, Clock3, Copy, Eye, EyeOff, History, KeyRound, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "../arc/button/button";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { workspaceScopeClassName } from "../ui/workspace-scope";
import type { SecretEnvironment, SecretMetadata, SecretVersion } from "@/lib/secrets-client";
import { formatSecretDate } from "./utils";

const emptyStateClassName = "flex flex-col items-center gap-2.5 px-[18px] py-11 text-center [&>h4]:mt-0.5 [&>h4]:mb-0 [&>h4]:text-[13px] [&>h4]:leading-[1.6] [&>h4]:font-medium [&>h4]:text-zinc-300 [&>p]:mt-0 [&>p]:mb-1 [&>p]:max-w-[280px] [&>p]:text-xs [&>p]:leading-[1.8] [&>p]:text-zinc-500 [&>p]:[overflow-wrap:anywhere]";
const iconStateClassName = "grid size-[38px] place-items-center rounded-[11px] border border-white/[.07] bg-white/[.025] text-zinc-500";
const productionClassName = "rounded-[10px] border border-amber-400/13 bg-amber-400/[.025] p-3 [&>h3]:m-0 [&>h3]:flex [&>h3]:items-center [&>h3]:gap-1.5 [&>h3]:text-xs [&>h3]:leading-normal [&>h3]:font-medium [&>h3]:text-[#d4b875] [&>p]:mt-1.25 [&>p]:mb-2.5 [&>p]:text-[11px] [&>p]:leading-[1.7] [&>p]:text-[#a19a89]";

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
  return <div className="animate-pulse motion-reduce:animate-none" role="status" aria-label="Loading version history">
    <span className="sr-only">Loading version history</span>
    {[0, 1, 2, 3].map((item) => <div className="flex gap-[11px] border-b border-white/[.055] py-5 last:border-b-0" key={item} aria-hidden="true">
      <span className="size-[19px] basis-[19px] rounded-full bg-white/[.055]" />
      <div className="min-w-0 flex-1 [&>span]:block [&>span]:h-[15px] [&>span]:w-[88px] [&>span]:rounded [&>span]:bg-white/[.055] [&>span+span]:mt-2.25 [&>span+span]:h-3 [&>span+span]:w-3/5 [&>span+span]:bg-white/[.035]"><span /><span /><div className="mt-[15px] flex gap-1.5 [&>span]:h-[23px] [&>span]:w-[58px] [&>span]:rounded-md [&>span]:bg-white/[.035]"><span /><span /><span /></div></div>
    </div>)}
  </div>;
}

export function SecretHistoryContent({ secret, environment, versions, loading, error, actionError, pending, revealed, secondsRemaining, copiedVersion, onReveal, onCopy, onRestore, onHide, onRetry }: SecretHistoryContentProps) {
  const id = useId();
  const hasMarkedCurrent = versions.some((version) => version.isCurrent === true);
  const currentVersion = versions.find((version) => version.isCurrent === true)?.version ?? secret?.version;
  const initialLoading = loading && versions.length === 0;
  return <div className="w-full min-w-0 text-zinc-300" aria-busy={loading || undefined}>
    <section className="flex min-w-0 items-center gap-[11px] pt-[18px] pb-[22px]" aria-label="Secret details">
      <span className="grid size-[34px] basis-[34px] place-items-center rounded-[10px] border border-white/[.07] bg-white/[.025] text-zinc-400"><KeyRound size={16} aria-hidden="true" /></span>
      <div className="min-w-0 [&>h3]:m-0 [&>h3]:font-mono [&>h3]:text-[13px] [&>h3]:leading-[1.6] [&>h3]:font-medium [&>h3]:text-zinc-200 [&>h3]:[overflow-wrap:anywhere]"><h3>{secret?.key ?? "Secret"}</h3><div className="mt-1 flex flex-wrap items-center gap-2.25 text-[11px] leading-[1.6] text-zinc-500">
        <span className="inline-flex items-center gap-1 text-zinc-400 data-production:text-[#bba477]" data-production={environment.isProduction || undefined}>{environment.isProduction ? <LockKeyhole size={11} aria-hidden="true" /> : null}{environment.name}</span>
        {currentVersion !== undefined ? <span>Current v{currentVersion}</span> : null}
      </div></div>
    </section>

    <div className="flex items-center justify-between gap-3 border-b border-white/[.07] pb-[11px] [&>h3]:m-0 [&>h3]:text-xs [&>h3]:leading-normal [&>h3]:font-medium [&>h3]:text-zinc-400 [&>span]:text-[11px] [&>span]:text-zinc-500"><h3>Version history</h3>{!initialLoading && !error ? <span>{versions.length} {versions.length === 1 ? "version" : "versions"}</span> : null}</div>

    {initialLoading ? <HistorySkeleton /> : error && versions.length === 0 ? <div className={emptyStateClassName} role="alert">
      <span className={`${iconStateClassName} text-[#c78996]`}><CircleAlert size={20} aria-hidden="true" /></span><h4>Couldn’t load history</h4><p>{error}</p><Button type="button" variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
    </div> : <>
      {error ? <div className="flex items-center justify-between gap-3 border-b border-white/[.07] py-2.25 [&>p]:m-0 [&>p]:text-[11px] [&>p]:leading-[1.7] [&>p]:text-[#f0a1af] [&>p]:[overflow-wrap:anywhere]" role="alert"><p>{error}</p><Button type="button" variant="ghost" size="sm" onClick={onRetry} disabled={loading}>Retry</Button></div> : null}
      {versions.length === 0 ? <div className={emptyStateClassName}><span className={iconStateClassName}><History size={20} aria-hidden="true" /></span><h4>No version history yet</h4><p>Saved versions will appear here. Values stay hidden until you choose to reveal one.</p></div> : <ol className="m-0 list-none p-0" aria-label="Secret versions">
        {versions.map((version) => {
          const current = hasMarkedCurrent ? version.isCurrent === true : version.version === secret?.version;
          const visible = revealed?.version === version.version;
          const actor = versionActor(version);
          const errorId = `${id}-error-${version.version}`;
          const titleId = `${id}-version-${version.version}`;
          const failed = actionError?.version === version.version;
          const actionPending = (type: PendingHistoryAction["type"]) => pending?.version === version.version && pending.type === type;
          return <li className="relative flex min-w-0 gap-[11px] border-b border-white/[.055] pt-[19px] pb-[17px] transition-colors duration-140 before:absolute before:top-[41px] before:bottom-[-18px] before:left-[9px] before:w-px before:bg-white/[.065] before:content-[''] last:border-b-0 last:before:hidden hover:bg-white/[.012] max-[540px]:gap-2.5 motion-reduce:transition-none" key={version.id} data-current={current || undefined}>
            <span className="relative z-1 mt-px grid size-[19px] basis-[19px] place-items-center rounded-full border border-white/[.11] bg-[#121213] text-zinc-500 [[data-current]_&]:border-emerald-300/26 [[data-current]_&]:bg-[#14201c] [[data-current]_&]:text-[#83bea9]" aria-hidden="true">{current ? <Check size={11} strokeWidth={2} /> : <Clock3 size={11} strokeWidth={1.7} />}</span>
            <article className="min-w-0 flex-1" aria-labelledby={titleId}>
              <header className="flex flex-wrap items-center gap-2.25 [&>h4]:m-0 [&>h4]:text-[13px] [&>h4]:leading-[1.6] [&>h4]:font-medium [&>h4]:text-zinc-200"><h4 id={titleId}>Version {version.version}</h4>{current ? <span className="inline-flex items-center gap-1.25 rounded-[5px] border border-[#6ebda3]/15 bg-[#6ebda3]/[.045] px-1.25 py-px text-[10px] leading-normal text-[#90bbaa] [&>span]:size-1 [&>span]:rounded-full [&>span]:bg-current"><span />Current</span> : null}</header>
              <p className="mt-1.25 mb-2.25 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px] leading-[1.7] text-zinc-500 [overflow-wrap:anywhere]"><span className="text-zinc-400">{versionSource(version)}</span><span className="text-zinc-600" aria-hidden="true">·</span><time dateTime={version.createdAt}>{formatSecretDate(version.createdAt)}</time>{actor ? <><span className="text-zinc-600" aria-hidden="true">·</span><span>{actor}</span></> : null}</p>
              <div className="-ml-[7px] flex flex-wrap items-center gap-1 max-[540px]:gap-0.5">
                <Button type="button" variant="ghost" size="sm" className="min-h-[34px] rounded-lg px-[7px] text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 max-[540px]:min-h-10 max-[540px]:px-2.25 max-[540px]:text-xs" aria-label={`${visible ? "Hide" : "Reveal"} version ${version.version}`} aria-expanded={visible} aria-controls={visible ? `${id}-value-${version.version}` : undefined} aria-describedby={failed ? errorId : undefined} loading={actionPending("reveal")} disabled={Boolean(pending) && !actionPending("reveal")} onClick={() => { if (visible) onHide(); else onReveal(version.version); }}>{visible ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{visible ? "Hide" : "Reveal"}</Button>
                <Button type="button" variant="ghost" size="sm" className="min-h-[34px] rounded-lg px-[7px] text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 max-[540px]:min-h-10 max-[540px]:px-2.25 max-[540px]:text-xs" aria-label={`Copy version ${version.version}`} aria-describedby={failed ? errorId : undefined} loading={actionPending("copy")} disabled={Boolean(pending) && !actionPending("copy")} onClick={() => onCopy(version.version)}>{copiedVersion === version.version ? <CheckCheck size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copiedVersion === version.version ? "Copied" : "Copy"}</Button>
                {!current ? <Button type="button" variant="ghost" size="sm" className="min-h-[34px] rounded-lg px-[7px] text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 max-[540px]:min-h-10 max-[540px]:px-2.25 max-[540px]:text-xs" aria-label={`Restore version ${version.version}`} aria-haspopup="dialog" disabled={Boolean(pending)} onClick={() => onRestore(version.version)}><RotateCcw size={13} aria-hidden="true" />Restore</Button> : null}
              </div>
              {copiedVersion === version.version ? <span className="sr-only" role="status" aria-live="polite">Version {version.version} copied.</span> : null}
              {visible ? <section id={`${id}-value-${version.version}`} className="mt-3 min-w-0 rounded-[9px] border border-[#baa273]/19 bg-[#baa273]/[.025]" aria-label={`Revealed value for version ${version.version}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-[11px] py-2.5 text-[10px] leading-normal text-[#bba477] [&>span:first-child]:inline-flex [&>span:first-child]:items-center [&>span:first-child]:gap-1.25"><span><Eye size={12} aria-hidden="true" />Value revealed</span><span className="text-[#a19a89] tabular-nums" aria-label={`Hides in ${secondsRemaining} seconds`}>{secondsRemaining}s remaining</span></div>
                <pre className="mx-[11px] my-0 max-w-full whitespace-pre-wrap border-y border-[#baa273]/[.09] py-[11px] font-mono text-xs leading-[1.8] text-zinc-200 select-text [overflow-wrap:anywhere] [word-break:break-word] [&>code]:font-[inherit] focus-visible:rounded-[3px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-[#a19a89]" tabIndex={0} aria-label={`Version ${version.version} secret value`}><code>{revealed.value}</code></pre>
                <p className="m-0 px-[11px] py-2.25 text-[10px] leading-[1.7] text-[#85817a] [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:font-[inherit] [&>button]:text-[#c4bba9] [&>button]:underline [&>button]:underline-offset-3 [&>button]:focus-visible:rounded-sm [&>button]:focus-visible:outline-2 [&>button]:focus-visible:outline-offset-3 [&>button]:focus-visible:outline-zinc-400 max-[540px]:[&>button]:-my-2 max-[540px]:[&>button]:min-h-9 max-[540px]:[&>button]:px-0.5">Hidden automatically after 30 seconds. <button type="button" onClick={onHide}>Hide now</button></p>
              </section> : null}
              {failed ? <p className="mt-[11px] mb-0 flex items-start gap-1.5 text-[11px] leading-[1.7] text-[#f0a1af] [overflow-wrap:anywhere] [&>svg]:mt-0.5 [&>svg]:shrink-0" id={errorId} role="alert"><CircleAlert size={13} aria-hidden="true" />{actionError.message}</p> : null}
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
    <DialogContent className={`${workspaceScopeClassName} ph-no-capture z-101! flex max-h-[calc(100dvh-24px)] w-[min(calc(100vw-24px),440px)] flex-col overflow-hidden rounded-2xl [&>div:first-child]:shrink-0 [&>div:first-child]:px-[22px] [&>div:first-child]:py-5 [&>div:first-child_h2]:text-lg [&>div:first-child_h2]:font-normal [&>div:first-child_h2]:tracking-[-.025em] [&>div:first-child_p]:mt-1 [&>div:first-child_p]:text-xs [&>div:first-child_p]:leading-[1.7] [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-1 [&>div:last-child]:flex-col [&>div:last-child]:overflow-hidden [&>div:last-child]:p-0 max-[540px]:[&>div:first-child]:p-[18px]`} overlayClassName="z-100!" data-private-product="secrets" title={`Restore version ${version ?? ""}?`} description="Use an earlier value as the current secret." closeDisabled={pending} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}>
      <form className="flex min-h-0 flex-1 flex-col" aria-busy={pending || undefined} onSubmit={(event) => { event.preventDefault(); if (!pending && version !== null && (!production || productionConfirmed)) onConfirm(); }}>
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overscroll-contain px-[22px] py-5 max-[540px]:p-[18px]">
          <div className="flex min-w-0 items-center gap-[11px] [&>div]:min-w-0 [&_p]:mt-[3px] [&_p]:mb-0 [&_p]:text-[11px] [&_p]:leading-[1.7] [&_p]:text-zinc-500"><span className="grid size-[35px] basis-[35px] place-items-center rounded-[10px] border border-white/[.07] bg-white/[.025] text-zinc-400"><RotateCcw size={17} aria-hidden="true" /></span><div><p className="m-0! font-mono text-xs! text-zinc-300! [overflow-wrap:anywhere]">{secretKey}</p><p>Version {version ?? "—"} → new version {currentVersion + 1}</p></div></div>
          <p className="m-0 flex items-start gap-2 text-xs leading-[1.8] text-zinc-400 [&>svg]:mt-[3px] [&>svg]:shrink-0 [&>svg]:text-zinc-500"><ShieldCheck size={14} aria-hidden="true" /><span>Restoring creates a new version. Existing versions are kept, so no history is deleted.</span></p>
          {production ? <section className={productionClassName} aria-labelledby={`${id}-production-title`}><h3 id={`${id}-production-title`}><LockKeyhole size={14} aria-hidden="true" />Production environment</h3><p id={`${id}-production-hint`}>This changes the value used by services reading this secret.</p><label className="group flex min-h-9 cursor-pointer items-center gap-2.25 text-xs leading-[1.6] text-zinc-300 has-disabled:cursor-not-allowed has-disabled:opacity-55"><span className="relative inline-flex size-4 basis-4"><input type="checkbox" className="peer absolute inset-0 z-1 m-0 size-full cursor-[inherit] opacity-0" checked={productionConfirmed} onChange={(event) => onProductionChange(event.target.checked)} disabled={pending} required aria-describedby={`${id}-production-hint`} /><span className="grid size-4 place-items-center rounded border border-white/25 bg-[#111112] text-transparent transition-[background-color,border-color] duration-120 group-hover:border-zinc-400 peer-checked:border-zinc-200 peer-checked:bg-zinc-200 peer-checked:text-zinc-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-zinc-400 motion-reduce:transition-none" aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span></span><span>I confirm this production change.</span></label></section> : null}
          {error ? <p className="m-0 rounded-lg border border-rose-400/20 bg-rose-400/[.04] px-3 py-2.5 text-xs leading-[1.7] text-rose-300 [overflow-wrap:anywhere]" role="alert">{error}</p> : null}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/[.07] px-[22px] py-4 max-[540px]:px-[18px] max-[540px]:py-3.5 max-[540px]:[&>button]:min-h-10"><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" size="sm" loading={pending} disabled={!pending && (version === null || (production && !productionConfirmed))}><RotateCcw size={14} aria-hidden="true" />Restore version</Button></footer>
      </form>
    </DialogContent>
  </Dialog>;
}
