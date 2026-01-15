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
    <div className="px-3 py-2 bg-linear-to-br from-accent/10 to-transparent rounded-xl border border-accent/10 mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-accent capitalize">
          {currentPlan} Plan
        </span>
        <span className="text-[10px] text-accent/70">
          {activeTunnelsCount}/{limit === -1 ? "∞" : limit} Tunnels
        </span>
      </div>
      {limit !== -1 && (
        <div className="h-1.5 bg-accent/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
