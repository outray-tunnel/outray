import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { type UptimeComponent, type UptimeGroup, type UptimeMonitor, type UptimePage, uptimeApiPath, uptimeRequest, useUptimeResource } from "@/components/uptime/uptime-client";
import { fieldClass, labelClass, primaryButton, secondaryButton, StateBadge, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";
import { statusPageUrl } from "@/lib/uptime/status-url";

export const Route = createFileRoute("/$orgSlug/uptime/status-page")({
  head: () => ({ meta: [{ title: "Status page - OutRay Uptime" }] }),
  component: StatusPageBuilder,
});

const statusBase = (import.meta.env.VITE_OUTRAY_STATUS_URL || "https://status.outray.app").replace(/\/$/, "");

function StatusPageBuilder() {
  const { orgSlug } = Route.useParams();
  const pageData = useUptimeResource<{ page: UptimePage | null; groups: UptimeGroup[] }>(orgSlug, "/page");
  const monitorData = useUptimeResource<{ monitors: UptimeMonitor[] }>(orgSlug, "/monitors");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const page = pageData.data?.page;
  const groups = pageData.data?.groups || [];
  const monitors = monitorData.data?.monitors || [];

  const perform = async (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    setWorking(true); setError(null);
    try {
      await uptimeRequest(orgSlug, path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      pageData.reload();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); return false; }
    finally { setWorking(false); }
  };

  const addGroup = async (event: FormEvent) => { event.preventDefault(); if (await perform("/groups", "POST", { name: newGroup.trim() })) { setNewGroup(""); setCreatingGroup(false); } };
  const reorder = async (kind: "groups" | "components", first: { id: string; sortOrder: number }, second: { id: string; sortOrder: number }) => {
    setWorking(true); setError(null);
    try {
      await uptimeRequest(orgSlug, `/${kind}/${encodeURIComponent(first.id)}`, { method: "PATCH", body: JSON.stringify({ sortOrder: second.sortOrder }) });
      await uptimeRequest(orgSlug, `/${kind}/${encodeURIComponent(second.id)}`, { method: "PATCH", body: JSON.stringify({ sortOrder: first.sortOrder }) });
      pageData.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reorder items."); }
    finally { setWorking(false); }
  };

  return <div className="mx-auto max-w-[1320px]">
    <UptimePageHeading eyebrow="Uptime / Status page" title="Build a page around your services." description="Groups and components are customer-facing. Monitor URLs and private headers never appear on the public page." action={page?.published && <a className={secondaryButton} href={statusPageUrl(statusBase, page.slug)} target="_blank" rel="noreferrer">View public page ↗</a>} />
    {error && <div className="mb-5"><UptimeError message={error} /></div>}
    {pageData.error && <UptimeError message={pageData.error} />}
    {pageData.loading && <p className="text-sm text-zinc-500">Loading status page…</p>}
    {!pageData.loading && !page && <CreatePage orgSlug={orgSlug} onCreated={pageData.reload} />}
    {page && <>
      <PageSettings page={page} orgSlug={orgSlug} onSaved={pageData.reload} />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-semibold text-zinc-100">Groups and components</h2><p className="mt-1 text-xs text-zinc-500">The first Services group is editable. Reorder with the arrow buttons.</p></div><button type="button" className={secondaryButton} onClick={() => setCreatingGroup((value) => !value)}>Add group</button></div>
      {creatingGroup && <form onSubmit={(event) => void addGroup(event)} className="mt-4 flex flex-wrap gap-2"><input className={`${fieldClass} max-w-sm`} value={newGroup} onChange={(event) => setNewGroup(event.target.value)} placeholder="Group name" required maxLength={100} aria-label="New group name" /><button className={primaryButton} type="submit" disabled={working}>Create group</button></form>}
      <div className="mt-5 space-y-5">
        {groups.map((group, groupIndex) => <GroupEditor key={group.id} group={group} groupIndex={groupIndex} groups={groups} orgSlug={orgSlug} monitors={monitors} working={working} perform={perform} reorder={reorder} reload={pageData.reload} />)}
      </div>
      {!groups.length && <UptimePanel className="mt-5 p-6"><p className="text-sm text-zinc-500">No groups yet.</p></UptimePanel>}
      <UptimePanel className="mt-6 p-5"><h2 className="text-sm font-semibold text-zinc-200">Custom subdomain</h2><p className="mt-2 text-xs leading-5 text-zinc-500">Your page is available at its OutRay subdomain. To use one of your own, prove ownership with TXT, then add a DNS-only CNAME to status.outray.app. Tunnel domains remain separate.</p><p className="mt-3 break-all font-mono text-xs text-zinc-600">{statusPageUrl(statusBase, page.slug)}</p></UptimePanel>
    </>}
  </div>;
}

function CreatePage({ orgSlug, onCreated }: { orgSlug: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState(orgSlug.toLowerCase());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try { await uptimeRequest(orgSlug, "/page", { method: "POST", body: JSON.stringify({ name, description, slug }) }); onCreated(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create page."); }
    finally { setSaving(false); }
  };
  return <UptimePanel className="max-w-2xl p-6"><h2 className="text-lg font-semibold text-zinc-100">Create your status page</h2><p className="mt-2 text-xs text-zinc-500">One page per organization in the Uptime beta. A Services group is added automatically.</p><form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4"><label className={labelClass}>Page name<input className={`${fieldClass} mt-2`} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Acme status" /></label><label className={labelClass}>Description<textarea className={`${fieldClass} mt-2 min-h-20 py-3`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Current availability and incident updates" /></label><label className={labelClass}>Public slug<input className={`${fieldClass} mt-2`} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} required pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]" /><span className="mt-1 block break-all font-normal text-zinc-600">{statusPageUrl(statusBase, slug || "your-slug")}</span></label>{error && <UptimeError message={error} />}<button type="submit" className={primaryButton} disabled={saving}>{saving ? "Creating…" : "Create page"}</button></form></UptimePanel>;
}

function PageSettings({ page, orgSlug, onSaved }: { page: UptimePage; orgSlug: string; onSaved: () => void }) {
  const [name, setName] = useState(page.name);
  const [description, setDescription] = useState(page.description || "");
  const [accentColor, setAccentColor] = useState(page.accentColor);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setName(page.name); setDescription(page.description || ""); setAccentColor(page.accentColor); }, [page]);
  const save = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await uptimeRequest(orgSlug, "/page", { method: "PATCH", body: JSON.stringify({ name, description: description || null, accentColor }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save page."); } finally { setSaving(false); } };
  const uploadLogo = async () => { if (!logoFile) return; setSaving(true); setError(null); try { const body = new FormData(); body.set("logo", logoFile); const response = await fetch(uptimeApiPath(orgSlug, "/page/logo"), { method: "POST", credentials: "same-origin", body }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "Logo upload failed."); setLogoFile(null); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload logo."); } finally { setSaving(false); } };
  const removeLogo = async () => { setSaving(true); setError(null); try { await uptimeRequest(orgSlug, "/page/logo", { method: "DELETE" }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove logo."); } finally { setSaving(false); } };
  const publish = async () => { setSaving(true); setError(null); try { await uptimeRequest(orgSlug, "/page", { method: "PATCH", body: JSON.stringify({ published: !page.published }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change publishing state."); } finally { setSaving(false); } };
  return <UptimePanel className="p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-zinc-100">Page settings</h2><p className="mt-1 break-all font-mono text-xs text-zinc-600">{statusPageUrl(statusBase, page.slug)}</p></div><div className="flex items-center gap-3"><StateBadge state={page.published ? "operational" : "unknown"} /><button type="button" className={page.published ? secondaryButton : primaryButton} disabled={saving} onClick={() => void publish()}>{page.published ? "Unpublish" : "Publish page"}</button></div></div>
    <form onSubmit={(event) => void save(event)} className="mt-6 grid gap-4 md:grid-cols-2"><label className={labelClass}>Name<input className={`${fieldClass} mt-2`} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label><label className={labelClass}>Accent color<div className="mt-2 flex gap-2"><input className="h-10 w-14 rounded-xl border border-white/[0.1] bg-transparent p-1" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} aria-label="Accent color" /><input className={fieldClass} value={accentColor} onChange={(event) => setAccentColor(event.target.value)} pattern="#[0-9a-fA-F]{6}" /></div></label><label className={`${labelClass} md:col-span-2`}>Description<textarea className={`${fieldClass} mt-2 min-h-20 py-3`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label>{error && <div className="md:col-span-2"><UptimeError message={error} /></div>}<div className="md:col-span-2"><button type="submit" className={secondaryButton} disabled={saving}>Save page settings</button></div></form>
    <div className="mt-7 border-t border-white/[0.07] pt-6"><p className={labelClass}>Page logo</p><p className="mt-1 text-xs text-zinc-600">Upload a PNG or WebP, up to 256 KB. The image appears publicly.</p><div className="mt-3 flex flex-wrap items-center gap-3">{page.logoUrl && <img src={page.logoUrl} alt="Current page logo" className="size-12 rounded-xl object-contain" />}<input type="file" accept="image/png,image/webp" aria-label="Upload page logo" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} className="max-w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border file:border-white/[0.12] file:bg-transparent file:px-3 file:py-2 file:text-zinc-200" /><button type="button" className={secondaryButton} disabled={!logoFile || saving} onClick={() => void uploadLogo()}>Upload logo</button>{page.logoUrl && <button type="button" className={secondaryButton} disabled={saving} onClick={() => void removeLogo()}>Remove</button>}</div></div>
  </UptimePanel>;
}

interface GroupEditorProps {
  group: UptimeGroup; groupIndex: number; groups: UptimeGroup[]; orgSlug: string; monitors: UptimeMonitor[]; working: boolean;
  perform: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  reorder: (kind: "groups" | "components", first: { id: string; sortOrder: number }, second: { id: string; sortOrder: number }) => Promise<void>;
  reload: () => void;
}

function GroupEditor({ group, groupIndex, groups, orgSlug, monitors, working, perform, reorder, reload }: GroupEditorProps) {
  const [name, setName] = useState(group.name);
  const [adding, setAdding] = useState(false);
  useEffect(() => setName(group.name), [group.name]);
  const saveName = async (event: FormEvent) => { event.preventDefault(); if (name.trim() !== group.name) await perform(`/groups/${encodeURIComponent(group.id)}`, "PATCH", { name: name.trim() }); };
  return <UptimePanel className="overflow-hidden"><div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-4 md:px-5"><form onSubmit={(event) => void saveName(event)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><input className={`${fieldClass} max-w-xs font-medium`} value={name} onChange={(event) => setName(event.target.value)} aria-label="Group name" maxLength={100} required /><button type="submit" className={secondaryButton} disabled={working || name.trim() === group.name}>Rename</button></form><div className="flex flex-wrap items-center gap-2"><button type="button" className={secondaryButton} disabled={working || groupIndex === 0} onClick={() => void reorder("groups", group, groups[groupIndex - 1])} aria-label={`Move ${group.name} up`}>↑</button><button type="button" className={secondaryButton} disabled={working || groupIndex === groups.length - 1} onClick={() => void reorder("groups", group, groups[groupIndex + 1])} aria-label={`Move ${group.name} down`}>↓</button><button type="button" className={secondaryButton} disabled={working} onClick={() => void perform(`/groups/${encodeURIComponent(group.id)}`, "PATCH", { visible: !group.visible })}>{group.visible ? "Hide" : "Show"}</button></div></div>
    <div className="divide-y divide-white/[0.06]">
      {group.components.map((component, index) => <ComponentEditor key={component.id} component={component} index={index} siblings={group.components} orgSlug={orgSlug} monitors={monitors} working={working} perform={perform} reorder={reorder} reload={reload} />)}
      {!group.components.length && <p className="px-5 py-6 text-sm text-zinc-500">No components yet. Add one that customers will recognize.</p>}
    </div>
    <div className="border-t border-white/[0.07] p-4 md:px-5"><button type="button" className={secondaryButton} onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "Add component"}</button>{adding && <ComponentForm orgSlug={orgSlug} groupId={group.id} monitors={monitors} onSaved={() => { setAdding(false); reload(); }} />}</div>
  </UptimePanel>;
}

function ComponentForm({ orgSlug, groupId, monitors, onSaved, component }: { orgSlug: string; groupId: string; monitors: UptimeMonitor[]; onSaved: () => void; component?: UptimeComponent }) {
  const [name, setName] = useState(component?.name || "");
  const [description, setDescription] = useState(component?.description || "");
  const [monitorIds, setMonitorIds] = useState<string[]>(component?.monitorIds || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await uptimeRequest(orgSlug, component ? `/components/${encodeURIComponent(component.id)}` : "/components", { method: component ? "PATCH" : "POST", body: JSON.stringify({ groupId, name, description: description || null, monitorIds }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save component."); } finally { setSaving(false); } };
  return <form className="mt-4 grid gap-4 rounded-xl border border-white/[0.08] bg-black/20 p-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}><label className={labelClass}>Component name<input className={`${fieldClass} mt-2`} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="API" /></label><label className={labelClass}>Description<input className={`${fieldClass} mt-2`} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Customer-facing description" /></label><fieldset className="md:col-span-2"><legend className={labelClass}>Associated monitors</legend><p className="mt-1 text-[11px] text-zinc-600">Choose zero for a manual-only component. One monitor can feed multiple components.</p><div className="mt-3 flex flex-wrap gap-2">{monitors.map((monitor) => <label key={monitor.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.09] px-3 text-xs text-zinc-300 hover:bg-white/[0.04]"><input type="checkbox" className="size-4 accent-violet-400" checked={monitorIds.includes(monitor.id)} onChange={(event) => setMonitorIds(event.target.checked ? [...monitorIds, monitor.id] : monitorIds.filter((id) => id !== monitor.id))} />{monitor.name}</label>)}{!monitors.length && <span className="text-xs text-zinc-600">No monitors yet; this will be manual-only.</span>}</div></fieldset>{error && <div className="md:col-span-2"><UptimeError message={error} /></div>}<div className="md:col-span-2"><button className={primaryButton} type="submit" disabled={saving}>{saving ? "Saving…" : component ? "Save component" : "Create component"}</button></div></form>;
}

function ComponentEditor({ component, index, siblings, orgSlug, monitors, working, perform, reorder, reload }: { component: UptimeComponent; index: number; siblings: UptimeComponent[]; orgSlug: string; monitors: UptimeMonitor[]; working: boolean; perform: GroupEditorProps["perform"]; reorder: GroupEditorProps["reorder"]; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [manualState, setManualState] = useState<"unknown" | "operational" | "degraded" | "outage">("operational");
  const [note, setNote] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const changeManualState = async (publish: boolean) => { setSaving(true); setManualError(null); try { await uptimeRequest(orgSlug, "/incidents", { method: "POST", body: JSON.stringify({ title: `${component.name} status update`, componentIds: [component.id], note, status: manualState === "operational" ? "resolved" : "investigating", componentStates: { [component.id]: manualState }, publish }) }); setNote(""); reload(); } catch (cause) { setManualError(cause instanceof Error ? cause.message : "Could not save update."); } finally { setSaving(false); } };
  return <div className="px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h3 className="text-sm font-medium text-zinc-200">{component.name}</h3><StateBadge state={component.state} />{!component.visible && <span className="text-[11px] text-zinc-600">Hidden</span>}</div><p className="mt-1 text-xs text-zinc-500">{component.description || (component.monitorIds.length ? `${component.monitorIds.length} linked monitor${component.monitorIds.length === 1 ? "" : "s"}` : "Manual-only component")}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={secondaryButton} disabled={working || index === 0} onClick={() => void reorder("components", component, siblings[index - 1])} aria-label={`Move ${component.name} up`}>↑</button><button type="button" className={secondaryButton} disabled={working || index === siblings.length - 1} onClick={() => void reorder("components", component, siblings[index + 1])} aria-label={`Move ${component.name} down`}>↓</button><button type="button" className={secondaryButton} disabled={working} onClick={() => void perform(`/components/${encodeURIComponent(component.id)}`, "PATCH", { visible: !component.visible })}>{component.visible ? "Hide" : "Show"}</button><button type="button" className={secondaryButton} onClick={() => setEditing((value) => !value)}>{editing ? "Close" : "Edit"}</button></div></div>
    {editing && <div><ComponentForm orgSlug={orgSlug} groupId={component.groupId} monitors={monitors} component={component} onSaved={() => { setEditing(false); reload(); }} />
      {!component.monitorIds.length && <div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-400/[0.025] p-4"><h4 className="text-sm font-medium text-zinc-200">Manual status update</h4><p className="mt-1 text-xs leading-5 text-zinc-500">A draft changes nothing publicly. Publishing applies this state, records an incident update, and emails confirmed subscribers.</p><div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]"><select className={fieldClass} value={manualState} onChange={(event) => setManualState(event.target.value as typeof manualState)} aria-label="New manual state"><option value="operational">Operational</option><option value="degraded">Degraded</option><option value="outage">Outage</option><option value="unknown">Unknown</option></select><textarea className={`${fieldClass} min-h-20 py-3`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain this change to your customers" aria-label="Update note" required /></div>{manualError && <div className="mt-3"><UptimeError message={manualError} /></div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondaryButton} disabled={saving || !note.trim()} onClick={() => void changeManualState(false)}>Save draft</button><button type="button" className={primaryButton} disabled={saving || !note.trim()} onClick={() => void changeManualState(true)}>Publish update</button></div></div>}
    </div>}
  </div>;
}
