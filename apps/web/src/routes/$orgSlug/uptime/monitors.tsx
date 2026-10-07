import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { Activity, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Select } from "@/components/arc/select/select";
import { MonitorForm } from "@/components/uptime/monitor-form";
import { filterMonitors, monitorPublishingLabel, type MonitorView } from "@/components/uptime/monitor-data";
import { type UptimeMonitor, useUptimeResource, uptimeRequest, formatTime } from "@/components/uptime/uptime-client";
import { UptimeDialog } from "@/components/uptime/uptime-dialog";
import { useUptimeRefresh } from "@/components/uptime/use-uptime-refresh";
import { UptimeRowsSkeleton, UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { StateBadge, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";

export const Route = createFileRoute("/$orgSlug/uptime/monitors")({
  head: () => ({ meta: [{ title: "Monitors - OutRay Uptime" }] }), component: UptimeMonitors,
});

function UptimeMonitors() {
  const { orgSlug } = Route.useParams();
  return <MonitorCatalog key={orgSlug} orgSlug={orgSlug} />;
}

function MonitorCatalog({ orgSlug }: { orgSlug: string }) {
  const resource = useUptimeResource<{ monitors: UptimeMonitor[]; limit: number; canManage: boolean }>(orgSlug, "/monitors");
  useUptimeRefresh(resource.reload);
  const formId = useId();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<MonitorView>("all");
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const rows = resource.data?.monitors ?? [];
  const filtered = filterMonitors(rows, search, view);
  const atLimit = Boolean(resource.data && rows.length >= resource.data.limit);
  const close = () => { if (!pending.current) { setCreating(false); setError(null); } };
  const create = async (payload: Record<string, unknown>) => {
    if (pending.current || atLimit || !resource.data?.canManage) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      await uptimeRequest(orgSlug, "/monitors", { method: "POST", body: JSON.stringify(payload) });
      if (!mounted.current) return;
      setCreating(false); setSuccess("Monitor created. Its state stays Unknown until a check runs."); resource.reload();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not create monitor."); }
    finally { pending.current = false; if (mounted.current) setSaving(false); }
  };

  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <UptimePageHeading title="Monitors" description="Check public endpoints every minute. Get team alerts and choose when issues become public incidents."
      action={resource.data?.canManage ? <Button type="button" size="md" aria-haspopup="dialog" disabled={atLimit} onClick={() => { setError(null); setSuccess(null); setCreating(true); }}><Plus size={15} aria-hidden="true" />Add monitor</Button> : undefined} />
    {success ? <p role="status" className="text-[12px] leading-5 text-zinc-400">{success}</p> : null}
    {atLimit ? <p className="rounded-lg border border-amber-400/10 bg-amber-400/[0.025] px-4 py-3 text-[12px] text-amber-200/75">This workspace has reached its limit of {resource.data!.limit} monitors.</p> : null}
    <UptimePanel className="@container/monitor-catalog overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="outray-arc-requests-search w-full sm:max-w-[340px]"><SearchField label="Search monitors" appearance="workspace" value={search} onValueChange={setSearch} placeholder="Search name or URL…" maxLength={200} autoComplete="off" spellCheck={false} /></div>
        <div className="flex items-center gap-3"><span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{resource.data ? `${rows.length} / ${resource.data.limit}` : "—"}</span><div className="outray-arc-address-filter w-[154px]"><Select label="Monitor state" value={view} onValueChange={(value) => setView(value as MonitorView)} options={[{ value: "all", label: "All monitors" }, { value: "up", label: "Up" }, { value: "down", label: "Down" }, { value: "unknown", label: "Unknown" }, { value: "paused", label: "Paused" }]} /></div></div>
      </div>
      {resource.error ? <div className="flex flex-wrap items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><UptimeError message={resource.error} /></div><Button type="button" variant="secondary" size="sm" onClick={resource.reload}><RotateCcw size={13} aria-hidden="true" />Retry</Button></div> : null}
      {resource.loading && !resource.data ? <UptimeSkeleton label="Loading monitors"><UptimeRowsSkeleton rows={5} /></UptimeSkeleton>
        : resource.data && rows.length === 0 ? <div className="flex flex-col items-center px-5 py-14 text-center"><Activity size={23} strokeWidth={1.5} className="text-zinc-500" aria-hidden="true" /><h2 className="mt-4 text-[14px] font-medium text-zinc-200">Know when your endpoints go down</h2><p className="mt-2 max-w-sm text-[12px] leading-5 text-zinc-500">{resource.data.canManage ? "Add a public HTTP or HTTPS URL to collect checks, alert your team, and track recovery." : "Ask a workspace owner or admin to add an endpoint monitor."}</p>{resource.data.canManage ? <Button type="button" size="md" className="mt-5" aria-haspopup="dialog" onClick={() => { setError(null); setCreating(true); }}><Plus size={14} aria-hidden="true" />Add first monitor</Button> : null}</div>
          : resource.data && filtered.length === 0 ? <div className="px-5 py-12 text-center"><p className="text-[13px] text-zinc-300">No matching monitors</p><p className="mt-2 text-[12px] text-zinc-500">Try another search or state filter.</p><Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => { setSearch(""); setView("all"); }}>Clear filters</Button></div>
            : <>
              <div className="hidden grid-cols-[minmax(0,1fr)_110px_170px_170px_16px] gap-4 border-b border-white/[0.06] px-4 py-3 text-[11px] text-zinc-500 @[850px]/monitor-catalog:grid"><span>Endpoint</span><span>State</span><span>Incident publishing</span><span>Last check</span><span /></div>
              {filtered.map((monitor) => <Link key={monitor.id} to="/$orgSlug/uptime/monitors/$monitorId" params={{ orgSlug, monitorId: monitor.id }} className="group flex min-w-0 flex-wrap items-center gap-4 border-b border-white/[0.06] px-4 py-4 transition-colors last:border-0 hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-400 motion-reduce:transition-none @[850px]/monitor-catalog:grid @[850px]/monitor-catalog:grid-cols-[minmax(0,1fr)_110px_170px_170px_16px]">
                <span className="min-w-0 flex-1 basis-full @[850px]/monitor-catalog:basis-auto"><span className="block truncate text-[13px] font-medium text-zinc-200">{monitor.name}</span><span className="mt-1 block truncate text-[11px] text-zinc-500"><span className="mr-1.5 text-zinc-400">{monitor.method}</span>{monitor.url}</span></span>
                <span>{monitor.enabled ? <StateBadge state={monitor.state} /> : <span className="text-[11px] text-zinc-500">Paused</span>}</span><span className="text-[11px] text-zinc-500">{monitorPublishingLabel(monitor)}</span><span className="text-[11px] text-zinc-500">{formatTime(monitor.lastCheckedAt)}</span><ChevronRight size={14} className="ml-auto text-zinc-600 group-hover:text-zinc-400" aria-hidden="true" />
              </Link>)}
            </>}
    </UptimePanel>
    <p className="flex items-start gap-2 text-[11px] leading-5 text-zinc-500"><Activity size={13} className="mt-1 shrink-0" aria-hidden="true" /><span>Checks run from one region. New or stale monitors show Unknown until fresh checks arrive.</span></p>
    {creating && resource.data?.canManage ? <UptimeDialog open onClose={close} title="Add monitor" description="Set the endpoint, alert recipients, and publishing behaviour." busy={saving}
      footer={<><Button type="button" size="sm" variant="secondary" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" form={formId} size="sm" loading={saving} disabled={!saving && atLimit}>Create monitor</Button></>}>
      <MonitorForm orgSlug={orgSlug} formId={formId} busy={saving} error={error || (atLimit ? "The monitor limit has been reached." : null)} onSubmit={(payload) => void create(payload)} />
    </UptimeDialog> : null}
  </div>;
}
