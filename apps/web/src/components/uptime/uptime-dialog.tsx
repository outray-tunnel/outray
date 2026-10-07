import { createContext, type ReactNode, useContext, useRef } from "react";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import styles from "./uptime-ui.module.css";
import "../outray-arc-theme.css";

const DialogDepth = createContext(0);

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
      className={`workspace-ui outray-arc outray-arc-dialog ${styles.dialog} ${depth > 0 ? styles.raisedDialog : ""}`} overlayClassName={`${styles.overlay} ${depth > 0 ? styles.raisedOverlay : ""}`}
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
      <div className={styles.dialogBody}>{children}</div>
      {footer && <footer className={styles.dialogFooter}>{footer}</footer>}
    </DialogContent>
  </Dialog></DialogDepth.Provider>;
}
