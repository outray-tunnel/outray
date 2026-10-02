import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { UptimeEmailRecipients } from "@/components/uptime/email-recipients";
import { IncidentPublishingFields, type IncidentPublishingMode } from "@/components/uptime/incident-publishing-fields";
import { formatTime, type UptimeCheck, type UptimeIncident, type UptimeMonitor, useUptimeResource, uptimeRequest } from "@/components/uptime/uptime-client";
import { UptimeHeaderSkeleton, UptimeRowsSkeleton, UptimeSkeleton, UptimeSummarySkeleton } from "@/components/uptime/uptime-skeleton";
import { fieldClass, labelClass, primaryButton, secondaryButton, StateBadge, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";

interface MonitorDetails {
  monitor: UptimeMonitor;
  checks: UptimeCheck[];
  incidents: UptimeIncident[];
  summary?: { observedUptimePercent?: number | null; averageLatencyMs?: number | null; observedChecks?: number };
}

export const Route = createFileRoute("/$orgSlug/uptime/monitors_/$monitorId")({
  head: () => ({ meta: [{ title: "Monitor - OutRay Uptime" }] }),
  component: MonitorDetail,
});

function MonitorDetail() {
  const { orgSlug, monitorId } = Route.useParams();
  const resource = useUptimeResource<MonitorDetails>(orgSlug, `/monitors/${encodeURIComponent(monitorId)}`);
  const monitor = resource.data?.monitor;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "HEAD">("GET");
  const [expectedStatus, setExpectedStatus] = useState("");
  const [responseText, setResponseText] = useState("");
  const [replaceHeaders, setReplaceHeaders] = useState(false);
  const [headerLines, setHeaderLines] = useState("");
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [incidentPublishing, setIncidentPublishing] = useState<IncidentPublishingMode>("manual");
  const [publishAfterMinutes, setPublishAfterMinutes] = useState(5);

  useEffect(() => {
    if (!monitor) return;
    setName(monitor.name); setUrl(monitor.url); setMethod(monitor.method);
    setExpectedStatus(monitor.expectedStatus?.toString() || "");
    setResponseText(monitor.responseText || "");
    setReplaceHeaders(false); setHeaderLines("");
    setNotificationEmails(monitor.notificationEmails || []);
    setFailureThreshold(monitor.failureThreshold); setIncidentPublishing(monitor.incidentPublishing);
    setPublishAfterMinutes(monitor.publishAfterMinutes);
  }, [monitor]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      const headers: Record<string, string> = {};
      if (replaceHeaders) {
        for (const line of headerLines.split("\n")) {
          if (!line.trim()) continue;
          const colon = line.indexOf(":");
          if (colon < 1) throw new Error("Each header needs a name and value separated by a colon.");
          const name = line.slice(0, colon).trim();
          const value = line.slice(colon + 1).trim();
          if (!name || !value) throw new Error("Header names and values cannot be empty.");
          headers[name] = value;
        }
      }
      await uptimeRequest(orgSlug, `/monitors/${encodeURIComponent(monitorId)}`, { method: "PATCH", body: JSON.stringify({ name, url, method, expectedStatus: expectedStatus ? Number(expectedStatus) : null, responseText: method === "GET" ? responseText || null : null, notificationEmails, failureThreshold, incidentPublishing, publishAfterMinutes, ...(replaceHeaders ? { headers } : {}) }) });
      setEditing(false); resource.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save monitor."); }
    finally { setSaving(false); }
  };

  const toggle = async () => {
    if (!monitor) return;
    try { setError(null); await uptimeRequest(orgSlug, `/monitors/${encodeURIComponent(monitorId)}`, { method: "PATCH", body: JSON.stringify({ enabled: !monitor.enabled }) }); resource.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update monitor."); }
  };

  if (resource.loading && !resource.data) return <div className="mx-auto max-w-[1180px]">
    <Link to="/$orgSlug/uptime/monitors" params={{ orgSlug }} className="mb-5 inline-block text-xs text-zinc-500 hover:text-white">← All monitors</Link>
    <UptimeSkeleton label="Loading monitor details" className="space-y-5">
      <UptimeHeaderSkeleton action />
      <UptimeSummarySkeleton />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
        <UptimePanel className="overflow-hidden"><div className="h-14 border-b border-white/[0.07] px-5 py-5"><div className="h-3 w-28 rounded bg-white/[0.06]" /></div><UptimeRowsSkeleton rows={3} /></UptimePanel>
        <UptimePanel className="h-52 bg-white/[0.015]" />
      </div>
    </UptimeSkeleton>
  </div>;
  if (resource.error && !resource.data) return <div className="mx-auto max-w-[1180px]"><Link to="/$orgSlug/uptime/monitors" params={{ orgSlug }} className="mb-5 inline-block text-xs text-zinc-500 hover:text-white">← All monitors</Link><UptimeError message={resource.error} /></div>;

  return <div className="mx-auto max-w-[1180px]">
    <Link to="/$orgSlug/uptime/monitors" params={{ orgSlug }} className="mb-5 inline-block text-xs text-zinc-500 hover:text-white">← All monitors</Link>
    <UptimePageHeading title={monitor?.name || "Monitor"} description={monitor ? `${monitor.method} ${monitor.url}` : "Check history and incidents for this endpoint."} action={monitor && <div className="flex flex-wrap gap-2"><button type="button" className={secondaryButton} onClick={() => setEditing((value) => !value)}>{editing ? "Close editor" : "Edit"}</button><button type="button" className={secondaryButton} onClick={() => void toggle()}>{monitor.enabled ? "Pause" : "Resume"}</button></div>} />
    {resource.error && <UptimeError message={resource.error} />}
    {error && <div className="mb-5"><UptimeError message={error} /></div>}
    {monitor && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UptimePanel className="p-5"><p className="text-xs text-zinc-500">Current state</p><div className="mt-4"><StateBadge state={monitor.state} /></div><p className="mt-3 text-xs text-zinc-600">{monitor.enabled ? `Every minute · Down after ${monitor.failureThreshold} failures` : "Paused"}</p><p className="mt-1 text-xs text-zinc-600">Incident publishing: {monitor.incidentPublishing === "after_confirmation" ? `after ${monitor.publishAfterMinutes} minutes` : monitor.incidentPublishing}</p></UptimePanel>
        <UptimePanel className="p-5"><p className="text-xs text-zinc-500">Observed uptime</p><p className="mt-3 text-xl font-semibold text-zinc-100">{resource.data?.summary?.observedUptimePercent == null ? "—" : `${resource.data.summary.observedUptimePercent.toFixed(2)}%`}</p><p className="mt-2 text-xs text-zinc-600">Based on recorded checks, last 30 days</p></UptimePanel>
        <UptimePanel className="p-5"><p className="text-xs text-zinc-500">Average latency</p><p className="mt-3 text-xl font-semibold text-zinc-100">{resource.data?.summary?.averageLatencyMs == null ? "—" : `${Math.round(resource.data.summary.averageLatencyMs)} ms`}</p><p className="mt-2 text-xs text-zinc-600">Successful observed checks</p></UptimePanel>
        <UptimePanel className="p-5"><p className="text-xs text-zinc-500">Last check</p><p className="mt-3 text-sm font-medium text-zinc-200">{formatTime(monitor.lastCheckedAt)}</p><p className="mt-2 text-xs text-zinc-600">Stale checks show Unknown</p></UptimePanel>
      </div>
      {editing && <UptimePanel className="mt-5 p-5 md:p-7"><h2 className="text-base font-semibold text-zinc-100">Monitor settings</h2><form onSubmit={(event) => void save(event)} className="mt-5 grid gap-5 md:grid-cols-2">
        <label className={labelClass}>Name<input className={`${fieldClass} mt-2`} value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className={labelClass}>Public URL<input className={`${fieldClass} mt-2`} value={url} onChange={(event) => setUrl(event.target.value)} type="url" required /></label>
        <label className={labelClass}>Method<select className={`${fieldClass} mt-2`} value={method} onChange={(event) => setMethod(event.target.value as "GET" | "HEAD")}><option value="GET">GET</option><option value="HEAD">HEAD</option></select></label>
        <label className={labelClass}>Exact status (blank accepts 200–399)<input className={`${fieldClass} mt-2`} type="number" min={100} max={599} value={expectedStatus} onChange={(event) => setExpectedStatus(event.target.value)} /></label>
        {method === "GET" && <label className={`${labelClass} md:col-span-2`}>Response text (optional)<input className={`${fieldClass} mt-2`} value={responseText} onChange={(event) => setResponseText(event.target.value)} /></label>}
        <div className="md:col-span-2 space-y-3"><p className="text-xs text-zinc-400">{monitor.hasHeaders ? "Custom headers are encrypted and cannot be retrieved. Changing the URL clears them unless you enter replacements." : "No custom headers configured."}</p><label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={replaceHeaders} onChange={(event) => setReplaceHeaders(event.target.checked)} />Replace or clear custom headers</label>{replaceHeaders && <label className={labelClass}>New headers (leave blank to clear)<textarea className={`${fieldClass} mt-2 min-h-24 resize-y py-3 font-mono text-xs`} value={headerLines} onChange={(event) => setHeaderLines(event.target.value)} placeholder="Authorization: Bearer …" /><span className="mt-1 block text-[11px] font-normal text-zinc-600">One Name: Value per line. Existing values will be replaced.</span></label>}</div>
        <div className="md:col-span-2"><UptimeEmailRecipients orgSlug={orgSlug} value={notificationEmails} onChange={setNotificationEmails} /></div>
        <IncidentPublishingFields failureThreshold={failureThreshold} onFailureThresholdChange={setFailureThreshold} mode={incidentPublishing} onModeChange={setIncidentPublishing} publishAfterMinutes={publishAfterMinutes} onPublishAfterMinutesChange={setPublishAfterMinutes} />
        <div className="md:col-span-2"><button type="submit" className={primaryButton} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
      </form></UptimePanel>}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
        <UptimePanel className="overflow-hidden"><div className="border-b border-white/[0.07] px-5 py-4"><h2 className="text-sm font-semibold text-zinc-200">Recent checks</h2></div>
          {!resource.data?.checks.length && <p className="p-5 text-sm text-zinc-500">No checks yet. The first run should arrive within a minute after the worker is enabled.</p>}
          {resource.data?.checks.map((check) => <div key={check.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3 last:border-0"><div><StateBadge state={check.success ? "up" : "down"} /><span className="ml-3 text-xs text-zinc-500">{formatTime(check.checkedAt)}</span></div><div className="text-xs text-zinc-400">{check.statusCode ?? check.errorKind ?? "—"} · {check.latencyMs == null ? "—" : `${Math.round(check.latencyMs)} ms`}</div></div>)}
        </UptimePanel>
        <UptimePanel className="p-5"><h2 className="text-sm font-semibold text-zinc-200">Related incidents</h2>{resource.data?.incidents.length ? <div className="mt-4 space-y-3">{resource.data.incidents.map((incident) => <Link key={incident.id} to="/$orgSlug/uptime/incidents/$incidentId" params={{ orgSlug, incidentId: incident.id }} className="block rounded-xl border border-white/[0.07] p-3 transition-colors hover:border-white/[0.15] hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-violet-400 motion-reduce:transition-none"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-zinc-200">{incident.title}</p><span className="text-[11px] text-zinc-500">{incident.uptimePublicationState === "ignored" ? "Ignored" : incident.uptimePublicationState === "detected" ? "Private detection" : incident.status === "resolved" ? "Resolved" : "Public incident"}</span></div><p className="mt-1 text-xs text-zinc-600">{formatTime(incident.startedAt || incident.createdAt)}</p></Link>)}</div> : <p className="mt-4 text-sm text-zinc-500">No incidents recorded.</p>}</UptimePanel>
      </div>
    </>}
  </div>;
}
