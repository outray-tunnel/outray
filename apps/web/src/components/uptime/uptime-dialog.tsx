import { createContext, type ReactNode, useContext, useRef } from "react";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { workspaceScopeClassName } from "../ui/workspace-scope";

const DialogDepth = createContext(0);
const dialogClassName = "z-81! flex max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),560px)] flex-col overflow-hidden bg-[#111112] [--text-lg:18px] [&>div:first-child]:shrink-0 [&>div:first-child]:px-6 [&>div:first-child]:py-5 max-sm:[&>div:first-child]:px-5 [&>div:first-child_h2]:font-normal [&>div:first-child_h2]:tracking-[-.025em] [&>div:last-child]:flex [&>div:last-child]:min-h-0 [&>div:last-child]:flex-col [&>div:last-child]:p-0";
const dialogBodyClassName = "min-h-0 overflow-y-auto overscroll-contain px-6 py-5 max-sm:px-5";
const dialogFooterClassName = "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[.08] px-6 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] max-sm:px-5";

export function UptimeDialog({ open, onClose, title, description, children, footer, busy = false, layer = 0 }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  /** Sibling confirmations sit above their still-open editor; nested dialogs inherit this automatically. */
  layer?: number;
}) {
  const depth = useContext(DialogDepth) + layer;
  const opener = useRef<HTMLElement | null>(null);
  const preventBusyClose = (event: { preventDefault: () => void }) => { if (busy) event.preventDefault(); };
  return <DialogDepth.Provider value={depth + 1}><Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <DialogContent title={title} description={description} closeDisabled={busy} aria-busy={busy}
      {...(description ? {} : { "aria-describedby": undefined })}
      className={`${workspaceScopeClassName} ${dialogClassName} ${depth > 0 ? "z-91!" : ""}`} overlayClassName={`z-80! backdrop-blur-none! ${depth > 0 ? "z-90!" : ""}`}
      onEscapeKeyDown={(event) => {
        if (typeof Element !== "undefined" && event.target instanceof Element && event.target.closest('[aria-haspopup="listbox"][aria-expanded="true"]')) event.preventDefault();
        preventBusyClose(event);
      }}
      onPointerDownOutside={preventBusyClose} onInteractOutside={preventBusyClose}
      onOpenAutoFocus={(event) => {
        const current = document.activeElement;
        if (current instanceof HTMLElement && current !== document.body) opener.current = current;
        if (!(event.target instanceof HTMLElement)) return;
        const target = event.target.querySelector<HTMLElement>("[data-autofocus]");
        if (target) { event.preventDefault(); target.focus(); }
      }}
      onCloseAutoFocus={(event) => {
        if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
        opener.current = null;
      }}>
      <div className={dialogBodyClassName}>{children}</div>
      {footer && <footer className={dialogFooterClassName}>{footer}</footer>}
    </DialogContent>
  </Dialog></DialogDepth.Provider>;
}
