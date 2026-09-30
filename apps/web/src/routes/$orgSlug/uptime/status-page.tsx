import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { Activity, ArrowUpRight, Check, ChevronDown, ExternalLink, Folder, Globe2, GripVertical, Layers3, MoreHorizontal, Palette, Plus, Radio } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type UptimeComponent, type UptimeGroup, type UptimeMonitor, type UptimePage, uptimeApiPath, uptimeRequest, useUptimeResource } from "@/components/uptime/uptime-client";
import { StatusPageEditorContext, useStatusPageEditor } from "@/components/uptime/status-page-editor-context";
import { fieldClass, labelClass, primaryButton, secondaryButton, StateBadge, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";
import { statusPageUrl } from "@/lib/uptime/status-url";
import { moveStatusLayout, type StatusLayout } from "@/lib/uptime/status-layout";

export const Route = createFileRoute("/$orgSlug/uptime/status-page")({
  head: () => ({ meta: [{ title: "Status page - OutRay Uptime" }] }),
  component: StatusPageLayout,
});

const statusBase = (import.meta.env.VITE_OUTRAY_STATUS_URL || "https://status.outray.app").replace(/\/$/, "");

const editorTabs = [
  { label: "Overview", to: "/$orgSlug/uptime/status-page", icon: Layers3 },
  { label: "Components", to: "/$orgSlug/uptime/status-page/components", icon: Radio },
  { label: "Appearance", to: "/$orgSlug/uptime/status-page/appearance", icon: Palette },
  { label: "Publishing", to: "/$orgSlug/uptime/status-page/publishing", icon: Globe2 },
] as const;

function StatusPageLayout() {
  const { orgSlug } = Route.useParams();
  const pageData = useUptimeResource<{ page: UptimePage | null; groups: UptimeGroup[]; standaloneComponents: UptimeComponent[] }>(orgSlug, "/page");
  const monitorData = useUptimeResource<{ monitors: UptimeMonitor[] }>(orgSlug, "/monitors");
  const page = pageData.data?.page;
  const groups = pageData.data?.groups || [];
  const standaloneComponents = pageData.data?.standaloneComponents || [];
  const monitors = monitorData.data?.monitors || [];

  return <div className="mx-auto max-w-[1280px] pb-12">
    {pageData.error && <UptimeError message={pageData.error} />}
    {pageData.loading && !page && <p className="text-sm text-zinc-500">Loading status page…</p>}
    {!pageData.loading && !pageData.error && !page && <><UptimePageHeading eyebrow="Uptime / Status page" title="Create a status page" description="Give customers a clear view of your service health." /><CreatePage orgSlug={orgSlug} onCreated={pageData.reload} /></>}
    {page && <StatusPageEditorContext.Provider value={{ orgSlug, page, groups, standaloneComponents, monitors, reload: pageData.reload }}>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Uptime / Status page</p>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-[28px] font-medium tracking-[-0.035em] text-zinc-100 md:text-[32px]">{page.name}</h1><span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${page.published ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300" : "border-white/[0.1] bg-white/[0.04] text-zinc-400"}`}>{page.published ? "Published" : "Draft"}</span></div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">Manage the components, appearance, and public access for this page.</p>
        </div>
        {page.published && <a className={`${secondaryButton} gap-2`} href={statusPageUrl(statusBase, page.slug)} target="_blank" rel="noopener noreferrer">View page <ExternalLink size={14} aria-hidden="true" /></a>}
      </header>
      <nav aria-label="Status page sections" className="mb-8 flex gap-1 overflow-x-auto border-b border-white/[0.08]">
        {editorTabs.map(({ label, to, icon: Icon }) => <Link key={label} to={to} params={{ orgSlug }} activeOptions={{ exact: true }} className="inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-4 text-[13px] text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-violet-400" activeProps={{ className: "!border-violet-400 !text-white" }}><Icon size={15} strokeWidth={1.8} aria-hidden="true" />{label}</Link>)}
      </nav>
      <Outlet />
    </StatusPageEditorContext.Provider>}
  </div>;
}

export function StatusPageOverview() {
  const { orgSlug, page, groups, standaloneComponents, monitors } = useStatusPageEditor();
  const visible = [
    ...standaloneComponents.filter((component) => component.visible),
    ...groups.filter((group) => group.visible).flatMap((group) => group.components.filter((component) => component.visible)),
  ];
  const linked = visible.filter((component) => component.monitorIds.length > 0);
  const publicUrl = statusPageUrl(statusBase, page.slug);
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Visible components", value: visible.length, detail: `${standaloneComponents.filter((component) => component.visible).length} standalone · ${groups.filter((group) => group.visible).length} groups` }, { label: "Connected monitors", value: new Set(linked.flatMap((component) => component.monitorIds)).size, detail: `of ${monitors.length} monitors` }, { label: "Page visibility", value: page.published ? "Live" : "Draft", detail: page.published ? "Available to visitors" : "Only your team can edit it" }].map((item) => <UptimePanel key={item.label} className="p-5"><p className="text-xs text-zinc-500">{item.label}</p><p className="mt-3 text-2xl font-medium tracking-tight text-white">{item.value}</p><p className="mt-1 text-xs text-zinc-600">{item.detail}</p></UptimePanel>)}
    </div>
    <UptimePanel className="overflow-hidden"><div className="border-b border-white/[0.07] px-6 py-5"><h2 className="text-base font-medium text-white">Your status page</h2><p className="mt-1 text-sm text-zinc-500">A customer-facing view of service health and published incidents.</p></div><div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><div className="min-w-0"><p className="text-xs text-zinc-500">OutRay address</p><p className="mt-2 break-all font-mono text-sm text-zinc-200">{publicUrl}</p><p className="mt-3 text-xs text-zinc-500">{page.published ? "The page is visible to anyone with this link." : "Publish the page when you're ready for visitors."}</p></div><Link to="/$orgSlug/uptime/status-page/publishing" params={{ orgSlug }} className={`${page.published ? secondaryButton : primaryButton} gap-2`}>{page.published ? "Publishing settings" : "Review and publish"}<ArrowUpRight size={15} aria-hidden="true" /></Link></div></UptimePanel>
    <div className="grid gap-4 md:grid-cols-2">
      <Link to="/$orgSlug/uptime/status-page/components" params={{ orgSlug }} className="group rounded-[20px] border border-white/[0.08] bg-[#0d0d0f] p-6 transition-colors hover:border-white/[0.16] hover:bg-white/[0.035] focus-visible:outline-2 focus-visible:outline-violet-400"><Layers3 size={19} className="text-zinc-400" aria-hidden="true" /><div className="mt-5 flex items-center justify-between gap-3"><h2 className="text-base font-medium text-white">Components</h2><ArrowUpRight size={17} className="text-zinc-600 transition-colors group-hover:text-white" aria-hidden="true" /></div><p className="mt-2 text-sm leading-6 text-zinc-500">Organize the services customers recognize and link monitors to them.</p></Link>
      <Link to="/$orgSlug/uptime/status-page/appearance" params={{ orgSlug }} className="group rounded-[20px] border border-white/[0.08] bg-[#0d0d0f] p-6 transition-colors hover:border-white/[0.16] hover:bg-white/[0.035] focus-visible:outline-2 focus-visible:outline-violet-400"><Palette size={19} className="text-zinc-400" aria-hidden="true" /><div className="mt-5 flex items-center justify-between gap-3"><h2 className="text-base font-medium text-white">Appearance</h2><ArrowUpRight size={17} className="text-zinc-600 transition-colors group-hover:text-white" aria-hidden="true" /></div><p className="mt-2 text-sm leading-6 text-zinc-500">Set the public name, description, logo, and accent color.</p></Link>
    </div>
  </div>;
}

export function StatusPageComponents() {
  const { orgSlug, groups, standaloneComponents, monitors, reload } = useStatusPageEditor();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingComponent, setCreatingComponent] = useState(false);
  const [draggingComponent, setDraggingComponent] = useState(false);
  const initialLayout = useMemo<StatusLayout>(() => ({
    root: [
      ...standaloneComponents.map((component) => ({ key: `component:${component.id}`, order: component.sortOrder })),
      ...groups.map((group) => ({ key: `group:${group.id}`, order: group.sortOrder })),
    ].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)).map((item) => item.key),
    groups: Object.fromEntries(groups.map((group) => [group.id, group.components.map((component) => `component:${component.id}`)])),
  }), [groups, standaloneComponents]);
  const [layout, setLayout] = useState<StatusLayout>(initialLayout);
  useEffect(() => setLayout(initialLayout), [initialLayout]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const componentById = useMemo(() => new Map([...standaloneComponents, ...groups.flatMap((group) => group.components)].map((component) => [component.id, component])), [groups, standaloneComponents]);
  const perform = async (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    setWorking(true); setError(null);
    try { await uptimeRequest(orgSlug, path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); reload(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); return false; }
    finally { setWorking(false); }
  };
  const addGroup = async (event: FormEvent) => { event.preventDefault(); if (await perform("/groups", "POST", { name: newGroup.trim() })) { setNewGroup(""); setCreatingGroup(false); } };
  const saveLayout = async (next: StatusLayout) => {
    setWorking(true); setError(null); setLayout(next);
    try { await uptimeRequest(orgSlug, "/page/layout", { method: "PATCH", body: JSON.stringify(next) }); reload(); }
    catch (cause) { setLayout(layout); setError(cause instanceof Error ? cause.message : "Could not reorder items."); }
    finally { setWorking(false); }
  };
  const move = (id: string, from: string, to: string, index: number) => {
    const next = moveStatusLayout(layout, id, from, to, index);
    if (next && JSON.stringify(next) !== JSON.stringify(layout)) void saveLayout(next);
  };
  return <div>
    <div className="mb-6"><h2 className="text-xl font-medium tracking-tight text-white">Groups and components</h2><p className="mt-1 text-sm text-zinc-500">Drag the handle to reorder or move a component into or out of a group.</p></div>
    {error && <div className="mb-4"><UptimeError message={error} /></div>}
    {creatingGroup && <form onSubmit={(event) => void addGroup(event)} className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.025] p-4"><input className={`${fieldClass} max-w-sm`} value={newGroup} onChange={(event) => setNewGroup(event.target.value)} placeholder="Group name" required maxLength={100} aria-label="New group name" autoFocus /><button className={primaryButton} type="submit" disabled={working}>Create group</button><button className={secondaryButton} type="button" onClick={() => setCreatingGroup(false)}>Cancel</button></form>}
    <DragDropProvider
      onDragStart={({ operation }) => setDraggingComponent(String(operation.source?.id || "").startsWith("component:"))}
      onDragEnd={({ operation, canceled }) => {
        setDraggingComponent(false);
        if (canceled || !operation.source || !isSortable(operation.source)) return;
        const source = operation.source;
        const from = String(source.initialGroup || "root");
        const target = operation.target;
        if (!target || target.id === source.id) return;
        const to = isSortable(target) ? String(target.group || "root") : String(target.id);
        if (to !== "root" && !groupById.has(to)) return;
        const index = isSortable(target) ? target.index
          : to === "root" ? layout.root.length : (layout.groups[to]?.length || 0);
        move(String(source.id), from, to, index);
      }}
    >
      <UptimePanel className="overflow-visible">
        <RootDropZone draggingComponent={draggingComponent}>
          {layout.root.map((key, index) => {
            if (key.startsWith("group:")) {
              const group = groupById.get(key.slice(6));
              if (!group) return null;
              const children = (layout.groups[group.id] || []).map((item) => componentById.get(item.slice(10))).filter((item): item is UptimeComponent => !!item);
              return <GroupEditor key={key} group={group} components={children} index={index} groups={groups} orgSlug={orgSlug} monitors={monitors} working={working} perform={perform} move={move} reload={reload} draggingComponent={draggingComponent} />;
            }
            const component = componentById.get(key.slice(10));
            return component ? <ComponentEditor key={key} component={component} index={index} container="root" groups={groups} orgSlug={orgSlug} monitors={monitors} working={working} perform={perform} move={move} reload={reload} /> : null;
          })}
          {!layout.root.length && <p className="p-8 text-center text-sm text-zinc-500">No components yet. Add one below to start your status page.</p>}
        </RootDropZone>
      </UptimePanel>
    </DragDropProvider>
    {creatingComponent && <div className="mt-4"><ComponentForm orgSlug={orgSlug} groupId={null} groups={groups} monitors={monitors} onSaved={() => { setCreatingComponent(false); reload(); }} onCancel={() => setCreatingComponent(false)} /></div>}
    <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={`${secondaryButton} gap-2`} onClick={() => { setCreatingComponent((value) => !value); setCreatingGroup(false); }} aria-expanded={creatingComponent}><Plus size={16} aria-hidden="true" />Add component</button><button type="button" className={`${secondaryButton} gap-2`} onClick={() => { setCreatingGroup((value) => !value); setCreatingComponent(false); }} aria-expanded={creatingGroup}><Plus size={16} aria-hidden="true" />Add group</button></div>
  </div>;
}

function RootDropZone({ children, draggingComponent }: { children: ReactNode; draggingComponent: boolean }) {
  const drop = useDroppable({ id: "root", accept: ["component", "group"], collisionPriority: -1 });
  return <div ref={drop.ref} className={`divide-y divide-white/[0.06] rounded-[19px] [&>*:first-child]:rounded-t-[19px] [&>*:last-child]:rounded-b-[19px] ${drop.isDropTarget ? "bg-violet-400/[0.025]" : ""}`}>
    {children}
    {draggingComponent && <div className={`px-5 py-4 text-center text-xs ${drop.isDropTarget ? "text-violet-300" : "text-zinc-600"}`}>Drop here to make a component standalone</div>}
  </div>;
}

export function StatusPageAppearance() {
  const { page, orgSlug, reload } = useStatusPageEditor();
  return <div><div className="mb-6"><h2 className="text-xl font-medium tracking-tight text-white">Appearance</h2><p className="mt-1 text-sm text-zinc-500">Give the public page a name and look your customers will recognize.</p></div><PageSettings page={page} orgSlug={orgSlug} onSaved={reload} /></div>;
}

export function StatusPagePublishing() {
  const { page, orgSlug, reload } = useStatusPageEditor();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicUrl = statusPageUrl(statusBase, page.slug);
  const publish = async () => { setSaving(true); setError(null); try { await uptimeRequest(orgSlug, "/page", { method: "PATCH", body: JSON.stringify({ published: !page.published }) }); reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change publishing state."); } finally { setSaving(false); } };
  return <div className="max-w-4xl"><div className="mb-6"><h2 className="text-xl font-medium tracking-tight text-white">Publishing</h2><p className="mt-1 text-sm text-zinc-500">Control when the page is public and where visitors find it.</p></div>{error && <div className="mb-4"><UptimeError message={error} /></div>}
    <UptimePanel className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-5 p-6"><div className="flex items-start gap-4"><div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${page.published ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.05] text-zinc-400"}`}>{page.published ? <Check size={20} aria-hidden="true" /> : <Globe2 size={20} aria-hidden="true" />}</div><div><h3 className="text-base font-medium text-white">{page.published ? "Your page is published" : "Your page is a draft"}</h3><p className="mt-1 max-w-lg text-sm leading-6 text-zinc-500">{page.published ? "Visitors can view current component health and published incident updates." : "Finish your components and appearance, then publish when you're ready."}</p></div></div><button type="button" className={page.published ? secondaryButton : primaryButton} disabled={saving} onClick={() => void publish()}>{saving ? "Saving…" : page.published ? "Unpublish page" : "Publish page"}</button></div></UptimePanel>
    <UptimePanel className="mt-5 p-6"><h3 className="text-base font-medium text-white">OutRay address</h3><p className="mt-1 text-sm text-zinc-500">This address is reserved for your page, even while it is a draft.</p><div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.09] bg-black/20 px-4 py-3"><span className="min-w-0 break-all font-mono text-sm text-zinc-200">{publicUrl}</span>{page.published && <a className="inline-flex shrink-0 items-center gap-1.5 text-xs text-zinc-300 hover:text-white" href={publicUrl} target="_blank" rel="noopener noreferrer">Open <ExternalLink size={14} aria-hidden="true" /></a>}</div></UptimePanel>
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
  const [saved, setSaved] = useState(false);
  useEffect(() => { setName(page.name); setDescription(page.description || ""); setAccentColor(page.accentColor); }, [page]);
  const save = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); setSaved(false); try { await uptimeRequest(orgSlug, "/page", { method: "PATCH", body: JSON.stringify({ name, description: description || null, accentColor }) }); setSaved(true); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save page."); } finally { setSaving(false); } };
  const uploadLogo = async () => { if (!logoFile) return; setSaving(true); setError(null); try { const body = new FormData(); body.set("logo", logoFile); const response = await fetch(uptimeApiPath(orgSlug, "/page/logo"), { method: "POST", credentials: "same-origin", body }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "Logo upload failed."); setLogoFile(null); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload logo."); } finally { setSaving(false); } };
  const removeLogo = async () => { setSaving(true); setError(null); try { await uptimeRequest(orgSlug, "/page/logo", { method: "DELETE" }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove logo."); } finally { setSaving(false); } };
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
    <UptimePanel className="p-6 md:p-7">
      <h3 className="text-base font-medium text-white">Page details</h3><p className="mt-1 text-sm text-zinc-500">These details are visible to visitors.</p>
      <form onSubmit={(event) => void save(event)} className="mt-7 space-y-5">
        <label className={labelClass}>Page name<input className={`${fieldClass} mt-2`} value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} required maxLength={120} /></label>
        <label className={labelClass}>Description<textarea className={`${fieldClass} mt-2 min-h-28 py-3`} value={description} onChange={(event) => { setDescription(event.target.value); setSaved(false); }} maxLength={1000} placeholder="Tell visitors what this page covers" /></label>
        <div><p className={labelClass}>Accent color</p><p className="mt-1 text-xs text-zinc-500">Used for highlights on your public page.</p><div className="mt-3 flex max-w-xs items-center gap-3"><input className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-white/[0.12] bg-transparent p-1" type="color" value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : page.accentColor} onChange={(event) => { setAccentColor(event.target.value); setSaved(false); }} aria-label="Choose accent color" /><input className={fieldClass} value={accentColor} onChange={(event) => { setAccentColor(event.target.value); setSaved(false); }} pattern="#[0-9a-fA-F]{6}" aria-label="Accent color hex value" /></div></div>
        {error && <UptimeError message={error} />}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-5"><button type="submit" className={primaryButton} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>{saved && <span role="status" className="inline-flex items-center gap-1.5 text-xs text-emerald-300"><Check size={14} aria-hidden="true" />Saved</span>}</div>
      </form>
    </UptimePanel>
    <UptimePanel className="p-6"><h3 className="text-base font-medium text-white">Logo</h3><p className="mt-1 text-sm leading-6 text-zinc-500">Upload a PNG or WebP up to 256 KB. It appears beside your page name.</p><div className="mt-6 flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.04]">{page.logoUrl ? <img src={page.logoUrl} alt="Current page logo" className="size-full object-contain" /> : <span className="text-2xl font-medium text-zinc-500" aria-label="No logo uploaded">{page.name.slice(0, 1).toUpperCase()}</span>}</div><input type="file" accept="image/png,image/webp" aria-label="Upload page logo" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} className="mt-5 max-w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border file:border-white/[0.12] file:bg-transparent file:px-3 file:py-2 file:text-zinc-200" /><div className="mt-4 flex flex-wrap gap-2"><button type="button" className={secondaryButton} disabled={!logoFile || saving} onClick={() => void uploadLogo()}>Upload logo</button>{page.logoUrl && <button type="button" className={secondaryButton} disabled={saving} onClick={() => void removeLogo()}>Remove logo</button>}</div></UptimePanel>
  </div>;
}

interface GroupEditorProps {
  group: UptimeGroup; components: UptimeComponent[]; index: number; groups: UptimeGroup[]; orgSlug: string; monitors: UptimeMonitor[]; working: boolean; draggingComponent: boolean;
  perform: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  move: (id: string, from: string, to: string, index: number) => void;
  reload: () => void;
}

function GroupEditor({ group, components, index, groups, orgSlug, monitors, working, perform, move, reload, draggingComponent }: GroupEditorProps) {
  const [name, setName] = useState(group.name);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const open = expanded || draggingComponent;
  const sortable = useSortable({ id: `group:${group.id}`, index, group: "root", type: "group", accept: ["group", "component"], disabled: working, plugins: [SortableKeyboardPlugin] });
  const drop = useDroppable({ id: group.id, accept: "component", collisionPriority: -1 });
  const saveName = async (event: FormEvent) => { event.preventDefault(); if (name.trim() === group.name || await perform(`/groups/${encodeURIComponent(group.id)}`, "PATCH", { name: name.trim() })) setRenaming(false); };
  return <div ref={sortable.sourceRef} className={`${sortable.isDragging ? "z-10 opacity-60" : ""} ${sortable.isDropTarget ? "bg-violet-400/[0.045]" : ""}`}>
    <div ref={sortable.targetRef} className="flex min-h-[58px] items-center gap-2 px-3 py-2 md:px-4">
      <DragHandle refCallback={sortable.handleRef} label={`Drag ${group.name} group`} disabled={working} />
      <RowAction label={`${open ? "Collapse" : "Expand"} ${group.name}`} onClick={() => setExpanded((value) => !value)} controls={`status-group-${group.id}`} expanded={open}><ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} /></RowAction>
      <Folder size={16} className="shrink-0 text-zinc-600" aria-hidden="true" />
      <div className="min-w-0 flex-1 pl-1"><h3 className="truncate text-sm font-medium text-zinc-100">{group.name}</h3></div>
      <span className="hidden text-xs text-zinc-600 sm:block">{components.length} {components.length === 1 ? "component" : "components"}{!group.visible ? " · Hidden" : ""}</span>
      <RowMenu label={`${group.name} actions`} items={[
        { label: "Add component", action: () => { setExpanded(true); setAdding(true); } },
        { label: "Rename group", action: () => { setName(group.name); setRenaming(true); } },
        { label: group.visible ? "Hide group" : "Show group", action: () => void perform(`/groups/${encodeURIComponent(group.id)}`, "PATCH", { visible: !group.visible }) },
        ...(components.length === 0 ? [{ label: "Delete empty group", danger: true, action: () => { if (window.confirm(`Delete the empty group “${group.name}”?`)) void perform(`/groups/${encodeURIComponent(group.id)}`, "DELETE"); } }] : []),
      ]} />
    </div>
    {renaming && <form onSubmit={(event) => void saveName(event)} className="flex flex-wrap gap-2 border-t border-white/[0.07] bg-white/[0.015] px-5 py-4"><input className={`${fieldClass} max-w-xs`} value={name} onChange={(event) => setName(event.target.value)} aria-label="Group name" maxLength={100} required autoFocus /><button type="submit" className={primaryButton} disabled={working || !name.trim()}>Save name</button><button type="button" className={secondaryButton} onClick={() => { setName(group.name); setRenaming(false); }}>Cancel</button></form>}
    <div id={`status-group-${group.id}`} hidden={!open} className="border-t border-white/[0.06] py-2 pl-8 pr-2 md:pl-10">
      <div ref={drop.ref} className={`divide-y divide-white/[0.05] rounded-xl border border-white/[0.04] bg-black/15 [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl ${drop.isDropTarget ? "bg-violet-400/[0.05]" : ""}`}>
        {components.map((component, childIndex) => <ComponentEditor key={component.id} component={component} index={childIndex} container={group.id} groups={groups} orgSlug={orgSlug} monitors={monitors} working={working} perform={perform} move={move} reload={reload} />)}
        {!components.length && <p className="px-5 py-4 text-xs text-zinc-600">Drag a component here, or add one.</p>}
      </div>
      {adding && <ComponentForm orgSlug={orgSlug} groupId={group.id} groups={groups} monitors={monitors} onSaved={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
    </div>
  </div>;
}

function DragHandle({ refCallback, label, disabled }: { refCallback: (element: Element | null) => void; label: string; disabled: boolean }) {
  return <button ref={refCallback} type="button" aria-label={label} title={`${label}. Press Space, then arrow keys to move.`} disabled={disabled} className="inline-flex size-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-violet-400 active:cursor-grabbing disabled:cursor-not-allowed"><GripVertical size={15} aria-hidden="true" /></button>;
}

function RowMenu({ label, items }: { label: string; items: Array<{ label: string; action: () => void; danger?: boolean }> }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) menuRef.current?.removeAttribute("open"); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") menuRef.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, []);
  return <details ref={menuRef} className="group/menu relative shrink-0"><summary aria-label={label} title={label} className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400 [&::-webkit-details-marker]:hidden"><MoreHorizontal size={18} aria-hidden="true" /></summary><div className="absolute right-0 top-full z-30 mt-1 min-w-44 rounded-xl border border-white/[0.12] bg-[#1b1b20] p-1 shadow-2xl">{items.map((item) => <button key={item.label} type="button" aria-label={item.label} className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-violet-400 ${item.danger ? "text-rose-300" : "text-zinc-200"}`} onClick={() => { menuRef.current?.removeAttribute("open"); item.action(); }}>{item.label}</button>)}</div></details>;
}

function RowAction({ label, onClick, disabled, children, controls, expanded }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; controls?: string; expanded?: boolean }) {
  return <button type="button" aria-label={label} title={label} aria-controls={controls} aria-expanded={expanded} disabled={disabled} onClick={onClick} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-30">{children}</button>;
}

function ComponentForm({ orgSlug, groupId, groups, monitors, onSaved, onCancel, component }: { orgSlug: string; groupId: string | null; groups: UptimeGroup[]; monitors: UptimeMonitor[]; onSaved: () => void; onCancel: () => void; component?: UptimeComponent }) {
  const [name, setName] = useState(component?.name || "");
  const [description, setDescription] = useState(component?.description || "");
  const [selectedGroupId, setSelectedGroupId] = useState(groupId);
  const [monitorIds, setMonitorIds] = useState<string[]>(component?.monitorIds || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await uptimeRequest(orgSlug, component ? `/components/${encodeURIComponent(component.id)}` : "/components", { method: component ? "PATCH" : "POST", body: JSON.stringify({ groupId: selectedGroupId, name, description: description || null, monitorIds }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save component."); } finally { setSaving(false); } };
  return <form className="mt-4 space-y-5 rounded-xl border border-white/[0.09] bg-[#111114] p-5" onSubmit={(event) => void submit(event)}><div className="grid gap-4 md:grid-cols-2"><label className={labelClass}>Component name<input className={`${fieldClass} mt-2`} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="API" /></label><label className={labelClass}>Description<input className={`${fieldClass} mt-2`} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Customer-facing description" /></label></div><label className={labelClass}>Placement<select className={`${fieldClass} mt-2`} value={selectedGroupId ?? ""} onChange={(event) => setSelectedGroupId(event.target.value || null)}><option value="">Standalone — no group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><fieldset><legend className={labelClass}>Linked monitors</legend><p className="mt-1 text-xs text-zinc-500">Leave unselected for a manual-only component. A monitor can appear in multiple components.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{monitors.map((monitor) => <label key={monitor.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm transition-colors ${monitorIds.includes(monitor.id) ? "border-violet-400/30 bg-violet-400/[0.06] text-white" : "border-white/[0.09] text-zinc-400 hover:border-white/[0.18] hover:text-zinc-200"}`}><input type="checkbox" className="size-4 accent-violet-400" checked={monitorIds.includes(monitor.id)} onChange={(event) => setMonitorIds(event.target.checked ? [...monitorIds, monitor.id] : monitorIds.filter((id) => id !== monitor.id))} /><span className="truncate">{monitor.name}</span></label>)}{!monitors.length && <span className="text-sm text-zinc-500">No monitors yet; this component will be manual-only.</span>}</div></fieldset>{error && <UptimeError message={error} />}<div className="flex flex-wrap gap-2"><button className={primaryButton} type="submit" disabled={saving}>{saving ? "Saving…" : component ? "Save component" : "Create component"}</button><button className={secondaryButton} type="button" onClick={onCancel}>Cancel</button></div></form>;
}

function ComponentEditor({ component, index, container, groups, orgSlug, monitors, working, perform, reload }: { component: UptimeComponent; index: number; container: string; groups: UptimeGroup[]; orgSlug: string; monitors: UptimeMonitor[]; working: boolean; perform: GroupEditorProps["perform"]; move: GroupEditorProps["move"]; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualState, setManualState] = useState<"unknown" | "operational" | "degraded" | "outage">("operational");
  const [note, setNote] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sortable = useSortable({ id: `component:${component.id}`, index, group: container, type: "component", accept: "component", disabled: working, plugins: [SortableKeyboardPlugin] });
  const changeManualState = async (publish: boolean) => { setSaving(true); setManualError(null); try { await uptimeRequest(orgSlug, "/incidents", { method: "POST", body: JSON.stringify({ title: `${component.name} status update`, componentIds: [component.id], note, status: manualState === "operational" ? "resolved" : "investigating", componentStates: { [component.id]: manualState }, publish }) }); setNote(""); setManualOpen(false); reload(); } catch (cause) { setManualError(cause instanceof Error ? cause.message : "Could not save update."); } finally { setSaving(false); } };
  return <div ref={sortable.ref} className={`min-w-0 px-3 py-2 md:px-4 ${sortable.isDragging ? "z-10 opacity-60" : ""} ${sortable.isDropTarget ? "bg-violet-400/[0.045]" : ""}`}>
    <div className="flex min-h-11 items-center gap-2">
      <DragHandle refCallback={sortable.handleRef} label={`Drag ${component.name} component`} disabled={working} />
      <Activity size={15} className="shrink-0 text-zinc-600" aria-hidden="true" />
      <div className="min-w-0 flex-1 pl-1"><h4 className="truncate text-sm font-medium text-zinc-100">{component.name}</h4>{component.description && <p className="truncate text-xs text-zinc-600">{component.description}</p>}</div>
      {!component.visible && <span className="text-[11px] text-zinc-600">Hidden</span>}
      <span className="hidden text-[11px] text-zinc-600 sm:block">{component.monitorIds.length ? `${component.monitorIds.length} ${component.monitorIds.length === 1 ? "monitor" : "monitors"}` : "Manual"}</span>
      <StateBadge state={component.state} />
      <RowMenu label={`${component.name} actions`} items={[
        { label: "Edit component", action: () => { setEditing(true); setManualOpen(false); } },
        ...(!component.monitorIds.length ? [{ label: "Update status", action: () => { setManualOpen(true); setEditing(false); } }] : []),
        { label: component.visible ? "Hide component" : "Show component", action: () => void perform(`/components/${encodeURIComponent(component.id)}`, "PATCH", { visible: !component.visible }) },
      ]} />
    </div>
    {editing && <ComponentForm orgSlug={orgSlug} groupId={component.groupId} groups={groups} monitors={monitors} component={component} onSaved={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />}
    {manualOpen && <div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-400/[0.025] p-5"><h5 className="text-sm font-medium text-zinc-200">Manual status update</h5><p className="mt-1 text-xs leading-5 text-zinc-500">A draft changes nothing publicly. Publishing applies this state, records an incident update, and emails confirmed subscribers.</p><div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]"><select className={fieldClass} value={manualState} onChange={(event) => setManualState(event.target.value as typeof manualState)} aria-label="New manual state"><option value="operational">Operational</option><option value="degraded">Degraded</option><option value="outage">Outage</option><option value="unknown">Unknown</option></select><textarea className={`${fieldClass} min-h-20 py-3`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain this change to your customers" aria-label="Update note" required /></div>{manualError && <div className="mt-3"><UptimeError message={manualError} /></div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondaryButton} disabled={saving || !note.trim()} onClick={() => void changeManualState(false)}>Save draft</button><button type="button" className={primaryButton} disabled={saving || !note.trim()} onClick={() => void changeManualState(true)}>Publish update</button></div></div>}
  </div>;
}
