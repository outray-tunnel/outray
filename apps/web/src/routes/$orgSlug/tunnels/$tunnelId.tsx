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
    meta: [{ title: "Tunnel Details - OutRay" }],
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
    return <TunnelDetailSkeleton activeTab={activeTab} />;
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
    <div className="mx-auto max-w-6xl space-y-7">
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

function TunnelDetailSkeleton({ activeTab }: { activeTab: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-pulse">
      <div className="flex flex-col gap-6">
        <header className="flex items-start gap-4 border-b border-white/[0.07] pb-7">
          <div className="mt-1 size-7 shrink-0 bg-white/[0.04]" />
          <div className="min-w-0 flex-1">
            <div className="h-2 w-20 bg-white/[0.05]" />
            <div className="mt-5 h-7 w-52 bg-white/[0.06]" />
            <div className="mt-3 h-2.5 w-64 max-w-full bg-white/[0.04]" />
          </div>
          <div className="h-9 w-20 shrink-0 rounded-md border border-white/[0.06] bg-white/[0.025]" />
        </header>

        <div className="flex gap-6 border-b border-white/[0.07]">
          <div className="h-10 w-16 border-b border-white/[0.08]" />
          <div className="h-10 w-16 border-b border-white/[0.04]" />
        </div>
      </div>

      {activeTab === "requests" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="h-9 w-full max-w-sm border-b border-white/[0.08]">
              <div className="mt-3 h-2.5 w-36 bg-white/[0.04]" />
            </div>
            <div className="flex h-9 w-56 items-end gap-5 border-b border-white/[0.07] px-2 pb-3">
              {[24, 14, 20, 14, 20].map((width, index) => (
                <div
                  key={index}
                  className="h-2 bg-white/[0.04]"
                  style={{ width }}
                />
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/[0.07]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-185 text-left">
                <thead className="border-b border-white/[0.07] text-[9px] uppercase tracking-[0.1em] text-zinc-800">
                  <tr>
                    <th className="w-20 px-4 py-3 font-medium">Status</th>
                    <th className="w-20 px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Path</th>
                    <th className="w-30 px-4 py-3 font-medium">Client</th>
                    <th className="w-24 px-4 py-3 text-right font-medium">
                      Duration
                    </th>
                    <th className="w-20 px-4 py-3 text-right font-medium">
                      Size
                    </th>
                    <th className="w-24 px-4 py-3 text-right font-medium">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index} className="h-11">
                      <td className="px-4 py-3">
                        <div className="h-2.5 w-7 bg-white/[0.05]" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-2.5 w-8 bg-white/[0.04]" />
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="h-2.5 bg-white/[0.05]"
                          style={{ width: `${38 + (index % 3) * 15}%` }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-2.5 w-16 bg-white/[0.035]" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="ml-auto h-2.5 w-9 bg-white/[0.04]" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="ml-auto h-2.5 w-8 bg-white/[0.035]" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="ml-auto h-2.5 w-12 bg-white/[0.035]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          <div className="grid rounded-xl border border-white/[0.07] md:grid-cols-4 md:divide-x md:divide-white/[0.07]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="px-5 py-6 sm:px-6">
                <div className="h-2 w-16 bg-white/[0.04]" />
                <div className="mt-4 h-6 w-20 bg-white/[0.06]" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/[0.07] px-5 py-6 sm:px-6">
            <div className="h-2.5 w-28 bg-white/[0.04]" />
            <div className="mt-8 h-64 bg-white/[0.025]" />
          </div>
        </div>
      )}
    </div>
  );
}
