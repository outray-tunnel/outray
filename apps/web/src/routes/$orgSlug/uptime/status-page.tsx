import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { Activity, ArrowUpRight, Check, ChevronDown, Eye, ExternalLink, Folder, Globe2, GripVertical, Layers3, Palette, Plus, Radio, ShieldCheck } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type UptimeComponent, type UptimeGroup, type UptimeMonitor, type UptimePage, uptimeApiPath, uptimeRequest, useUptimeResource } from "@/components/uptime/uptime-client";
import { UptimeHeaderSkeleton, UptimeSkeleton, UptimeSummarySkeleton } from "@/components/uptime/uptime-skeleton";
import { useStatusPageEditor } from "@/components/uptime/status-page-editor-context";
import { StatusPageEditorProvider } from "@/components/uptime/status-page-editor-provider";
import { labelClass, secondaryButton, StateBadge, UptimeCheckbox, UptimeError, UptimePageHeading, UptimePanel } from "@/components/uptime/uptime-ui";
import { preferredStatusPageUrl, statusPageUrl } from "@/lib/uptime/status-url";
import { moveStatusLayout, type StatusLayout } from "@/lib/uptime/status-layout";
import { WorkspaceInput, WorkspaceTextarea } from "@/components/ui/workspace-input";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { SearchField } from "@/components/arc/search-field/search-field";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { UptimeDialog } from "@/components/uptime/uptime-dialog";
import { StatusPageRowMenu } from "@/components/uptime/status-page-row-menu";
import "@/components/outray-arc-theme.css";

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
  { label: "Custom domains", to: "/$orgSlug/uptime/status-page/domains", icon: ExternalLink },
] as const;

function StatusPageLayout() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceStatusPage key={orgSlug} orgSlug={orgSlug} />;
}

function WorkspaceStatusPage({ orgSlug }: { orgSlug: string }) {
  const pageData = useUptimeResource<{ page: UptimePage | null; groups: UptimeGroup[]; standaloneComponents: UptimeComponent[]; canManage: boolean }>(orgSlug, "/page");
  const monitorData = useUptimeResource<{ monitors: UptimeMonitor[] }>(orgSlug, "/monitors");
  const navigate = Route.useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const page = pageData.data?.page;
  const groups = pageData.data?.groups || [];
  const standaloneComponents = pageData.data?.standaloneComponents || [];
  const monitors = monitorData.data?.monitors || [];
  const canManage = pageData.data?.canManage === true;
  const selectedTab = editorTabs.find((tab) => pathname.replace(/\/$/, "") === tab.to.replace("$orgSlug", orgSlug))?.label || "Overview";

  return <div className="workspace-ui outray-arc mx-auto max-w-[1440px] pb-8">
    {pageData.error && <div className="mb-4 space-y-2"><UptimeError message={pageData.error} /><Button type="button" variant="secondary" size="sm" onClick={pageData.reload}>Try again</Button></div>}
    {pageData.loading && !page && <UptimeSkeleton label="Loading status page" className="space-y-7">
      <UptimeHeaderSkeleton action />
      <div className="flex gap-6 border-b border-white/[0.08] pb-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-3 w-20 rounded bg-white/[0.04]" />)}</div>
      <UptimeSummarySkeleton cards={3} />
      <div className="h-44 rounded-xl border border-white/[0.08] bg-white/[0.015]" />
    </UptimeSkeleton>}
    {!pageData.loading && !pageData.error && !page && <><UptimePageHeading title="Status page" description="A clear home for your service health and incident updates." />{canManage ? <CreatePage orgSlug={orgSlug} onCreated={pageData.reload} /> : <UptimePanel className="p-8 text-center"><Globe2 className="mx-auto mb-3 text-zinc-600" size={23} aria-hidden="true" /><h2 className="text-[14px] font-medium text-zinc-200">No status page yet</h2><p className="mt-2 text-[12px] text-zinc-500">An organization owner or admin can create one.</p></UptimePanel>}</>}
    {page && <StatusPageEditorProvider key={page.id} orgSlug={orgSlug} page={page} groups={groups} standaloneComponents={standaloneComponents} monitors={monitors} monitorsLoaded={Boolean(monitorData.data)} reload={pageData.reload} canManage={canManage}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5"><h1 className="min-w-0 break-words text-[20px] font-normal tracking-[-0.035em] text-zinc-100">{page.name}</h1><span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${page.published ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300" : "border-white/[0.08] bg-white/[0.025] text-zinc-400"}`}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{page.published ? "Published" : "Draft"}</span></div>
          <p className="mt-1 text-[12px] leading-5 text-zinc-500">Components, branding, and a home for your public updates.</p>
        </div>
        {page.published && <a className={`${secondaryButton} gap-2`} href={preferredStatusPageUrl(statusBase, page)} target="_blank" rel="noopener noreferrer">View page <ExternalLink size={14} aria-hidden="true" /></a>}
      </header>
      <nav aria-label="Status page sections" className="mb-6 border-b border-white/[0.07] pb-4"><SegmentedControl label="Status page section" options={editorTabs.map(({ label }) => ({ value: label, label }))} value={selectedTab} onValueChange={(label) => { const tab = editorTabs.find((item) => item.label === label); if (tab) void navigate({ to: tab.to, params: { orgSlug } }); }} /></nav>
      {monitorData.error && ["Components", "Overview"].includes(selectedTab) && <div className="mb-4 space-y-2"><UptimeError message={monitorData.error} /><Button type="button" variant="secondary" size="sm" onClick={monitorData.reload}>Retry monitors</Button></div>}
      {selectedTab === "Components" && !monitorData.data ? monitorData.loading ? <UptimeSkeleton label="Loading status page components" className="space-y-4"><div className="h-12 rounded-lg bg-white/[0.025]" /><div className="h-56 rounded-xl border border-white/[0.08] bg-white/[0.015]" /></UptimeSkeleton> : null : <Outlet />}
    </StatusPageEditorProvider>}
  </div>;
}

export function StatusPageOverview() {
  const { orgSlug, page, groups, standaloneComponents, monitors, monitorsLoaded } = useStatusPageEditor();
  const visible = [
    ...standaloneComponents.filter((component) => component.visible),
    ...groups.filter((group) => group.visible).flatMap((group) => group.components.filter((component) => component.visible)),
  ];
  const linked = visible.filter((component) => component.monitorIds.length > 0);
  const publicUrl = preferredStatusPageUrl(statusBase, page);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Visible components", value: visible.length, detail: `${standaloneComponents.filter((component) => component.visible).length} standalone · ${groups.filter((group) => group.visible).length} groups` }, { label: "Connected monitors", value: new Set(linked.flatMap((component) => component.monitorIds)).size, detail: monitorsLoaded ? `of ${monitors.length} monitors` : "Linked to visible components" }, { label: "Page visibility", value: page.published ? "Live" : "Draft", detail: page.published ? "Available to visitors" : "Not publicly available" }].map((item) => <UptimePanel key={item.label} className="p-4"><p className="text-[12px] text-zinc-500">{item.label}</p><p className="mt-2 text-[24px] font-normal tracking-tight text-zinc-100">{item.value}</p><p className="mt-1 text-[11px] text-zinc-600">{item.detail}</p></UptimePanel>)}
    </div>
    <UptimePanel className="overflow-hidden"><div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5"><Globe2 size={16} className="text-zinc-500" aria-hidden="true" /><h2 className="text-[14px] font-medium text-zinc-200">Public address</h2></div><div className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><a href={publicUrl} target="_blank" rel="noopener noreferrer" className="break-all rounded-sm font-mono text-[12px] text-zinc-300 underline-offset-4 hover:text-zinc-100 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-400">{publicUrl}</a><p className="mt-1.5 text-[12px] text-zinc-500">{page.published ? "Share this link with your customers." : "This address is reserved. Publish when you're ready."}</p></div><CopyButton value={publicUrl} label="Copy status page address" iconOnly variant="plain" /><Link to="/$orgSlug/uptime/status-page/publishing" params={{ orgSlug }} className={secondaryButton}>{page.published ? "Publishing settings" : "Review and publish"}<ArrowUpRight size={13} aria-hidden="true" /></Link></div></UptimePanel>
    <UptimePanel className="overflow-hidden divide-y divide-white/[0.06]">
      {[{ to: "/$orgSlug/uptime/status-page/components" as const, title: "Components", detail: "Organize services and connect their monitors.", icon: Layers3 }, { to: "/$orgSlug/uptime/status-page/appearance" as const, title: "Appearance", detail: "Make the page feel like part of your product.", icon: Palette }, { to: "/$orgSlug/uptime/status-page/domains" as const, title: "Custom domain", detail: "Use an address your customers recognize.", icon: Globe2 }].map(({ to, title, detail, icon: Icon }) => <Link key={to} to={to} params={{ orgSlug }} className="group flex items-center gap-3 px-4 py-4 transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-400"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] text-zinc-500"><Icon size={16} aria-hidden="true" /></span><div className="min-w-0 flex-1"><h2 className="text-[13px] text-zinc-200">{title}</h2><p className="mt-1 text-[12px] text-zinc-500">{detail}</p></div><ArrowUpRight size={15} className="text-zinc-600 group-hover:text-zinc-300" aria-hidden="true" /></Link>)}
    </UptimePanel>
  </div>;
}

export function StatusPageComponents() {
  const { orgSlug, groups, standaloneComponents, monitors, reload, canManage } = useStatusPageEditor();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingComponent, setCreatingComponent] = useState(false);
  const [draggingComponent, setDraggingComponent] = useState(false);
  const pending = useRef(false);
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
    if (!canManage || pending.current) return false;
    pending.current = true;
    setWorking(true); setError(null);
    try { await uptimeRequest(orgSlug, path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); reload(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); return false; }
    finally { pending.current = false; setWorking(false); }
  };
  const addGroup = async (event: FormEvent) => { event.preventDefault(); if (await perform("/groups", "POST", { name: newGroup.trim() })) { setNewGroup(""); setCreatingGroup(false); } };
  const saveLayout = async (next: StatusLayout) => {
    if (!canManage || pending.current) return;
    pending.current = true;
    setWorking(true); setError(null); setLayout(next);
    try { await uptimeRequest(orgSlug, "/page/layout", { method: "PATCH", body: JSON.stringify(next) }); reload(); }
    catch (cause) { setLayout(layout); setError(cause instanceof Error ? cause.message : "Could not reorder items."); }
    finally { pending.current = false; setWorking(false); }
  };
  const move = (id: string, from: string, to: string, index: number) => {
    const next = moveStatusLayout(layout, id, from, to, index);
    if (next && JSON.stringify(next) !== JSON.stringify(layout)) void saveLayout(next);
  };
  return <div>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[14px] font-medium text-zinc-200">Groups and components</h2><p className="mt-1 text-[12px] leading-5 text-zinc-500">{canManage ? "Drag to reorder. Components can live inside a group or on their own." : "The services and monitors shown on your public page."}</p></div>{canManage && <div className="flex gap-2"><Button type="button" variant="secondary" size="md" disabled={working} onClick={() => { setCreatingGroup((value) => !value); }} aria-expanded={creatingGroup}><Folder size={14} aria-hidden="true" />Add group</Button><Button type="button" size="md" disabled={working} onClick={() => { setCreatingComponent((value) => !value); }} aria-expanded={creatingComponent}><Plus size={14} aria-hidden="true" />Add component</Button></div>}</div>
    {error && <div className="mb-4"><UptimeError message={error} /></div>}
    {creatingGroup && canManage && <form onSubmit={(event) => void addGroup(event)} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-white/[0.08] bg-[#111112] p-4"><label className={`${labelClass} w-full sm:max-w-xs`}>Group name<WorkspaceInput className="mt-2" value={newGroup} onChange={(event) => setNewGroup(event.target.value)} placeholder="For example, Platform" required maxLength={100} disabled={working} autoFocus /></label><Button size="sm" type="submit" loading={working} disabled={working || !newGroup.trim()}>Create group</Button><Button size="sm" variant="secondary" type="button" disabled={working} onClick={() => setCreatingGroup(false)}>Cancel</Button></form>}
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
              return <GroupEditor key={key} group={group} components={children} index={index} groups={groups} orgSlug={orgSlug} monitors={monitors} working={working || !canManage} perform={perform} move={move} reload={reload} draggingComponent={draggingComponent} />;
            }
            const component = componentById.get(key.slice(10));
            return component ? <ComponentEditor key={key} component={component} index={index} container="root" groups={groups} orgSlug={orgSlug} monitors={monitors} working={working || !canManage} perform={perform} move={move} reload={reload} /> : null;
          })}
          {!layout.root.length && <div className="px-6 py-12 text-center"><Layers3 size={22} className="mx-auto mb-3 text-zinc-600" aria-hidden="true" /><h3 className="text-[14px] text-zinc-200">Start with the services that matter</h3><p className="mx-auto mt-2 max-w-sm text-[12px] leading-5 text-zinc-500">Components turn monitor results into a status your customers can understand.{canManage ? " Add your first component above." : " An owner or admin can add components."}</p></div>}
        </RootDropZone>
      </UptimePanel>
    </DragDropProvider>
    {creatingComponent && canManage && <div className="mt-4"><ComponentForm orgSlug={orgSlug} groupId={null} groups={groups} monitors={monitors} onSaved={() => { setCreatingComponent(false); reload(); }} onCancel={() => setCreatingComponent(false)} /></div>}
  </div>;
}

function RootDropZone({ children, draggingComponent }: { children: ReactNode; draggingComponent: boolean }) {
  const { ref: dropRef, isDropTarget } = useDroppable({ id: "root", accept: ["component", "group"], collisionPriority: -1 });
  return <div ref={dropRef} className={`divide-y divide-white/[0.06] rounded-xl [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl ${isDropTarget ? "bg-white/[0.035]" : ""}`}>
    {children}
    {draggingComponent && <div className={`px-5 py-4 text-center text-xs ${isDropTarget ? "text-zinc-200" : "text-zinc-500"}`}>Drop here to make a component standalone</div>}
  </div>;
}

export function StatusPageAppearance() {
  const { page, orgSlug, reload } = useStatusPageEditor();
  return <div><div className="mb-4"><h2 className="text-[14px] font-medium text-zinc-200">Appearance</h2><p className="mt-1 text-[12px] leading-5 text-zinc-500">Make your status page feel like part of your product.</p></div><PageSettings page={page} orgSlug={orgSlug} onSaved={reload} /></div>;
}

export function StatusPagePublishing() {
  const { page, orgSlug, reload, canManage } = useStatusPageEditor();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  const publicUrl = statusPageUrl(statusBase, page.slug);
  const publish = async () => { if (!canManage || pending.current) return; pending.current = true; setSaving(true); setError(null); setNotice(null); try { await uptimeRequest(orgSlug, "/page", { method: "PATCH", body: JSON.stringify({ published: !page.published }) }); setNotice(page.published ? "Page unpublished. Visitors can no longer view it." : "Page published. It is now available to visitors."); reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change publishing state."); } finally { pending.current = false; setSaving(false); } };
  return <div className="max-w-4xl space-y-4"><div><h2 className="text-[14px] font-medium text-zinc-200">Publishing</h2><p className="mt-1 text-[12px] leading-5 text-zinc-500">Choose when customers can see your page.</p></div>{error && <UptimeError message={error} />}{notice && <p role="status" className="flex items-center gap-2 text-[12px] text-emerald-300"><Check size={13} aria-hidden="true" />{notice}</p>}
    <UptimePanel className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="flex min-w-0 items-start gap-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] ${page.published ? "text-emerald-400" : "text-zinc-500"}`}>{page.published ? <Eye size={17} aria-hidden="true" /> : <Globe2 size={17} aria-hidden="true" />}</span><div><h3 className="text-[14px] font-medium text-zinc-200">{page.published ? "Your page is public" : "Your page is private"}</h3><p className="mt-1 max-w-lg text-[12px] leading-5 text-zinc-500">{page.published ? "Visitors can see component health and published incident updates." : "Review your components and branding before making the page public."}</p></div></div>{canManage && <Button type="button" variant={page.published ? "secondary" : "primary"} size="md" loading={saving} disabled={saving} onClick={() => void publish()}>{page.published ? "Unpublish page" : "Publish page"}</Button>}</div><p className="border-t border-white/[0.06] px-4 py-3 text-[12px] leading-5 text-zinc-500">Publishing this page does not publish incident drafts. Updates are published separately from the Incidents page.</p></UptimePanel>
    <UptimePanel className="p-4"><h3 className="text-[14px] font-medium text-zinc-200">OutRay address</h3><p className="mt-1 text-[12px] text-zinc-500">Reserved for your page, including while it is private.</p><div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 py-2 pl-3 pr-2"><code className="min-w-0 flex-1 break-all text-[12px] text-zinc-300">{publicUrl}</code><CopyButton value={publicUrl} label="Copy status page address" iconOnly variant="plain" />{page.published && <a className={secondaryButton} href={publicUrl} target="_blank" rel="noopener noreferrer">Open <ExternalLink size={13} aria-hidden="true" /></a>}</div></UptimePanel>
    <div className="flex items-start gap-2 px-1 text-[12px] leading-5 text-zinc-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-zinc-600" aria-hidden="true" /><p>Visitors can subscribe on a published page. Only confirmed subscribers are queued for published incident emails.</p></div>
  </div>;
}

function CreatePage({ orgSlug, onCreated }: { orgSlug: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState(orgSlug.toLowerCase());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (pending.current) return; pending.current = true; setSaving(true); setError(null);
    try { await uptimeRequest(orgSlug, "/page", { method: "POST", body: JSON.stringify({ name, description, slug }) }); onCreated(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create page."); }
    finally { pending.current = false; setSaving(false); }
  };
  return <UptimePanel className="max-w-xl overflow-hidden"><div className="border-b border-white/[0.06] p-4"><h2 className="text-[14px] font-medium text-zinc-200">Create your status page</h2><p className="mt-1 text-[12px] leading-5 text-zinc-500">One page per organization. Start with a name and your public address.</p></div><form onSubmit={(event) => void submit(event)} className="space-y-4 p-4"><label className={labelClass}>Page name<WorkspaceInput className="mt-2" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Acme status" disabled={saving} /></label><label className={labelClass}>Description <span className="text-zinc-600">· Optional</span><WorkspaceTextarea className="mt-2 min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Current availability and incident updates" disabled={saving} /></label><label className={labelClass}>Public slug<WorkspaceInput className="mt-2" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} required pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]" disabled={saving} /><span className="mt-1.5 block break-all text-[11px] text-zinc-600">{statusPageUrl(statusBase, slug || "your-slug")}</span></label>{error && <UptimeError message={error} />}<div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4"><p className="text-[11px] text-zinc-600">Your page starts as a private draft.</p><Button type="submit" size="sm" loading={saving} disabled={saving}>Create page</Button></div></form></UptimePanel>;
}

function PageSettings({ page, orgSlug, onSaved }: { page: UptimePage; orgSlug: string; onSaved: () => void }) {
  const { canManage, appearanceDraft, setAppearanceDraft, appearanceDirty, commitAppearance, appearanceSaving: saving, setAppearanceSaving: setSaving } = useStatusPageEditor();
  const { name, description, accentColor } = appearanceDraft;
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewColor = /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : page.accentColor;
  const updateDraft = (key: "name" | "description" | "accentColor", value: string) => { setAppearanceDraft((draft) => ({ ...draft, [key]: value })); setSaved(false); };
  const save = async (event: FormEvent) => { event.preventDefault(); if (!canManage || pending.current) return; pending.current = true; setSaving(true); setError(null); setSaved(false); try { await uptimeRequest(orgSlug, "/page", { method: "PATCH", body: JSON.stringify({ name, description: description || null, accentColor }) }); commitAppearance(appearanceDraft); setSaved(true); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save page."); } finally { pending.current = false; setSaving(false); } };
  const uploadLogo = async () => { if (!logoFile || !canManage || pending.current) return; pending.current = true; setSaving(true); setError(null); try { const body = new FormData(); body.set("logo", logoFile); const response = await fetch(uptimeApiPath(orgSlug, "/page/logo"), { method: "POST", credentials: "same-origin", body }); const payload = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(payload?.error || "Logo upload failed."); setLogoFile(null); if (fileInput.current) fileInput.current.value = ""; onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload logo."); } finally { pending.current = false; setSaving(false); } };
  const removeLogo = async () => { if (!canManage || pending.current) return; pending.current = true; setSaving(true); setError(null); try { await uptimeRequest(orgSlug, "/page/logo", { method: "DELETE" }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove logo."); } finally { pending.current = false; setSaving(false); } };
  return <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
    <UptimePanel className="overflow-hidden">
      <div className="border-b border-white/[0.06] p-4"><h3 className="text-[14px] font-medium text-zinc-200">Page details</h3><p className="mt-1 text-[12px] text-zinc-500">The first things visitors see.</p></div>
      <form onSubmit={(event) => void save(event)} className="space-y-4 p-4">
        <label className={labelClass}>Page name<WorkspaceInput className="mt-2" value={name} onChange={(event) => updateDraft("name", event.target.value)} required maxLength={120} disabled={saving || !canManage} /></label>
        <label className={labelClass}>Description<WorkspaceTextarea className="mt-2 min-h-24" value={description} onChange={(event) => updateDraft("description", event.target.value)} maxLength={1000} placeholder="Tell visitors what this page covers" disabled={saving || !canManage} /></label>
        <div>
          <p className={labelClass}>Accent color</p>
          <p className="mt-1 text-xs text-zinc-500">Used for highlights on your public page.</p>
          <div className="mt-3 flex max-w-xs items-center gap-3">
            <div className="relative size-9 shrink-0 rounded-full focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white" style={{ backgroundColor: previewColor }}>
              <input className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0 disabled:cursor-not-allowed" type="color" value={previewColor} onChange={(event) => updateDraft("accentColor", event.target.value)} aria-label="Choose accent color" disabled={saving || !canManage} />
            </div>
            <WorkspaceInput value={accentColor} onChange={(event) => updateDraft("accentColor", event.target.value)} pattern="#[0-9a-fA-F]{6}" aria-label="Accent color hex value" disabled={saving || !canManage} />
          </div>
        </div>
        {error && <UptimeError message={error} />}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">{canManage && <Button type="submit" size="sm" loading={saving} disabled={saving || !appearanceDirty}>Save changes</Button>}{saved && <span role="status" className="inline-flex items-center gap-1.5 text-[12px] text-emerald-300"><Check size={13} aria-hidden="true" />Saved</span>}{appearanceDirty && !saved && <span className="text-[11px] text-zinc-500">Unsaved changes</span>}{!canManage && <span className="text-[12px] text-zinc-500">Only owners and admins can change these settings.</span>}</div>
      </form>
    </UptimePanel>
    <UptimePanel className="overflow-hidden"><div className="border-b border-white/[0.06] p-4"><h3 className="text-[14px] font-medium text-zinc-200">Logo</h3><p className="mt-1 text-[12px] text-zinc-500">Shown beside the public page name.</p></div><div className="p-4"><div className="flex items-center gap-3"><div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025]">{page.logoUrl ? <img src={page.logoUrl} alt="Current page logo" className="size-full object-contain" /> : <span className="text-[22px] font-normal text-zinc-500" aria-label="No logo uploaded">{page.name.slice(0, 1).toUpperCase()}</span>}</div><p className="text-[12px] leading-5 text-zinc-500">PNG or WebP<br /><span className="text-zinc-600">Up to 256 KB</span></p></div>{canManage && <><input ref={fileInput} type="file" accept="image/png,image/webp" aria-label="Choose page logo" disabled={saving} onChange={(event) => setLogoFile(event.target.files?.[0] || null)} className="mt-4 max-w-full text-[11px] text-zinc-500 file:mr-3 file:rounded-lg file:border file:border-white/[0.08] file:bg-white/[0.025] file:px-3 file:py-2 file:text-[12px] file:text-zinc-300" /><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" disabled={!logoFile || saving} onClick={() => void uploadLogo()}>Upload logo</Button>{page.logoUrl && <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void removeLogo()}>Remove logo</Button>}</div></>}</div></UptimePanel>
  </div>;
}

interface GroupEditorProps {
  group: UptimeGroup; components: UptimeComponent[]; index: number; groups: UptimeGroup[]; orgSlug: string; monitors: UptimeMonitor[]; working: boolean; draggingComponent: boolean;
  perform: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  move: (id: string, from: string, to: string, index: number) => void;
  reload: () => void;
}

function GroupEditor({ group, components, index, groups, orgSlug, monitors, working, perform, move, reload, draggingComponent }: GroupEditorProps) {
  const { canManage } = useStatusPageEditor();
  const [name, setName] = useState(group.name);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const open = expanded || draggingComponent;
  const { sourceRef, targetRef, handleRef, isDragging, isDropTarget } = useSortable({ id: `group:${group.id}`, index, group: "root", type: "group", accept: ["group", "component"], disabled: working, plugins: [SortableKeyboardPlugin] });
  const { ref: dropRef, isDropTarget: groupDropTarget } = useDroppable({ id: group.id, accept: "component", collisionPriority: -1 });
  const saveName = async (event: FormEvent) => { event.preventDefault(); if (name.trim() === group.name || await perform(`/groups/${encodeURIComponent(group.id)}`, "PATCH", { name: name.trim() })) setRenaming(false); };
  return <div ref={sourceRef} className={`${isDragging ? "z-10 opacity-60" : ""} ${isDropTarget ? "bg-white/[0.035]" : ""}`}>
    <div ref={targetRef} className="flex min-h-14 items-center gap-2 rounded-[inherit] px-3 py-2 transition-colors hover:bg-white/[0.02] motion-reduce:transition-none md:px-4">
      {canManage && <DragHandle refCallback={handleRef} label={`Drag ${group.name} group`} disabled={working} />}
      <RowAction label={`${open ? "Collapse" : "Expand"} ${group.name}`} onClick={() => setExpanded((value) => !value)} controls={`status-group-${group.id}`} expanded={open}><ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} /></RowAction>
      <Folder size={16} className="shrink-0 text-zinc-600" aria-hidden="true" />
      <div className="min-w-0 flex-1 pl-1"><h3 className="truncate text-[13px] font-medium text-zinc-200">{group.name}</h3></div>
      <span className="hidden text-xs text-zinc-600 sm:block">{components.length} {components.length === 1 ? "component" : "components"}{!group.visible ? " · Hidden" : ""}</span>
      {canManage && <StatusPageRowMenu label={`${group.name} actions`} disabled={working} items={[
        { label: "Add component", action: () => { setExpanded(true); setAdding(true); } },
        { label: "Rename group", action: () => { setName(group.name); setRenaming(true); } },
        { label: group.visible ? "Hide group" : "Show group", action: () => void perform(`/groups/${encodeURIComponent(group.id)}`, "PATCH", { visible: !group.visible }) },
        ...(components.length === 0 ? [{ label: "Delete empty group", danger: true, action: () => { setDeleteError(null); setDeleting(true); } }] : []),
      ]} />}
    </div>
    {renaming && canManage && <form onSubmit={(event) => void saveName(event)} className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3"><WorkspaceInput className="max-w-xs" value={name} onChange={(event) => setName(event.target.value)} aria-label="Group name" maxLength={100} required autoFocus disabled={working} /><Button type="submit" size="sm" disabled={working || !name.trim()}>Save name</Button><Button type="button" variant="secondary" size="sm" disabled={working} onClick={() => { setName(group.name); setRenaming(false); }}>Cancel</Button></form>}
    <div id={`status-group-${group.id}`} hidden={!open} className="border-t border-white/[0.06] py-2 pl-8 pr-2 md:pl-10">
      <div ref={dropRef} className={`divide-y divide-white/[0.05] rounded-lg border border-white/[0.04] bg-black/15 [&>*:first-child]:rounded-t-lg [&>*:last-child]:rounded-b-lg ${groupDropTarget ? "bg-white/[0.04]" : ""}`}>
        {components.map((component, childIndex) => <ComponentEditor key={component.id} component={component} index={childIndex} container={group.id} groups={groups} orgSlug={orgSlug} monitors={monitors} working={working} perform={perform} move={move} reload={reload} />)}
        {!components.length && <p className="px-5 py-4 text-xs text-zinc-600">Drag a component here, or add one.</p>}
      </div>
      {adding && canManage && <ComponentForm orgSlug={orgSlug} groupId={group.id} groups={groups} monitors={monitors} onSaved={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
    </div>
    <UptimeDialog open={deleting} onClose={() => { if (!working) setDeleting(false); }} title="Delete empty group?" busy={working} footer={<><Button type="button" variant="secondary" size="sm" data-autofocus disabled={working} onClick={() => setDeleting(false)}>Keep group</Button><Button type="button" variant="danger" size="sm" loading={working} disabled={working} onClick={() => { void perform(`/groups/${encodeURIComponent(group.id)}`, "DELETE").then((success) => { if (success) setDeleting(false); else setDeleteError("Could not delete this group. Please try again."); }); }}>Delete group</Button></>}><p className="text-[13px] leading-6 text-zinc-400">Delete “{group.name}” from this status page? No components will be removed.</p>{deleteError && <div className="mt-3"><UptimeError message={deleteError} /></div>}</UptimeDialog>
  </div>;
}

function DragHandle({ refCallback, label, disabled }: { refCallback: (element: Element | null) => void; label: string; disabled: boolean }) {
  return <Button ref={refCallback} type="button" variant="ghost" size="sm" aria-label={label} title={`${label}. Press Space, then arrow keys to move.`} disabled={disabled} className="!size-8 !min-h-8 !px-0 touch-none !cursor-grab active:!cursor-grabbing disabled:!cursor-not-allowed"><GripVertical size={14} aria-hidden="true" /></Button>;
}

function RowAction({ label, onClick, disabled, children, controls, expanded }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; controls?: string; expanded?: boolean }) {
  return <Button type="button" variant="ghost" size="sm" aria-label={label} title={label} aria-controls={controls} aria-expanded={expanded} disabled={disabled} onClick={onClick} className="!size-8 !min-h-8 !px-0">{children}</Button>;
}

function ComponentForm({ orgSlug, groupId, groups, monitors, onSaved, onCancel, component }: { orgSlug: string; groupId: string | null; groups: UptimeGroup[]; monitors: UptimeMonitor[]; onSaved: () => void; onCancel: () => void; component?: UptimeComponent }) {
  const { canManage } = useStatusPageEditor();
  const [name, setName] = useState(component?.name || "");
  const [description, setDescription] = useState(component?.description || "");
  const [selectedGroupId, setSelectedGroupId] = useState(groupId);
  const [monitorIds, setMonitorIds] = useState<string[]>(component?.monitorIds || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const pending = useRef(false);
  const shownMonitors = monitors.filter((monitor) => monitor.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!canManage || pending.current) return; pending.current = true; setSaving(true); setError(null); try { await uptimeRequest(orgSlug, component ? `/components/${encodeURIComponent(component.id)}` : "/components", { method: component ? "PATCH" : "POST", body: JSON.stringify({ groupId: selectedGroupId, name, description: description || null, monitorIds }) }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save component."); } finally { pending.current = false; setSaving(false); } };
  return <form className="mt-3 space-y-4 rounded-xl border border-white/[0.08] bg-[#141415] p-4" onSubmit={(event) => void submit(event)}>
    <div><h3 className="text-[14px] font-medium text-zinc-200">{component ? "Edit component" : "New component"}</h3><p className="mt-1 text-[12px] text-zinc-500">Give customers a recognizable service name.</p></div>
    <label className={labelClass}>Component name<WorkspaceInput className="mt-2" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="API" disabled={saving} autoFocus /></label>
    <label className={labelClass}>Description <span className="text-zinc-600">· Optional</span><WorkspaceInput className="mt-2" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Customer-facing description" disabled={saving} /></label>
    <Select label="Placement" value={selectedGroupId ?? "standalone"} onValueChange={(value) => setSelectedGroupId(value === "standalone" ? null : value)} disabled={saving} options={[{ value: "standalone", label: "Standalone — no group", icon: <Activity size={14} /> }, ...groups.map((group) => ({ value: group.id, label: group.name, icon: <Folder size={14} /> }))]} />
    <fieldset><legend className={labelClass}>Linked monitors <span className="text-zinc-600">· {monitorIds.length} selected</span></legend><p className="mt-1 text-[12px] leading-5 text-zinc-500">No selection creates a manual-only component. Monitors can belong to more than one component.</p>
      {monitors.length > 5 && <div className="mt-3 max-w-sm"><SearchField label="Find a monitor" appearance="workspace" placeholder="Search monitors…" value={search} onValueChange={setSearch} disabled={saving} /></div>}
      <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-white/[0.06] divide-y divide-white/[0.05]">{shownMonitors.map((monitor) => <label key={monitor.id} className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-[12px] transition-colors hover:bg-white/[0.025] ${monitorIds.includes(monitor.id) ? "bg-white/[0.025] text-zinc-200" : "text-zinc-400"}`}><UptimeCheckbox checked={monitorIds.includes(monitor.id)} disabled={saving} onChange={(event) => { const checked = event.target.checked; setMonitorIds((ids) => checked ? [...ids, monitor.id] : ids.filter((id) => id !== monitor.id)); }} /><span className="min-w-0 flex-1 truncate">{monitor.name}</span><StateBadge state={monitor.state} /></label>)}{!shownMonitors.length && <p className="px-3 py-5 text-center text-[12px] text-zinc-500">{monitors.length ? "No monitors match this search." : "No monitors yet. You can update this component manually."}</p>}</div>
    </fieldset>
    {error && <UptimeError message={error} />}
    <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4"><Button variant="secondary" size="sm" type="button" disabled={saving} onClick={onCancel}>Cancel</Button><Button size="sm" type="submit" loading={saving} disabled={saving || !name.trim()}>{component ? "Save component" : "Create component"}</Button></div>
  </form>;
}

function ComponentEditor({ component, index, container, groups, orgSlug, monitors, working, perform, reload }: { component: UptimeComponent; index: number; container: string; groups: UptimeGroup[]; orgSlug: string; monitors: UptimeMonitor[]; working: boolean; perform: GroupEditorProps["perform"]; move: GroupEditorProps["move"]; reload: () => void }) {
  const { canManage, page } = useStatusPageEditor();
  const [editing, setEditing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualState, setManualState] = useState<"unknown" | "operational" | "degraded" | "outage">("operational");
  const [note, setNote] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const { ref: sortableRef, handleRef, isDragging, isDropTarget } = useSortable({ id: `component:${component.id}`, index, group: container, type: "component", accept: "component", disabled: working || saving, plugins: [SortableKeyboardPlugin] });
  const changeManualState = async (publish: boolean) => { if (!canManage || pending.current || (publish && !page.published)) return; pending.current = true; setSaving(true); setManualError(null); try { await uptimeRequest(orgSlug, "/incidents", { method: "POST", body: JSON.stringify({ title: `${component.name} status update`, componentIds: [component.id], note, status: manualState === "operational" ? "resolved" : "investigating", componentStates: { [component.id]: manualState }, publish }) }); setNote(""); setManualOpen(false); reload(); } catch (cause) { setManualError(cause instanceof Error ? cause.message : "Could not save update."); } finally { pending.current = false; setSaving(false); } };
  return <div ref={sortableRef} className={`min-w-0 px-3 py-2 transition-colors hover:bg-white/[0.02] motion-reduce:transition-none md:px-4 ${isDragging ? "z-10 opacity-60" : ""} ${isDropTarget ? "bg-white/[0.035]" : ""}`}>
    <div className="flex min-h-11 items-center gap-2">
      {canManage && <DragHandle refCallback={handleRef} label={`Drag ${component.name} component`} disabled={working || saving} />}
      <Activity size={15} className="shrink-0 text-zinc-600" aria-hidden="true" />
      <div className="min-w-0 flex-1 pl-1"><h4 className="truncate text-[13px] text-zinc-200">{component.name}</h4>{component.description && <p className="mt-0.5 truncate text-[11px] text-zinc-600">{component.description}</p>}</div>
      {!component.visible && <span className="text-[11px] text-zinc-600">Hidden</span>}
      <span className="hidden text-[11px] text-zinc-600 sm:block">{component.monitorIds.length ? `${component.monitorIds.length} ${component.monitorIds.length === 1 ? "monitor" : "monitors"}` : "Manual"}</span>
      <StateBadge state={component.state} />
      {canManage && <StatusPageRowMenu label={`${component.name} actions`} disabled={working || saving} items={[
        { label: "Edit component", action: () => { setEditing(true); setManualOpen(false); } },
        ...(!component.monitorIds.length ? [{ label: "Update status", action: () => { setManualOpen(true); setEditing(false); } }] : []),
        { label: component.visible ? "Hide component" : "Show component", action: () => void perform(`/components/${encodeURIComponent(component.id)}`, "PATCH", { visible: !component.visible }) },
      ]} />}
    </div>
    {editing && canManage && <ComponentForm orgSlug={orgSlug} groupId={component.groupId} groups={groups} monitors={monitors} component={component} onSaved={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />}
    {manualOpen && canManage && <div className="mt-3 space-y-3 rounded-xl border border-white/[0.08] bg-[#141415] p-4"><div><h5 className="text-[14px] font-medium text-zinc-200">Manual status update</h5><p className="mt-1 text-[12px] leading-5 text-zinc-500">Save privately, or publish to apply this state and queue email for confirmed subscribers.</p></div><div className="max-w-xs"><Select label="Component state" value={manualState} onValueChange={(value) => setManualState(value as typeof manualState)} disabled={saving} options={[{ value: "operational", label: "Operational", icon: <span className="size-2 rounded-full bg-emerald-400" /> }, { value: "degraded", label: "Degraded", icon: <span className="size-2 rounded-full bg-amber-400" /> }, { value: "outage", label: "Outage", icon: <span className="size-2 rounded-full bg-rose-400" /> }, { value: "unknown", label: "Unknown", icon: <span className="size-2 rounded-full bg-zinc-500" /> }]} /></div><label className={labelClass}>Update note<WorkspaceTextarea className="mt-2 min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain this change to your customers" disabled={saving} required /></label>{manualError && <UptimeError message={manualError} />}{!page.published && <p className="text-[12px] text-zinc-500">Publish your status page before publishing an update.</p>}<div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-3"><Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setManualOpen(false)}>Close</Button><Button type="button" variant="secondary" size="sm" disabled={saving || !note.trim()} onClick={() => void changeManualState(false)}>Save draft</Button><Button type="button" size="sm" disabled={saving || !note.trim() || !page.published} onClick={() => void changeManualState(true)}>Publish update</Button></div></div>}
  </div>;
}
