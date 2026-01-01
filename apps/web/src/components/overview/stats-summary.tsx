import { Activity, Globe, Network } from "lucide-react";
import { OverviewCard } from "./overview-card";
import { formatBytes, formatNumber } from "./format";

export type OverviewStats = {
  totalRequests: number;
  requestsChange?: number;
  activeTunnels?: number | null;
  activeTunnelsChange?: number;
  totalDataTransfer: number;
  dataTransferChange?: number;
};

export function StatsSummary({ stats }: { stats?: OverviewStats | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <OverviewCard
        title="Total Requests"
        value={formatNumber(stats?.totalRequests || 0)}
        change={stats?.requestsChange}
        icon={<Activity size={20} />}
        trend={
          stats?.requestsChange && stats.requestsChange < 0 ? "down" : "up"
        }
        showDash={stats?.totalRequests === 0}
      />
      <OverviewCard
        title="Active Tunnels"
        value={(stats?.activeTunnels ?? 0).toString()}
        icon={<Network size={20} />}
        trend="neutral"
      />
      <OverviewCard
        title="Data Transfer"
        value={formatBytes(stats?.totalDataTransfer || 0)}
        change={stats?.dataTransferChange}
        icon={<Globe size={20} />}
        trend={
          stats?.dataTransferChange && stats.dataTransferChange < 0
            ? "down"
            : "up"
        }
        showDash={stats?.totalDataTransfer === 0}
      />
    </div>
  );
}
