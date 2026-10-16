import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  AreaChart, Area, BarChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart,
} from "recharts";
import { Button } from "@/components/arc/button/button";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { appClient } from "@/lib/app-client";
import { ChartsSkeleton } from "@/components/admin/admin-skeleton";

export const Route = createFileRoute("/admin/charts")({
  head: () => ({
    meta: [
      { title: "Admin Charts - OutRay" },
    ],
  }),
  component: AdminChartsPage,
});

interface ChartDataItem {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

const COLORS = {
  primary: "#8367c7",
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
  backgroundColor: "#161616",
  fontSize: 12,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  boxShadow: "0 8px 24px rgb(0 0 0 / .3)",
  color: "#fff",
};

function ChartFrame({ children, hasData, compact = false }: { children: ReactNode; hasData: boolean; compact?: boolean }) {
  return <div className={compact ? "h-44" : "h-60"}>{hasData ? children : <div className="flex h-full items-center justify-center rounded-lg bg-white/[.015] text-[12px] text-zinc-600">No data available yet.</div>}</div>;
}

function AdminChartsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "charts"],
    queryFn: async () => {
      const res = await appClient.admin.charts();
      if ("error" in res) throw new Error(res.error);
      return res;
    },
  });

  if (isLoading) return <ChartsSkeleton />;
  if (error || !data) return <div className="mx-auto max-w-[1440px] space-y-5"><WorkspacePageHeader appearance="compact" title="Analytics" description="Growth, usage, and subscription activity across OutRay." /><WorkspaceNotice message={error?.message || "Analytics could not be loaded."} action={<Button size="sm" variant="ghost" onClick={() => void refetch()} loading={isFetching}>Try again</Button>} /></div>;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatHour = (hourStr: string) => {
    const date = new Date(hourStr);
    return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
  };

  const verificationData: ChartDataItem[] = data.verificationStatus.map((v) => ({
    name: v.verified ? "Verified" : "Unverified",
    value: v.count,
    color: v.verified ? COLORS.quaternary : COLORS.danger,
  }));

  const subStatusData: ChartDataItem[] = data.subStatus.map((s) => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: s.count,
    color: s.status === "active" ? COLORS.quaternary : s.status === "cancelled" ? COLORS.danger : COLORS.gray,
  }));

  const protocolData: ChartDataItem[] = data.protocolDist.map((p) => ({
    name: p.protocol.toUpperCase(),
    value: p.count,
    color: PROTOCOL_COLORS[p.protocol] || COLORS.gray,
  }));

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <WorkspacePageHeader appearance="compact" title="Analytics" description="Growth, usage, and subscription activity across OutRay." action={<Button size="sm" variant="ghost" onClick={() => void refetch()} loading={isFetching}>Refresh</Button>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        {/* User growth */}
        <div className="lg:col-span-6 min-w-0 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">User growth</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">Cumulative registered users</p>
          <ChartFrame hasData={data.cumulativeGrowth.length > 0}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.cumulativeGrowth}>
                <defs>
                  <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.14} />
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => formatDate(label)} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#9ca3af" }} />
                <Area type="monotone" dataKey="total" stroke={COLORS.primary} strokeWidth={2} fill="url(#colorGrowth)" name="Total Users" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        {/* Daily Signups */}
        <div className="min-w-0 lg:col-span-3 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">New users</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">Daily signups · Last 30 days</p>
          <ChartFrame hasData={data.userSignups.length > 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.userSignups}>
                <CartesianGrid strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => formatDate(label)} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#9ca3af" }} />
                <Bar dataKey="count" fill={COLORS.secondary} radius={[4, 4, 0, 0]} name="Signups" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        {/* New organizations */}
        <div className="min-w-0 lg:col-span-3 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">New organizations</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">Daily workspaces · Last 30 days</p>
          <ChartFrame hasData={data.orgGrowth.length > 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.orgGrowth}>
                <CartesianGrid strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => formatDate(label)} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#9ca3af" }} />
                <Bar dataKey="count" fill={COLORS.tertiary} radius={[4, 4, 0, 0]} name="Organizations" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        {/* Weekly Tunnel Trend */}
        <div className="min-w-0 lg:col-span-3 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">Tunnel activity</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">Average and peak connections · Last 7 days</p>
          <ChartFrame hasData={data.weeklyTunnelTrend.length > 0}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.weeklyTunnelTrend}>
                <CartesianGrid strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" tickFormatter={formatDate} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => formatDate(label)} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#9ca3af" }} />
                <Legend wrapperStyle={{ color: "#71717a", fontSize: 11, paddingTop: 12 }} iconType="circle" iconSize={6} />
                <Bar dataKey="max" fill={COLORS.quaternary} opacity={0.2} radius={[4, 4, 0, 0]} name="Max" />
                <Line type="monotone" dataKey="avg" stroke={COLORS.quaternary} strokeWidth={2} dot={false} name="Average" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        {/* Hourly Activity */}
        <div className="min-w-0 lg:col-span-3 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">Hourly activity</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">Tunnel requests · Last 24 hours</p>
          <ChartFrame hasData={data.hourlyRequests.length > 0}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.hourlyRequests}>
                <defs>
                  <linearGradient id="colorHourly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8367c7" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="#8367c7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={formatHour} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => formatHour(label)} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#9ca3af" }} />
                <Area type="monotone" dataKey="requests" stroke="#8367c7" strokeWidth={2} fill="url(#colorHourly)" name="Activity" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        {/* Protocols */}
        <div className="min-w-0 lg:col-span-2 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">Protocols</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">Tunnels by protocol type</p>
          <ChartFrame hasData={protocolData.some((item) => item.value > 0)} compact>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={protocolData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {protocolData.map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
            {protocolData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-[11px]">
                <div className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-zinc-500">{item.name}</span>
                <span className="font-normal tabular-nums text-zinc-200">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* User Verification */}
        <div className="min-w-0 lg:col-span-2 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">Email verification</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">User verification status</p>
          <ChartFrame hasData={verificationData.some((item) => item.value > 0)} compact>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={verificationData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {verificationData.map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
            {verificationData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-[11px]">
                <div className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-zinc-500">{item.name}</span>
                <span className="font-normal tabular-nums text-zinc-200">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Subscriptions */}
        <div className="min-w-0 lg:col-span-2 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">Subscriptions</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">Active vs cancelled subscriptions</p>
          <ChartFrame hasData={subStatusData.some((item) => item.value > 0)} compact>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={subStatusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {subStatusData.map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
            {subStatusData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-[11px]">
                <div className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-zinc-500">{item.name}</span>
                <span className="font-normal tabular-nums text-zinc-200">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Organizations */}
        <div className="lg:col-span-6 min-w-0 rounded-xl border border-white/[.08] bg-[#101010] p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-normal text-zinc-200">Top organizations</h3>
          </div>
          <p className="mt-1 mb-5 text-[12px] text-zinc-500">Ranked by tunnel count</p>
          <ChartFrame hasData={data.topOrgsByTunnels.length > 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topOrgsByTunnels} layout="vertical">
                <CartesianGrid strokeDasharray="3 5" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="orgName" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} width={150} tick={{ fill: "#9ca3af" }} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#9ca3af" }} />
                <Bar dataKey="tunnelCount" fill={COLORS.tertiary} radius={[0, 4, 4, 0]} name="Tunnels" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </div>
    </div>
  );
}
