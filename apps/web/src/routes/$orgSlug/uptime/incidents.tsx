import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { formatTime, type UptimeComponent, type UptimeIncident, type UptimePage, type UptimeGroup, useUptimeResource, uptimeApiPath, uptimeRequest } from "@/components/uptime/uptime-client";
import { fieldClass, labelClass, primaryButton, secondaryButton, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";

export const Route = createFileRoute("/$orgSlug/uptime/incidents")({
  head: () => ({ meta: [{ title: "Incidents - OutRay Uptime" }] }),
  component: UptimeIncidents,
});

const incidentStatuses = ["investigating", "identified", "monitoring", "resolved"] as const;
type IncidentStatus = typeof incidentStatuses[number];

function UptimeIncidents() {
  const { orgSlug } = Route.useParams();
  const resource = useUptimeResource<{ incidents: UptimeIncident[] }>(orgSlug, "/incidents");
  const page = useUptimeResource<{ page: UptimePage | null; groups: UptimeGroup[] }>(orgSlug, "/page");
  const integrations = useUptimeResource<{ integrations: Array<{ provider: string; connectedAt: string; target?: { workspaceName?: string; channelName?: string } }>; availability: { slack: boolean; discord: boolean } }>(orgSlug, "/integrations");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<IncidentStatus>("investigating");
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const components = page.data?.groups.flatMap((group) => group.components) || [];

  const create = async (publish: boolean) => {
    setSaving(true); setError(null);
    try { await uptimeRequest(orgSlug, "/incidents", { method: "POST", body: JSON.stringify({ title, note, status, componentIds, publish }) }); setCreating(false); setTitle(""); setNote(""); setComponentIds([]); resource.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create incident."); }
    finally { setSaving(false); }
  };

  const disconnect = async (provider: string) => {
    if (!window.confirm(`Remove the ${provider} destination from Uptime?`)) return;
    try { await uptimeRequest(orgSlug, `/integrations/${provider}`, { method: "DELETE" }); integrations.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disconnect integration."); }
  };

  return <div className="mx-auto max-w-[1320px]">
    <UptimePageHeading eyebrow="Uptime / Incidents" title="Incident history" description="Automatic Down and Recovery events appear on the status page. Subscriber email is reserved for a team-published update." action={<button type="button" className={primaryButton} onClick={() => setCreating((value) => !value)}>{creating ? "Close form" : "Create manual incident"}</button>} />
    {error && <div className="mb-5"><UptimeError message={error} /></div>}
    {creating && <UptimePanel className="mb-6 p-5 md:p-7"><h2 className="text-lg font-semibold text-zinc-100">New manual incident</h2><p className="mt-1 text-xs text-zinc-500">Save a draft without public changes, or publish it to the status page and confirmed subscribers.</p><form onSubmit={(event) => { event.preventDefault(); void create(false); }} className="mt-5 space-y-5"><label className={labelClass}>Title<input className={`${fieldClass} mt-2`} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} placeholder="Checkout is experiencing errors" /></label><fieldset><legend className={labelClass}>Affected components</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{components.map((component) => <label key={component.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.09] px-3 text-xs text-zinc-300"><input className="size-4 accent-violet-400" type="checkbox" checked={componentIds.includes(component.id)} onChange={(event) => setComponentIds(event.target.checked ? [...componentIds, component.id] : componentIds.filter((id) => id !== component.id))} />{component.name}</label>)}</div>{!components.length && <p className="mt-2 text-xs text-amber-200">Create a status-page component first.</p>}</fieldset><div className="grid gap-4 md:grid-cols-[180px_1fr]"><label className={labelClass}>State<select className={`${fieldClass} mt-2`} value={status} onChange={(event) => setStatus(event.target.value as IncidentStatus)}>{incidentStatuses.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label><label className={labelClass}>Update note<textarea className={`${fieldClass} mt-2 min-h-24 py-3`} value={note} onChange={(event) => setNote(event.target.value)} required maxLength={4000} placeholder="What happened and what are you doing?" /></label></div><div className="flex flex-wrap gap-2"><button className={secondaryButton} type="submit" disabled={saving || !componentIds.length}>Save draft</button><button className={primaryButton} type="button" disabled={saving || !componentIds.length || !page.data?.page?.published || !title.trim() || !note.trim()} onClick={() => void create(true)}>Publish incident</button></div>{!page.data?.page?.published && <p className="text-xs text-zinc-600">Publish your status page before publishing an incident update.</p>}</form></UptimePanel>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
      <UptimePanel className="overflow-hidden"><div className="border-b border-white/[0.07] px-5 py-4"><h2 className="text-sm font-semibold text-zinc-200">All incidents</h2></div>{resource.loading && <p className="p-5 text-sm text-zinc-500">Loading incidents…</p>}{resource.error && <div className="p-5"><UptimeError message={resource.error} /></div>}{!resource.loading && !resource.error && !resource.data?.incidents.length && <p className="p-5 text-sm text-zinc-500">No incidents recorded.</p>}{resource.data?.incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} components={components} orgSlug={orgSlug} onSaved={resource.reload} pagePublished={!!page.data?.page?.published} />)}</UptimePanel>
      <UptimePanel className="p-5"><h2 className="text-sm font-semibold text-zinc-200">Team notification channels</h2><p className="mt-2 text-xs leading-5 text-zinc-500">Email recipients are selected per monitor. Slack and Discord are connected once for this Uptime workspace, separate from Observability.</p><div className="mt-5 space-y-3">{(["slack", "discord"] as const).map((provider) => { const connection = integrations.data?.integrations.find((item) => item.provider === provider); const available = integrations.data?.availability[provider]; return <div key={provider} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.09] p-3"><div className="flex items-center gap-3"><img src={`/logos/${provider}.svg`} alt="" className="size-6 object-contain" /><div><p className="text-sm font-medium capitalize text-zinc-200">{provider}</p><p className="text-[11px] text-zinc-600">{connection ? `${connection.target?.workspaceName || "Connected"}${connection.target?.channelName ? ` · #${connection.target.channelName}` : ""}` : available ? "Not connected" : "Not configured"}</p></div></div>{connection ? <div className="flex gap-2"><a className={secondaryButton} href={uptimeApiPath(orgSlug, `/integrations/${provider}/start`)}>Change channel</a><button type="button" className={secondaryButton} onClick={() => void disconnect(provider)}>Remove</button></div> : <a className={secondaryButton} href={available ? uptimeApiPath(orgSlug, `/integrations/${provider}/start`) : undefined} aria-disabled={!available} onClick={(event) => { if (!available) event.preventDefault(); }}>Connect</a>}</div>; })}</div></UptimePanel>
    </div>
  </div>;
}

function IncidentCard({ incident, components, orgSlug, onSaved, pagePublished }: { incident: UptimeIncident; components: UptimeComponent[]; orgSlug: string; onSaved: () => void; pagePublished: boolean }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<IncidentStatus>("monitoring");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manual = incident.sourceType === "uptime_manual";
  const affected = components.filter((component) => incident.componentIds?.includes(component.id));
  const addUpdate = async (publish: boolean) => { setSaving(true); setError(null); try { await uptimeRequest(orgSlug, `/incidents/${encodeURIComponent(incident.id)}/updates`, { method: "POST", body: JSON.stringify({ note, status, publish }) }); setNote(""); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save update."); } finally { setSaving(false); } };
  const publishDraft = async (updateId: string) => { setSaving(true); setError(null); try { await uptimeRequest(orgSlug, `/incidents/${encodeURIComponent(incident.id)}/updates/${encodeURIComponent(updateId)}`, { method: "PATCH", body: JSON.stringify({ publish: true }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish update."); } finally { setSaving(false); } };
  return <article className="border-b border-white/[0.07] p-5 last:border-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-medium text-zinc-200">{incident.title}</h3><p className="mt-1 text-xs text-zinc-600">{formatTime(incident.startedAt || incident.createdAt)} · {manual ? "Manual" : "Automatic"}</p>{affected.length > 0 && <p className="mt-2 text-xs text-zinc-500">Affects {affected.map((component) => component.name).join(", ")}</p>}</div><span className={`rounded-full border px-2.5 py-1 text-[11px] ${incident.status === "resolved" ? "border-emerald-400/20 text-emerald-300" : "border-amber-400/20 text-amber-300"}`}>{incident.status === "resolved" ? "Resolved" : "Open"}</span></div>
    {incident.updates?.length ? <div className="mt-4 space-y-2">{incident.updates.map((update) => <div key={update.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium capitalize text-zinc-300">{update.status} · {update.publishedAt ? "Published" : "Draft"}</p><span className="text-[11px] text-zinc-600">{formatTime(update.createdAt)}</span></div><p className="mt-2 text-xs leading-5 text-zinc-500">{update.note}</p>{manual && !update.publishedAt && <button type="button" className={`${secondaryButton} mt-3`} disabled={saving || !pagePublished} onClick={() => void publishDraft(update.id)}>Publish draft</button>}</div>)}</div> : null}
    {manual && incident.status !== "resolved" && <details className="mt-4"><summary className="cursor-pointer text-xs text-zinc-300 hover:text-white">Add update</summary><div className="mt-4 grid gap-3"><select className={fieldClass} aria-label="Incident update state" value={status} onChange={(event) => setStatus(event.target.value as IncidentStatus)}>{incidentStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select><textarea className={`${fieldClass} min-h-20 py-3`} aria-label="Incident update note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed?" maxLength={4000} /><div className="flex gap-2"><button type="button" className={secondaryButton} disabled={saving || !note.trim()} onClick={() => void addUpdate(false)}>Save draft</button><button type="button" className={primaryButton} disabled={saving || !note.trim() || !pagePublished} onClick={() => void addUpdate(true)}>Publish update</button></div>{error && <UptimeError message={error} />}</div></details>}
  </article>;
}
