import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { Activity, ArrowLeft, ChevronRight, Clock3, FilePenLine, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { MonitorForm } from "@/components/uptime/monitor-form";
import { monitorPublishingLabel } from "@/components/uptime/monitor-data";
import { formatTime, type UptimeCheck, type UptimeIncident, type UptimeMonitor, useUptimeResource, uptimeRequest } from "@/components/uptime/uptime-client";
import { UptimeDialog } from "@/components/uptime/uptime-dialog";
import { useUptimeRefresh } from "@/components/uptime/use-uptime-refresh";
import { UptimeHeaderSkeleton, UptimeRowsSkeleton, UptimeSkeleton, UptimeSummarySkeleton } from "@/components/uptime/uptime-skeleton";
import { StateBadge, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";

interface MonitorDetails {
  monitor: UptimeMonitor;
  canManage: boolean;
  checks: UptimeCheck[];
  incidents: UptimeIncident[];
  summary?: { observedUptimePercent?: number | null; averageLatencyMs?: number | null; observedChecks?: number; historyDays?: number };
}

export const Route = createFileRoute("/$orgSlug/uptime/monitors_/$monitorId")({
  head: () => ({ meta: [{ title: "Monitor - OutRay Uptime" }] }), component: MonitorDetail,
});

function MonitorDetail() {
  const { orgSlug, monitorId } = Route.useParams();
  return <MonitorDetailSession key={JSON.stringify([orgSlug, monitorId])} orgSlug={orgSlug} monitorId={monitorId} />;
}

function MonitorDetailSession({ orgSlug, monitorId }: { orgSlug: string; monitorId: string }) {
  const resource = useUptimeResource<MonitorDetails>(orgSlug, `/monitors/${encodeURIComponent(monitorId)}`);
  useUptimeRefresh(resource.reload);
  const monitor = resource.data?.monitor;
  const formId = useId();
  const [editing, setEditing] = useState<UptimeMonitor | null>(null);
  const [busy, setBusy] = useState<"save" | "toggle" | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<"checks" | "incidents">("checks");
  const [checkCount, setCheckCount] = useState(25);
  const [incidentCount, setIncidentCount] = useState(25);
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const close = () => { if (!pending.current) { setEditing(null); setEditError(null); } };

  const save = async (payload: Record<string, unknown>) => {
    if (pending.current || !resource.data?.canManage) return;
    pending.current = true; setBusy("save"); setEditError(null);
    try {
      await uptimeRequest(orgSlug, `/monitors/${encodeURIComponent(monitorId)}`, { method: "PATCH", body: JSON.stringify(payload) });
      if (mounted.current) { setEditing(null); resource.reload(); }
    } catch (cause) { if (mounted.current) setEditError(cause instanceof Error ? cause.message : "Could not save monitor."); }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  };
  const toggle = async () => {
    if (!monitor || pending.current || !resource.data?.canManage) return;
    pending.current = true; setBusy("toggle"); setActionError(null);
    try {
      await uptimeRequest(orgSlug, `/monitors/${encodeURIComponent(monitorId)}`, { method: "PATCH", body: JSON.stringify({ enabled: !monitor.enabled }) });
      if (mounted.current) resource.reload();
    } catch (cause) { if (mounted.current) setActionError(cause instanceof Error ? cause.message : "Could not update monitor."); }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  };

  const back = <Link to="/$orgSlug/uptime/monitors" params={{ orgSlug }} className="inline-flex min-h-8 items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-zinc-400 motion-reduce:transition-none"><ArrowLeft size={13} aria-hidden="true" />Monitors</Link>;
  if (resource.loading && !resource.data) return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">{back}<UptimeSkeleton label="Loading monitor details" className="space-y-5"><UptimeHeaderSkeleton action /><UptimeSummarySkeleton /><UptimePanel className="overflow-hidden"><UptimeRowsSkeleton rows={5} /></UptimePanel></UptimeSkeleton></div>;
  if (!monitor) return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">{back}<UptimeError message={resource.error || "This monitor could not be loaded."} /><Button type="button" variant="secondary" size="sm" onClick={resource.reload}><RotateCcw size={13} aria-hidden="true" />Try again</Button></div>;

  const summary = resource.data?.summary;
  const historyDays = summary?.historyDays ?? 30;
  const checks = resource.data?.checks ?? [], incidents = resource.data?.incidents ?? [];
  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    {back}
    <UptimePageHeading title={monitor.name} description={`${monitor.method} ${monitor.url}`}
      action={<div className="flex flex-wrap items-center gap-2"><CopyButton value={monitor.url} label="Copy endpoint URL" iconOnly variant="plain" />{resource.data?.canManage ? <><Button type="button" variant="secondary" size="md" aria-haspopup="dialog" disabled={Boolean(busy)} onClick={() => { setEditError(null); setEditing({ ...monitor, notificationEmails: [...(monitor.notificationEmails ?? [])] }); }}><FilePenLine size={14} aria-hidden="true" />Edit monitor</Button><Button type="button" variant="secondary" size="md" loading={busy === "toggle"} disabled={busy === "save"} onClick={() => void toggle()}>{monitor.enabled ? <Pause size={14} fill="currentColor" aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}{monitor.enabled ? "Pause" : "Resume"}</Button></> : null}</div>} />
    {resource.error ? <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><UptimeError message={resource.error} /></div><Button type="button" size="sm" variant="secondary" onClick={resource.reload}>Retry</Button></div> : null}
    {actionError ? <UptimeError message={actionError} /> : null}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <UptimePanel className="p-4"><p className="text-[11px] text-zinc-500">Current state</p><div className="mt-3">{monitor.enabled ? <StateBadge state={monitor.state} /> : <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400"><Pause size={13} aria-hidden="true" />Paused</span>}</div><p className="mt-3 text-[11px] leading-5 text-zinc-500">{monitor.enabled ? `Every minute · Down after ${monitor.failureThreshold} failures` : "Checks are paused"}</p></UptimePanel>
      <UptimePanel className="p-4"><p className="text-[11px] text-zinc-500">Observed uptime</p><p className="mt-3 text-[24px] font-normal tracking-tight text-zinc-100">{summary?.observedUptimePercent == null ? "—" : `${summary.observedUptimePercent.toFixed(2)}%`}</p><p className="mt-2 text-[11px] leading-5 text-zinc-500">Recorded checks · Last {historyDays} days</p></UptimePanel>
      <UptimePanel className="p-4"><p className="text-[11px] text-zinc-500">Average latency</p><p className="mt-3 text-[24px] font-normal tracking-tight text-zinc-100">{summary?.averageLatencyMs == null ? "—" : <>{Math.round(summary.averageLatencyMs)}<span className="ml-1.5 text-[13px] text-zinc-500">ms</span></>}</p><p className="mt-2 text-[11px] leading-5 text-zinc-500">Observed checks · Last {historyDays} days</p></UptimePanel>
      <UptimePanel className="p-4"><p className="text-[11px] text-zinc-500">Last check</p><p className="mt-3 text-[13px] leading-6 text-zinc-200">{formatTime(monitor.lastCheckedAt)}</p><p className="mt-3 text-[11px] leading-5 text-zinc-500">Stale checks show Unknown</p></UptimePanel>
    </div>
    <dl className="flex flex-wrap items-start gap-x-10 gap-y-3 px-1 text-[11px]"><div><dt className="text-zinc-500">Incident publishing</dt><dd className="mt-1 text-zinc-300">{monitorPublishingLabel(monitor)}</dd></div><div><dt className="text-zinc-500">Expected status</dt><dd className="mt-1 text-zinc-300">{monitor.expectedStatus ?? "200–399"}</dd></div><div><dt className="text-zinc-500">Email alerts</dt><dd className="mt-1 text-zinc-300">{monitor.notificationEmails?.length ? `${monitor.notificationEmails.length} team ${monitor.notificationEmails.length === 1 ? "member" : "members"}` : "No recipients"}</dd></div><div><dt className="text-zinc-500">Headers</dt><dd className="mt-1 text-zinc-300">{monitor.hasHeaders ? "Encrypted headers configured" : "None"}</dd></div></dl>
    <UptimePanel className="@container/monitor-history overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-4"><SegmentedControl value={tab} onValueChange={(value) => setTab(value as "checks" | "incidents")} label="Monitor activity" options={[{ value: "checks", label: "Checks" }, { value: "incidents", label: "Incidents", accessory: incidents.length ? <span className="ml-1.5 text-[10px] opacity-50">{incidents.length}</span> : undefined }]} /><span className="text-[11px] text-zinc-500">{tab === "checks" ? `Last ${historyDays} days · ${Math.min(checkCount, checks.length)} of ${checks.length} recent checks` : `${incidents.length} related ${incidents.length === 1 ? "incident" : "incidents"}`}</span></div>
      {tab === "checks" ? checks.length ? <>
        <div className="hidden grid-cols-[120px_minmax(0,1fr)_140px_120px] gap-4 border-b border-white/[0.06] px-4 py-3 text-[11px] text-zinc-500 @[650px]/monitor-history:grid"><span>Result</span><span>Checked at</span><span>Response</span><span className="text-right">Latency</span></div>
        {checks.slice(0, checkCount).map((check) => <div key={check.id} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-[12px] last:border-0 @[650px]/monitor-history:grid-cols-[120px_minmax(0,1fr)_140px_120px] @[650px]/monitor-history:gap-4"><div><StateBadge state={check.success ? "up" : "down"} /></div><span className="text-[11px] text-zinc-500">{formatTime(check.checkedAt)}</span><span className="break-words text-[11px] text-zinc-400">{check.statusCode ?? check.errorKind?.replaceAll("_", " ") ?? "—"}</span><span className="text-[11px] tabular-nums text-zinc-400 @[650px]/monitor-history:text-right">{check.latencyMs == null ? "—" : `${Math.round(check.latencyMs)} ms`}</span></div>)}
        {checks.length > checkCount ? <div className="border-t border-white/[0.06] px-4 py-3"><Button type="button" variant="ghost" size="sm" onClick={() => setCheckCount((count) => count + 25)}>Show more checks</Button></div> : null}
      </> : <div className="px-5 py-12 text-center"><Activity size={21} strokeWidth={1.5} className="mx-auto text-zinc-500" aria-hidden="true" /><p className="mt-3 text-[13px] text-zinc-300">No checks yet</p><p className="mx-auto mt-2 max-w-sm text-[12px] leading-5 text-zinc-500">{monitor.enabled ? "The first check should arrive within a minute once the uptime worker is running." : "Resume this monitor to start collecting check history."}</p></div>
        : incidents.length ? <>{incidents.slice(0, incidentCount).map((incident) => <Link key={incident.id} to="/$orgSlug/uptime/incidents/$incidentId" params={{ orgSlug, incidentId: incident.id }} className="group flex items-center gap-3 border-b border-white/[0.06] px-4 py-4 transition-colors last:border-0 hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-400 motion-reduce:transition-none"><span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-zinc-200">{incident.title}</span><span className="mt-1 block text-[11px] text-zinc-500">{formatTime(incident.startedAt || incident.createdAt)}</span></span><span className="text-right text-[11px] text-zinc-500">{incident.uptimePublicationState === "ignored" ? "Ignored" : incident.uptimePublicationState === "detected" ? "Private detection" : incident.status === "resolved" ? "Resolved" : "Public incident"}</span><ChevronRight size={14} className="shrink-0 text-zinc-600 group-hover:text-zinc-400" aria-hidden="true" /></Link>)}{incidents.length > incidentCount ? <div className="border-t border-white/[0.06] px-4 py-3"><Button type="button" variant="ghost" size="sm" onClick={() => setIncidentCount((count) => count + 25)}>Show more incidents</Button></div> : null}</>
          : <div className="px-5 py-12 text-center"><Clock3 size={21} strokeWidth={1.5} className="mx-auto text-zinc-500" aria-hidden="true" /><p className="mt-3 text-[13px] text-zinc-300">No related incidents</p><p className="mt-2 text-[12px] leading-5 text-zinc-500">Detected downtime and published incidents for this endpoint appear here.</p></div>}
    </UptimePanel>
    {editing && resource.data?.canManage ? <UptimeDialog open onClose={close} title="Edit monitor" description="Update the endpoint, alerts, and publishing behaviour." busy={busy === "save"}
      footer={<><Button type="button" variant="secondary" size="sm" disabled={Boolean(busy)} onClick={close}>Cancel</Button><Button type="submit" form={formId} size="sm" loading={busy === "save"} disabled={busy === "toggle"}>Save changes</Button></>}>
      <MonitorForm orgSlug={orgSlug} formId={formId} monitor={editing} busy={Boolean(busy)} error={editError} onSubmit={(payload) => void save(payload)} />
    </UptimeDialog> : null}
  </div>;
}
