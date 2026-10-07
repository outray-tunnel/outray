import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "../outray-arc-theme.css";

export function UptimeDialog({ open, onClose, title, description, children, footer, busy = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? dialog).focus();
    return () => {
      dialog.close();
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
    className="outray-arc fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0d0d0f] p-0 text-zinc-200 shadow-2xl outline-none backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => {
      if (busy || event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
  >
    <div className="flex max-h-[calc(100dvh_-_2rem)] flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5 sm:px-6">
        <div><h2 id={titleId} className="text-lg font-normal tracking-tight text-zinc-100">{title}</h2>{description && <p id={descriptionId} className="mt-1.5 text-[13px] leading-5 text-zinc-500">{description}</p>}</div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog" className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors motion-reduce:transition-none hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-40"><X size={17} aria-hidden="true" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
      {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4 sm:px-6">{footer}</div>}
    </div>
  </dialog>, document.body);
}
