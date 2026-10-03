import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { BandwidthUsage } from "@/components/overview/bandwidth-usage";
import { NewTunnelModal } from "@/components/new-tunnel-modal";
import { LimitModal } from "@/components/limit-modal";
import { OverviewHeader } from "@/components/overview/overview-header";
import {
  TunnelsAnalytics,
  type OverviewRange,
} from "@/components/overview/tunnels-analytics";
import { ActiveTunnelsPanel } from "@/components/overview/active-tunnels-panel";
import { OverviewSkeleton } from "@/components/overview/overview-skeleton";

export const Route = createFileRoute("/$orgSlug/")({
  head: () => ({
    meta: [{ title: "Overview - OutRay" }],
  }),
  component: OverviewView,
});

function OverviewView() {
  const [isNewTunnelModalOpen, setIsNewTunnelModalOpen] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const newTunnelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [timeRange, setTimeRange] = useState<OverviewRange>("24h");
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
    isFetching: statsFetching,
    error: statsError,
    refetch: refetchStats,
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
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    // Keep the prior range visible, but never carry another organization's data.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === orgSlug ? previousData : undefined,
  });

  const {
    data: tunnelsData,
    isLoading: tunnelsLoading,
    error: tunnelsError,
    refetch: refetchTunnels,
  } = useQuery({
    queryKey: ["tunnels", orgSlug],
    queryFn: async () => {
      if (!orgSlug) throw new Error("No active organization");
      const result = await appClient.tunnels.list(orgSlug);
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    enabled: !!orgSlug,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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

  if (statsLoading && !stats) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <OverviewHeader
        isAtLimit={isAtLimit}
        onNewTunnelClick={handleNewTunnelClick}
        triggerRef={newTunnelTriggerRef}
      />

      <TunnelsAnalytics
        stats={stats}
        range={timeRange}
        onRangeChange={setTimeRange}
        isFetching={statsFetching && !!stats}
        error={statsError?.message ?? null}
        onRetry={() => void refetchStats()}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(250px,320px)]">
        <ActiveTunnelsPanel
          activeTunnels={activeTunnels}
          orgSlug={orgSlug}
          isLoading={tunnelsLoading}
          error={tunnelsError?.message ?? null}
          onRetry={() => void refetchTunnels()}
        />
        <BandwidthUsage />
      </div>

      <NewTunnelModal
        isOpen={isNewTunnelModalOpen}
        onClose={() => setIsNewTunnelModalOpen(false)}
        orgSlug={orgSlug}
        triggerRef={newTunnelTriggerRef}
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
