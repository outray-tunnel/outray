import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
} from "recharts";
import {
  TrendingUp,
  Users,
  Building2,
  Network,
  Activity,
  Shield,
  Crown,
  Zap,
} from "lucide-react";
import { appClient } from "@/lib/app-client";
import { ChartsSkeleton } from "@/components/admin/admin-skeleton";
import { useAdminStore } from "@/lib/admin-store";

export const Route = createFileRoute("/admin/charts")({
  component: AdminChartsPage,
});

interface ChartDataItem {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

const COLORS = {
  primary: "#FFA62B",
  secondary: "#3B82F6",
  tertiary: "#8B5CF6",
  quaternary: "#10B981",
  danger: "#EF4444",
  gray: "#6B7280",
};

const PROTOCOL_COLORS: Record<string, string> = {
  http: "#3B82F6",
  tcp: "#8B5CF6",
  udp: "#F59E0B",
};

const tooltipStyle = {
  backgroundColor: "#0A0A0A",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px",
  color: "#fff",
};

function AdminChartsPage() {
  const token = useAdminStore((s) => s.token);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "charts"],
    queryFn: async () => {
      const res = await appClient.admin.charts(token!);
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    enabled: !!token,
  });

  if (!token || isLoading || !data) {
    return <ChartsSkeleton />;
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatHour = (hourStr: string) => {
    const date = new Date(hourStr);
    return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
  };

  const verificationData: ChartDataItem[] = data.verificationStatus.map(
    (v) => ({
      name: v.verified ? "Verified" : "Unverified",
      value: v.count,
      color: v.verified ? COLORS.quaternary : COLORS.danger,
    }),
  );

  const subStatusData: ChartDataItem[] = data.subStatus.map((s) => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: s.count,
    color:
      s.status === "active"
        ? COLORS.quaternary
        : s.status === "cancelled"
          ? COLORS.danger
          : COLORS.gray,
  }));

  const protocolData: ChartDataItem[] = data.protocolDist.map((p) => ({
    name: p.protocol.toUpperCase(),
    value: p.count,
    color: PROTOCOL_COLORS[p.protocol] || COLORS.gray,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Analytics Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Deep dive into your platform metrics
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumulative User Growth */}
        <div className="lg:col-span-2 bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={18} className="text-accent" />
            <h3 className="text-lg font-medium text-white">
              Cumulative User Growth
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">Total users over time</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.cumulativeGrowth}>
                <defs>
                  <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={COLORS.primary}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={COLORS.primary}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatDate(label)}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke={COLORS.primary}
                  strokeWidth={2}
                  fill="url(#colorGrowth)"
                  name="Total Users"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Signups */}
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Users size={18} className="text-blue-400" />
            <h3 className="text-lg font-medium text-white">
              Daily User Signups
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            New users per day (30 days)
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.userSignups}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#666"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatDate(label)}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Bar
                  dataKey="count"
                  fill={COLORS.secondary}
                  radius={[4, 4, 0, 0]}
                  name="Signups"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Organization Growth */}
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={18} className="text-purple-400" />
            <h3 className="text-lg font-medium text-white">
              Organization Growth
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            New orgs per day (30 days)
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.orgGrowth}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#666"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatDate(label)}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Bar
                  dataKey="count"
                  fill={COLORS.tertiary}
                  radius={[4, 4, 0, 0]}
                  name="Organizations"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Tunnel Trend */}
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={18} className="text-green-400" />
            <h3 className="text-lg font-medium text-white">
              Weekly Tunnel Activity
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Avg & max active tunnels (7 days)
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.weeklyTunnelTrend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDate}
                  stroke="#666"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatDate(label)}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Legend wrapperStyle={{ color: "#9ca3af" }} />
                <Bar
                  dataKey="max"
                  fill={COLORS.quaternary}
                  opacity={0.3}
                  radius={[4, 4, 0, 0]}
                  name="Max"
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke={COLORS.quaternary}
                  strokeWidth={2}
                  dot={false}
                  name="Average"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Activity */}
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={18} className="text-yellow-400" />
            <h3 className="text-lg font-medium text-white">
              24h Activity Pattern
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">Tunnel activity by hour</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.hourlyRequests}>
                <defs>
                  <linearGradient id="colorHourly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tickFormatter={formatHour}
                  stroke="#666"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatHour(label)}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  fill="url(#colorHourly)"
                  name="Activity"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Protocol Distribution */}
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Network size={18} className="text-blue-400" />
            <h3 className="text-lg font-medium text-white">
              Protocol Distribution
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">Tunnels by protocol type</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={protocolData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {protocolData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {protocolData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-gray-400">{item.name}</span>
                <span className="text-white font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* User Verification */}
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={18} className="text-green-400" />
            <h3 className="text-lg font-medium text-white">
              Email Verification
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">User verification status</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={verificationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {verificationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {verificationData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-gray-400">{item.name}</span>
                <span className="text-white font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription Status */}
        <div className="bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Crown size={18} className="text-yellow-400" />
            <h3 className="text-lg font-medium text-white">
              Subscription Status
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Active vs cancelled subscriptions
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={subStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {subStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {subStatusData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-gray-400">{item.name}</span>
                <span className="text-white font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Organizations */}
        <div className="lg:col-span-2 bg-white/2 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={18} className="text-purple-400" />
            <h3 className="text-lg font-medium text-white">
              Top Organizations by Tunnels
            </h3>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Organizations with most tunnel usage
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topOrgsByTunnels} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="orgName"
                  stroke="#666"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={150}
                  tick={{ fill: "#9ca3af" }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Bar
                  dataKey="tunnelCount"
                  fill={COLORS.tertiary}
                  radius={[0, 4, 4, 0]}
                  name="Tunnels"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
