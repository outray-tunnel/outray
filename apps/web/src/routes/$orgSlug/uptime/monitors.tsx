import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { UptimeEmailRecipients } from "@/components/uptime/email-recipients";
import { IncidentPublishingFields, type IncidentPublishingMode } from "@/components/uptime/incident-publishing-fields";
import { type UptimeMonitor, useUptimeResource, uptimeRequest, formatTime } from "@/components/uptime/uptime-client";
import { UptimeRowsSkeleton, UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { fieldClass, labelClass, primaryButton, secondaryButton, StateBadge, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";

export const Route = createFileRoute("/$orgSlug/uptime/monitors")({
  head: () => ({ meta: [{ title: "Monitors - OutRay Uptime" }] }),
  component: UptimeMonitors,
});

function parseHeaderLines(input: string) {
  const headers: Record<string, string> = {};
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error("Each header needs a name and value separated by a colon.");
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!name || !value) throw new Error("Header names and values cannot be empty.");
    headers[name] = value;
  }
  return headers;
}

function UptimeMonitors() {
  const { orgSlug } = Route.useParams();
  const resource = useUptimeResource<{ monitors: UptimeMonitor[]; limit: number }>(orgSlug, "/monitors");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "HEAD">("GET");
  const [statusMode, setStatusMode] = useState<"range" | "exact">("range");
  const [expectedStatus, setExpectedStatus] = useState("200");
  const [responseText, setResponseText] = useState("");
  const [headers, setHeaders] = useState("");
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [incidentPublishing, setIncidentPublishing] = useState<IncidentPublishingMode>("manual");
  const [publishAfterMinutes, setPublishAfterMinutes] = useState(5);
  const rows = resource.data?.monitors ?? [];
  const atLimit = rows.length >= (resource.data?.limit ?? 10);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const parsedHeaders = parseHeaderLines(headers);
      await uptimeRequest(orgSlug, "/monitors", { method: "POST", body: JSON.stringify({
        name: name.trim(), url: url.trim(), method,
        headers: parsedHeaders,
        expectedStatus: statusMode === "exact" ? Number(expectedStatus) : null,
        responseText: method === "GET" && responseText.trim() ? responseText : null,
        notificationEmails,
        failureThreshold, incidentPublishing, publishAfterMinutes,
      }) });
      setCreating(false);
      setName(""); setUrl(""); setHeaders(""); setResponseText(""); setNotificationEmails([]);
      setFailureThreshold(3); setIncidentPublishing("manual"); setPublishAfterMinutes(5);
      resource.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create monitor."); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-[1320px]">
    <UptimePageHeading title="Endpoint monitors" description="Probe public HTTP(S) endpoints once per minute from one region. Choose how many failures confirm Down and when to publish an incident." action={<button type="button" className={primaryButton} disabled={atLimit || (resource.loading && !resource.data)} onClick={() => setCreating((value) => !value)}>{creating ? "Close form" : "Add monitor"}</button>} />
    {resource.data && atLimit && <p className="mb-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-xs text-amber-200">This workspace has reached the beta limit of {resource.data.limit} monitors.</p>}
    {creating && <UptimePanel className="mb-6 p-5 md:p-7"><h2 className="text-lg font-semibold text-zinc-100">New monitor</h2><p className="mt-2 text-xs text-zinc-500">Header values are encrypted at rest and never shown again after saving.</p>
      <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-5 md:grid-cols-2">
        <label className={labelClass}>Name<input className={`${fieldClass} mt-2`} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="API" /></label>
        <label className={labelClass}>Public URL<input className={`${fieldClass} mt-2`} value={url} onChange={(event) => setUrl(event.target.value)} required type="url" placeholder="https://api.example.com/health" /></label>
        <label className={labelClass}>Method<select className={`${fieldClass} mt-2`} value={method} onChange={(event) => setMethod(event.target.value as "GET" | "HEAD")}><option value="GET">GET</option><option value="HEAD">HEAD</option></select></label>
        <div><label className={labelClass} htmlFor="uptime-status-mode">Expected status</label><div className="mt-2 flex gap-2"><select id="uptime-status-mode" className={fieldClass} value={statusMode} onChange={(event) => setStatusMode(event.target.value as "range" | "exact")}><option value="range">Any 200–399</option><option value="exact">Exact code</option></select>{statusMode === "exact" && <input className={`${fieldClass} max-w-24`} aria-label="Exact status code" type="number" min={100} max={599} value={expectedStatus} onChange={(event) => setExpectedStatus(event.target.value)} required />}</div></div>
        {method === "GET" && <label className={`${labelClass} md:col-span-2`}>Response text (optional)<input className={`${fieldClass} mt-2`} value={responseText} onChange={(event) => setResponseText(event.target.value)} maxLength={500} placeholder="healthy" /><span className="mt-1 block text-[11px] font-normal text-zinc-600">Literal, case-sensitive match. Response content is never stored.</span></label>}
        <label className={`${labelClass} md:col-span-2`}>Headers (optional)<textarea className={`${fieldClass} mt-2 min-h-24 resize-y py-3 font-mono text-xs`} value={headers} onChange={(event) => setHeaders(event.target.value)} placeholder="Authorization: Bearer …" /><span className="mt-1 block text-[11px] font-normal text-zinc-600">One Name: Value per line. Proxy, Host, and connection-control headers are rejected.</span></label>
        <div className="md:col-span-2"><UptimeEmailRecipients orgSlug={orgSlug} value={notificationEmails} onChange={setNotificationEmails} /></div>
        <IncidentPublishingFields failureThreshold={failureThreshold} onFailureThresholdChange={setFailureThreshold} mode={incidentPublishing} onModeChange={setIncidentPublishing} publishAfterMinutes={publishAfterMinutes} onPublishAfterMinutesChange={setPublishAfterMinutes} />
        <div className="md:col-span-2">{error && <UptimeError message={error} />}<div className="mt-5 flex flex-wrap gap-3"><button type="submit" className={primaryButton} disabled={saving || atLimit}>{saving ? "Creating…" : "Create monitor"}</button><button type="button" className={secondaryButton} onClick={() => setCreating(false)}>Cancel</button></div></div>
      </form>
    </UptimePanel>}
    <UptimePanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><h2 className="text-sm font-semibold text-zinc-200">All monitors</h2>{resource.data ? <span className="text-xs text-zinc-600">{rows.length} / {resource.data.limit}</span> : <span className="h-3 w-10 rounded bg-white/[0.04]" aria-hidden="true" />}</div>
      {resource.error && <div className="p-5"><UptimeError message={resource.error} /></div>}
      {resource.loading && !resource.data && <UptimeSkeleton label="Loading monitors"><UptimeRowsSkeleton rows={5} /></UptimeSkeleton>}
      {!resource.loading && !resource.error && rows.length === 0 && <div className="p-8 text-center"><p className="text-sm text-zinc-400">No monitors yet.</p><p className="mt-2 text-xs text-zinc-600">A new monitor stays Unknown until a check runs.</p></div>}
      {rows.map((monitor) => <Link key={monitor.id} to="/$orgSlug/uptime/monitors/$monitorId" params={{ orgSlug, monitorId: monitor.id }} className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4 last:border-0 hover:bg-white/[0.025]"><span className="min-w-0"><span className="block text-sm font-medium text-zinc-100">{monitor.name}</span><span className="mt-1 block max-w-[520px] truncate font-mono text-xs text-zinc-600">{monitor.method} {monitor.url}</span><span className="mt-2 block text-[11px] text-zinc-600">Last checked {formatTime(monitor.lastCheckedAt)}</span></span><StateBadge state={monitor.state} /></Link>)}
    </UptimePanel>
  </div>;
}
