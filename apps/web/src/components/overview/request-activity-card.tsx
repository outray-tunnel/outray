import { HugeiconsIcon } from "@hugeicons/react";
import { Activity03Icon } from "@hugeicons-pro/core-stroke-rounded";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = { time: string; requests: number };

export function RequestActivityCard({
  stats,
  timeRange,
  setTimeRange,
  isPlaceholderData,
}: {
  stats?: { chartData?: ChartPoint[] } | null;
  timeRange: string;
  setTimeRange: (range: string) => void;
  isPlaceholderData: boolean;
}) {
  const chartData = stats?.chartData ?? [];

  const transformData = () =>
    chartData.map((d) => {
      const date = new Date(d.time);
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
      return { time: timeLabel, requests: d.requests };
    });

  return (
    <section className="relative border-y border-white/[0.07] py-5 lg:col-span-2">
      {isPlaceholderData && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm transition-all duration-200">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">
            Request activity
          </h3>
          <p className="mt-1 text-[11px] text-zinc-600">Traffic over time</p>
        </div>
        <div className="flex items-center gap-1 border-b border-white/[0.07]">
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

      {!chartData || chartData.length === 0 ? (
        <div className="flex h-75 flex-col items-center justify-center text-zinc-700">
          <HugeiconsIcon
            icon={Activity03Icon}
            size={25}
            strokeWidth={1.5}
            className="mb-3"
            aria-hidden="true"
          />
          <p className="text-xs">No traffic data available yet</p>
        </div>
      ) : (
        <div className="h-75 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={transformData()}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
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
        </div>
      )}
    </section>
  );
}
