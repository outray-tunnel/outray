import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { BandwidthUsage } from "@/components/overview/bandwidth-usage";
import { NewTunnelModal } from "@/components/new-tunnel-modal";
import { LimitModal } from "@/components/limit-modal";
import { OverviewHeader } from "@/components/overview/overview-header";
import { StatsSummary } from "@/components/overview/stats-summary";
import { RequestActivityCard } from "@/components/overview/request-activity-card";
import { ActiveTunnelsPanel } from "@/components/overview/active-tunnels-panel";
import { OverviewSkeleton } from "@/components/overview/overview-skeleton";

export const Route = createFileRoute("/$orgSlug/")({
  head: () => ({
    meta: [
      { title: "Overview - OutRay" },
    ],
  }),
  component: OverviewView,
});

function OverviewView() {
  const [isNewTunnelModalOpen, setIsNewTunnelModalOpen] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [timeRange, setTimeRange] = useState("24h");
  const { orgSlug } = Route.useParams();

  const { data: subscriptionData } = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return null;
      const response = await appClient.subscriptions.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!orgSlug,
  });

  const {
    data: stats,
    isLoading: statsLoading,
    isPlaceholderData,
  } = useQuery({
    queryKey: ["stats", "overview", orgSlug, timeRange],
    queryFn: async () => {
      if (!orgSlug) return null;
      const result = await appClient.stats.overview(orgSlug, timeRange);
      if ("error" in result) {
        throw new Error(result.error);
      }
      return result;
    },
    enabled: !!orgSlug,
    placeholderData: keepPreviousData,
  });

  const { data: tunnelsData } = useQuery({
    queryKey: ["tunnels", orgSlug],
    queryFn: () => {
      if (!orgSlug) throw new Error("No active organization");

      return appClient.tunnels.list(orgSlug);
    },
    enabled: !!orgSlug,
  });

  const activeTunnels =
    tunnelsData && "tunnels" in tunnelsData ? tunnelsData.tunnels : [];

  const subscription = subscriptionData?.subscription;
  const currentPlan = subscription?.plan || "free";
  const planLimits = getPlanLimits(currentPlan as any);
  const tunnelLimit = planLimits.maxTunnels as number;
  const isAtLimit = tunnelLimit !== -1 && activeTunnels.length >= tunnelLimit;

  const handleNewTunnelClick = () => {
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    setIsNewTunnelModalOpen(true);
  };

  if (statsLoading) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <OverviewHeader
        isAtLimit={isAtLimit}
        onNewTunnelClick={handleNewTunnelClick}
      />

      <StatsSummary stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RequestActivityCard
          stats={stats}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          isPlaceholderData={isPlaceholderData}
        />

        <div className="flex flex-col gap-6">
          <BandwidthUsage />
          <ActiveTunnelsPanel activeTunnels={activeTunnels} orgSlug={orgSlug} />
        </div>
      </div>

      <NewTunnelModal
        isOpen={isNewTunnelModalOpen}
        onClose={() => setIsNewTunnelModalOpen(false)}
      />

      <LimitModal
        isOpen={isLimitModalOpen}
        onClose={() => setIsLimitModalOpen(false)}
        title="Tunnel Limit Reached"
        description={`You've reached your plan's limit of ${tunnelLimit} active tunnels. Upgrade your plan to create more tunnels.`}
        limit={tunnelLimit}
        currentPlan={currentPlan}
        resourceName="Active Tunnels"
      />
    </div>
  );
}
