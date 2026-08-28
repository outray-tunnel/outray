interface PlanUsageProps {
  activeTunnelsCount: number;
  limit: number;
  currentPlan: string;
}

export function PlanUsage({
  activeTunnelsCount,
  limit,
  currentPlan,
}: PlanUsageProps) {
  const percentage =
    limit === -1 ? 0 : Math.min(100, (activeTunnelsCount / limit) * 100);

  return (
    <div className="px-2 py-2">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium capitalize text-zinc-400">
          {currentPlan} plan
        </span>
        <span className="tabular-nums text-zinc-600">
          {activeTunnelsCount} / {limit === -1 ? "∞" : limit} tunnels
        </span>
      </div>
      {limit !== -1 && (
        <div className="h-px overflow-hidden bg-white/[0.08]">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
