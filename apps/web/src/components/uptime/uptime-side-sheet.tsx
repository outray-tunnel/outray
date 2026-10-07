import type { ReactNode } from "react";
import { SideSheet } from "../ui/side-sheet";

/** Uptime uses the same accessible, animated panel as the refreshed products. */
export function UptimeSideSheet({ busy = false, ...props }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  busy?: boolean;
}) {
  return <SideSheet {...props} closeDisabled={busy} />;
}
