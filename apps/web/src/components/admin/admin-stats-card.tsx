import { HugeiconsIcon } from "@hugeicons/react";
import ArrowUpRight01Icon from "@outray/icons/stroke/ArrowUpRight01Icon";
import type { ReactNode } from "react";

interface AdminStatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: ReactNode;
  subtitle?: string;
  onClick?: () => void;
}

export function AdminStatsCard({
  title,
  value,
  change,
  icon,
  subtitle,
  onClick,
}: AdminStatsCardProps) {
  const finiteChange = change !== undefined && Number.isFinite(change) ? change : undefined;
  const content = <>
    <span className="flex items-center justify-between gap-3 text-zinc-500"><span className="text-[12px] font-normal">{title}</span><span aria-hidden="true" className="[&_svg]:size-4">{icon}</span></span>
    <span className="mt-4 block text-[28px] font-normal leading-none tracking-[-.055em] text-zinc-100 tabular-nums">{value}</span>
    <span className="mt-3 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-normal text-zinc-500">
      {finiteChange !== undefined && <span className={`tabular-nums ${finiteChange > 0 ? "text-emerald-400" : finiteChange < 0 ? "text-rose-400" : "text-zinc-500"}`}>{finiteChange > 0 ? "+" : ""}{finiteChange.toFixed(1)}%</span>}
      {subtitle ? <span>{subtitle}</span> : finiteChange !== undefined ? <span>growth</span> : <span>{onClick ? "View revenue card" : "Across the platform"}</span>}
      {onClick ? <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} className="ml-auto text-zinc-600 transition-colors group-hover:text-zinc-300" aria-hidden="true" /> : null}
    </span>
  </>;
  const classes = `group block min-w-0 rounded-xl border border-white/[.08] bg-[#101010] p-5 text-left ${onClick ? "w-full transition-colors hover:border-white/[.14] hover:bg-[#131313] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none" : ""}`;
  return onClick ? <button type="button" onClick={onClick} className={classes} aria-label={`${title}: ${value}. View revenue card`}>{content}</button> : <div className={classes}>{content}</div>;
}
