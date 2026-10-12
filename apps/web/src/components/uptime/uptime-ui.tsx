import type { InputHTMLAttributes, ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { workspaceInputClassName } from "../ui/workspace-input-styles";
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

// Links mirror Button without nesting an interactive button in an anchor.
/* eslint-disable react-refresh/only-export-components -- Shared Uptime style tokens are consumed alongside its UI primitives. */
const uptimeButtonBaseClassName = "relative inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-transparent px-4 text-[13px] leading-[1.45] font-medium whitespace-nowrap transition-[color,background,border-color,opacity,box-shadow] duration-[160ms] ease-[cubic-bezier(.22,1,.36,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8367c7] disabled:cursor-not-allowed disabled:opacity-[.52] motion-reduce:transition-none";
const primaryButtonClassName = "border-zinc-50 bg-zinc-50 text-zinc-950 hover:opacity-[.91] hover:shadow-[0_1px_2px_rgb(0_0_0/.25)] active:opacity-[.84]";
const secondaryButtonClassName = "border-white/12 bg-zinc-900 text-zinc-50 hover:bg-[#202023] hover:shadow-[0_1px_2px_rgb(0_0_0/.25)] active:bg-[#202023]";
export const primaryButton = `${uptimeButtonBaseClassName} ${primaryButtonClassName}`;
export const primaryButtonSmall = `${uptimeButtonBaseClassName} ${primaryButtonClassName} min-h-8 px-3`;
export const secondaryButton = `${uptimeButtonBaseClassName} ${secondaryButtonClassName} min-h-8 px-3`;
export const secondaryButtonMedium = `${uptimeButtonBaseClassName} ${secondaryButtonClassName}`;
export const fieldClass = workspaceInputClassName;
export const labelClass = "block text-[12px] text-zinc-300";
export const uptimeControlsClassName = "[&>div>label]:text-xs [&>div>label]:font-normal [&>div>label]:text-zinc-300 [&_button[role=combobox]]:bg-[#0c0c0e] [&_button[role=combobox]:focus-visible]:border-white/25 [&_button[role=combobox]:focus-visible]:shadow-[0_0_0_1px_rgb(255_255_255/.07)] [&_button[role=combobox]:focus-visible]:outline-none";

export function UptimeCheckbox(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  return <span className="relative inline-flex size-4 shrink-0 [&>input]:m-0 [&>input]:size-full [&>input]:appearance-none [&>input]:rounded [&>input]:border [&>input]:border-white/18 [&>input]:bg-white/[.03] [&>input]:transition-[background-color,border-color] [&>input]:duration-[120ms] [&>input:checked]:border-zinc-300 [&>input:checked]:bg-zinc-300 [&>input:focus-visible]:outline-2 [&>input:focus-visible]:outline-offset-3 [&>input:focus-visible]:outline-zinc-400 [&>input:disabled]:cursor-not-allowed [&>input:disabled]:opacity-50 [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:inset-0.5 [&>svg]:text-zinc-900 [&>svg]:opacity-0 [&:has(>input:checked)>svg]:opacity-100 motion-reduce:[&>input]:transition-none"><input {...props} type="checkbox" /><Check size={12} strokeWidth={2.5} aria-hidden="true" /></span>;
}

export function UptimeError({ message }: { message: string }) {
  return <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/15 bg-rose-400/[0.035] px-3.5 py-2.5 text-[12px] leading-5 text-rose-300"><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{message}</p>;
}
