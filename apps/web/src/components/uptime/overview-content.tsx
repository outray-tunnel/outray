import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Bell, CircleAlert, CircleCheck, Globe2, Info, Pause, Plus, Radar, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "../arc/button/button";
import { IncidentBadge } from "./incident-ui";
import { formatTime, type UptimeIncidentListResponse, type UptimeMonitor, type UptimePageResponse } from "./uptime-client";
import { overviewMonitorRows, uptimeOverviewSummary } from "./overview-data";
import { UptimeRowsSkeleton, UptimeSkeleton, UptimeSummarySkeleton } from "./uptime-skeleton";
import { primaryButton, secondaryButton, StateBadge, UptimeError, UptimePageHeading, UptimePanel } from "./uptime-ui";
import { incidentDuration } from "@/lib/uptime/incident-display";
import "../outray-arc-theme.css";

type Resource<T> = { data: T | null; loading: boolean; error: string | null };
type MonitorsResponse = { monitors: UptimeMonitor[]; limit: number; canManage?: boolean };
export type UptimeOverviewContentProps = {
  orgSlug: string;
  monitors: Resource<MonitorsResponse>;
  incidents: Resource<UptimeIncidentListResponse>;
  page: Resource<UptimePageResponse>;
  onRefresh: () => void;
};

const healthDetails = {
  empty: { icon: Radar, label: "Ready for your first monitor", color: "text-zinc-400" },
  paused: { icon: Pause, label: "All monitors paused", color: "text-zinc-400" },
  down: { icon: CircleAlert, label: "Services need attention", color: "text-rose-400" },
  unknown: { icon: Radar, label: "Waiting for fresh checks", color: "text-amber-400" },
  up: { icon: CircleCheck, label: "All monitored services are up", color: "text-emerald-400" },
};

export function UptimeOverviewContent({ orgSlug, monitors, incidents, page, onRefresh }: UptimeOverviewContentProps) {
  const rows = monitors.data?.monitors ?? [];
  const incidentRows = incidents.data?.incidents ?? [];
  const summary = uptimeOverviewSummary(rows, incidentRows);
  const health = healthDetails[summary.health as keyof typeof healthDetails];
  const HealthIcon = health.icon;
  const publicPage = page.data?.page;
  const refreshing = [monitors, incidents, page].some((resource) => resource.loading && resource.data);
  const canManage = monitors.data?.canManage === true;

  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <UptimePageHeading title="Overview" description="Service health, detected issues, and your public status page."
      action={<div className="flex items-center gap-2"><Button variant="ghost" size="sm" type="button" aria-label="Refresh Uptime overview" title="Refresh overview" disabled={refreshing} onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" /></Button>{canManage && <Link className={primaryButton} to="/$orgSlug/uptime/monitors" params={{ orgSlug }}><Plus size={14} aria-hidden="true" />Add monitor</Link>}</div>} />
    {refreshing && <span role="status" className="sr-only">Refreshing Uptime overview</span>}

    {!monitors.data ? monitors.loading ? <UptimeSkeleton label="Loading service health"><UptimeSummarySkeleton /></UptimeSkeleton> : <LoadError message={monitors.error} onRetry={onRefresh} /> : <>
      {monitors.error && <RefreshError onRetry={onRefresh} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        <span className={`inline-flex items-center gap-2 ${health.color}`}><HealthIcon size={15} aria-hidden="true" />{health.label}</span>
        <span className="text-zinc-500">Checks run every minute</span>
        {summary.paused > 0 && <span className="text-zinc-500">{summary.paused} paused</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Monitors" value={summary.total} detail={`${summary.enabled} checking · limit ${monitors.data.limit}`} icon={Activity} />
        <Metric label="Up" value={summary.up} detail={summary.unknown ? `${summary.unknown} awaiting fresh checks` : "From the latest monitor checks"} icon={CircleCheck} color="text-emerald-400" />
        <Metric label="Down" value={summary.down} detail="Confirmed monitor failures" icon={CircleAlert} color={summary.down ? "text-rose-400" : "text-zinc-500"} />
        {!incidents.data ? <UptimePanel className="p-4 sm:p-5"><p className="text-[12px] text-zinc-500">Recent incidents</p>{incidents.loading ? <UptimeSkeleton label="Loading incidents"><div className="mt-4 h-7 w-16 rounded bg-white/[0.07]" /></UptimeSkeleton> : <p className="mt-3 text-[12px] leading-5 text-zinc-500">Could not load incidents</p>}</UptimePanel> :
          <Metric label="Recent incidents" value={incidentRows.length} detail={`${summary.active} active · ${summary.detected} private detections in recent history`} icon={ShieldCheck} />}
      </div>
    </>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <UptimePanel className="overflow-hidden">
        <SectionHeader title="Monitor health" to="/$orgSlug/uptime/monitors" orgSlug={orgSlug} label="View monitors" />
        {!monitors.data ? monitors.loading ? <UptimeSkeleton label="Loading monitors"><UptimeRowsSkeleton rows={5} /></UptimeSkeleton> : <LoadError message={monitors.error} onRetry={onRefresh} /> : rows.length === 0 ?
          <Empty icon={Radar} title="Start with a public endpoint" description="Add a website or API to receive downtime alerts. Publishing an incident remains your choice."
            action={canManage ? <Link className={secondaryButton} to="/$orgSlug/uptime/monitors" params={{ orgSlug }}>Create first monitor<ArrowRight size={13} aria-hidden="true" /></Link> : undefined} /> :
          <ul className="divide-y divide-white/[0.06]">{overviewMonitorRows(rows).map((monitor) => <li key={monitor.id}><Link to="/$orgSlug/uptime/monitors/$monitorId" params={{ orgSlug, monitorId: monitor.id }}
            className="group flex min-h-[72px] items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-500 motion-reduce:transition-none sm:px-5">
            <div className="min-w-0"><p className="truncate text-[13px] text-zinc-200">{monitor.name}</p><p className="mt-1 truncate font-mono text-[11px] text-zinc-500">{monitor.method} {monitor.url}</p></div>
            <div className="flex shrink-0 items-center gap-2">{monitor.enabled ? <StateBadge state={monitor.state} /> : <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"><Pause size={12} aria-hidden="true" />Paused</span>}<ArrowRight size={13} className="text-zinc-600 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></div>
          </Link></li>)}</ul>}
      </UptimePanel>
      <UptimePanel className="overflow-hidden">
        <SectionHeader title="Recent incidents" to="/$orgSlug/uptime/incidents" orgSlug={orgSlug} label="View incidents" />
        {!incidents.data ? incidents.loading ? <UptimeSkeleton label="Loading recent incidents"><UptimeRowsSkeleton rows={3} /></UptimeSkeleton> : <LoadError message={incidents.error} onRetry={onRefresh} /> : <>
          {incidents.error && <div className="px-4 pt-3"><RefreshError onRetry={onRefresh} /></div>}
          {incidentRows.length === 0 ? <Empty icon={ShieldCheck} title="No incidents recorded" description="Detected issues and team-written incidents will appear here. A private detection is not a public incident." /> :
            <ul className="divide-y divide-white/[0.06]">{incidentRows.slice(0, 3).map((incident) => <li key={incident.id}><Link to="/$orgSlug/uptime/incidents/$incidentId" params={{ orgSlug, incidentId: incident.id }} className="block px-4 py-3.5 transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-500 motion-reduce:transition-none sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words text-[13px] text-zinc-200">{incident.title}</p><IncidentBadge incident={incident} /></div>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">{formatTime(incident.startedAt || incident.createdAt)}<span className="px-2 text-zinc-700">·</span>{incidentDuration(incident)}</p>
            </Link></li>)}</ul>}
        </>}
      </UptimePanel>
    </div>

    <section aria-label="Uptime settings" className="grid gap-3 lg:grid-cols-2">
      <UptimePanel className="flex items-start gap-3 p-4 sm:p-5"><Globe2 size={17} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" /><div className="min-w-0 flex-1">
        <h2 className="text-[13px] font-medium text-zinc-200">Public status page</h2>
        {!page.data ? page.loading ? <UptimeSkeleton label="Loading status page"><div className="mt-2 h-3 w-44 rounded bg-white/[0.05]" /></UptimeSkeleton> : <div className="mt-2"><LoadError message={page.error} onRetry={onRefresh} /></div> : <>
          <p className="mt-1 text-[12px] leading-5 text-zinc-500">{publicPage ? publicPage.published ? `${publicPage.name} is published for your customers.` : `${publicPage.name} is a private draft.` : "Give customers one place to check service availability."}</p>
          <Link to="/$orgSlug/uptime/status-page" params={{ orgSlug }} className="mt-3 inline-flex min-h-8 items-center gap-1.5 text-[12px] text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-zinc-500">{publicPage ? "View status page settings" : page.data.canManage ? "Set up a status page" : "View status page"}<ArrowRight size={13} aria-hidden="true" /></Link>
          {page.error && <RefreshError onRetry={onRefresh} />}
        </>}
      </div>{publicPage && <span className={`rounded-md px-2 py-0.5 text-[11px] ${publicPage.published ? "bg-emerald-400/[0.06] text-emerald-400" : "bg-white/[0.04] text-zinc-500"}`}>{publicPage.published ? "Published" : "Draft"}</span>}</UptimePanel>
      <UptimePanel className="flex items-start gap-3 p-4 sm:p-5"><Bell size={17} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" /><div className="min-w-0"><h2 className="text-[13px] font-medium text-zinc-200">Team notifications</h2><p className="mt-1 text-[12px] leading-5 text-zinc-500">Connect Slack or Discord. Email recipients are chosen per monitor.</p><Link to="/$orgSlug/uptime/notifications" params={{ orgSlug }} className="mt-3 inline-flex min-h-8 items-center gap-1.5 text-[12px] text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-zinc-500">View notifications<ArrowRight size={13} aria-hidden="true" /></Link></div></UptimePanel>
    </section>
    <p className="flex items-start gap-1.5 text-[11px] leading-5 text-zinc-500"><Info size={12} className="mt-1 shrink-0" aria-hidden="true" /><span>Monitor state is private monitoring evidence. Incident publishing follows each monitor’s settings.</span></p>
  </div>;
}

function Metric({ label, value, detail, icon: Icon, color = "text-zinc-500" }: { label: string; value: number; detail: string; icon: typeof Activity; color?: string }) {
  return <UptimePanel className="p-4 sm:p-5"><p className="flex items-center justify-between gap-2 text-[12px] text-zinc-500">{label}<Icon size={14} className={color} aria-hidden="true" /></p><p className="mt-3 text-[26px] font-normal tabular-nums tracking-[-0.035em] text-zinc-100">{value}</p><p className="mt-1 text-[11px] leading-5 text-zinc-500">{detail}</p></UptimePanel>;
}
function SectionHeader({ title, to, orgSlug, label }: { title: string; to: "/$orgSlug/uptime/monitors" | "/$orgSlug/uptime/incidents"; orgSlug: string; label: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5"><h2 className="text-[13px] font-medium text-zinc-200">{title}</h2><Link to={to} params={{ orgSlug }} className="inline-flex min-h-8 items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-zinc-500">{label}<ArrowRight size={12} aria-hidden="true" /></Link></div>;
}
function Empty({ icon: Icon, title, description, action }: { icon: typeof Radar; title: string; description: string; action?: ReactNode }) {
  return <div className="px-5 py-10 text-center"><Icon size={23} className="mx-auto text-zinc-600" aria-hidden="true" /><h3 className="mt-3 text-[13px] font-medium text-zinc-300">{title}</h3><p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-5 text-zinc-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
function LoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return <div className="space-y-3 p-4"><UptimeError message={message || "Could not load this section."} /><Button type="button" variant="secondary" size="sm" onClick={onRetry}>Try again</Button></div>;
}
function RefreshError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/10 bg-amber-400/[0.025] px-3 py-2 text-[11px] text-amber-100/75"><span>Could not refresh. Showing the last available data.</span><Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button></div>;
}
