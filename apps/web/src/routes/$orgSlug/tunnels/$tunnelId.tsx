import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { appClient } from "@/lib/app-client";
import { AlertTriangle } from "lucide-react";
import { TunnelHeader } from "@/components/tunnel-details/tunnel-header";
import { TunnelTabs } from "@/components/tunnel-details/tunnel-tabs";
import { TunnelOverview } from "@/components/tunnel-details/tunnel-overview";
import { ProtocolOverview } from "@/components/tunnel-details/protocol-overview";
import { ProtocolEvents } from "@/components/tunnel-details/protocol-events";
import { TunnelRequests } from "@/components/tunnel-details/tunnel-requests";

export const Route = createFileRoute("/$orgSlug/tunnels/$tunnelId")({
  head: () => ({
    meta: [
      { title: "Tunnel Details - OutRay" },
    ],
  }),
  component: TunnelDetailView,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as string) || "overview",
    };
  },
});

function TunnelDetailView() {
  const { tunnelId, orgSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab = search.tab;

  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState("24h");

  const { data: tunnelData, isLoading: tunnelLoading } = useQuery({
    queryKey: ["tunnel", orgSlug, tunnelId],
    queryFn: () => appClient.tunnels.get(orgSlug, tunnelId),
  });

  const stopMutation = useMutation({
    mutationFn: () => appClient.tunnels.stop(orgSlug, tunnelId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
      void queryClient.invalidateQueries({
        queryKey: ["tunnel", orgSlug, tunnelId],
      });
    },
  });

  const tunnel =
    tunnelData && "tunnel" in tunnelData ? tunnelData.tunnel : null;
  const isProtocolTunnel =
    tunnel?.protocol === "tcp" || tunnel?.protocol === "udp";

  // HTTP stats query
  const {
    data: statsData,
    isLoading: statsLoading,
    isPlaceholderData,
  } = useQuery({
    queryKey: ["tunnelStats", orgSlug, tunnelId, timeRange],
    queryFn: async () => {
      const result = await appClient.stats.tunnel(orgSlug, tunnelId, timeRange);
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
    enabled: !isProtocolTunnel,
  });

  // Protocol stats query (TCP/UDP)
  const { data: protocolStatsData, isLoading: protocolStatsLoading } = useQuery(
    {
      queryKey: ["protocolStats", orgSlug, tunnelId, timeRange],
      queryFn: async () => {
        const response = await appClient.stats.protocol(orgSlug!, {
          tunnelId,
          range: timeRange,
        });
        if ("error" in response) throw new Error(response.error);
        return response;
      },
      refetchInterval: 5000,
      enabled: isProtocolTunnel,
    },
  );

  const stats = statsData && "stats" in statsData ? statsData.stats : null;
  const chartData =
    statsData && "chartData" in statsData ? statsData.chartData : [];

  const setActiveTab = (tab: string) => {
    navigate({
      search: (prev) => ({ ...prev, tab }),
    });
  };

  const isLoadingStats = isProtocolTunnel ? protocolStatsLoading : statsLoading;

  if (tunnelLoading || (isLoadingStats && !tunnel)) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="h-20 bg-white/5 rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-white/5 rounded-2xl" />
          ))}
        </div>
        <div className="h-96 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (!tunnel) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <AlertTriangle size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-medium text-white mb-2">
          Tunnel Not Found
        </h2>
        <p>
          The tunnel you are looking for does not exist or you don't have access
          to it.
        </p>
        <Link
          to="/$orgSlug/tunnels"
          className="mt-4 text-accent hover:underline"
          params={{
            orgSlug,
          }}
        >
          Back to Tunnels
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-6">
        <TunnelHeader
          tunnel={tunnel}
          onStop={() => stopMutation.mutate()}
          isStopping={stopMutation.isPending}
        />

        <TunnelTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          protocol={tunnel.protocol}
        />
      </div>

      {activeTab === "overview" && isProtocolTunnel && (
        <ProtocolOverview
          protocol={tunnel.protocol as "tcp" | "udp"}
          stats={protocolStatsData?.stats || null}
          chartData={protocolStatsData?.chartData || []}
          recentEvents={protocolStatsData?.recentEvents || []}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          isLoading={protocolStatsLoading}
        />
      )}

      {activeTab === "overview" && !isProtocolTunnel && (
        <TunnelOverview
          stats={stats}
          chartData={chartData}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          isPlaceholderData={isPlaceholderData}
        />
      )}

      {activeTab === "requests" && isProtocolTunnel && (
        <ProtocolEvents
          tunnelId={tunnelId}
          protocol={tunnel.protocol as "tcp" | "udp"}
          orgSlug={orgSlug}
        />
      )}

      {activeTab === "requests" && !isProtocolTunnel && (
        <TunnelRequests tunnelId={tunnelId} />
      )}
    </div>
  );
}
