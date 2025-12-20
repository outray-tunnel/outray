import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Network,
  Globe,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Zap,
  Server,
  Clock,
  ChevronRight,
} from "lucide-react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { appClient } from "../../lib/app-client";
import { useAppStore } from "../../lib/store";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";

export const Route = createFileRoute("/dash/")({
  component: OverviewView,
});

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  } else if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  } else if (bytes >= 1_024) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function OverviewView() {
  const [timeRange, setTimeRange] = useState("24h");
  const { selectedOrganizationId } = useAppStore();
  const activeOrganization = selectedOrganizationId;

  const {
    data: stats,
    isLoading: statsLoading,
    isPlaceholderData,
  } = useQuery({
    queryKey: ["stats", "overview", activeOrganization, timeRange],
    queryFn: async () => {
      if (!activeOrganization) return null;
      const result = await appClient.stats.overview(activeOrganization, timeRange);
      if ("error" in result) {
        throw new Error(result.error);
      }
      return result;
    },
    enabled: !!activeOrganization,
    placeholderData: keepPreviousData,
  });

  const { data: tunnelsData } = useQuery({
    queryKey: ["tunnels", activeOrganization],
    queryFn: () => {
      if (!activeOrganization) throw new Error("No active organization");
      return appClient.tunnels.list(activeOrganization);
    },
    enabled: !!activeOrganization,
  });

  const activeTunnels = tunnelsData && "tunnels" in tunnelsData ? tunnelsData.tunnels : [];

  if (statsLoading) {
    return (
      <div className="space-y-6 animate-pulse max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-white/5 rounded-lg" />
          <div className="h-10 w-32 bg-white/5 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white/2 border border-white/5 rounded-2xl p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-white/5" />
                <div className="w-12 h-5 rounded-full bg-white/5" />
              </div>
              <div className="h-8 w-24 bg-white/5 rounded mb-2" />
              <div className="h-3 w-32 bg-white/5 rounded" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/2 border border-white/5 rounded-2xl p-6">
            <div className="h-6 w-48 bg-white/5 rounded mb-6" />
            <div className="h-75 w-full bg-white/5 rounded" />
          </div>
          <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
            <div className="h-6 w-32 bg-white/5 rounded mb-6" />
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Overview</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back, here's what's happening.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-200 text-black rounded-xl transition-colors font-medium shadow-lg shadow-white/5">
          <Plus size={18} />
          New Tunnel
        </button>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OverviewCard
          title="Total Requests"
          value={formatNumber(stats?.totalRequests || 0)}
          change={stats?.requestsChange}
          icon={<Activity size={20} />}
          trend={stats?.requestsChange && stats.requestsChange < 0 ? "down" : "up"}
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
          trend={stats?.dataTransferChange && stats.dataTransferChange < 0 ? "down" : "up"}
          showDash={stats?.totalDataTransfer === 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 bg-white/2 border border-white/5 rounded-2xl p-6 relative">
          {isPlaceholderData && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-10 rounded-2xl flex items-center justify-center transition-all duration-200">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Zap size={18} className="text-accent" />
                Request Activity
              </h3>
              <p className="text-sm text-gray-500">Traffic over time</p>
            </div>
            <div className="flex bg-white/5 rounded-lg p-1">
              {["1h", "24h", "7d", "30d"].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    timeRange === range
                      ? "bg-white/10 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          
          {!stats?.chartData || stats.chartData.length === 0 ? (
            <div className="h-75 flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-xl border border-white/5 border-dashed">
              <Activity size={32} className="mb-2 opacity-50" />
              <p>No traffic data available yet</p>
            </div>
          ) : (
            <div className="h-75 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.chartData.map((d) => {
                    const date = new Date(d.hour);
                    let timeLabel = "";
                    if (timeRange === "1h") {
                      timeLabel = date.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                    } else if (timeRange === "24h") {
                      timeLabel = date.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        hour12: true,
                      });
                    } else {
                      timeLabel = date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }
                    return {
                      time: timeLabel,
                      requests: d.requests,
                    };
                  })}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFA62B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FFA62B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#666"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#666"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0A0A0A",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                    itemStyle={{ color: "#fff" }}
                    labelStyle={{ color: "#9ca3af", marginBottom: "0.25rem" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stroke="#FFA62B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRequests)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>


        <div className="bg-white/2 border border-white/5 rounded-2xl p-6 flex flex-col">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Server size={18} className="text-blue-400" />
            Active Tunnels
          </h3>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 -mr-2 custom-scrollbar">
            {activeTunnels.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-8">
                <Network size={32} className="mb-3 opacity-50" />
                <p className="text-sm">No active tunnels</p>
                <Link 
                  to="/dash/tunnels" 
                  className="mt-2 text-xs text-accent hover:underline"
                >
                  Start your first tunnel
                </Link>
              </div>
            ) : (
              activeTunnels.slice(0, 5).map((tunnel) => (
                <Link
                  key={tunnel.id}
                  to="/dash/tunnels/$tunnelId"
                  params={{ tunnelId: tunnel.id }}
                  className="block p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${tunnel.isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                      <span className="text-sm font-medium text-white truncate max-w-30">
                        {tunnel.name || tunnel.id}
                      </span>
                    </div>
                    <ChevronRight size={14} className="text-gray-500 group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-mono truncate max-w-35">{tunnel.url}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(tunnel.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
          
          {activeTunnels.length > 0 && (
            <Link 
              to="/dash/tunnels"
              className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-colors py-2 border-t border-white/5"
            >
              View all tunnels
              <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewCard({
  title,
  value,
  change,
  icon,
  trend = "neutral",
  subValue,
  showDash,
}: {
  title: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  subValue?: string;
  showDash?: boolean;
}) {
  const isPositive = trend === "up";
  const changeColor = trend === "neutral" 
    ? "text-gray-400 bg-white/5 border-white/10"
    : isPositive
      ? "text-green-400 bg-green-500/10 border-green-500/20"
      : "text-red-400 bg-red-500/10 border-red-500/20";

  return (
    <div className="group bg-white/2 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all relative overflow-hidden">
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-300 border border-white/5 group-hover:border-accent/20 group-hover:text-accent transition-colors">
          {icon}
        </div>
        {(change !== undefined || trend !== "neutral") && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium ${changeColor}`}>
            {trend === "up" ? <ArrowUpRight size={12} /> : trend === "down" ? <ArrowDownRight size={12} /> : null}
            {showDash ? "-" : (change ? `${change > 0 ? "+" : ""}${change}%` : "—")}
          </div>
        )}
      </div>
      
      <div className="relative z-10">
        <div className="text-3xl font-bold text-white mb-1 tracking-tight">{value}</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">
            {title}
          </div>
          {subValue && (
            <>
              <span className="text-gray-700">•</span>
              <span className="text-xs text-gray-500">{subValue}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
