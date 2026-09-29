import type { ReactNode } from "react";
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
  const normalized = state && state in stateLabels ? state as UptimeState : "unknown";
  return <span className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium ${stateClasses[normalized]}`}>
    <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{stateLabels[normalized]}
  </span>;
}

export function UptimePageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">{eyebrow}</p>
      <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-zinc-100 md:text-[32px]">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{description}</p>
    </div>
    {action}
  </div>;
}

export function UptimePanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-white/[0.08] bg-[#0d0d0f] ${className}`}>{children}</section>;
}

export const primaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl bg-zinc-100 px-4 text-[12px] font-semibold text-black transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.12] px-4 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50";
export const fieldClass = "min-h-10 w-full rounded-xl border border-white/[0.1] bg-[#111113] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-400/50";
export const labelClass = "block text-[12px] font-medium text-zinc-300";

export function UptimeError({ message }: { message: string }) {
  return <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-[12px] text-rose-300">{message}</p>;
}
