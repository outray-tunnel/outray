"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRef, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import "../outray-arc-theme.css";

type ContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;

export interface SideSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onEscapeKeyDown?: ContentProps["onEscapeKeyDown"];
  onInteractOutside?: ContentProps["onInteractOutside"];
}

/** A modal panel whose caller owns its open state and optional nested dialogs. */
export function SideSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeDisabled = false,
  returnFocusRef,
  onEscapeKeyDown,
  onInteractOutside,
}: SideSheetProps) {
  const reducedMotion = useReducedMotion();
  const opener = useRef<HTMLElement | null>(null);

  const handleEscape: ContentProps["onEscapeKeyDown"] = (event) => {
    if (typeof Element !== "undefined" && event.target instanceof Element &&
      event.target.closest('[aria-haspopup="listbox"][aria-expanded="true"]')) {
      // Radix sees Escape in document capture, before Select closes in bubble.
      event.preventDefault();
      return;
    }
    onEscapeKeyDown?.(event);
    if (closeDisabled) event.preventDefault();
  };
  const handleOutside: ContentProps["onInteractOutside"] = (event) => {
    onInteractOutside?.(event);
    if (closeDisabled) event.preventDefault();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && !closeDisabled) onClose();
    }}>
      <AnimatePresence>
        {open && <DialogPrimitive.Portal key="side-sheet" forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.1 : 0.18 }}
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content
            asChild
            forceMount
            {...(description ? {} : { "aria-describedby": undefined })}
            onEscapeKeyDown={handleEscape}
            onInteractOutside={handleOutside}
            onOpenAutoFocus={() => {
              opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = returnFocusRef?.current?.isConnected ? returnFocusRef.current : opener.current;
              if (target?.isConnected) target.focus();
            }}
          >
            <motion.div
              className="workspace-ui outray-arc fixed inset-y-0 right-0 z-[61] flex h-dvh max-h-dvh w-full max-w-[640px] min-w-0 flex-col overflow-hidden border-l border-white/[0.08] bg-[#111112] text-zinc-200 shadow-[-20px_0_70px_rgba(0,0,0,0.35)] outline-none"
              initial={reducedMotion ? { opacity: 0 } : { x: 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-5 sm:px-6">
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-[18px] font-normal tracking-[-0.025em] text-zinc-100">{title}</DialogPrimitive.Title>
                  {description && <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-5 text-zinc-400">{description}</DialogPrimitive.Description>}
                </div>
                <DialogPrimitive.Close
                  disabled={closeDisabled}
                  aria-label="Close panel"
                  className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                >
                  <X size={17} strokeWidth={1.75} aria-hidden="true" />
                </DialogPrimitive.Close>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
              {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-4 sm:px-6" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>{footer}</footer>}
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
