import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BarChart3, Eye, Globe2, LockKeyhole, RefreshCw, Users } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { statusPageOrigin, statusPagePreviewUrl } from "@/lib/uptime/status-url";
import { useStatusPageEditor } from "./status-page-editor-context";
import { statusPagePath, uptimeRequest, UptimeRequestError } from "./uptime-client";
import { UptimeSkeleton, UptimeSummarySkeleton } from "./uptime-skeleton";
import { primaryButton, UptimeError, UptimePanel } from "./uptime-ui";
import analyticsPolicy, { type StatusAnalyticsRange, type StatusAnalyticsReport } from "../../../../../shared/status-analytics";

const { STATUS_ANALYTICS_RANGES } = analyticsPolicy;
const number = new Intl.NumberFormat("en");
const regions = new Intl.DisplayNames(["en"], { type: "region" });

export function StatusPageAnalytics() {
  const { orgSlug, page, analyticsAvailable } = useStatusPageEditor();
  const publicUrl = statusPagePreviewUrl(statusPageOrigin(import.meta.env.VITE_OUTRAY_STATUS_URL, import.meta.env.DEV), page);
  return <AnalyticsSession key={`${orgSlug}:${page.id}:${analyticsAvailable}`} orgSlug={orgSlug} pageId={page.id} publicUrl={publicUrl} published={page.published} available={analyticsAvailable} />;
}

function AnalyticsSession({ orgSlug, pageId, publicUrl, published, available }: { orgSlug: string; pageId: string; publicUrl: string; published: boolean; available: boolean }) {
  const [range, setRange] = useState<StatusAnalyticsRange>("7d");
  const reducedMotion = useReducedMotion();
  const resource = useQuery({
    queryKey: ["uptime", orgSlug, "status-analytics", pageId, range],
    enabled: available,
    queryFn: ({ signal }) => uptimeRequest<StatusAnalyticsReport>(orgSlug, statusPagePath(`/page/analytics?range=${range}`, pageId), { signal }),
    staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false,
  });
  if (!available || (resource.error instanceof UptimeRequestError && resource.error.code === "paid_plan_required")) return <UptimePanel className="mx-auto max-w-xl p-8 text-center sm:p-12">
    <span className="mx-auto grid size-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-zinc-400"><LockKeyhole size={19} aria-hidden="true" /></span>
    <h2 className="mt-5 text-[18px] font-normal tracking-tight text-zinc-100">Know who’s checking in.</h2>
    <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-zinc-500">See page views, visitor trends, and where your audience comes from. Status page analytics is included with every paid plan.</p>
    <Link to="/$orgSlug/billing" params={{ orgSlug }} className={`${primaryButton} mt-6`}>Explore plans</Link>
    <p className="mt-3 text-[11px] text-zinc-600">Tracking starts after you upgrade.</p>
  </UptimePanel>;
  // A denied refresh must hide previously cached reports immediately.
  if (resource.error instanceof UptimeRequestError && [401, 403, 404].includes(resource.error.status)) {
    return <UptimeError message={resource.error.message} />;
  }
  const data = resource.data;
  const dateLabel = (value: string | number) => new Intl.DateTimeFormat("en", range === "24h"
    ? { hour: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-[14px] font-medium text-zinc-200">Your status page audience</h2><p className="mt-1 text-[12px] text-zinc-500">Cookie-free visitor analytics. All times in UTC.</p></div>
      <div className="flex items-center gap-2"><SegmentedControl label="Analytics date range" value={range} onValueChange={(value) => { if (Object.hasOwn(STATUS_ANALYTICS_RANGES, value)) setRange(value as StatusAnalyticsRange); }} options={Object.keys(STATUS_ANALYTICS_RANGES).map((value) => ({ value, label: value }))} /><Button type="button" variant="secondary" size="sm" aria-label="Refresh analytics" disabled={resource.isFetching} onClick={() => void resource.refetch()}><RefreshCw size={14} className={resource.isFetching ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" /></Button></div>
    </div>
    {resource.error && <UptimeError message={resource.error instanceof Error ? resource.error.message : "Could not load analytics."} />}
    {resource.isPending && <UptimeSkeleton label="Loading status page analytics"><UptimeSummarySkeleton cards={3} /><div className="mt-4 h-64 rounded-xl border border-white/[0.08] bg-white/[0.02]" /></UptimeSkeleton>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Page views", value: data.views, detail: "Status page and incident reports", icon: Eye },
          { label: "Daily unique visitors", value: data.visitors, detail: "Daily estimates, summed over this period", icon: Users },
          { label: "Referring sites", value: data.referrers.filter((row) => row.label).length, detail: "Among your top traffic sources", icon: Globe2 }].map(({ label, value, detail, icon: Icon }) => <UptimePanel key={label} className="p-4 sm:p-5"><p className="flex items-center justify-between text-[12px] text-zinc-500">{label}<Icon size={14} aria-hidden="true" /></p><p className="mt-3 text-[28px] font-normal tabular-nums tracking-[-0.035em] text-zinc-100">{number.format(value)}</p><p className="mt-1 text-[11px] text-zinc-600">{detail}</p></UptimePanel>)}
      </div>
      <UptimePanel className="p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-medium text-zinc-200">Traffic over time</h3><div className="flex gap-4 text-[11px] text-zinc-400"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#a78bfa]" />Views</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#71717a]" />Daily uniques</span></div></div>
        {data.views === 0 ? <div className="flex h-56 flex-col items-center justify-center text-center"><BarChart3 size={24} className="text-zinc-600" aria-hidden="true" /><p className="mt-3 text-[13px] text-zinc-300">No visits in this period</p><p className="mt-1.5 max-w-sm text-[12px] leading-5 text-zinc-500">{published ? "Visits to your public page will appear here. Analytics starts collecting with this release." : "Publish your status page to start collecting visitor analytics."}</p></div> : <div className="h-64 w-full min-w-0" role="img" aria-label={`${number.format(data.views)} page views and ${number.format(data.visitors)} daily unique visitors over the selected period`}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} accessibilityLayer>
            <CartesianGrid stroke="#ffffff09" vertical={false} />
            <XAxis dataKey="time" tickFormatter={dateLabel} minTickGap={36} axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 10 }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 10 }} />
            <Tooltip labelFormatter={(label) => new Date(String(label)).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"} contentStyle={{ background: "#18181b", border: "1px solid #ffffff16", borderRadius: 10, fontSize: 12 }} labelStyle={{ color: "#a1a1aa", marginBottom: 6 }} />
            <Area type="monotone" dataKey="visitors" name="Daily uniques" stroke="#71717a" fill="#71717a" fillOpacity={0.04} strokeWidth={1.5} isAnimationActive={!reducedMotion} />
            <Area type="monotone" dataKey="views" name="Views" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.07} strokeWidth={2} isAnimationActive={!reducedMotion} />
          </AreaChart></ResponsiveContainer>
        </div>}
      </UptimePanel>
      <div className="grid gap-3 lg:grid-cols-3">
        <Breakdown title="Top sources" rows={data.referrers} total={data.views} label={(value) => value || "Direct / unknown"} href={sourceUrl} />
        <Breakdown title="Countries" rows={data.countries} total={data.views} label={(value) => countryFlag(value) ? regions.of(value) || value : "Unknown"} icon={countryFlag} />
        <Breakdown title="Pages" rows={data.pages} total={data.views} label={(value) => value === "/" ? "Status overview" : value} href={(value) => /^\/(?!\/)/.test(value) && !value.includes("\\") ? new URL(`.${value}`, publicUrl).href : undefined} />
      </div>
    </>}
  </div>;
}

function sourceUrl(value: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(`https://${value}`);
    if (url.host === value && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password) return url.href;
  } catch { /* Invalid sources stay plain text. */ }
}

function countryFlag(value: string): string | undefined {
  if (!/^[A-Z]{2}$/.test(value) || ["XX", "T1"].includes(value)) return;
  return String.fromCodePoint(...Array.from(value, (letter) => letter.charCodeAt(0) + 127397));
}

function Breakdown({ title, rows, total, label, href, icon }: {
  title: string;
  rows: Array<{ label: string; views: number }>;
  total: number;
  label: (value: string) => string;
  href?: (value: string) => string | undefined;
  icon?: (value: string) => ReactNode;
}) {
  return <UptimePanel className="min-w-0 p-4 sm:p-5">
    <h3 className="mb-4 text-[13px] font-medium text-zinc-200">{title}</h3>
    {rows.length === 0 ? <p className="py-5 text-[12px] text-zinc-600">No traffic yet.</p> : <ul className="space-y-3">{rows.map((row) => {
      const name = label(row.label);
      const url = href?.(row.label);
      const marker = icon?.(row.label);
      return <li key={row.label} className="relative overflow-hidden rounded-md px-2.5 py-2">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 rounded-md bg-white/[0.035]" style={{ width: `${total ? Math.min(100, row.views / total * 100) : 0}%` }} />
        <div className="relative flex items-center justify-between gap-3 text-[12px]">
          <div className="flex min-w-0 items-center gap-2 text-zinc-400">
            {marker && <span aria-hidden="true" className="shrink-0 text-[15px] leading-none">{marker}</span>}
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" title={name} className="min-w-0 truncate rounded-sm transition-colors hover:text-zinc-100 hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">{name}</a> : <span title={name} className="min-w-0 truncate">{name}</span>}
          </div>
          <span className="shrink-0 tabular-nums text-zinc-300">{number.format(row.views)}</span>
        </div>
      </li>;
    })}</ul>}
  </UptimePanel>;
}
