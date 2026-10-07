import type { InputHTMLAttributes, ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import buttonStyles from "../arc/button/button.module.css";
import { workspaceInputClassName } from "../ui/workspace-input-styles";
import styles from "./uptime-ui.module.css";
import type { UptimeState } from "./uptime-client";

const stateLabels: Record<UptimeState, string> = {
  up: "Up",
  down: "Down",
  unknown: "Unknown",
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
};

const stateClasses: Record<UptimeState, string> = {
  up: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
  operational: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
  degraded: "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
  down: "border-rose-400/20 bg-rose-400/[0.07] text-rose-300",
  outage: "border-rose-400/20 bg-rose-400/[0.07] text-rose-300",
  unknown: "border-white/[0.1] bg-white/[0.035] text-zinc-400",
};

export function StateBadge({ state }: { state: UptimeState | string | null | undefined }) {
  const normalized = state && Object.hasOwn(stateLabels, state) ? state as UptimeState : "unknown";
  return <span className={`inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${stateClasses[normalized]}`}>
    <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{stateLabels[normalized]}
  </span>;
}

export function UptimePageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="break-words text-[20px] font-normal tracking-[-0.035em] text-zinc-100">{title}</h1>
      <p className="mt-1 max-w-2xl text-[12px] leading-5 text-zinc-500 [overflow-wrap:anywhere]">{description}</p>
    </div>
    {action}
  </header>;
}

export function UptimePanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-white/[0.08] bg-[#111112] ${className}`}>{children}</section>;
}

// Links use the installed button styles without nesting a button in an anchor.
/* eslint-disable react-refresh/only-export-components -- Shared Uptime style tokens are consumed alongside its UI primitives. */
export const primaryButton = `${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`;
export const secondaryButton = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`;
export const fieldClass = workspaceInputClassName;
export const labelClass = "block text-[12px] text-zinc-300";

export function UptimeCheckbox(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  return <span className={styles.checkbox}><input {...props} type="checkbox" /><Check size={12} strokeWidth={2.5} aria-hidden="true" /></span>;
}

export function UptimeError({ message }: { message: string }) {
  return <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/15 bg-rose-400/[0.035] px-3.5 py-2.5 text-[12px] leading-5 text-rose-300"><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{message}</p>;
}
