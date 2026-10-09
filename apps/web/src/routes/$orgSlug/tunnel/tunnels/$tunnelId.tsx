import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appClient } from "@/lib/app-client";
import { AlertTriangle } from "lucide-react";
import { TunnelHeader } from "@/components/tunnel-details/tunnel-header";
import { TunnelTabs } from "@/components/tunnel-details/tunnel-tabs";
import { TabsContent } from "@/components/arc/tabs/tabs";
import { TunnelOverview } from "@/components/tunnel-details/tunnel-overview";
import { TunnelOverviewSkeleton } from "@/components/tunnel-details/tunnel-overview-ui";
import { ProtocolOverview } from "@/components/tunnel-details/protocol-overview";
import { ProtocolEvents } from "@/components/tunnel-details/protocol-events";
import { TunnelRequests } from "@/components/tunnel-details/tunnel-requests";
import {
  parseTunnelDetailSearch,
  retainSameTunnelData,
  TUNNEL_RANGES,
  type TunnelRange,
} from "@/lib/tunnel-detail-search";

export const Route = createFileRoute("/$orgSlug/tunnel/tunnels/$tunnelId")({
  head: () => ({
    meta: [{ title: "Tunnel Details - OutRay" }],
  }),
  component: TunnelDetailView,
  validateSearch: parseTunnelDetailSearch,
});

function TunnelDetailView() {
  const { tunnelId, orgSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab = search.tab;
  const timeRange = search.range ?? "24h";

  const queryClient = useQueryClient();

  const {
    data: tunnelData,
    isLoading: tunnelLoading,
    error: tunnelError,
    refetch: refetchTunnel,
  } = useQuery({
    queryKey: ["tunnel", orgSlug, tunnelId],
    queryFn: async () => {
      const result = await appClient.tunnels.get(orgSlug, tunnelId);
      if ("error" in result) throw new Error(result.error);
      return result;
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const result = await appClient.tunnels.stop(orgSlug, tunnelId);
      if ("error" in result) throw new Error(result.error);
      return result;
    },
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
    isFetching: statsFetching,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["tunnelStats", orgSlug, tunnelId, timeRange],
    queryFn: async () => {
      const result = await appClient.stats.tunnel(orgSlug, tunnelId, timeRange);
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    refetchInterval: 5000,
    // Preserve prior range data, but never show another tunnel's data as a placeholder.
    placeholderData: (previousData, previousQuery) =>
      retainSameTunnelData(
        previousData,
        previousQuery?.queryKey,
        orgSlug,
        tunnelId,
      ),
    enabled: !!tunnel && !isProtocolTunnel && activeTab === "overview",
  });

  // Protocol stats query (TCP/UDP)
  const {
    data: protocolStatsData,
    isLoading: protocolStatsLoading,
    isPlaceholderData: isProtocolPlaceholderData,
    isFetching: protocolStatsFetching,
    error: protocolStatsError,
    refetch: refetchProtocolStats,
  } = useQuery({
    queryKey: ["protocolStats", orgSlug, tunnelId, timeRange],
    queryFn: async () => {
      const response = await appClient.stats.protocol(orgSlug, {
        tunnelId,
        range: timeRange,
      });
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    refetchInterval: 5000,
    placeholderData: (previousData, previousQuery) =>
      retainSameTunnelData(
        previousData,
        previousQuery?.queryKey,
        orgSlug,
        tunnelId,
      ),
    enabled: !!tunnel && isProtocolTunnel && activeTab === "overview",
  });

  const stats = statsData && "stats" in statsData ? statsData.stats : null;
  const chartData =
    statsData && "chartData" in statsData ? statsData.chartData : [];

  const setActiveTab = (tab: string) => {
    if (tab !== "overview" && tab !== "requests") return;
    navigate({
      search: (prev) => ({ ...prev, tab }),
    });
  };

  const setTimeRange = (range: string) => {
    if (!TUNNEL_RANGES.includes(range as TunnelRange) || range === timeRange) {
      return;
    }
    navigate({
      search: (prev) => ({ ...prev, range: range as TunnelRange }),
    });
  };

  if (tunnelLoading) {
    return <TunnelDetailSkeleton activeTab={activeTab} />;
  }

  if (tunnelError && !tunnel) {
    const isMissing =
      tunnelError.message === "Tunnel not found" ||
      tunnelError.message === "Unauthorized";
    if (!isMissing) {
      return (
        <div className="mx-auto flex min-h-72 max-w-6xl flex-col items-center justify-center rounded-xl border border-white/[0.07] px-6 text-center">
          <AlertTriangle
            size={24}
            className="mb-3 text-amber-400"
            aria-hidden="true"
          />
          <h2 className="text-sm font-medium text-zinc-200">
            Could not load this tunnel
          </h2>
          <p className="mt-1 max-w-md text-xs text-zinc-500">
            {tunnelError.message}
          </p>
          <button
            type="button"
            onClick={() => void refetchTunnel()}
            className="mt-4 rounded-md border border-white/[0.12] px-3 py-2 text-xs text-zinc-200 transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
        </div>
      );
    }
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
          to="/$orgSlug/tunnel/tunnels"
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
    <div className="mx-auto max-w-[1440px] space-y-7">
      <TunnelHeader
        orgSlug={orgSlug}
        tunnel={tunnel}
        onStop={() => stopMutation.mutateAsync().then(() => undefined)}
        isStopping={stopMutation.isPending}
      />

      <TunnelTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        protocol={tunnel.protocol}
      >
        <TabsContent value="overview" className="mt-7">
          {isProtocolTunnel ? (
            <ProtocolOverview
              protocol={tunnel.protocol as "tcp" | "udp"}
              stats={protocolStatsData?.stats || null}
              chartData={protocolStatsData?.chartData || []}
              recentEvents={protocolStatsData?.recentEvents || []}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              dataRange={
                protocolStatsData &&
                "timeRange" in protocolStatsData &&
                typeof protocolStatsData.timeRange === "string"
                  ? protocolStatsData.timeRange
                  : timeRange
              }
              isLoading={protocolStatsLoading && !protocolStatsData}
              isPlaceholderData={
                isProtocolPlaceholderData ||
                (protocolStatsFetching && !!protocolStatsData)
              }
              error={protocolStatsError?.message ?? null}
              onRetry={() => void refetchProtocolStats()}
              onViewActivity={() => setActiveTab("requests")}
            />
          ) : (
            <TunnelOverview
              stats={stats}
              chartData={chartData}
              recentRequests={
                statsData && "requests" in statsData ? statsData.requests : []
              }
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              dataRange={
                statsData &&
                "timeRange" in statsData &&
                typeof statsData.timeRange === "string"
                  ? statsData.timeRange
                  : timeRange
              }
              isLoading={statsLoading && !statsData}
              isPlaceholderData={
                isPlaceholderData || (statsFetching && !!statsData)
              }
              error={statsError?.message ?? null}
              onRetry={() => void refetchStats()}
              onViewActivity={() => setActiveTab("requests")}
            />
          )}
        </TabsContent>

        <TabsContent value="requests" className="mt-7">
          {isProtocolTunnel ? (
            <ProtocolEvents
              tunnelId={tunnelId}
              protocol={tunnel.protocol as "tcp" | "udp"}
              orgSlug={orgSlug}
            />
          ) : (
            <TunnelRequests tunnelId={tunnelId} />
          )}
        </TabsContent>
      </TunnelTabs>
    </div>
  );
}

function TunnelDetailSkeleton({ activeTab }: { activeTab: string }) {
  return (
    <div
      className="mx-auto max-w-[1440px] space-y-7 animate-pulse motion-reduce:animate-none"
      aria-label="Loading tunnel details"
      aria-busy="true"
    >
      <div className="flex flex-col gap-6">
        <header className="min-w-0">
          <div className="mb-3 h-3 w-20 rounded bg-white/[0.05]" />
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-5 w-44 max-w-[45vw] rounded bg-white/[0.07]" />
              <div className="h-6 w-16 rounded-full bg-white/[0.05]" />
            </div>
            <div className="h-11 w-28 rounded-xl bg-white/[0.05]" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="h-3 w-10 rounded bg-white/[0.04]" />
            <div className="h-3 w-1 rounded bg-white/[0.03]" />
            <div className="h-3 w-64 max-w-[55vw] rounded bg-white/[0.05]" />
            <div className="h-7 w-12 rounded bg-white/[0.04]" />
            <div className="h-7 w-12 rounded bg-white/[0.04]" />
          </div>
        </header>

        <div className="flex h-10 items-center gap-6 border-b border-white/[0.08]">
          <div className="h-2.5 w-14 rounded-sm bg-white/[0.06]" />
          <div className="h-2.5 w-14 rounded-sm bg-white/[0.04]" />
        </div>
      </div>

      {activeTab === "requests" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex h-9 w-full min-w-0 items-center rounded-xl border border-white/[0.08] px-3 sm:w-72">
              <div className="h-2.5 w-36 bg-white/[0.04]" />
            </div>
            <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
              <div className="h-8 w-20 shrink-0 rounded-xl bg-white/[0.03]" />
              <div className="flex h-9 w-72 items-center gap-5 rounded-lg border border-white/[0.07] px-2">
                {[24, 14, 20, 14, 20].map((width, index) => (
                  <div
                    key={index}
                    className="h-2 bg-white/[0.04]"
                    style={{ width }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/[0.07]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
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
                    <tr key={index} className="h-12">
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
            <div className="flex h-11 items-center justify-between border-t border-white/[0.07] px-4">
              <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
              <div className="h-2.5 w-16 rounded bg-white/[0.04]" />
            </div>
          </div>
        </div>
      ) : (
        <TunnelOverviewSkeleton />
      )}
    </div>
  );
}
