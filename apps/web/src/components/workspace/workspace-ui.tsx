import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "../arc/button/button";
import { workspaceScopeClassName } from "../ui/workspace-scope";
import { workspaceFocusTarget } from "./workspace-dialog-focus";

/** Opt-in workspace shell: shared focus handling without changing legacy dialogs. */
export function WorkspaceDialog({ open, onClose, title, description, children, footer, busy = false, size = "md" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const opener = useRef<HTMLElement | null>(null);
  const pageScope = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <AnimatePresence>
      {open && <Dialog.Portal key="workspace-dialog" forceMount>
      <Dialog.Overlay asChild forceMount>
        <motion.div className="fixed inset-0 z-80 bg-black/68 data-[state=closed]:pointer-events-none!" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { type: "tween", duration: reducedMotion ? 0 : .12, ease: "easeOut" } }} transition={{ type: "tween", duration: reducedMotion ? 0 : .14, ease: "easeOut" }} />
      </Dialog.Overlay>
      <Dialog.Content asChild forceMount {...(description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => {
          // These dialogs are opened from page/menu actions, not a Radix Trigger.
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          pageScope.current = opener.current?.closest("main") ?? document.querySelector("main");
          const field = event.currentTarget instanceof HTMLElement ? event.currentTarget.querySelector<HTMLElement>('input:not([disabled]):not([readonly]):not([type="hidden"]), textarea:not([disabled]), [role="combobox"]:not([disabled])') : null;
          if (field) { event.preventDefault(); field.focus({ preventScroll: true }); }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          workspaceFocusTarget(opener.current, pageScope.current)?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
        <motion.div className={`${workspaceScopeClassName} fixed top-1/2 left-1/2 z-81 flex max-h-[calc(100dvh-48px)] w-[min(480px,calc(100vw-32px))] -translate-1/2 flex-col rounded-2xl border border-white/10 bg-[#101010] shadow-[0_24px_80px_rgb(0_0_0/.55)] outline-none data-[size=sm]:w-[min(420px,calc(100vw-32px))] data-[size=lg]:w-[min(600px,calc(100vw-32px))] data-[state=closed]:pointer-events-none! max-[480px]:max-h-[calc(100dvh-24px)]`} data-size={size} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : 4, transition: { type: "tween", duration: reducedMotion ? 0 : .12, ease: "easeOut" } }} transition={{ type: "tween", duration: reducedMotion ? 0 : .16, ease: "easeOut" }}>
        <header className="flex shrink-0 items-start gap-4 border-b border-white/[.07] px-6 pt-[22px] pb-[18px] max-[480px]:px-5 max-[480px]:pt-5 max-[480px]:pb-4">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-[17px] leading-[1.4] font-medium tracking-[-.035em] text-zinc-100">{title}</Dialog.Title>
            {description ? <Dialog.Description className="mt-1.25 text-xs leading-[1.7] text-[#929299]">{description}</Dialog.Description> : null}
          </div>
          <Dialog.Close asChild>
            <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Close ${title}`} className="w-[30px] min-w-[30px] shrink-0 px-0!">
              <X size={16} aria-hidden="true" />
            </Button>
          </Dialog.Close>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-[22px_24px] max-[480px]:p-5" aria-busy={busy || undefined}>{children}</div>
        {footer ? <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[.07] px-6 py-4 max-[480px]:px-5 max-[480px]:py-3.5">{footer}</footer> : null}
        </motion.div>
      </Dialog.Content>
    </Dialog.Portal>}
    </AnimatePresence>
  </Dialog.Root>;
}

export function WorkspaceNotice({ message, tone = "error", action, onDismiss }: {
  message: ReactNode;
  tone?: "error" | "success" | "info";
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return <div role={tone === "error" ? "alert" : "status"} className="flex flex-wrap items-start gap-2.25 rounded-[10px] border border-rose-500/18 bg-rose-500/[.04] px-3.5 py-[11px] text-xs leading-[1.6] text-rose-300 data-[tone=success]:border-emerald-400/15 data-[tone=success]:bg-emerald-400/[.035] data-[tone=success]:text-emerald-200 data-[tone=info]:border-white/[.09] data-[tone=info]:bg-white/[.025] data-[tone=info]:text-zinc-400" data-tone={tone}>
    <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">{message}</div>
    {action}
    {onDismiss ? <Button type="button" variant="ghost" size="sm" aria-label="Dismiss message" onClick={onDismiss} className="w-[30px] min-w-[30px] shrink-0 px-0!"><X size={14} aria-hidden="true" /></Button> : null}
  </div>;
}

export function WorkspaceEmptyState({ icon, title, description, action }: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return <div className="px-6 py-12 text-center">
    {icon ? <span className="mx-auto mb-[17px] grid size-11 place-items-center rounded-[13px] border border-white/[.08] bg-white/[.025] text-zinc-400" aria-hidden="true">{icon}</span> : null}
    <h2 className="text-[14px] font-medium tracking-[-0.02em] text-zinc-200">{title}</h2>
    <div className="mx-auto mt-2 max-w-[420px] text-[12px] leading-5 text-zinc-400">{description}</div>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>;
}
