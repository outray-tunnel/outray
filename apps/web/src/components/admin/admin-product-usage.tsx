import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HugeiconsIcon } from "@hugeicons/react";
import Cone01Icon from "@outray/icons/stroke/Cone01Icon";
import Pulse02Icon from "@outray/icons/stroke/Pulse02Icon";
import LockPasswordIcon from "@outray/icons/stroke/LockPasswordIcon";
import HeartPulseIcon from "@outray/icons/stroke/HeartPulseIcon";
import AiChat02Icon from "@outray/icons/stroke/AiChat02Icon";
import ArrowUpRight01Icon from "@outray/icons/stroke/ArrowUpRight01Icon";
import RefreshIcon from "@outray/icons/stroke/RefreshIcon";
import Search01Icon from "@outray/icons/stroke/Search01Icon";
import Building03Icon from "@outray/icons/stroke/Building03Icon";
import ChartLineData01Icon from "@outray/icons/stroke/ChartLineData01Icon";
import { appClient } from "@/lib/app-client";
import { adminProductPaths } from "@/lib/admin-products";
import { adminProducts, formatAdminUsage, type AdminProduct, type AdminProductUsage, type AdminUsageParams, type AdminUsageRange, type AdminUsageResponse, type AdminWorkspaceUsage } from "@/lib/admin-usage";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/arc/button/button";
import { AdminDataTable, type Column } from "./admin-data-table";

const productStyle = {
  tunnels: { name: "Tunnels", icon: Cone01Icon, color: "#b49ade", className: "text-violet-300" },
  observability: { name: "Observability", icon: Pulse02Icon, color: "#7eb5f3", className: "text-blue-300" },
  secrets: { name: "Secrets", icon: LockPasswordIcon, color: "#dfbc7a", className: "text-amber-300" },
  uptime: { name: "Uptime", icon: HeartPulseIcon, color: "#76ceb0", className: "text-emerald-300" },
  agent: { name: "Agent", icon: AiChat02Icon, color: "#dfa1cb", className: "text-pink-300" },
} as const;
const ranges = [{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }] as const;
const panelClass = "min-w-0 rounded-xl border border-white/[.08] bg-[#101010]";
const chartTooltipStyle = { background: "#18181b", border: "1px solid #ffffff14", borderRadius: 10, padding: "10px 12px", fontSize: 12 };
const tickStyle = { fill: "#71717a", fontSize: 10 };
type ProductFilter = AdminProduct | "all";
type ActivityMetric = "secretOperations" | "uptimeChecks" | "agentRuns" | "agentTokens" | "tunnelsCreated";
const activityMetrics: Record<ActivityMetric, { label: string; unit: string; color: string }> = {
  secretOperations: { label: "Secrets operations", unit: "operations", color: productStyle.secrets.color },
  uptimeChecks: { label: "Uptime checks", unit: "checks", color: productStyle.uptime.color },
  agentRuns: { label: "Agent runs", unit: "runs", color: productStyle.agent.color },
  agentTokens: { label: "Agent tokens", unit: "tokens", color: productStyle.agent.color },
  tunnelsCreated: { label: "Tunnels created", unit: "new tunnels", color: productStyle.tunnels.color },
};

function useAdminUsage(params: AdminUsageParams = {}) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["admin", "usage", params.range ?? "30d", params.page ?? 1, params.search ?? "", params.product ?? "all", params.organizationId ?? "platform"],
    queryFn: async () => {
      const result = await appClient.admin.usage(params);
      if ("error" in result) {
        if (result.error === "Unauthorized" || result.error === "Forbidden") void queryClient.invalidateQueries({ queryKey: ["admin-access"] });
        throw new Error(result.error);
      }
      return result;
    },
    retry: false,
    staleTime: 60_000,
    placeholderData: (previousData, previousQuery) => previousQuery?.queryKey[6] === (params.organizationId ?? "platform") ? previousData : undefined,
  });
}

function UsageSkeleton({ compact = false }: { compact?: boolean }) {
  return <div role="status" aria-label="Loading product usage" className={`${panelClass} p-5`}>
    <div className="h-3.5 w-28 rounded bg-white/[.055] motion-safe:animate-pulse" />
    <div className={`mt-6 grid gap-4 ${compact ? "grid-cols-2 sm:grid-cols-5" : "sm:grid-cols-3 lg:grid-cols-5"}`}>{adminProducts.map((product) => <div key={product} aria-hidden="true" className="space-y-4"><div className="h-5 w-20 rounded bg-white/[.04] motion-safe:animate-pulse" /><div className={`${compact ? "h-1" : "h-24"} rounded bg-white/[.035] motion-safe:animate-pulse`} /></div>)}</div>
  </div>;
}

function ProductIcon({ product, size = 16 }: { product: AdminProduct; size?: number }) {
  return <HugeiconsIcon icon={productStyle[product].icon} size={size} className={productStyle[product].className} aria-hidden="true" />;
}

function UsageLink() {
  return <Link to="/admin/usage" className="inline-flex shrink-0 items-center gap-1.5 rounded text-[11px] text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Explore usage<HugeiconsIcon icon={ArrowUpRight01Icon} size={13} aria-hidden="true" /></Link>;
}

function MetricWindow({ window, range }: { window: "current" | "range" | "month"; range: AdminUsageRange }) {
  return <span className="shrink-0 text-[9px] text-zinc-600">{window === "current" ? "now" : window === "month" ? "this month" : `last ${range.slice(0, -1)} days`}</span>;
}

export function AdminProductAdoptionSummary() {
  const query = useAdminUsage();
  if (query.isPending) return <UsageSkeleton compact />;
  if (!query.data) return <WorkspaceNotice message="Product adoption could not be loaded." action={<Button type="button" variant="ghost" size="sm" onClick={() => void query.refetch()}>Try again</Button>} />;
  const { products, summary } = query.data;
  return <section className={`${panelClass} p-5`} aria-labelledby="admin-adoption-summary">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="admin-adoption-summary" className="text-[13px] font-medium text-zinc-200">Product adoption</h2><p className="mt-1 text-[11px] text-zinc-500">{formatAdminUsage(summary.adoptedOrganizations)} workspaces have adopted a product · {formatAdminUsage(summary.multiProductOrganizations)} use more than one</p></div><UsageLink /></header>
    <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-5">{products.map((product) => {
      const percent = summary.organizations ? product.configuredOrganizations / summary.organizations * 100 : 0;
      return <Link key={product.id} to={adminProductPaths[product.id]} className="group -m-2 rounded-lg p-2 transition-colors hover:bg-white/[.035] focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Explore ${product.name}`}><div className="flex items-center gap-2"><ProductIcon product={product.id} size={14} /><span className="text-[11px] text-zinc-400 group-hover:text-zinc-100">{product.name}</span><HugeiconsIcon icon={ArrowUpRight01Icon} size={12} className="ml-auto text-zinc-600 group-hover:text-zinc-300" aria-hidden="true" /></div><div className="mt-2.5 flex items-baseline justify-between gap-2"><span className="text-xl tracking-[-.04em] text-zinc-200 tabular-nums">{formatAdminUsage(product.configuredOrganizations)}</span><span className="text-[10px] text-zinc-600 tabular-nums">{Math.round(percent)}%</span></div><div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[.045]" aria-label={`${product.name}: ${product.configuredOrganizations} configured workspaces, ${Math.round(percent)} percent`}><div className="h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: productStyle[product.id].color }} /></div></Link>;
    })}</div>
  </section>;
}

function ProductCard({ product, range, compact = false }: { product: AdminProductUsage; range: AdminUsageRange; compact?: boolean }) {
  return <section className={`${panelClass} p-4`} aria-label={`${product.name} usage`}>
    <header><Link to={adminProductPaths[product.id]} className="group flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-accent"><span className="grid size-8 place-items-center rounded-lg bg-white/[.035]"><ProductIcon product={product.id} /></span><h3 className="text-[12px] font-medium text-zinc-200 group-hover:text-white">{product.name}</h3><HugeiconsIcon icon={ArrowUpRight01Icon} size={13} className="ml-auto text-zinc-600 group-hover:text-zinc-300" aria-hidden="true" /></Link></header>
    {compact ? <p className="mt-5 text-[15px] tracking-tight text-zinc-200" title={product.adoptionDefinition}>{product.configuredOrganizations > 0 ? "Configured" : "Not configured"}</p> : <div className="mt-5 flex items-baseline gap-2"><span className="text-[25px] leading-none tracking-[-.05em] text-zinc-100 tabular-nums">{formatAdminUsage(product.configuredOrganizations)}</span><span title={product.adoptionDefinition} className="text-[10px] text-zinc-500">configured workspaces</span></div>}
    <p className="mt-2 text-[10px] text-zinc-500" title={product.activityDefinition}>{product.activeOrganizations === null ? "Activity unavailable" : `${formatAdminUsage(product.activeOrganizations)} active ${product.activityWindow === "month" ? "this month" : `in ${range.slice(0, -1)} days`}`}</p>
    <dl className="mt-5 space-y-3">{product.metrics.map((metric) => <div key={metric.key}><div className="flex items-baseline justify-between gap-2"><dt className="min-w-0 text-[10px] leading-4 text-zinc-500">{metric.label}</dt><dd className="shrink-0 text-[12px] text-zinc-300 tabular-nums">{formatAdminUsage(metric.value, metric.format)}</dd></div><div className="mt-0.5 text-right"><MetricWindow window={metric.window} range={range} /></div></div>)}</dl>
  </section>;
}

function AdoptionChart({ data }: { data: AdminUsageResponse }) {
  return <section className={`${panelClass} p-5`} aria-labelledby="admin-adoption-chart">
    <header><h2 id="admin-adoption-chart" className="text-[13px] font-medium text-zinc-200">Product adoption</h2><p className="mt-1 text-[11px] text-zinc-500">Configured workspaces, compared with recent activity</p></header>
    <div className="mt-6 flex flex-wrap items-center gap-4 text-[10px] text-zinc-500"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-zinc-400" />Configured</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400" />Active</span><span className="ml-auto tabular-nums">{formatAdminUsage(data.summary.organizations)} workspaces</span></div>
    <ul className="mt-6 space-y-5">{data.products.map((product) => {
      const configuredPercent = data.summary.organizations ? product.configuredOrganizations / data.summary.organizations * 100 : 0;
      const activePercent = product.activeOrganizations === null ? null : data.summary.organizations ? product.activeOrganizations / data.summary.organizations * 100 : 0;
      return <li key={product.id}><div className="mb-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[11px] text-zinc-400"><ProductIcon product={product.id} size={14} />{product.name}</span><span className="flex items-center gap-2 text-[11px] tabular-nums"><span className="text-zinc-300" title={product.adoptionDefinition}>{formatAdminUsage(product.configuredOrganizations)}</span><span className="text-zinc-700" aria-hidden="true">/</span><span className={product.activeOrganizations === null ? "text-zinc-600" : "text-emerald-300"} title={product.activityDefinition}>{formatAdminUsage(product.activeOrganizations)}</span></span></div><div className="space-y-1" aria-label={`${product.name}: ${product.configuredOrganizations} configured; ${product.activeOrganizations === null ? "activity unavailable" : `${product.activeOrganizations} active`}`}><div className="h-1 overflow-hidden rounded-full bg-white/[.045]"><div className="h-full rounded-full bg-zinc-500/60" style={{ width: `${Math.min(configuredPercent, 100)}%` }} /></div>{activePercent !== null ? <div className="h-1 overflow-hidden rounded-full bg-white/[.045]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(activePercent, 100)}%` }} /></div> : null}</div></li>;
    })}</ul>
    <p className="mt-6 text-[10px] leading-4 text-zinc-600">Active: last {data.period.range.slice(0, -1)} days, except Observability’s current-month ingest.</p>
  </section>;
}

function compactNumber(value: number) {
  return value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

function ActivityChart({ data }: { data: AdminUsageResponse }) {
  const reducedMotion = useReducedMotion();
  const [metric, setMetric] = useState<ActivityMetric>("secretOperations");
  const selected = activityMetrics[metric];
  const total = data.daily.reduce((sum, day) => sum + day[metric], 0);
  return <section className={`${panelClass} p-5`} aria-labelledby="admin-product-activity">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="admin-product-activity" className="text-[13px] font-medium text-zinc-200">Activity over time</h2><p className="mt-1 text-[11px] text-zinc-500">Daily totals · UTC</p></div><Select ariaLabel="Activity metric" value={metric} onChange={(value) => setMetric(value as ActivityMetric)} options={Object.entries(activityMetrics).map(([value, item]) => ({ value, label: item.label }))} className="w-44" triggerClassName="min-h-8! h-8! px-2.5! text-[11px]!" /></header>
    <div className="mt-5 flex items-baseline gap-2"><span className="text-[28px] leading-none tracking-[-.055em] text-zinc-100 tabular-nums">{formatAdminUsage(total)}</span><span className="text-[11px] text-zinc-500">{selected.unit} in {data.period.range.slice(0, -1)} days</span></div>
    {total === 0 ? <div className="flex h-[225px] items-center justify-center text-[12px] text-zinc-600">No {selected.unit} recorded in this period.</div> : <div className="mt-4 h-[210px] min-w-0" role="img" aria-label={`${selected.label}: ${formatAdminUsage(total)} over ${data.period.range.slice(0, -1)} days`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.daily} margin={{ top: 12, right: 8, left: -14, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.045)" strokeDasharray="3 5" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={tickStyle} minTickGap={42} tickMargin={12} tickFormatter={(value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} /><YAxis axisLine={false} tickLine={false} tick={tickStyle} allowDecimals={false} tickFormatter={compactNumber} /><Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#a1a1aa", fontSize: 11, marginBottom: 5 }} itemStyle={{ color: "#e4e4e7" }} labelFormatter={(value) => String(value).slice(0, 10)} formatter={(value) => [formatAdminUsage(Number(value)), selected.label]} /><Area key={metric} dataKey={metric} type="monotone" stroke={selected.color} strokeWidth={2} fill={selected.color} fillOpacity={.07} isAnimationActive={!reducedMotion} animationDuration={350} activeDot={{ r: 4, stroke: "#101010", strokeWidth: 3 }} /></AreaChart></ResponsiveContainer></div>}
  </section>;
}

function TelemetryChart({ data }: { data: AdminUsageResponse }) {
  const reducedMotion = useReducedMotion();
  const latest = data.telemetryMonthly.at(-1);
  const hasData = data.telemetryMonthly.some((month) => month.bytes > 0);
  return <section className={`${panelClass} p-5`} aria-labelledby="admin-telemetry-history"><header className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="admin-telemetry-history" className="text-[13px] font-medium text-zinc-200">Telemetry ingest</h2><p className="mt-1 text-[11px] text-zinc-500">Monthly recorded usage · trailing six months</p></div><span className="text-[11px] text-zinc-500">{formatAdminUsage(latest?.bytes ?? null, "bytes")} this month</span></header>
    {!hasData ? <div className="flex h-[180px] items-center justify-center text-[12px] text-zinc-600">No telemetry usage recorded yet.</div> : <div className="mt-5 h-[175px] min-w-0" role="img" aria-label={`Monthly telemetry ingest, current month ${formatAdminUsage(latest?.bytes ?? null, "bytes")}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.telemetryMonthly} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.045)" strokeDasharray="3 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={tickStyle} tickMargin={10} tickFormatter={(value: string) => new Date(`${value.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })} /><YAxis axisLine={false} tickLine={false} tick={tickStyle} tickFormatter={(value: number) => formatAdminUsage(value, "bytes")} width={68} /><Tooltip cursor={{ fill: "#ffffff04" }} contentStyle={chartTooltipStyle} labelStyle={{ color: "#a1a1aa", fontSize: 11, marginBottom: 5 }} formatter={(value, name) => [name === "bytes" ? formatAdminUsage(Number(value), "bytes") : formatAdminUsage(Number(value)), name === "bytes" ? "Telemetry ingested" : "Workspaces"]} /><Bar dataKey="bytes" name="bytes" fill={productStyle.observability.color} fillOpacity={.75} radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={!reducedMotion} animationDuration={350} /></BarChart></ResponsiveContainer></div>}
  </section>;
}

function WorkspaceProducts({ products }: { products: AdminProduct[] }) {
  return products.length ? <div className="flex items-center gap-1.5">{products.map((product) => <span key={product} title={productStyle[product].name} className="grid size-6 place-items-center rounded-md bg-white/[.03]"><ProductIcon product={product} size={12} /><span className="sr-only">{productStyle[product].name}</span></span>)}</div> : <span className="text-[11px] text-zinc-600">Not configured</span>;
}

function MetricCell({ primary, detail }: { primary: string; detail?: string }) {
  return <div className="whitespace-nowrap tabular-nums"><div className="text-[12px] text-zinc-300">{primary}</div>{detail ? <div className="mt-1 text-[10px] text-zinc-600">{detail}</div> : null}</div>;
}

function organizationColumns(product: ProductFilter): Column<AdminWorkspaceUsage>[] {
  const base: Column<AdminWorkspaceUsage>[] = [
    { key: "name", header: "Workspace", render: (org) => <Link to="/admin/organizations/$slug" params={{ slug: org.slug }} className="group flex min-w-[170px] items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-accent"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[.035] text-zinc-500"><HugeiconsIcon icon={Building03Icon} size={14} aria-hidden="true" /></span><span><span className="block text-[12px] text-zinc-200 group-hover:text-white">{org.name}</span><span className="mt-0.5 block text-[10px] text-zinc-600">/{org.slug}</span></span></Link> },
    { key: "plan", header: "Plan", render: (org) => <span className="rounded-md border border-white/[.07] bg-white/[.025] px-2 py-0.5 text-[10px] capitalize text-zinc-400">{org.plan}</span> },
    { key: "products", header: "Products", render: (org) => <WorkspaceProducts products={org.products} /> },
  ];
  if (product === "all" || product === "observability") base.push({ key: "telemetryBytesMonth", header: "Telemetry · month", render: (org) => <MetricCell primary={formatAdminUsage(org.telemetryBytesMonth, "bytes")} detail={product === "observability" ? `${formatAdminUsage(org.alerts)} alerts` : undefined} /> });
  if (product === "all" || product === "tunnels") base.push({ key: "tunnels", header: "Tunnels · now", render: (org) => <MetricCell primary={formatAdminUsage(org.tunnels)} /> });
  if (product === "all" || product === "secrets") base.push({ key: "secretOperations", header: "Secrets operations", render: (org) => <MetricCell primary={formatAdminUsage(org.secretOperations)} detail={product === "secrets" ? `${formatAdminUsage(org.vaults)} vaults · ${formatAdminUsage(org.secrets)} secrets` : undefined} /> });
  if (product === "all" || product === "uptime") base.push({ key: "uptimeChecks", header: "Uptime checks", render: (org) => <MetricCell primary={formatAdminUsage(org.uptimeChecks)} detail={product === "uptime" ? `${formatAdminUsage(org.monitors)} monitors · ${formatAdminUsage(org.publishedStatusPages)} published pages` : undefined} /> });
  if (product === "all" || product === "agent") base.push({ key: "agentTokens", header: "Agent tokens", render: (org) => <MetricCell primary={formatAdminUsage(org.agentTokens)} detail={`${formatAdminUsage(org.agentRuns)} runs`} /> });
  return base;
}

export function AdminProductUsagePage() {
  const [range, setRange] = useState<AdminUsageRange>("30d");
  const [product, setProduct] = useState<ProductFilter>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const query = useAdminUsage({ range, page, search, product: product === "all" ? undefined : product });
  const data = query.data;
  const changeRange = (next: AdminUsageRange) => { setRange(next); setPage(1); };
  const changeProduct = (next: ProductFilter) => { setProduct(next); setPage(1); };

  return <div className="mx-auto w-full max-w-[1440px] space-y-5" aria-busy={query.isFetching || undefined}>
    <WorkspacePageHeader appearance="compact" title="Product usage" description="What workspaces adopt, what they use, and how that changes over time." action={<div className="flex flex-wrap items-center gap-2"><SegmentedControl label="Usage period" value={range} options={ranges} onValueChange={changeRange} /><Button type="button" variant="ghost" size="sm" loading={query.isFetching} aria-label="Refresh product usage" onClick={() => void query.refetch()}><HugeiconsIcon icon={RefreshIcon} size={15} aria-hidden="true" /></Button></div>} />
    {query.isError ? <WorkspaceNotice message="Could not load product usage." action={<Button type="button" variant="ghost" size="sm" onClick={() => void query.refetch()}>Try again</Button>} /> : null}
    {!data ? query.isPending ? <><UsageSkeleton /><div className="grid gap-4 lg:grid-cols-2"><UsageSkeleton /><UsageSkeleton /></div></> : <section className={`${panelClass} flex min-h-52 flex-col items-center justify-center gap-3 p-5`}><HugeiconsIcon icon={ChartLineData01Icon} size={22} className="text-zinc-600" aria-hidden="true" /><p className="text-[12px] text-zinc-500">Usage is unavailable. No metrics have been substituted.</p></section> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        { label: "Workspaces", value: data.summary.organizations, detail: `${formatAdminUsage(data.summary.users)} users across the platform` },
        { label: "Product adoption", value: data.summary.adoptedOrganizations, detail: data.summary.organizations ? `${Math.round(data.summary.adoptedOrganizations / data.summary.organizations * 100)}% have configured a product` : "No workspaces yet" },
        { label: "Multi-product workspaces", value: data.summary.multiProductOrganizations, detail: "Using two or more products" },
        { label: "Product configurations", value: data.summary.productConfigurations, detail: "Workspace–product combinations" },
      ].map((stat) => <div key={stat.label} className={`${panelClass} p-4`}><p className="text-[11px] text-zinc-500">{stat.label}</p><p className="mt-3 text-[27px] leading-none tracking-[-.055em] text-zinc-100 tabular-nums">{formatAdminUsage(stat.value)}</p><p className="mt-3 text-[10px] leading-4 text-zinc-600">{stat.detail}</p></div>)}</div>
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,1.8fr)]"><AdoptionChart data={data} /><ActivityChart data={data} /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">{data.products.map((item) => <ProductCard key={item.id} product={item} range={data.period.range} />)}</div>
      <TelemetryChart data={data} />
      <section aria-labelledby="admin-usage-workspaces" className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="admin-usage-workspaces" className="text-[14px] font-medium text-zinc-200">Usage by workspace</h2><p className="mt-1 text-[11px] text-zinc-500">{formatAdminUsage(data.pagination.total)} matching workspaces · activity in the last {data.period.range.slice(0, -1)} days unless marked otherwise{query.isFetching ? <span role="status" className="ml-2 text-zinc-400">Updating…</span> : null}</p></div><form className="flex w-full max-w-[340px] items-center gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}><div className="relative min-w-0 flex-1"><HugeiconsIcon icon={Search01Icon} size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" aria-hidden="true" /><WorkspaceInput size="compact" aria-label="Search workspaces by name or slug" placeholder="Search workspaces…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="[--workspace-input-padding-left:34px]" /></div><Button type="submit" variant="secondary" size="sm">Search</Button></form></header>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter workspace usage by product">{(["all", ...adminProducts] as const).map((item) => <button key={item} type="button" onClick={() => changeProduct(item)} aria-pressed={product === item} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${product === item ? "bg-white/[.09] text-zinc-100" : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-200"}`}>{item === "all" ? null : <ProductIcon product={item} size={13} />}{item === "all" ? "All products" : productStyle[item].name}</button>)}{search ? <Button type="button" variant="ghost" size="sm" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>Clear “{search}”</Button> : null}</div>
        <AdminDataTable columns={organizationColumns(product)} data={data.organizations} page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} isLoading={query.isFetching} emptyMessage={search || product !== "all" ? "No workspaces match these filters." : "Workspaces will appear here once they are created."} />
      </section>
      <UsageCoverage data={data} />
    </>}
  </div>;
}

function UsageCoverage({ data }: { data: AdminUsageResponse }) {
  return <details className="rounded-lg px-1 text-[10px] text-zinc-600"><summary className="w-fit cursor-pointer rounded py-1 hover:text-zinc-400 focus-visible:outline-2 focus-visible:outline-accent">How usage is measured · updated {new Date(data.generatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</summary><div className="mt-2 max-w-4xl space-y-2 leading-5"><p>Period: {data.period.from.slice(0, 10)} – {data.period.to.slice(0, 10)} UTC. Current configuration counts are snapshots; activity counts use the selected period. Monthly telemetry uses the calendar month.</p>{data.coverage.map((note) => <p key={note}>{note}</p>)}{data.products.map((item) => <p key={item.id}><span className="text-zinc-500">{item.name}:</span> {item.adoptionDefinition} {item.activityDefinition}</p>)}</div></details>;
}

export function AdminOrganizationProductUsage({ organizationId }: { organizationId: string }) {
  const [range, setRange] = useState<AdminUsageRange>("30d");
  const query = useAdminUsage({ organizationId, range });
  if (query.isPending) return <UsageSkeleton />;
  if (!query.data) return <WorkspaceNotice message="This workspace’s product usage could not be loaded." action={<Button type="button" variant="ghost" size="sm" onClick={() => void query.refetch()}>Try again</Button>} />;
  return <section className="space-y-4" aria-labelledby="admin-org-product-usage" aria-busy={query.isFetching || undefined}><header className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="admin-org-product-usage" className="text-[14px] font-medium text-zinc-200">Products & usage</h2><p className="mt-1 text-[11px] text-zinc-500">Configuration and activity for this workspace{query.isFetching ? <span role="status" className="ml-2 text-zinc-400">Updating…</span> : null}</p></div><SegmentedControl label="Workspace usage period" value={range} options={ranges} onValueChange={setRange} /></header><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{query.data.products.map((item) => <ProductCard key={item.id} product={item} range={query.data.period.range} compact />)}</div><div className="flex justify-end"><UsageLink /></div></section>;
}
