import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HugeiconsIcon } from "@hugeicons/react";
import UserGroupIcon from "@outray/icons/stroke/UserGroupIcon";
import Building03Icon from "@outray/icons/stroke/Building03Icon";
import WalletCardsIcon from "@outray/icons/stroke/WalletCardsIcon";
import Cone01Icon from "@outray/icons/stroke/Cone01Icon";
import RefreshIcon from "@outray/icons/stroke/RefreshIcon";
import ArrowUpRight01Icon from "@outray/icons/stroke/ArrowUpRight01Icon";
import Share08Icon from "@outray/icons/stroke/Share08Icon";
import Analytics01Icon from "@outray/icons/stroke/Analytics01Icon";
import { appClient } from "@/lib/app-client";
import { Button } from "../arc/button/button";
import { WorkspacePageHeader } from "../workspace-page-header";
import { WorkspaceEmptyState, WorkspaceNotice } from "../workspace/workspace-ui";
import { SegmentedControl } from "../ui/segmented-control";
import { AdminStatsCard } from "./admin-stats-card";
import { OverviewSkeleton } from "./admin-skeleton";
import { ShareRevenueModal, preloadRevenueBackgrounds } from "./share-revenue-modal";
import { AdminProductAdoptionSummary } from "./admin-product-usage";

const periods = [{ value: "1h", label: "1h" }, { value: "24h", label: "24h" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }] as const;
type Period = typeof periods[number]["value"];
const planColors: Record<string, string> = { free: "#71717a", ray: "#60a5fa", beam: "#b49ade", pulse: "#fbbf24" };

export function AdminOverview() {
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const [period, setPeriod] = useState<Period>("24h");
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [bgDataUrls, setBgDataUrls] = useState<Record<number, string>>({});
  const overviewQuery = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const result = await appClient.admin.overview();
      if ("error" in result) {
        if (result.error === "Unauthorized" || result.error === "Forbidden") void queryClient.invalidateQueries({ queryKey: ["admin-access"] });
        throw new Error(result.error);
      }
      return result;
    },
    refetchInterval: 60_000,
    retry: false,
  });
  const activityQuery = useQuery({
    queryKey: ["admin", "activity", period],
    queryFn: async () => {
      const result = await appClient.admin.stats(period);
      if ("error" in result) {
        if (result.error === "Unauthorized" || result.error === "Forbidden") void queryClient.invalidateQueries({ queryKey: ["admin-access"] });
        throw new Error(result.error);
      }
      return (result as { time: string; active_tunnels: number }[]).map((row) => ({ ...row, time: Date.parse(row.time.endsWith("Z") ? row.time : `${row.time.replace(" ", "T")}Z`) })).filter((row) => Number.isFinite(row.time));
    },
    refetchInterval: 60_000,
    retry: false,
  });
  const overview = overviewQuery.data;
  const refreshing = overviewQuery.isFetching || activityQuery.isFetching;
  const refresh = () => { void overviewQuery.refetch(); void activityQuery.refetch(); void queryClient.invalidateQueries({ queryKey: ["admin", "usage"] }); };

  async function openRevenueCard() {
    setShowRevenueModal(true);
    if (!Object.keys(bgDataUrls).length) setBgDataUrls(await preloadRevenueBackgrounds());
  }

  if (!overview && overviewQuery.isPending) return <OverviewSkeleton />;

  const formatTime = (value: number) => new Date(value).toLocaleString(undefined, period === "1h" || period === "24h" ? { hour: "numeric", ...(period === "1h" ? { minute: "2-digit" } : {}) } : { month: "short", day: "numeric" });
  const plans = Object.entries(overview?.subscriptions.byPlan ?? {}).map(([name, value]) => ({ name, value, color: planColors[name] || "#a1a1aa" }));
  const totalSubs = plans.reduce((sum, item) => sum + item.value, 0);
  const activity = activityQuery.data ?? [];

  return <div className="mx-auto w-full max-w-[1440px] space-y-5">
    <WorkspacePageHeader appearance="compact" title="Overview" description="A clear view of the people, workspaces, and activity across OutRay." action={<div className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" loading={refreshing} onClick={refresh} aria-label="Refresh overview"><HugeiconsIcon icon={RefreshIcon} size={15} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span></Button>{overview && <Button type="button" variant="secondary" size="md" onClick={() => void openRevenueCard()} aria-haspopup="dialog"><HugeiconsIcon icon={Share08Icon} size={15} aria-hidden="true" />Share revenue</Button>}</div>} />

    {overviewQuery.isError && <WorkspaceNotice message={overview ? "Could not refresh the overview. Showing the last available data." : "Could not load the platform overview."} action={<Button type="button" variant="ghost" size="sm" onClick={() => void overviewQuery.refetch()}>Try again</Button>} />}
    {!overview ? <section className="rounded-xl border border-white/[.08]"><WorkspaceEmptyState icon={<HugeiconsIcon icon={RefreshIcon} size={21} />} title="Overview unavailable" description="Reload the overview to see the latest platform metrics." action={<Button type="button" variant="secondary" size="sm" onClick={refresh}>Try again</Button>} /></section> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatsCard title="Users" value={overview.users.total.toLocaleString()} change={overview.users.growth} subtitle={`${overview.users.newToday.toLocaleString()} joined today`} icon={<HugeiconsIcon icon={UserGroupIcon} size={16} />} />
        <AdminStatsCard title="Organizations" value={overview.organizations.total.toLocaleString()} change={overview.organizations.growth} icon={<HugeiconsIcon icon={Building03Icon} size={16} />} />
        <AdminStatsCard title="Active tunnels" value={overview.tunnels.active.toLocaleString()} subtitle={`${overview.tunnels.total.toLocaleString()} created in total`} icon={<HugeiconsIcon icon={Cone01Icon} size={16} />} />
        <AdminStatsCard title="Monthly revenue" value={overview.subscriptions.mrr.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })} subtitle="Monthly recurring revenue" icon={<HugeiconsIcon icon={WalletCardsIcon} size={16} />} onClick={() => void openRevenueCard()} />
      </div>

      <AdminProductAdoptionSummary />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(290px,1fr)]">
        <section className="min-w-0 rounded-xl border border-white/[.08] bg-[#101010] p-5" aria-label="Tunnel activity">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[13px] font-medium text-zinc-200">Tunnel activity</h2><p className="mt-1 text-[11px] text-zinc-500">Active connections over time</p></div><SegmentedControl label="Tunnel activity period" value={period} options={periods} onValueChange={setPeriod} /></header>
          {activityQuery.isError ? <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-[12px] text-zinc-500"><p>Could not load tunnel activity.</p><Button variant="secondary" size="sm" onClick={() => void activityQuery.refetch()}>Try again</Button></div> : activityQuery.isPending ? <div role="status" aria-label="Loading tunnel activity" className="h-[260px] animate-pulse rounded-lg bg-white/[.025] motion-reduce:animate-none" /> : !activity.length ? <div className="flex min-h-[260px] items-center justify-center text-[12px] text-zinc-500">No tunnel activity in this period.</div> : <div className="h-[260px] min-w-0" role="img" aria-label={`Active tunnel counts over the last ${period}. Peak: ${Math.max(...activity.map((row) => row.active_tunnels)).toLocaleString()}.`}>
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={activity} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.045)" strokeDasharray="3 5" /><XAxis dataKey="time" tickFormatter={formatTime} axisLine={false} tickLine={false} minTickGap={46} tickMargin={12} tick={{ fill: "#71717a", fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tickMargin={10} tick={{ fill: "#71717a", fontSize: 10 }} /><Tooltip cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 4", strokeWidth: 1 }} contentStyle={{ background: "#18181b", border: "1px solid #ffffff14", borderRadius: 10, padding: "10px 12px", fontSize: 12 }} labelStyle={{ color: "#a1a1aa", fontSize: 11, marginBottom: 5 }} itemStyle={{ color: "#e4e4e7" }} labelFormatter={(value) => new Date(Number(value)).toLocaleString()} formatter={(value) => [Number(value).toLocaleString(), "Active tunnels"]} /><Area type="monotone" dataKey="active_tunnels" stroke="#b49ade" strokeWidth={2} fill="#b49ade" fillOpacity={.075} activeDot={{ r: 4, stroke: "#101010", strokeWidth: 3, fill: "#c4b5fd" }} isAnimationActive={!reducedMotion} animationDuration={450} /></AreaChart></ResponsiveContainer>
          </div>}
        </section>

        <section className="min-w-0 rounded-xl border border-white/[.08] bg-[#101010] p-5" aria-labelledby="admin-plan-mix"><h2 id="admin-plan-mix" className="text-[13px] font-medium text-zinc-200">Plans at a glance</h2><p className="mt-1 text-[11px] text-zinc-500">How organizations are using OutRay</p><div className="mt-6 flex items-baseline gap-2"><span className="text-[28px] leading-none tracking-[-.055em] text-zinc-100 tabular-nums">{totalSubs.toLocaleString()}</span><span className="text-[11px] text-zinc-500">organizations</span></div>
          {totalSubs ? <div className="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">{plans.filter((plan) => plan.value > 0).map((plan) => <span key={plan.name} style={{ width: `${plan.value / totalSubs * 100}%`, backgroundColor: plan.color }} />)}</div> : <p className="mt-5 text-[12px] text-zinc-500">No plan data yet.</p>}
          <ul className="mt-6 space-y-4">{plans.map((plan) => <li key={plan.name} className="flex items-center gap-2.5 text-[12px]"><span className="size-1.5 shrink-0 rounded-full" style={{ background: plan.color }} aria-hidden="true" /><span className="flex-1 capitalize text-zinc-400">{plan.name}</span><span className="tabular-nums text-zinc-200">{plan.value.toLocaleString()}</span><span className="w-10 text-right text-[11px] tabular-nums text-zinc-600">{totalSubs ? Math.round(plan.value / totalSubs * 100) : 0}%</span></li>)}</ul>
          <Link to="/admin/subscriptions" className="mt-7 inline-flex items-center gap-1.5 rounded text-[11px] text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">View subscriptions<HugeiconsIcon icon={ArrowUpRight01Icon} size={13} aria-hidden="true" /></Link>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">{[
        { to: "/admin/users", title: "People", detail: "Accounts and access", icon: UserGroupIcon },
        { to: "/admin/organizations", title: "Organizations", detail: "Workspaces across the platform", icon: Building03Icon },
        { to: "/admin/usage", title: "Product insights", detail: "Adoption and activity across products", icon: Analytics01Icon },
      ].map((item) => <Link key={item.to} to={item.to} className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/[.07] px-4 py-4 transition-colors hover:border-white/[.12] hover:bg-white/[.015] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[.035] text-zinc-500"><HugeiconsIcon icon={item.icon} size={16} aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-[12px] text-zinc-300">{item.title}</p><p className="mt-0.5 truncate text-[11px] text-zinc-600">{item.detail}</p></div><HugeiconsIcon icon={ArrowUpRight01Icon} size={14} className="text-zinc-600 transition-colors group-hover:text-zinc-300" aria-hidden="true" /></Link>)}</div>
      <p className="text-[10px] text-zinc-600">Refreshes every minute{overviewQuery.dataUpdatedAt > 0 && <> · Updated {new Date(overviewQuery.dataUpdatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</>}</p>
      <ShareRevenueModal isOpen={showRevenueModal} onClose={() => setShowRevenueModal(false)} currentMrr={overview.subscriptions.mrr} bgDataUrls={bgDataUrls} />
    </>}
  </div>;
}
