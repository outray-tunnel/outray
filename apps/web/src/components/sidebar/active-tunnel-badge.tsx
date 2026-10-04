import { activeTunnelCountLabel } from "./active-tunnel-count";

export function ActiveTunnelBadge({
  count,
  compact = false,
}: {
  count?: number;
  compact?: boolean;
}) {
  const label = activeTunnelCountLabel(count);
  if (!label || count === undefined) return null;

  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white/[0.07] font-medium tabular-nums text-zinc-300 ${
        compact
          ? "absolute right-0.5 top-0.5 h-4 min-w-4 px-1 text-[9px]"
          : "h-5 min-w-5 px-1.5 text-[11px]"
      }`}
    >
      {compact && count > 99 ? "99+" : count.toLocaleString()}
    </span>
  );
}
