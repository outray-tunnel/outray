import { useId, type FormEvent } from "react";
import { ArrowRight, Check, CheckCheck, KeyRound, Link2, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "../arc/button/button";
import { CopyButton } from "../arc/copy-button/copy-button";
import { Select } from "../arc/select/select";
import { WorkspaceInput } from "../ui/workspace-input";
import { HoldToDelete } from "./hold-to-delete";
import type { SecretEnvironment } from "@/lib/secrets-client";

const fieldClassName = "flex min-w-0 flex-col gap-[7px] [&>label]:text-xs [&>label]:leading-normal [&>label]:font-medium [&>label]:text-zinc-300";
const hintClassName = "m-0 text-[11px] leading-[1.6] text-zinc-500";
const noteClassName = "flex items-start gap-2.5 text-zinc-400 [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-zinc-500 [&_p]:m-0 [&_p]:text-xs [&_p]:leading-[1.7]";
const errorClassName = "rounded-lg border border-rose-400/20 bg-rose-400/[.04] px-3 py-2.5 text-xs leading-[1.6] text-rose-300 [overflow-wrap:anywhere]";
const footerClassName = "flex shrink-0 items-center justify-between gap-3 border-t border-white/[.07] px-6 py-4 max-[540px]:flex-col max-[540px]:items-stretch max-[540px]:gap-2.5 max-[540px]:px-[18px] max-[540px]:py-3.5";

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

  if (link) return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pt-[18px] pb-6 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin] max-[540px]:gap-[18px] max-[540px]:px-[18px] max-[540px]:pt-4 max-[540px]:pb-5">
      <div className="flex items-center gap-3 [&_h3]:m-0 [&_h3]:text-sm [&_h3]:leading-normal [&_h3]:font-medium [&_h3]:text-zinc-200 [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-[11px] [&_p]:leading-[1.6] [&_p]:text-zinc-500">
        <span className="grid size-10 basis-10 place-items-center rounded-xl border border-emerald-400/15 bg-emerald-400/[.035] text-[#6fbda3]"><CheckCheck size={20} aria-hidden="true" /></span>
        <div><h3>Your share link is ready</h3><p>{selectedLabel} saved as an encrypted snapshot.</p></div>
      </div>
      <div className={fieldClassName}>
        <label htmlFor={fieldId("link")}>Private viewing link</label>
        <div className="flex min-w-0 items-center gap-2 [&>input]:min-w-0 [&>input]:flex-1">
          <WorkspaceInput id={fieldId("link")} className="font-mono! text-xs!" value={link} readOnly autoFocus data-bulk-autofocus dir="ltr" onFocus={(event) => {
            const input = event.currentTarget;
            // Keep the complete link selected, with its active end at the start.
            input.setSelectionRange(0, input.value.length, "backward");
            input.scrollLeft = 0;
          }} aria-describedby={fieldId("link-hint")} autoComplete="off" spellCheck={false} />
          <CopyButton value={link} label="Copy link" iconOnly variant="plain" className="size-11 basis-11 rounded-xl text-xs" onCopyError={() => onCopyError("Could not copy the link. Select it above and copy it manually.")} />
        </div>
        <p id={fieldId("link-hint")} className={hintClassName}>Copy it before closing. The complete link cannot be recovered later.</p>
      </div>
      <div className={noteClassName}><ShieldCheck size={16} aria-hidden="true" /><p>Anyone with this link can reveal the selected secrets until its expiry or view limit. Keep the full link, including the part after #.</p></div>
      {error && <div className={errorClassName} role="alert">{error}</div>}
    </div>
    <footer className={footerClassName}><div className="ml-auto flex shrink-0 items-start gap-2"><Button type="button" size="sm" onClick={onClose}>Done</Button></div></footer>
  </div>;

  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { if (action === "delete") event.preventDefault(); else onSubmit(event); }} noValidate aria-busy={busy || undefined}>
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pt-[18px] pb-6 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin] max-[540px]:gap-[18px] max-[540px]:px-[18px] max-[540px]:pt-4 max-[540px]:pb-5">
      <details className="group overflow-hidden rounded-[10px] border border-white/[.07] bg-white/[.018] [&>summary]:flex [&>summary]:min-h-[58px] [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-2.5 [&>summary]:rounded-[10px] [&>summary]:px-3 [&>summary]:py-[11px] [&>summary]:transition-colors [&>summary]:duration-120 [&>summary:hover]:bg-white/[.025] [&>summary:focus-visible]:outline-2 [&>summary:focus-visible]:-outline-offset-3 [&>summary:focus-visible]:outline-zinc-400 [&>summary::-webkit-details-marker]:hidden motion-reduce:[&>summary]:transition-none">
        <summary><span className="grid size-7 basis-7 place-items-center rounded-[7px] bg-white/[.035] text-zinc-400"><KeyRound size={15} aria-hidden="true" /></span><span className="flex min-w-0 flex-col gap-0.5 [&>span:first-child]:text-xs [&>span:first-child]:leading-normal [&>span:first-child]:text-zinc-300 [&>span:last-child]:truncate [&>span:last-child]:text-[11px] [&>span:last-child]:text-zinc-500"><span>{selectedLabel} selected</span><span>{environment.name}</span></span><span className="ml-auto text-right text-[10px] leading-normal text-zinc-400">Review selection</span></summary>
        <ul className="m-0 flex max-h-40 list-none flex-wrap gap-1.5 overflow-y-auto border-t border-white/[.06] p-3 [scrollbar-width:thin] [&>li]:max-w-full [&>li]:rounded-[5px] [&>li]:border [&>li]:border-white/[.06] [&>li]:bg-white/[.025] [&>li]:px-1.5 [&>li]:py-1 [&>li]:font-mono [&>li]:text-[10px] [&>li]:leading-[1.4] [&>li]:text-zinc-400 [&>li]:[overflow-wrap:anywhere]" aria-label="Selected secret keys">{selectedKeys.map((key) => <li key={key}>{key}</li>)}</ul>
      </details>

      {action === "move" && <>
        {targets.length ? <div className={fieldClassName}>
          <Select id={fieldId("target")} label="Move to" value={targetSlug} onValueChange={onTargetChange} disabled={busy} className="min-h-11 rounded-2xl border-white/10 bg-[#0b0b0b] text-zinc-200 shadow-none focus-visible:border-white/35 focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_rgb(255_255_255/.08)]" description={fieldErrors.target} placeholder="Choose an environment" options={targets.map((item) => ({ value: item.slug, label: `${item.name}${item.isProduction && !/^production$/i.test(item.name.trim()) ? " · Production" : ""}` }))} />
          <p className={hintClassName}>Another environment in this vault. The original keys are removed after a successful move.</p>
          {target && <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-zinc-500 [&>span]:truncate [&>span:last-child]:text-zinc-400 [&>svg]:shrink-0" aria-label={`Move from ${environment.name} to ${target.name}`}><span>{environment.name}</span><ArrowRight size={13} aria-hidden="true" /><span>{target.name}</span></div>}
        </div> : <div className={noteClassName}><KeyRound size={16} aria-hidden="true" /><p>Create another environment in this vault before moving secrets.</p></div>}

        <fieldset className="m-0 flex min-w-0 flex-col gap-[7px] border-0 p-0 [&>legend]:mb-2 [&>legend]:p-0 [&>legend]:text-xs [&>legend]:leading-normal [&>legend]:font-medium [&>legend]:text-zinc-300 disabled:[&>label]:cursor-not-allowed disabled:[&>label]:opacity-55" disabled={busy}>
          <legend>If a key already exists</legend>
          <label className="group flex min-w-0 cursor-pointer items-start gap-2.5 rounded-[10px] border border-white/[.065] p-3 transition-[background-color,border-color] duration-120 hover:border-white/[.14] hover:bg-white/[.02] data-selected:border-white/[.18] data-selected:bg-white/[.03] motion-reduce:transition-none" data-selected={conflictMode === "skip" || undefined}>
            <span className="relative mt-px inline-flex size-4 basis-4"><input className="peer absolute inset-0 z-1 m-0 size-full cursor-[inherit] opacity-0" type="radio" name={fieldId("duplicates")} value="skip" checked={conflictMode === "skip"} onChange={() => onConflictChange("skip")} /><span className="grid size-4 place-items-center rounded-full border border-white/25 bg-[#111112] after:size-1.5 after:rounded-full after:bg-zinc-200 after:opacity-0 after:content-[''] peer-checked:border-zinc-400 peer-checked:after:opacity-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-zinc-400" aria-hidden="true" /></span>
            <span className="flex min-w-0 flex-col gap-[3px]"><span className="text-xs leading-normal text-zinc-300">Skip duplicates</span><span className="text-[11px] leading-[1.6] text-zinc-500 [overflow-wrap:anywhere]">Keep the destination value. Leave the duplicate in {environment.name}.</span></span>
          </label>
          <label className="group flex min-w-0 cursor-pointer items-start gap-2.5 rounded-[10px] border border-white/[.065] p-3 transition-[background-color,border-color] duration-120 hover:border-white/[.14] hover:bg-white/[.02] data-selected:border-white/[.18] data-selected:bg-white/[.03] motion-reduce:transition-none" data-selected={conflictMode === "overwrite" || undefined}>
            <span className="relative mt-px inline-flex size-4 basis-4"><input className="peer absolute inset-0 z-1 m-0 size-full cursor-[inherit] opacity-0" type="radio" name={fieldId("duplicates")} value="overwrite" checked={conflictMode === "overwrite"} onChange={() => onConflictChange("overwrite")} /><span className="grid size-4 place-items-center rounded-full border border-white/25 bg-[#111112] after:size-1.5 after:rounded-full after:bg-zinc-200 after:opacity-0 after:content-[''] peer-checked:border-zinc-400 peer-checked:after:opacity-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-zinc-400" aria-hidden="true" /></span>
            <span className="flex min-w-0 flex-col gap-[3px]"><span className="text-xs leading-normal text-zinc-300">Overwrite destination values</span><span className="text-[11px] leading-[1.6] text-zinc-500 [overflow-wrap:anywhere]">Replace matching keys with the selected values.</span></span>
          </label>
        </fieldset>
      </>}

      {action === "share" && <>
        <div className={noteClassName}><Link2 size={16} aria-hidden="true" /><p>Create one encrypted link for the selected values. Later edits, moves, or deletions won’t change this snapshot.</p></div>
        <div className={fieldClassName}>
          <Select id={fieldId("expiry")} label="Expires in" value={expiry} onValueChange={onExpiryChange} disabled={busy} options={expiryChoices} className="min-h-11 rounded-2xl border-white/10 bg-[#0b0b0b] text-zinc-200 shadow-none focus-visible:border-white/35 focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_rgb(255_255_255/.08)]" description={fieldErrors.expiry} />
        </div>
        <div className={fieldClassName}>
          <label htmlFor={fieldId("views")}>Maximum reveals</label>
          <WorkspaceInput id={fieldId("views")} type="number" inputMode="numeric" min={1} max={100} step={1} required value={maxViews} onChange={(event) => onMaxViewsChange(event.target.value)} disabled={busy} aria-invalid={Boolean(fieldErrors.maxViews) || undefined} aria-describedby={[fieldId("views-hint"), fieldErrors.maxViews ? fieldId("views-error") : null].filter(Boolean).join(" ")} />
          <p id={fieldId("views-hint")} className={hintClassName}>Each reveal uses one view. Choose between 1 and 100.</p>
          {fieldErrors.maxViews && <p id={fieldId("views-error")} className="m-0 text-[11px] leading-[1.6] text-rose-300 [overflow-wrap:anywhere]">{fieldErrors.maxViews}</p>}
        </div>
        <p className="m-0 border-t border-white/[.06] pt-3.5 text-[11px] leading-[1.7] text-zinc-500">Anyone with the complete link can view these secrets. Only share it with people you trust.</p>
      </>}

      {action === "delete" && <div className={`${noteClassName} rounded-[10px] border border-white/[.07] p-3.5 [&>svg]:text-[#b09298] [&_h3]:mt-0 [&_h3]:mb-1.25 [&_h3]:text-xs [&_h3]:leading-normal [&_h3]:font-medium [&_h3]:text-zinc-300`}><Trash2 size={17} aria-hidden="true" /><div><h3>Move to Trash, not permanent deletion</h3><p>The selected secrets will be removed from {environment.name}. You can restore them together as one batch from Trash.</p></div></div>}

      {needsProduction && <section className="rounded-[10px] border border-amber-400/13 bg-amber-400/[.025] p-3 [&>h3]:m-0 [&>h3]:flex [&>h3]:items-center [&>h3]:gap-1.5 [&>h3]:text-xs [&>h3]:leading-normal [&>h3]:font-medium [&>h3]:text-[#d4b875]" aria-labelledby={fieldId("production-title")}>
        <h3 id={fieldId("production-title")}><LockKeyhole size={14} aria-hidden="true" />Production environment</h3>
        <p id={fieldId("production-hint")} className="mt-1.25 mb-2.5 text-[11px] leading-[1.7] text-[#a19a89]">{action === "share" ? "This link gives access to production secret values." : action === "move" ? "This move affects a production environment." : "Removing these values may affect services using this environment."}</p>
        <label className="group flex min-h-8 cursor-pointer items-center gap-2.25 text-xs leading-[1.6] text-zinc-300 has-disabled:cursor-not-allowed has-disabled:opacity-55">
          <span className="relative inline-flex size-4 basis-4"><input type="checkbox" className="peer absolute inset-0 z-1 m-0 size-full cursor-[inherit] opacity-0" checked={productionConfirmed} onChange={(event) => onProductionChange(event.target.checked)} disabled={busy} required aria-describedby={fieldId("production-hint")} /><span className="grid size-4 place-items-center rounded border border-white/25 bg-[#111112] text-transparent transition-[background-color,border-color] duration-120 group-hover:border-zinc-400 peer-checked:border-zinc-200 peer-checked:bg-zinc-200 peer-checked:text-zinc-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-zinc-400 motion-reduce:transition-none" aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span></span>
          <span>{action === "share" ? "I confirm sharing these production secrets." : "I confirm this production change."}</span>
        </label>
      </section>}

      {error && <div className={errorClassName} role="alert">{error}</div>}
    </div>

    <footer className={footerClassName}>
      {action === "share" && <p className="m-0 flex items-center gap-1.25 text-[10px] leading-[1.6] text-zinc-500"><ShieldCheck size={12} aria-hidden="true" />Encrypted in your browser.</p>}
      <div className={`ml-auto flex shrink-0 items-start gap-2 ${action === "delete" ? "ml-0 w-full min-w-0" : ""} max-[540px]:justify-end max-[540px]:[&>button]:min-h-10`}>
        {action !== "delete" && <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>}
        {action === "delete" ? <HoldToDelete onConfirm={onDeleteConfirmed} disabled={!canSubmit} loading={busy} label="Hold to delete" /> : <Button type="submit" size="sm" disabled={!canSubmit && !busy} loading={busy}>{action === "share" ? "Create share link" : `Move ${selectedLabel}`}</Button>}
      </div>
    </footer>
  </form>;
}
