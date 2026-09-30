import { useQuery, useQueryClient } from "@tanstack/react-query";
import { legacyIncidentDocument, parseIncidentDocument, type IncidentDocument } from "@outray/incident-content";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, ChevronDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IncidentBadge, IncidentStatusSelect, StagePill } from "@/components/uptime/incident-ui";
import { IncidentRichContent, IncidentRichEditor } from "@/components/uptime/incident-rich-editor";
import {
  formatTime,
  type UptimeIncidentDetailResponse,
  type UptimeIncidentUpdate,
  type UptimePageResponse,
  UptimeRequestError,
  uptimeRequest,
} from "@/components/uptime/uptime-client";
import { UptimeHeaderSkeleton, UptimeRowsSkeleton, UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { labelClass, primaryButton, secondaryButton, UptimeError } from "@/components/uptime/uptime-ui";
import { UptimeDialog } from "@/components/uptime/uptime-dialog";
import { useUptimeUnsavedChanges } from "@/components/uptime/use-uptime-unsaved-changes";
import { affectedComponentNames, incidentDuration, incidentSearch, publishedIncidentUpdates } from "@/lib/uptime/incident-display";
import { statusPageUrl } from "@/lib/uptime/status-url";

export const Route = createFileRoute("/$orgSlug/uptime/incidents_/$incidentId")({
  validateSearch: incidentSearch,
  head: () => ({ meta: [{ title: "Incident - OutRay Uptime" }] }),
  component: IncidentDetailRoute,
});

const statusBase = import.meta.env.VITE_OUTRAY_STATUS_URL || "https://status.outray.app";
type UpdateStatus = "investigating" | "identified" | "monitoring" | "resolved";
const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400";

function IncidentDetailRoute() {
  const { orgSlug, incidentId } = Route.useParams();
  return <IncidentDetail key={`${orgSlug}:${incidentId}`} orgSlug={orgSlug} incidentId={incidentId} />;
}

function IncidentDetail({ orgSlug, incidentId }: { orgSlug: string; incidentId: string }) {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const resource = useQuery({
    queryKey: ["uptime", orgSlug, "incident", incidentId],
    queryFn: ({ signal }) => uptimeRequest<UptimeIncidentDetailResponse>(orgSlug, `/incidents/${encodeURIComponent(incidentId)}`, { signal }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const pageResource = useQuery({
    queryKey: ["uptime", orgSlug, "page"],
    queryFn: ({ signal }) => uptimeRequest<UptimePageResponse>(orgSlug, "/page", { signal }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const [editor, setEditor] = useState<{ draft?: UptimeIncidentUpdate } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const composerTrigger = useRef<HTMLButtonElement | null>(null);
  const draftTrigger = useRef<HTMLButtonElement | null>(null);
  const back = <Link to="/$orgSlug/uptime/incidents" params={{ orgSlug }} search={search} className={`mb-6 inline-flex min-h-10 items-center gap-2 text-xs text-zinc-500 hover:text-zinc-200 ${focusClass}`}><ArrowLeft size={14} aria-hidden="true" />All incidents</Link>;

  const closeEditor = () => {
    setEditor(null);
    requestAnimationFrame(() => {
      if (draftTrigger.current?.isConnected) draftTrigger.current.focus();
      else composerTrigger.current?.focus();
    });
  };

  const saved = async (published: boolean) => {
    closeEditor();
    setFeedback(published ? "Update published. Email to confirmed subscribers is queued for delivery." : "Draft saved. Public status and subscriber email are unchanged.");
    await queryClient.invalidateQueries({ queryKey: ["uptime", orgSlug] });
  };

  if (resource.isPending) return <div className="mx-auto max-w-[1120px] pb-12">
    {back}
    <UptimeSkeleton label="Loading incident" className="space-y-7">
      <UptimeHeaderSkeleton action />
      <div className="grid gap-6 border-y border-white/[0.08] py-5 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item}><div className="h-3 w-20 rounded bg-white/[0.04]" /><div className="mt-3 h-3 w-32 rounded bg-white/[0.07]" /></div>)}</div>
      <div className="h-4 w-24 rounded bg-white/[0.06]" />
      <UptimeRowsSkeleton rows={3} />
    </UptimeSkeleton>
  </div>;

  if (!resource.data) return <div className="mx-auto max-w-[1120px] pb-12">
    {back}
    <h1 className="mb-3 text-xl font-normal text-zinc-100">{resource.error instanceof UptimeRequestError && resource.error.status === 404 ? "Incident not found" : "Could not load incident"}</h1>
    <UptimeError message={resource.error?.message || "This incident is not available."} />
    <button className={`${secondaryButton} mt-4`} type="button" onClick={() => void resource.refetch()}>Try again</button>
  </div>;

  const { incident, updates, notifications, canManage, monitorAvailable, componentIds } = resource.data;
  const manual = incident.sourceType === "uptime_manual";
  const editable = manual && incident.status !== "resolved" && canManage;
  const components = [...(pageResource.data?.standaloneComponents || []), ...(pageResource.data?.groups.flatMap((group) => group.components) || [])];
  const affected = affectedComponentNames({ ...incident, componentIds }, components);
  const published = publishedIncidentUpdates(updates);
  const draftOnly = manual && published.length === 0;
  const drafts = updates.filter((update) => !update.publishedAt).sort((left, right) =>
    Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id));
  const page = pageResource.data?.page;
  const publicComponents = [
    ...(pageResource.data?.standaloneComponents.filter((component) => component.visible) || []),
    ...(pageResource.data?.groups.filter((group) => group.visible).flatMap((group) => group.components.filter((component) => component.visible)) || []),
  ];
  const publicReportAvailable = page?.published && (!manual || published.length > 0) && publicComponents.some((component) => componentIds.includes(component.id));
  const monitorName = typeof incident.sourceSnapshot?.monitorName === "string" ? incident.sourceSnapshot.monitorName : "Originating monitor";
  const monitorLink = monitorAvailable && incident.sourceId ? <Link to="/$orgSlug/uptime/monitors/$monitorId" params={{ orgSlug, monitorId: incident.sourceId }} className={`inline-flex items-center gap-1 text-zinc-300 hover:text-white ${focusClass}`}>{monitorName}<ArrowUpRight size={13} aria-hidden="true" /></Link> : <span>{monitorName}{!monitorAvailable && " (unavailable)"}</span>;

  return <div className="mx-auto max-w-[1120px] pb-12">
    {back}
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-xl font-normal tracking-[-0.02em] text-zinc-100">{incident.title}</h1><IncidentBadge incident={incident} updates={updates} /></div>
        <p className="mt-2 text-[13px] leading-6 text-zinc-500">{manual ? "Team updates and publication history." : "Detection and recovery recorded by your monitor."}</p>
      </div>
      {publicReportAvailable && page && <a className={`${secondaryButton} gap-2`} href={new URL(`incidents/${encodeURIComponent(incident.id)}`, statusPageUrl(statusBase, page.slug)).href} target="_blank" rel="noopener noreferrer">Public report<ArrowUpRight size={14} aria-hidden="true" /></a>}
    </header>

    {resource.isError && <div className="mb-5"><UptimeError message={`The latest refresh failed. Showing the last loaded incident. ${resource.error.message}`} /></div>}
    {pageResource.isError && <div className="mb-5"><UptimeError message={`Could not refresh status-page settings. ${pageResource.error.message}`} /><button type="button" className={`${secondaryButton} mt-2`} onClick={() => void pageResource.refetch()}>Retry settings</button></div>}
    {feedback && <p role="status" className="mb-5 text-[13px] leading-6 text-zinc-300">{feedback}</p>}

    <dl className="grid gap-x-8 gap-y-5 border-y border-white/[0.08] py-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
      <div className="min-w-0"><dt className="text-xs text-zinc-500">Affected components</dt><dd className="mt-2 break-words text-[13px] text-zinc-300">{affected.join(", ") || "No components currently linked"}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-zinc-500">Source</dt><dd className="mt-2 text-[13px] text-zinc-300">{manual ? "Manual" : "Automatic"}</dd>{!manual && <dd className="mt-1 break-words text-xs text-zinc-500">{monitorLink}</dd>}</div>
      <div><dt className="text-xs text-zinc-500">{draftOnly ? "Created" : "Started"}</dt><dd className="mt-2 text-[13px] text-zinc-300">{formatTime(draftOnly ? incident.createdAt || incident.startedAt : incident.startedAt || incident.createdAt)}</dd></div>
      <div><dt className="text-xs text-zinc-500">Duration</dt><dd className="mt-2 text-[13px] text-zinc-300">{draftOnly ? "Unpublished" : incidentDuration(incident, resource.dataUpdatedAt)}</dd></div>
    </dl>

    <section className="mt-7" aria-labelledby="incident-timeline-title">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 id="incident-timeline-title" className="text-sm font-medium text-zinc-200">Timeline</h2>
        {editable && !editor && <button ref={composerTrigger} type="button" className={`${primaryButton} gap-2`} onClick={() => { draftTrigger.current = null; setFeedback(null); setEditor({}); }}><Plus size={14} aria-hidden="true" />Add update</button>}
      </div>

      {editor && <IncidentUpdateEditor
        key={editor.draft?.id || "new"}
        orgSlug={orgSlug}
        incidentId={incidentId}
        draft={editor.draft}
        defaultStatus={published[0]?.status ?? "investigating"}
        pagePublished={!!page?.published}
        editable={editable && (!editor.draft || updates.some((update) => update.id === editor.draft?.id && !update.publishedAt))}
        onSaved={saved}
        onCancel={closeEditor}
      />}

      {manual && incident.status === "resolved" && <p className="mb-6 text-xs text-zinc-500">This incident is resolved. Its updates and drafts are read-only.</p>}
      {manual && incident.status !== "resolved" && !canManage && <p className="mb-6 text-xs text-zinc-500">Only organization owners and admins can manage updates.</p>}
      {manual && !published.length && <div className="border-l border-white/[0.1] py-2 pl-5"><p className="text-[13px] text-zinc-300">No published updates yet</p><p className="mt-2 text-xs leading-5 text-zinc-500">Drafts are private to your team. Publishing an update makes it public and queues email to confirmed subscribers.</p></div>}
      {manual && published.length > 0 && <ol className="ml-1 border-l border-white/[0.1]">{published.map((update) => <li key={update.id} className="relative pb-8 pl-6 last:pb-0"><span aria-hidden="true" className="absolute -left-[4px] top-1.5 size-[7px] rounded-full bg-zinc-500" /><div className="flex flex-wrap items-center justify-between gap-2"><h3><StagePill stage={update.status} /></h3><time dateTime={update.publishedAt!} className="text-xs text-zinc-500">{formatTime(update.publishedAt)}</time></div><IncidentRichContent body={update.bodyJson} note={update.note} /></li>)}</ol>}
      {!manual && <ol className="ml-1 border-l border-white/[0.1]">
        {incident.resolvedAt && <li className="relative pb-8 pl-6"><span aria-hidden="true" className="absolute -left-[4px] top-1.5 size-[7px] rounded-full bg-emerald-400/70" /><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-medium text-zinc-200">Recovery detected</h3><time dateTime={incident.resolvedAt} className="text-xs text-zinc-500">{formatTime(incident.resolvedAt)}</time></div><p className="mt-3 text-[13px] leading-6 text-zinc-400">The monitor confirmed recovery and resolved this incident automatically.</p></li>}
        <li className="relative pl-6"><span aria-hidden="true" className="absolute -left-[4px] top-1.5 size-[7px] rounded-full bg-rose-400/70" /><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-medium text-zinc-200">Downtime detected</h3><time dateTime={incident.startedAt || incident.createdAt} className="text-xs text-zinc-500">{formatTime(incident.startedAt || incident.createdAt)}</time></div><p className="mt-3 text-[13px] leading-6 text-zinc-400">The monitor confirmed downtime and opened this incident automatically.</p></li>
      </ol>}
    </section>

    {drafts.length > 0 && <section aria-labelledby="incident-drafts-title" className="mt-9 border-t border-white/[0.08] pt-6">
      <div className="flex items-center gap-2"><h2 id="incident-drafts-title" className="text-sm font-medium text-zinc-200">Drafts</h2><span className="text-xs text-zinc-500">{drafts.length}</span></div>
      <p className="mt-2 text-xs text-zinc-500">Visible only to your team. Drafts do not change public status or send email.</p>
      <div className="mt-2 divide-y divide-white/[0.07]">{drafts.map((draft) => <article key={draft.id} className="py-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><StagePill stage="draft" /><span className="text-xs text-zinc-500">Planned stage: {draft.status}</span></div><time dateTime={draft.createdAt} className="text-xs text-zinc-500">Created {formatTime(draft.createdAt)}</time></div><IncidentRichContent body={draft.bodyJson} note={draft.note} />{editable && <button type="button" className={`${secondaryButton} mt-3`} disabled={!!editor} onClick={(event) => { draftTrigger.current = event.currentTarget; setFeedback(null); setEditor({ draft }); }}>Edit draft</button>}</article>)}</div>
    </section>}

    <details className="group mt-9 border-t border-white/[0.08] pt-2">
      <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${focusClass}`}><span>Recent delivery attempts <span className="ml-2 text-xs font-normal text-zinc-600">{notifications.length}</span></span><ChevronDown size={15} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
      <p className="mb-3 text-xs leading-5 text-zinc-500">Queued messages have not necessarily been delivered. Showing up to 100 recent attempts.</p>
      {!notifications.length && <p className="py-3 text-[13px] text-zinc-500">No delivery attempts recorded.</p>}
      <ul className="divide-y divide-white/[0.06]">{notifications.map((notification) => <li key={notification.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs"><span className="text-zinc-300"><span className="capitalize">{notification.channel}</span><span className="mx-2 text-zinc-600">·</span><span className="capitalize">{notification.event.replaceAll("_", " ")}</span></span><span className={notification.status === "failed" ? "text-rose-300" : "text-zinc-500"}><span className="capitalize">{notification.status}</span> · {notification.attempts} {notification.attempts === 1 ? "attempt" : "attempts"} · {formatTime(notification.sentAt || notification.createdAt)}</span></div>{notification.lastError && <p className="mt-2 break-words text-xs text-rose-300/80">{notification.lastError}</p>}</li>)}</ul>
    </details>
  </div>;
}

function IncidentUpdateEditor({ orgSlug, incidentId, draft, defaultStatus, pagePublished, editable, onSaved, onCancel }: {
  orgSlug: string;
  incidentId: string;
  draft?: UptimeIncidentUpdate;
  defaultStatus: UpdateStatus;
  pagePublished: boolean;
  editable: boolean;
  onSaved: (published: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState<IncidentDocument>(() => draft?.bodyJson ?? legacyIncidentDocument(draft?.note || ""));
  const [status, setStatus] = useState<UpdateStatus>(draft?.status || defaultStatus);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const submissionPending = useRef(false);
  const dirty = JSON.stringify(body) !== JSON.stringify(draft?.bodyJson ?? legacyIncidentDocument(draft?.note || "")) || status !== (draft?.status || defaultStatus);
  const blocker = useUptimeUnsavedChanges(dirty || !!saving);
  const currentBlocker = useRef(blocker);

  useEffect(() => { document.getElementById("incident-update-body")?.focus(); }, []);
  useEffect(() => { currentBlocker.current = blocker; }, [blocker]);
  useEffect(() => {
    if (saving) return;
    if (fieldError?.field === "note" || fieldError?.field === "body") document.getElementById("incident-update-body")?.focus();
    else if (fieldError?.field === "status") document.querySelector<HTMLElement>("[aria-label='Update status']")?.focus();
    else if (error) errorRef.current?.focus();
  }, [fieldError, error, saving]);

  const save = async (publish: boolean) => {
    if (!editable || submissionPending.current) return;
    setError(null);
    setFieldError(null);
    if (!parseIncidentDocument(body)) {
      setFieldError({ field: "body", message: "Write an update using supported formatting before saving." });
      return;
    }
    submissionPending.current = true;
    setSaving(publish ? "publish" : "draft");
    try {
      await uptimeRequest(orgSlug, `/incidents/${encodeURIComponent(incidentId)}/updates${draft ? `/${encodeURIComponent(draft.id)}` : ""}`, {
        method: draft ? "PATCH" : "POST",
        body: JSON.stringify({ body, status, publish, ...(draft?.componentStates ? { componentStates: draft.componentStates } : {}) }),
      });
      // Resolve a navigation attempt made during the request before this editor unmounts.
      if (currentBlocker.current.status === "blocked") currentBlocker.current.reset();
      await onSaved(publish);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save this update.";
      if (cause instanceof UptimeRequestError && (cause.field === "note" || cause.field === "body" || cause.field === "status")) setFieldError({ field: cause.field, message });
      else setError(message);
    } finally {
      submissionPending.current = false;
      setSaving(null);
    }
  };

  const keepEditing = () => {
    if (saving) return;
    setDiscardOpen(false);
    if (blocker.status === "blocked") blocker.reset();
  };

  const discard = () => {
    if (saving) return;
    const proceed = blocker.status === "blocked" ? blocker.proceed : undefined;
    // Search-only navigation keeps this route mounted, so explicitly discard the editor.
    onCancel();
    proceed?.();
  };

  return <><form aria-busy={!!saving} className="mb-7 border-y border-white/[0.08] bg-white/[0.015] px-4 py-5 sm:px-5" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
    <h3 className="text-sm font-medium text-zinc-200">{draft ? "Edit draft" : "New update"}</h3>
    <div className="mt-5 grid gap-4 sm:grid-cols-[170px_minmax(0,1fr)]">
      <div className={labelClass}>Update status<div className="mt-2"><IncidentStatusSelect value={status} onChange={setStatus} disabled={!editable || !!saving} ariaLabel="Update status" /></div>{fieldError?.field === "status" && <span id="incident-status-error" role="alert" className="mt-2 block font-normal text-rose-300">{fieldError.message}</span>}</div>
      <div><p className={labelClass}>Update</p><IncidentRichEditor id="incident-update-body" initialBody={draft?.bodyJson} initialNote={draft?.note} onChange={setBody} disabled={!editable || !!saving} invalid={fieldError?.field === "body" || fieldError?.field === "note"} />{(fieldError?.field === "body" || fieldError?.field === "note") && <span id="incident-update-body-error" role="alert" className="mt-2 block text-xs text-rose-300">{fieldError.message}</span>}</div>
    </div>
    <p className="mt-4 text-xs leading-5 text-zinc-500">Saving a draft keeps it private. Publishing updates the public incident and queues email to confirmed subscribers.{status === "resolved" && " Publishing this update also resolves the incident and makes it read-only."}</p>
    {!pagePublished && <p className="mt-2 text-xs leading-5 text-amber-200/80">Publish the status page before publishing this update. You can still save a draft.</p>}
    {!editable && <p role="status" className="mt-3 text-xs leading-5 text-amber-200/80">This update is no longer editable. The incident may have resolved, the draft may have been published, or your role may have changed. Your text is preserved here so you can copy it.</p>}
    <div className="mt-5 flex flex-wrap gap-2"><button type="submit" className={secondaryButton} disabled={!!saving || !editable}>{saving === "draft" ? "Saving…" : "Save draft"}</button><button type="button" className={primaryButton} disabled={!!saving || !editable || !pagePublished} onClick={() => void save(true)}>{saving === "publish" ? "Publishing…" : "Publish update"}</button><button type="button" className={secondaryButton} disabled={!!saving} onClick={() => { if (dirty) setDiscardOpen(true); else onCancel(); }}>Cancel</button></div>
    {error && <div ref={errorRef} tabIndex={-1} className="mt-4 outline-none"><UptimeError message={error} /></div>}
  </form><UptimeDialog open={discardOpen || blocker.status === "blocked"} onClose={keepEditing} title="Discard unsaved changes?" busy={!!saving} footer={<><button type="button" data-autofocus className={secondaryButton} onClick={keepEditing} disabled={!!saving}>Keep editing</button><button type="button" className={primaryButton} onClick={discard} disabled={!!saving}>Discard changes</button></>}><p className="text-[13px] leading-6 text-zinc-400">{saving ? "Wait for this update to finish saving before leaving." : "Your unsaved update text and status changes will be lost."}</p></UptimeDialog></>;
}
