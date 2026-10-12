import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, Info, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import type { SecretTrashItem } from "@/lib/secrets-client";
import { Button } from "../arc/button/button";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { WorkspaceInput } from "../ui/workspace-input";
import { workspaceScopeClassName } from "../ui/workspace-scope";
import { canConfirmTrashRestore, trashCountLabel, trashKind, trashLocation, trashRestoreDescription } from "./trash-data";

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
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit} aria-busy={loading}>
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pt-[18px] pb-6 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin] max-[540px]:gap-[18px] max-[540px]:px-[18px] max-[540px]:pt-4 max-[540px]:pb-5">
      <div className="flex min-w-0 items-start gap-[11px] rounded-[10px] border border-white/[.07] bg-white/[.018] p-[13px]">
        <span className="grid size-8 basis-8 place-items-center rounded-lg bg-white/[.04] text-zinc-400"><RotateCcw size={17} strokeWidth={1.7} aria-hidden="true" /></span>
        <div className="flex min-w-0 flex-col gap-[3px] [&>p]:m-0 [&>p]:text-[13px] [&>p]:leading-[1.6] [&>p]:text-zinc-200 [&>p]:[overflow-wrap:anywhere] [&>span]:text-[11px] [&>span]:leading-[1.6] [&>span]:text-zinc-500 [&>span]:[overflow-wrap:anywhere]">
          <p>{item.name}</p>
          <span>{trashKind(item)} · {trashCountLabel(item)}</span>
          {location ? <span>{location}</span> : null}
        </div>
      </div>
      <div className="flex items-start gap-2.25 text-zinc-400 [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-zinc-500 [&_p]:m-0 [&_p]:text-xs [&_p]:leading-[1.7] [&_p+p]:mt-1.25 [&_p+p]:text-[11px] [&_p+p]:text-zinc-500">
        <Info size={15} strokeWidth={1.7} aria-hidden="true" />
        <div>
          <p>{trashRestoreDescription(item)}</p>
          <p>Existing keys won’t be overwritten. If names or keys conflict, nothing is restored.</p>
          {item.type === "secret" || item.type === "bulk" ? <p>If its vault or environment is also in Trash, restore that first.</p> : item.type === "environment" ? <p>If its vault is also in Trash, restore that first.</p> : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-[7px] [&>label]:text-xs [&>label]:leading-normal [&>label]:font-medium [&>label]:text-zinc-300">
        <label htmlFor={`${id}-confirmation`}>Confirm what you’re restoring</label>
        <p id={`${id}-confirmation-hint`} className="m-0 text-[11px] leading-[1.6] text-zinc-500 [overflow-wrap:anywhere] [&_strong]:font-medium [&_strong]:text-zinc-400">Type <strong>{item.name}</strong> to continue.</p>
        <WorkspaceInput id={`${id}-confirmation`} value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)}
          aria-describedby={`${id}-confirmation-hint`} autoComplete="off" spellCheck={false} required disabled={loading}
          maxLength={Math.max(200, item.name.length)} data-trash-restore-autofocus="true" />
      </div>
      {item.isProduction ? <div className="rounded-[10px] border border-amber-400/13 bg-amber-400/[.025] p-3 [&>h3]:m-0 [&>h3]:flex [&>h3]:items-center [&>h3]:gap-1.5 [&>h3]:text-xs [&>h3]:leading-normal [&>h3]:font-medium [&>h3]:text-[#d4b875] [&>p]:mt-1.25 [&>p]:mb-2.5 [&>p]:text-[11px] [&>p]:leading-[1.7] [&>p]:text-[#a19a89]">
        <h3><ShieldCheck size={15} strokeWidth={1.7} aria-hidden="true" /> Production recovery</h3>
        <p id={`${id}-production-hint`}>Restoring this batch changes production secret configuration.</p>
        <label className="group flex min-h-8 cursor-pointer items-center gap-2.25 text-xs leading-[1.6] text-zinc-300 has-disabled:cursor-not-allowed has-disabled:opacity-55">
          <span className="relative inline-flex size-4 basis-4">
            <input type="checkbox" required checked={productionConfirmed} disabled={loading}
              className="peer absolute inset-0 z-1 m-0 size-full cursor-[inherit] opacity-0" onChange={(event) => onProductionChange(event.target.checked)} aria-describedby={`${id}-production-hint`} />
            <span className="grid size-4 place-items-center rounded border border-white/25 bg-[#111112] text-transparent transition-[background-color,border-color] duration-120 group-hover:border-zinc-400 peer-checked:border-zinc-200 peer-checked:bg-zinc-200 peer-checked:text-zinc-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-zinc-400 motion-reduce:transition-none" aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span>
          </span>
          <span>I confirm restoring this production configuration</span>
        </label>
      </div> : null}
      {error ? <div className="rounded-lg border border-rose-400/20 bg-rose-400/[.04] px-3 py-2.5 text-xs leading-[1.6] text-rose-300 [overflow-wrap:anywhere]" role="alert">{error}</div> : null}
    </div>
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[.07] px-6 py-4 max-[540px]:flex-col max-[540px]:items-stretch max-[540px]:gap-2.5 max-[540px]:px-[18px] max-[540px]:py-3.5">
      <p className="m-0 flex items-center gap-1.25 text-[10px] leading-[1.6] text-zinc-500"><LockKeyhole size={12} strokeWidth={1.7} aria-hidden="true" /> Values stay encrypted</p>
      <div className="ml-auto flex shrink-0 items-start gap-2 max-[540px]:justify-end max-[540px]:[&>button]:min-h-10">
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
      className={`${workspaceScopeClassName} ph-no-capture flex max-h-[calc(100dvh-24px)] w-[min(calc(100vw-24px),500px)] flex-col overflow-hidden rounded-2xl [&>div:first-child]:shrink-0 [&>div:first-child]:gap-4 [&>div:first-child]:px-6 [&>div:first-child]:py-5 [&>div:first-child_h2]:text-lg [&>div:first-child_h2]:font-normal [&>div:first-child_h2]:tracking-[-.025em] [&>div:first-child_p]:mt-1 [&>div:first-child_p]:text-xs [&>div:first-child_p]:leading-[1.6] [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-1 [&>div:last-child]:flex-col [&>div:last-child]:overflow-hidden [&>div:last-child]:p-0 max-[540px]:[&>div:first-child]:p-[18px]`} data-private-product="secrets"
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
