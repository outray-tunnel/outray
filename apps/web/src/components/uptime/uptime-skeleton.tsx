import type { ReactNode } from "react";
import { UptimePanel } from "./uptime-ui";

export function UptimeSkeleton({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  return <div role="status" aria-busy="true" className={`animate-pulse motion-reduce:animate-none ${className}`}>
    {children}
    <span className="sr-only">{label}</span>
  </div>;
}

export function UptimeHeaderSkeleton({ action = false }: { action?: boolean }) {
  return <div className="mb-5 flex items-end justify-between gap-3">
    <div className="min-w-0 flex-1">
      <div className="h-6 w-48 max-w-[75%] rounded bg-white/[0.07]" />
      <div className="mt-3 h-3 w-80 max-w-full rounded bg-white/[0.04]" />
    </div>
    {action && <div className="h-9 w-28 shrink-0 rounded-xl bg-white/[0.05]" />}
  </div>;
}

export function UptimeSummarySkeleton({ cards = 4 }: { cards?: 3 | 4 }) {
  return <div className={`grid gap-3 ${cards === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
    {Array.from({ length: cards }, (_, index) => <UptimePanel key={index} className="p-5">
      <div className="h-2.5 w-24 rounded bg-white/[0.04]" />
      <div className="mt-4 h-7 w-20 rounded bg-white/[0.07]" />
      <div className="mt-3 h-2.5 w-32 max-w-full rounded bg-white/[0.04]" />
    </UptimePanel>)}
  </div>;
}

export function UptimeRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="divide-y divide-white/[0.06]">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="flex min-h-[68px] items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="h-3 w-40 max-w-[70%] rounded bg-white/[0.07]" />
        <div className="mt-3 h-2.5 w-56 max-w-full rounded bg-white/[0.04]" />
      </div>
      <div className="h-6 w-20 shrink-0 rounded-md bg-white/[0.04]" />
    </div>)}
  </div>;
}
