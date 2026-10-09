import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "../arc/button/button";
import "../outray-arc-theme.css";
import styles from "./workspace-ui.module.css";
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
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={`outray-arc ${styles.dialog}`} data-size={size} {...(description ? {} : { "aria-describedby": undefined })}
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
        <header className={styles.dialogHeader}>
          <div className="min-w-0 flex-1">
            <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
            {description ? <Dialog.Description className={styles.dialogDescription}>{description}</Dialog.Description> : null}
          </div>
          <Dialog.Close asChild>
            <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Close ${title}`} className={styles.closeButton}>
              <X size={16} aria-hidden="true" />
            </Button>
          </Dialog.Close>
        </header>
        <div className={styles.dialogBody} aria-busy={busy || undefined}>{children}</div>
        {footer ? <footer className={styles.dialogFooter}>{footer}</footer> : null}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function WorkspaceNotice({ message, tone = "error", action, onDismiss }: {
  message: ReactNode;
  tone?: "error" | "success" | "info";
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return <div role={tone === "error" ? "alert" : "status"} className={styles.notice} data-tone={tone}>
    <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">{message}</div>
    {action}
    {onDismiss ? <Button type="button" variant="ghost" size="sm" aria-label="Dismiss message" onClick={onDismiss} className={styles.closeButton}><X size={14} aria-hidden="true" /></Button> : null}
  </div>;
}

export function WorkspaceEmptyState({ icon, title, description, action }: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return <div className={styles.emptyState}>
    {icon ? <span className={styles.emptyIcon} aria-hidden="true">{icon}</span> : null}
    <h2 className="text-[14px] font-medium tracking-[-0.02em] text-zinc-200">{title}</h2>
    <div className="mx-auto mt-2 max-w-[420px] text-[12px] leading-5 text-zinc-400">{description}</div>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>;
}
