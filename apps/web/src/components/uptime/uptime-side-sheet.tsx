import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "../outray-arc-theme.css";

export function UptimeSideSheet({ open, onClose, title, description, children, footer, busy = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(<dialog
    ref={ref}
    tabIndex={-1}
    aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    aria-busy={busy}
    className="outray-arc fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[640px] overflow-hidden border-0 border-l border-white/[0.1] bg-[#0d0d0f] p-0 text-zinc-200 shadow-[-20px_0_80px_rgba(0,0,0,0.45)] outline-none backdrop:bg-black/65 backdrop:backdrop-blur-[2px] sm:w-[min(640px,92vw)]"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => {
      if (busy || event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left) onClose();
    }}
  >
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-5 sm:px-7">
        <div className="min-w-0"><h2 id={titleId} className="text-[16px] font-medium tracking-[-0.02em] text-zinc-100">{title}</h2>{description && <p id={descriptionId} className="mt-1.5 break-words text-xs leading-5 text-zinc-500">{description}</p>}</div>
        <button type="button" data-autofocus onClick={onClose} disabled={busy} aria-label="Close update sheet" className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400 motion-reduce:transition-none disabled:opacity-40"><X size={17} aria-hidden="true" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">{children}</div>
      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] bg-[#0d0d0f] px-5 py-4 sm:px-7" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>{footer}</footer>
    </div>
  </dialog>, document.body);
}
