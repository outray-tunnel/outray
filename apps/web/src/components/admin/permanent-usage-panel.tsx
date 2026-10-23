import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "motion/react";
import productUsage, { type UsageAggregateReport, type UsageMetric, type UsageProduct } from "../../../../../shared/product-usage";
const { usageProducts } = productUsage;
import { Select } from "@/components/ui/select";
import { Button } from "@/components/arc/button/button";

const names: Record<UsageProduct, string> = { tunnels: "Tunnels", secrets: "Secrets", observability: "Observability", uptime: "Uptime", agent: "Agent" };
const ranges = [{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }, { value: "365d", label: "365 days" }, { value: "all", label: "All time" }];
type Report = UsageAggregateReport & { tunnelQueue: { queued: string; deadLetters: string; oldestQueuedAt: string | null } | null };
export function formatPermanentUsage(value: string, unit: "count" | "bytes" = "count") {
  const count = BigInt(value);
  if (unit === "count") return count.toLocaleString();
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
  let divisor = 1n; let index = 0;
  while (index < units.length - 1 && count >= divisor * 1024n) { divisor *= 1024n; index++; }
  return `${(count / divisor).toLocaleString()}${index ? `.${count % divisor * 10n / divisor}` : ""} ${units[index]}`;
}
export function PermanentUsagePanel({ product, organizationId }: { product?: UsageProduct; organizationId?: string }) {
  const [selectedProduct, setSelectedProduct] = useState<UsageProduct>(product ?? "tunnels");
  const [range, setRange] = useState<Report["range"]>("30d");
  const heading = useId();
  const active = product ?? selectedProduct;
  return <section aria-labelledby={heading} className="space-y-4 rounded-xl border border-white/[.08] bg-[#101010] p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id={heading} className="text-[14px] font-medium text-zinc-200">Recorded usage</h2><p className="mt-1 text-[11px] text-zinc-500">Lifetime totals · daily summaries kept beyond retention</p></div>
      <div className="flex flex-wrap gap-2">{!product ? <Select ariaLabel="Permanent usage product" value={active} onChange={value => setSelectedProduct(value as UsageProduct)} options={usageProducts.map(value => ({ value, label: names[value] }))} className="w-36" /> : null}<Select ariaLabel="Permanent usage chart period" value={range} onChange={value => setRange(value as Report["range"])} options={ranges} className="w-32" /></div>
    </header>
    <UsageEvidence key={`${organizationId ?? "platform"}:${active}`} product={active} organizationId={organizationId} range={range} />
  </section>;
}
function UsageEvidence({ product, organizationId, range }: { product: UsageProduct; organizationId?: string; range: Report["range"] }) {
  const [selected, setSelected] = useState<UsageMetric | null>(null);
  const reduced = useReducedMotion();
  const query = useQuery({
    queryKey: ["admin", "permanent-usage", organizationId ?? "platform", product, range],
    queryFn: async ({ signal }): Promise<Report> => {
      const params = new URLSearchParams({ product, range });
      if (organizationId) params.set("organizationId", organizationId);
      const response = await fetch(`/api/admin/usage/aggregates?${params}`, { signal });
      if (!response.ok) throw new Error("Permanent usage is temporarily unavailable.");
      return await response.json() as Report;
    }, staleTime: 30000, refetchInterval: 60000, refetchIntervalInBackground: false,
  });
  if (!query.data) return <div className="flex min-h-40 items-center justify-center gap-3 text-[12px] text-zinc-500" role={query.isError ? "alert" : "status"}>{query.isError ? <><span>Recorded usage is unavailable.</span><Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Retry</Button></> : "Loading recorded usage…"}</div>;
  const report = query.data;
  const metric = report.metrics.find(item => item.key === selected) ?? report.metrics[0];
  const points = metric ? report.points.map(point => ({ date: point.date, exact: point.values[metric.key] ?? null, value: point.values[metric.key] === undefined ? null : Number(point.values[metric.key]) })) : [];
  return <div className="space-y-5">
    {query.isError ? <p role="alert" className="text-[11px] text-amber-300">Could not refresh. Showing the last recorded totals.</p> : null}
    <div className="grid grid-cols-2 gap-x-5 gap-y-5 lg:grid-cols-3 xl:grid-cols-4">{report.metrics.map(item => <div key={item.key}><p className="text-[11px] leading-5 text-zinc-500">{item.label}</p><p title={`${item.lifetime}${item.unit === "bytes" ? " bytes" : ""} recorded`} className="mt-1 break-words text-[24px] tracking-[-.045em] text-zinc-100 tabular-nums">{formatPermanentUsage(item.lifetime, item.unit)}</p><p className="mt-1 text-[10px] text-zinc-600">Lifetime · {formatPermanentUsage(item.period, item.unit)} {range === "all" ? "recorded" : `in ${range.slice(0, -1)} days`}</p></div>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-[12px] text-zinc-300">Recorded activity</h3>{metric ? <Select ariaLabel="Recorded activity metric" value={metric.key} onChange={value => setSelected(value as UsageMetric)} options={report.metrics.map(item => ({ value: item.key, label: item.label }))} className="w-full sm:w-64" /> : null}</div>
    {points.length && metric ? <div className="h-52 min-w-0" role="img" aria-label={`${metric.label} by ${report.interval}, UTC`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
      <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={45} tick={{ fill: "#71717a", fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} width={65} tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={value => Number(value).toLocaleString(undefined, { notation: "compact" })} />
      <Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-[11px] text-zinc-300"><p className="text-zinc-500">{payload[0].payload.date} UTC</p><p className="mt-1">{formatPermanentUsage(payload[0].payload.exact, metric.unit)}</p><p className="mt-1 text-[10px] text-zinc-500">{payload[0].payload.exact}{metric.unit === "bytes" ? " bytes" : ""}</p></div> : null} /><Area type="linear" dataKey="value" stroke="#a1a1aa" fill="#a1a1aa" fillOpacity={.06} strokeWidth={2} isAnimationActive={!reduced} />
    </AreaChart></ResponsiveContainer></div> : <p className="py-8 text-center text-[12px] text-zinc-500">No daily activity recorded in this period.</p>}
    <details className="text-[10px] leading-5 text-zinc-500"><summary className="w-fit cursor-pointer rounded hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-accent">Coverage & processing</summary>
      <p className="mt-3">Recorded totals include surviving historical data, not a complete history since launch. Monthly-only baselines count toward lifetime totals without invented daily allocations.</p>
      <p className="mt-1">Collection timing is installation-wide.{organizationId ? " Backfill progress reflects this organization." : " Backfill coverage is partial across organizations."}</p>
      <ul className="mt-2 space-y-1">{report.coverage.map(source => <li key={source.source}>{source.source}: {source.collectionStartedAt ? `collecting since ${source.collectionStartedAt.slice(0, 10)}` : "not yet recording"} · backfill {source.backfill.replaceAll("_", " ")}{source.lastProcessedAt ? ` · last processed ${new Date(source.lastProcessedAt).toLocaleString()}` : ""}</li>)}</ul>
      {product === "uptime" ? <p className="mt-2">Status views awaiting delivery: {report.pending.statusViews} · failed: {report.pending.failedStatusViews}{report.pending.oldestStatusViewAt ? ` · oldest ${new Date(report.pending.oldestStatusViewAt).toLocaleString()}` : ""}</p> : null}
      {product === "tunnels" ? <p className={report.tunnelQueue && BigInt(report.tunnelQueue.deadLetters) > 0n ? "mt-2 text-amber-300" : "mt-2"}>Platform tunnel queue: {report.tunnelQueue ? `${report.tunnelQueue.queued} batches pending · ${report.tunnelQueue.deadLetters} dead letters${report.tunnelQueue.oldestQueuedAt ? ` · oldest ${new Date(report.tunnelQueue.oldestQueuedAt).toLocaleString()}` : ""}` : "unavailable"}</p> : null}
    </details>
  </div>;
}
