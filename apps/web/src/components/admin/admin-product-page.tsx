import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HugeiconsIcon } from "@hugeicons/react";
import Cone01Icon from "@outray/icons/stroke/Cone01Icon";
import Pulse02Icon from "@outray/icons/stroke/Pulse02Icon";
import LockPasswordIcon from "@outray/icons/stroke/LockPasswordIcon";
import HeartPulseIcon from "@outray/icons/stroke/HeartPulseIcon";
import AiChat02Icon from "@outray/icons/stroke/AiChat02Icon";
import ArrowUpRight01Icon from "@outray/icons/stroke/ArrowUpRight01Icon";
import RefreshIcon from "@outray/icons/stroke/RefreshIcon";
import Search01Icon from "@outray/icons/stroke/Search01Icon";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import { appClient } from "@/lib/app-client";
import { formatAdminUsage, type AdminProduct } from "@/lib/admin-usage";
import { adminProductPages, type AdminProductBreakdown, type AdminProductColumn, type AdminProductParams, type AdminProductRecord, type AdminProductResponse, type AdminProductValue, type AdminProductValueFormat } from "@/lib/admin-products";
import { Button } from "@/components/arc/button/button";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceEmptyState, WorkspaceNotice } from "@/components/workspace/workspace-ui";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { SideSheet } from "@/components/ui/side-sheet";
import { AdminDataTable, type Column } from "./admin-data-table";

const productStyles = {
  tunnels: { icon: Cone01Icon, color: "#b49ade", className: "text-violet-300" },
  observability: { icon: Pulse02Icon, color: "#7eb5f3", className: "text-blue-300" },
  secrets: { icon: LockPasswordIcon, color: "#dfbc7a", className: "text-amber-300" },
  uptime: { icon: HeartPulseIcon, color: "#76ceb0", className: "text-emerald-300" },
  agent: { icon: AiChat02Icon, color: "#dfa1cb", className: "text-pink-300" },
} as const;
const ranges = [{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }] as const;
const panelClass = "min-w-0 rounded-xl border border-white/[.08] bg-[#101010]";
const toneColors = { neutral: "#a1a1aa", green: "#76ceb0", amber: "#dfbc7a", red: "#fb7185", purple: "#b49ade", blue: "#7eb5f3" };
const tickStyle = { fill: "#71717a", fontSize: 10 };
const tooltipStyle = { background: "#18181b", border: "1px solid #ffffff14", borderRadius: 10, padding: "10px 12px", fontSize: 12 };

function productValue(value: AdminProductValue | undefined, format: AdminProductValueFormat = "text"): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (format === "date") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
  }
  if (format === "duration") {
    const duration = Number(value);
    if (!Number.isFinite(duration)) return "Unavailable";
    if (duration < 1_000) return `${duration.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms`;
    if (duration < 60_000) return `${(duration / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} s`;
    const seconds = Math.round(duration / 1_000);
    return `${Math.floor(seconds / 60).toLocaleString()}m ${seconds % 60}s`;
  }
  if (format === "number" || format === "bytes" || format === "percent") return formatAdminUsage(Number(value), format);
  return String(value);
}

function StatusValue({ value }: { value: AdminProductValue | undefined }) {
  if (value === null || value === undefined || value === "") return <span className="text-zinc-600">—</span>;
  const status = String(value).toLowerCase();
  const positive = ["active", "enabled", "healthy", "up", "resolved", "published", "complete", "completed", "succeeded", "success", "verified", "connected", "ok"].includes(status);
  const negative = ["down", "firing", "failed", "failure", "denied", "error", "errored", "expired", "revoked", "unhealthy", "overdue"].includes(status);
  const pending = ["pending", "degraded", "running", "queued", "investigating", "identified", "monitoring", "past_due"].includes(status);
  return <span className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] ${positive ? "border-emerald-400/15 bg-emerald-400/[.04] text-emerald-300" : negative ? "border-rose-400/15 bg-rose-400/[.04] text-rose-300" : pending ? "border-amber-400/15 bg-amber-400/[.04] text-amber-300" : "border-white/[.07] bg-white/[.025] text-zinc-400"}`}><span className="size-1 rounded-full bg-current" aria-hidden="true" />{String(value).replaceAll("_", " ")}</span>;
}

function ProductLoading() {
  return <div role="status" aria-label="Loading product insights" className="space-y-4"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className={`${panelClass} space-y-5 p-5`} aria-hidden="true"><div className="h-3 w-24 rounded bg-white/[.05] motion-safe:animate-pulse" /><div className="h-7 w-16 rounded bg-white/[.04] motion-safe:animate-pulse" /><div className="h-2 w-32 rounded bg-white/[.035] motion-safe:animate-pulse" /></div>)}</div><div className={`${panelClass} h-[300px] bg-white/[.015] motion-safe:animate-pulse`} aria-hidden="true" /><div className={`${panelClass} h-[260px] bg-white/[.015] motion-safe:animate-pulse`} aria-hidden="true" /></div>;
}

function ResourceTableLoading() {
  return <div className={`${panelClass} overflow-hidden`} role="status" aria-label="Loading resource records"><div className="grid grid-cols-4 gap-6 border-b border-white/[.06] px-4 py-3" aria-hidden="true">{[1, 2, 3, 4].map((item) => <div key={item} className="h-2.5 w-16 rounded bg-white/[.035] motion-safe:animate-pulse" />)}</div>{[1, 2, 3, 4, 5].map((row) => <div key={row} className="grid grid-cols-4 gap-6 border-b border-white/[.035] px-4 py-5 last:border-0" aria-hidden="true">{[1, 2, 3, 4].map((column) => <div key={column} className={`h-3 rounded bg-white/[.04] motion-safe:animate-pulse ${column === 1 ? "w-28" : "w-16"}`} />)}</div>)}</div>;
}

function ProductTrend({ data, product }: { data: AdminProductResponse; product: AdminProduct }) {
  const reducedMotion = useReducedMotion();
  const [selectedKey, setSelectedKey] = useState("");
  const selected = data.trend.series.find((series) => series.key === selectedKey) ?? data.trend.series[0];
  const points = data.trend.points.map((point) => ({ date: point.date, amount: selected ? point.values[selected.key] ?? 0 : 0 }));
  const total = points.reduce((sum, point) => sum + point.amount, 0);
  const monthly = data.trend.interval === "month";
  const windowLabel = monthly ? `${points.length} months` : `${data.period.range.slice(0, -1)} days`;
  const dateLabel = (value: string, detailed = false) => {
    const date = new Date(monthly ? `${value.slice(0, 7)}-15T12:00:00Z` : `${value.slice(0, 10)}T12:00:00Z`);
    return date.toLocaleDateString(undefined, monthly ? { month: detailed ? "long" : "short", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", ...(detailed ? { year: "numeric" } : {}), timeZone: "UTC" });
  };
  const color = productStyles[product].color;
  const headingId = useId();
  const seriesOptions = data.trend.series.map((series) => ({ value: series.key, label: series.label }));
  return <section className={`${panelClass} p-5`} aria-labelledby={headingId}><header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id={headingId} className="text-[13px] font-medium text-zinc-200">{data.trend.title}</h2><p className="mt-1 max-w-lg text-[11px] leading-4 text-zinc-500">{data.trend.description}</p></div>{selected && seriesOptions.length > 1 ? <Select value={selected.key} onChange={setSelectedKey} options={seriesOptions} ariaLabel="Chart metric" className="w-44" triggerClassName="h-8! min-h-8! px-2.5! text-[11px]!" /> : null}</header>
    {selected ? <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-[28px] leading-none tracking-[-.055em] text-zinc-100 tabular-nums">{formatAdminUsage(total, selected.format)}</span><span className="text-[11px] text-zinc-500">{selected.label.toLowerCase()} · {windowLabel}</span></div> : null}
    {!selected || !points.length || total === 0 ? <div className="flex h-[205px] items-center justify-center text-[12px] text-zinc-600">No {selected?.label.toLowerCase() ?? "activity"} recorded in this period.</div> : <div className="mt-5 h-[205px] min-w-0" role="img" aria-label={`${selected.label}: ${formatAdminUsage(total, selected.format)} recorded across ${windowLabel}`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{ top: 10, right: 8, left: selected.format === "bytes" ? 2 : -14, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.045)" strokeDasharray="3 5" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={tickStyle} minTickGap={42} tickMargin={12} tickFormatter={(value: string) => dateLabel(value)} /><YAxis axisLine={false} tickLine={false} tick={tickStyle} allowDecimals={false} width={selected.format === "bytes" ? 66 : 60} tickFormatter={(value: number) => selected.format === "bytes" ? formatAdminUsage(value, "bytes") : value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })} /><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#a1a1aa", fontSize: 11, marginBottom: 5 }} itemStyle={{ color: "#e4e4e7" }} labelFormatter={(value) => `${dateLabel(String(value), true)} · UTC`} formatter={(value) => [formatAdminUsage(Number(value), selected.format), selected.label]} /><Area key={selected.key} dataKey="amount" type="monotone" stroke={color} strokeWidth={2} fill={color} fillOpacity={.07} activeDot={{ r: 4, stroke: "#101010", strokeWidth: 3 }} isAnimationActive={!reducedMotion} animationDuration={350} /></AreaChart></ResponsiveContainer></div>}
  </section>;
}

function Breakdown({ data }: { data: AdminProductBreakdown }) {
  const headingId = useId();
  const total = data.items.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(0, ...data.items.map((item) => item.value));
  return <section className={`${panelClass} p-5`} aria-labelledby={headingId}><header><h2 id={headingId} className="text-[13px] font-medium text-zinc-200">{data.title}</h2><p className="mt-1 text-[11px] leading-4 text-zinc-500">{data.description}</p></header>
    {data.items.length ? <><div className="mt-5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/[.045]" aria-hidden="true">{data.items.filter((item) => item.value > 0).map((item) => <span key={item.label} style={{ width: `${total ? item.value / total * 100 : 0}%`, backgroundColor: toneColors[item.tone ?? "neutral"] }} />)}</div><ul className="mt-5 space-y-4">{data.items.map((item) => <li key={item.label}><div className="flex items-center gap-2.5"><span className="size-1.5 shrink-0 rounded-full" style={{ background: toneColors[item.tone ?? "neutral"] }} aria-hidden="true" /><span className="min-w-0 flex-1 text-[11px] text-zinc-400">{item.label}</span><span className="shrink-0 text-[12px] text-zinc-200 tabular-nums">{formatAdminUsage(item.value, data.format)}</span>{total ? <span className="w-9 shrink-0 text-right text-[10px] text-zinc-600 tabular-nums">{Math.round(item.value / total * 100)}%</span> : null}</div>{data.items.length <= 3 ? <div className="mt-2 ml-4 h-1 overflow-hidden rounded-full bg-white/[.035]" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${max ? item.value / max * 100 : 0}%`, backgroundColor: toneColors[item.tone ?? "neutral"], opacity: .5 }} /></div> : null}</li>)}</ul></> : <p className="py-9 text-center text-[12px] text-zinc-600">No records yet.</p>}
  </section>;
}

function ResourceSearch({ initialValue, onSubmit }: { initialValue: string; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState(initialValue);
  return <form className="flex w-full max-w-[360px] items-center gap-2" onSubmit={(event) => { event.preventDefault(); onSubmit(value.trim()); }}><div className="relative min-w-0 flex-1"><HugeiconsIcon icon={Search01Icon} size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" aria-hidden="true" /><WorkspaceInput size="compact" aria-label="Search resources or workspaces" placeholder="Search resources or workspaces…" value={value} onChange={(event) => setValue(event.target.value)} className="[--workspace-input-padding-left:34px]" /></div><Button type="submit" variant="secondary" size="sm">Search</Button></form>;
}

function ResourceValue({ row, column }: { row: AdminProductRecord; column: AdminProductColumn }) {
  const value = row.values[column.key];
  return column.format === "status" ? <StatusValue value={value} /> : <span className={`${column.format === "date" ? "text-[10px] text-zinc-500" : "text-[12px] text-zinc-300"} ${column.format === "number" || column.format === "bytes" || column.format === "duration" || column.format === "percent" ? "tabular-nums" : ""}`}>{productValue(value, column.format)}</span>;
}

function ResourceDetails({ row, columns, product, open, onClose }: { row: AdminProductRecord | null; columns: AdminProductColumn[]; product: AdminProduct; open: boolean; onClose: () => void }) {
  const style = productStyles[product];
  const details = row?.details ?? [];
  return <SideSheet open={open} onClose={onClose} title={row?.name ?? "Resource details"} description={`${adminProductPages[product].name} · ${row?.organization.name ?? "Workspace"}`} size="md" footer={row ? <Link to="/admin/organizations/$slug" params={{ slug: row.organization.slug }} onClick={onClose} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/[.09] bg-white/[.04] px-3 text-[12px] text-zinc-200 transition-colors hover:bg-white/[.075] focus-visible:outline-2 focus-visible:outline-accent">Open workspace<HugeiconsIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true" /></Link> : undefined}>
    {row ? <div className="space-y-6"><div className="flex items-center gap-3 rounded-xl border border-white/[.075] bg-white/[.02] p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg bg-white/[.035] ${style.className}`}><HugeiconsIcon icon={style.icon} size={18} aria-hidden="true" /></span><div className="min-w-0"><p className="text-[12px] text-zinc-200">{row.organization.name}</p><p className="mt-1 truncate text-[11px] text-zinc-600">/{row.organization.slug}</p></div></div><section><h3 className="mb-4 text-[12px] font-medium text-zinc-300">Resource details</h3><dl className="space-y-4">{columns.map((column) => <div key={column.key} className="grid grid-cols-[minmax(110px,1fr)_minmax(0,1.6fr)] items-start gap-4"><dt className="text-[11px] leading-5 text-zinc-500">{column.label}</dt><dd className="min-w-0 break-words text-right leading-5"><ResourceValue row={row} column={column} /></dd></div>)}</dl></section>{details.length ? <section className="rounded-xl border border-white/[.075] bg-white/[.015] p-4"><h3 className="mb-4 text-[12px] font-medium text-zinc-300">More information</h3><dl className="space-y-4">{details.map((detail, index) => <div key={`${detail.label}-${index}`}><dt className="text-[10px] text-zinc-500">{detail.label}</dt><dd className="mt-1.5 break-all text-[12px] leading-5 text-zinc-300">{detail.format === "status" ? <StatusValue value={detail.value} /> : productValue(detail.value, detail.format)}</dd></div>)}</dl></section> : null}<div className="text-[10px] leading-5 text-zinc-600"><span className="text-zinc-500">Resource ID</span><p className="mt-1 break-all font-mono">{row.id}</p></div></div> : null}
  </SideSheet>;
}

export function AdminProductPage({ product, params, onParamsChange }: { product: AdminProduct; params: AdminProductParams; onParamsChange: (next: AdminProductParams) => void }) {
  const definition = adminProductPages[product];
  const style = productStyles[product];
  const range = params.range ?? "30d";
  const view = params.view ?? definition.views[0].id;
  const queryClient = useQueryClient();
  const [inspection, setInspection] = useState<{ product: AdminProduct; view: string; row: AdminProductRecord } | null>(null);
  const query = useQuery({
    queryKey: ["admin", "product", product, view, range, params.page ?? 1, params.search ?? "", params.status ?? ""],
    queryFn: async () => {
      const result = await appClient.admin.product(product, { ...params, view, range });
      if ("error" in result) {
        if (result.error === "Unauthorized" || result.error === "Forbidden") void queryClient.invalidateQueries({ queryKey: ["admin-access"] });
        throw new Error(result.error);
      }
      return result;
    },
    placeholderData: (previousData, previousQuery) => previousQuery?.queryKey[2] === product ? previousData : undefined,
    staleTime: 60_000,
    retry: false,
  });
  const data = query.data;
  const resourcesReady = data?.resources.view === view;
  const selected = inspection?.product === product && inspection.view === view ? (resourcesReady ? data.resources.rows.find((row) => row.id === inspection.row.id) : undefined) ?? inspection.row : null;
  const changeParams = (next: Partial<AdminProductParams>) => onParamsChange({ ...params, ...next });
  const viewLabel = definition.views.find((item) => item.id === view)?.label ?? definition.name;
  const columns: Column<AdminProductRecord>[] = data && resourcesReady ? [
    { key: "name", header: data.resources.nameLabel, render: (row) => <button type="button" onClick={() => setInspection({ product, view, row })} className="group flex min-w-[180px] max-w-[340px] items-center gap-2.5 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"><span className={`grid size-8 shrink-0 place-items-center rounded-lg bg-white/[.035] ${style.className}`}><HugeiconsIcon icon={style.icon} size={14} aria-hidden="true" /></span><span className="min-w-0"><span className="block truncate text-[12px] text-zinc-200 group-hover:text-white" title={row.name}>{row.name}</span><span className="mt-1 block truncate text-[10px] text-zinc-600">View details</span></span></button> },
    { key: "organization", header: "Workspace", render: (row) => <Link to="/admin/organizations/$slug" params={{ slug: row.organization.slug }} className="block max-w-[180px] rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"><span className="block truncate text-[11px] text-zinc-400 hover:text-zinc-100">{row.organization.name}</span><span className="mt-1 block truncate text-[10px] text-zinc-600">/{row.organization.slug}</span></Link> },
    ...data.resources.columns.map((column): Column<AdminProductRecord> => ({ key: column.key, header: column.label, className: column.format === "date" ? "whitespace-nowrap" : undefined, render: (row) => <ResourceValue row={row} column={column} /> })),
    { key: "inspect", header: "", className: "w-10", render: (row) => <Button type="button" variant="ghost" size="sm" onClick={() => setInspection({ product, view, row })} aria-label={`Inspect ${row.name}`} className="size-7! min-w-7! px-0!"><HugeiconsIcon icon={ArrowRight01Icon} size={14} aria-hidden="true" /></Button> },
  ] : [];

  return <div className="mx-auto w-full max-w-[1440px] space-y-5" aria-busy={query.isFetching || undefined}>
    <WorkspacePageHeader appearance="compact" title={definition.name} description={definition.description} action={<div className="flex flex-wrap items-center gap-2">{product === "tunnels" ? <Link to="/admin/tunnels/connections" className="mr-1 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/[.08] px-3 text-[11px] text-zinc-300 transition-colors hover:bg-white/[.035] focus-visible:outline-2 focus-visible:outline-accent"><span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />Live connections<HugeiconsIcon icon={ArrowUpRight01Icon} size={12} aria-hidden="true" /></Link> : null}<SegmentedControl label={`${definition.name} reporting period`} value={range} options={ranges} onValueChange={(next) => changeParams({ range: next, page: 1 })} /><Button type="button" variant="ghost" size="sm" loading={query.isFetching} aria-label={`Refresh ${definition.name.toLowerCase()} insights`} onClick={() => void query.refetch()}><HugeiconsIcon icon={RefreshIcon} size={15} aria-hidden="true" /></Button></div>} />
    {query.isError ? <WorkspaceNotice message={data ? "Could not refresh this report. Showing the last available data." : `Could not load ${definition.name.toLowerCase()} insights.`} action={<Button type="button" variant="ghost" size="sm" onClick={() => void query.refetch()}>Try again</Button>} /> : null}
    {!data ? query.isPending ? <ProductLoading /> : <section className={panelClass}><WorkspaceEmptyState icon={<HugeiconsIcon icon={style.icon} size={20} />} title="Product insights unavailable" description="Try loading the report again to see this product’s current configuration and recorded activity." action={<Button type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>Try again</Button>} /></section> : <>
      <div className={`grid grid-cols-2 gap-3 ${data.metrics.length > 4 ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>{data.metrics.map((metric) => <section key={metric.key} className={`${panelClass} p-4`} aria-label={metric.label}><div className="flex items-center justify-between gap-3"><h2 className="text-[11px] font-normal text-zinc-500">{metric.label}</h2><span className={`size-1.5 shrink-0 rounded-full ${style.className} bg-current opacity-65`} aria-hidden="true" /></div><p className="mt-3 text-[27px] leading-none tracking-[-.055em] text-zinc-100 tabular-nums">{metric.value === null ? "Unavailable" : productValue(metric.value, metric.format ?? "number")}</p><p className="mt-3 text-[10px] leading-4 text-zinc-600">{metric.description}</p></section>)}</div>
      <div className={`grid gap-4 ${data.breakdowns.length ? "xl:grid-cols-[minmax(0,1.9fr)_minmax(275px,1fr)]" : ""}`}><ProductTrend data={data} product={product} />{data.breakdowns[0] ? <Breakdown data={data.breakdowns[0]} /> : null}</div>
      {data.breakdowns.length > 1 ? <div className={`grid gap-4 ${data.breakdowns.length > 2 ? "md:grid-cols-2" : ""}`}>{data.breakdowns.slice(1).map((breakdown) => <Breakdown key={breakdown.key} data={breakdown} />)}</div> : null}
      <section className="space-y-4" aria-labelledby={`admin-${product}-resources`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-1" role="group" aria-label={`${definition.name} resource views`}>{definition.views.map((item) => <button key={item.id} type="button" onClick={() => changeParams({ view: item.id, page: 1, search: "", status: "" })} aria-pressed={view === item.id} className={`min-h-8 rounded-lg px-3 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${view === item.id ? "bg-white/[.09] text-zinc-100" : "text-zinc-500 hover:bg-white/[.035] hover:text-zinc-200"}`}>{item.label}</button>)}</div><p className="text-[10px] text-zinc-600">{query.isFetching ? <span role="status">Updating…</span> : `Updated ${new Date(data.generatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}</p></div>
        <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 id={`admin-${product}-resources`} className="text-[14px] font-medium text-zinc-200">{viewLabel}<span className="ml-2 text-[11px] font-normal text-zinc-600 tabular-nums">{resourcesReady ? formatAdminUsage(data.resources.pagination.total) : "Loading…"}</span></h2><p className="mt-1 max-w-xl text-[11px] leading-4 text-zinc-500">{resourcesReady ? data.resources.description : `Loading ${viewLabel.toLowerCase()} across workspaces.`}</p></div><div className="flex w-full flex-wrap items-center gap-2 lg:w-auto"><ResourceSearch key={`${product}:${view}:${params.search ?? ""}`} initialValue={params.search ?? ""} onSubmit={(search) => changeParams({ search, page: 1 })} />{resourcesReady && data.resources.statusOptions.length ? <Select value={params.status ?? ""} onChange={(status) => changeParams({ status, page: 1 })} options={[{ value: "", label: "All statuses" }, ...data.resources.statusOptions]} ariaLabel={`Filter ${viewLabel.toLowerCase()} by status`} className="w-36 shrink-0" triggerClassName="h-8! min-h-8! px-2.5! text-[11px]!" /> : null}</div></header>
        {params.search || params.status ? <div className="flex items-center gap-2"><span className="text-[11px] text-zinc-500">{params.search ? `Matching “${params.search}”` : "Status filter applied"}</span><Button type="button" variant="ghost" size="sm" onClick={() => changeParams({ search: "", status: "", page: 1 })}>Clear filters</Button></div> : null}
        {resourcesReady ? <AdminDataTable columns={columns} data={data.resources.rows} page={data.resources.pagination.page} totalPages={data.resources.pagination.totalPages} onPageChange={(page) => changeParams({ page })} isLoading={query.isFetching} emptyMessage={params.search || params.status ? `No ${viewLabel.toLowerCase()} match these filters.` : `No ${viewLabel.toLowerCase()} recorded yet.`} /> : <ResourceTableLoading />}
      </section>
      {data.notes.length ? <details className="rounded-lg px-1 text-[10px] text-zinc-600"><summary className="w-fit cursor-pointer rounded py-1 hover:text-zinc-400 focus-visible:outline-2 focus-visible:outline-accent">How this report is measured</summary><div className="mt-2 max-w-4xl space-y-2 leading-5"><p>Selected period: {data.period.from.slice(0, 10)} – {data.period.to.slice(0, 10)} UTC. Configuration is current; activity uses the period shown for each metric.</p>{data.notes.map((note) => <p key={note}>{note}</p>)}</div></details> : null}
      <ResourceDetails row={selected} columns={data.resources.columns} product={product} open={selected !== null} onClose={() => setInspection(null)} />
    </>}
  </div>;
}
