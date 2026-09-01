import { HugeiconsIcon } from "@hugeicons/react";
import Activity03Icon from "@hugeicons-pro/core-stroke-rounded/Activity03Icon";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

interface TunnelOverviewProps {
  stats: any;
  chartData: any[];
  timeRange: string;
  setTimeRange: (range: string) => void;
  isPlaceholderData: boolean;
}

export function TunnelOverview({
  stats,
  chartData,
  timeRange,
  setTimeRange,
  isPlaceholderData,
}: TunnelOverviewProps) {
  return (
    <div className="space-y-6">
      <div className="grid overflow-hidden rounded-xl border border-white/[0.07] md:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.07]">
        {[
          {
            label: "Total Requests",
            value: stats?.totalRequests.toLocaleString() || "0",
            change: null,
            trend: "neutral",
          },
          {
            label: "Avg. Duration",
            value: `${Math.round(stats?.avgDuration || 0)}ms`,
            change: null,
            trend: "neutral",
          },
          {
            label: "Bandwidth",
            value: formatBytes(stats?.totalBandwidth || 0),
            change: null,
            trend: "neutral",
          },
          {
            label: "Error Rate",
            value: `${(stats?.errorRate || 0).toFixed(2)}%`,
            change: null,
            trend: stats?.errorRate && stats.errorRate > 0 ? "down" : "neutral",
          },
        ].map((stat, i) => (
          <div key={i} className="px-6 py-6">
            <div className="mb-2 text-[11px] text-zinc-600">{stat.label}</div>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-medium tracking-[-0.04em] text-zinc-200">
                {stat.value}
              </div>
              {stat.change && (
                <div
                  className={`text-xs font-medium px-2 py-1 rounded-lg ${
                    stat.trend === "up"
                      ? "bg-green-500/10 text-green-500"
                      : stat.trend === "down"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-gray-500/10 text-gray-400"
                  }`}
                >
                  {stat.change}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <section className="relative overflow-hidden rounded-xl border border-white/[0.07] p-6">
        {isPlaceholderData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm transition-all duration-200">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-medium text-zinc-300">
              Traffic overview
            </h3>
            <p className="mt-1 text-[11px] text-zinc-600">Requests over time</p>
          </div>
          <div className="flex border-b border-white/[0.07]">
            {["1h", "24h", "7d", "30d"].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`border-b px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  timeRange === range
                    ? "border-accent text-zinc-200"
                    : "border-transparent text-zinc-700 hover:text-zinc-400"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className="h-75 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="colorRequests"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#8367c7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8367c7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    if (timeRange === "1h") {
                      return date.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                    } else if (timeRange === "24h") {
                      return date.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        hour12: true,
                      });
                    } else {
                      return date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }
                  }}
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
                    borderRadius: "6px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#9ca3af", marginBottom: "0.25rem" }}
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    });
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="#8367c7"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRequests)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-zinc-700">
              <HugeiconsIcon
                icon={Activity03Icon}
                size={25}
                strokeWidth={1.5}
                className="mb-3"
              />
              <p className="text-xs">No traffic data available yet</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
