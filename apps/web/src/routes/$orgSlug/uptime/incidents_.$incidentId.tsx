import { useQuery, useQueryClient } from "@tanstack/react-query";
import { incidentPlainText, legacyIncidentDocument, parseIncidentDocument, type IncidentDocument } from "@outray/incident-content";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, ChevronDown, Info, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { IncidentBadge, IncidentStatusSelect, StagePill } from "@/components/uptime/incident-ui";
import { incidentStageDescriptions } from "@/components/uptime/incident-stages";
import { IncidentRichContent, IncidentRichEditor } from "@/components/uptime/incident-rich-editor";
import { IncidentTimeline, type IncidentTimelineEvent } from "@/components/uptime/incident-timeline";
import {
  formatTime,
  type UptimeIncidentDetailResponse,
  type UptimeIncidentUpdate,
  type UptimePageResponse,
  UptimeRequestError,
  uptimeRequest,
} from "@/components/uptime/uptime-client";
import { UptimeHeaderSkeleton, UptimeRowsSkeleton, UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { labelClass, secondaryButtonMedium, UptimeCheckbox, UptimeError } from "@/components/uptime/uptime-ui";
import { UptimeDialog } from "@/components/uptime/uptime-dialog";
import { UptimeSideSheet } from "@/components/uptime/uptime-side-sheet";
import { useUptimeUnsavedChanges } from "@/components/uptime/use-uptime-unsaved-changes";
import { affectedComponentNames, incidentDuration, incidentSearch, incidentSourceLabel, publishedIncidentUpdates } from "@/lib/uptime/incident-display";
import { statusIncidentUrl, statusPageOrigin } from "@/lib/uptime/status-url";

export const Route = createFileRoute("/$orgSlug/uptime/incidents_/$incidentId")({
  validateSearch: incidentSearch,
  head: () => ({ meta: [{ title: "Incident - OutRay Uptime" }] }),
  component: IncidentDetailRoute,
});

const statusBase = statusPageOrigin(import.meta.env.VITE_OUTRAY_STATUS_URL, import.meta.env.DEV);
type UpdateStatus = "investigating" | "identified" | "monitoring" | "resolved";
const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-500";

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
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoring, setIgnoring] = useState(false);
  const [ignoreError, setIgnoreError] = useState<string | null>(null);
  const composerTrigger = useRef<HTMLButtonElement | null>(null);
  const draftTrigger = useRef<HTMLButtonElement | null>(null);
  const back = <Link to="/$orgSlug/uptime/incidents" params={{ orgSlug }} search={search} className={`mb-4 inline-flex min-h-9 items-center gap-2 text-[11px] text-zinc-500 hover:text-zinc-200 ${focusClass}`}><ArrowLeft size={13} aria-hidden="true" />All incidents</Link>;

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

  if (resource.isPending) return <div className="mx-auto w-full max-w-[1440px] pb-12">
    {back}
    <UptimeSkeleton label="Loading incident" className="space-y-7">
      <UptimeHeaderSkeleton action />
      <div className="grid gap-6 border-y border-white/[0.08] py-5 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item}><div className="h-3 w-20 rounded bg-white/[0.04]" /><div className="mt-3 h-3 w-32 rounded bg-white/[0.07]" /></div>)}</div>
      <div className="h-4 w-24 rounded bg-white/[0.06]" />
      <UptimeRowsSkeleton rows={3} />
    </UptimeSkeleton>
  </div>;

  if (!resource.data) return <div className="mx-auto w-full max-w-[1440px] pb-12">
    {back}
    <h1 className="mb-3 text-xl font-normal text-zinc-100">{resource.error instanceof UptimeRequestError && resource.error.status === 404 ? "Incident not found" : "Could not load incident"}</h1>
    <UptimeError message={resource.error?.message || "This incident is not available."} />
    <Button variant="secondary" size="sm" className="mt-4" type="button" loading={resource.isFetching} onClick={() => void resource.refetch()}>Try again</Button>
  </div>;

  const { incident, updates, notifications, canManage, monitorAvailable, componentIds, observabilitySource } = resource.data;
  const manual = incident.sourceType === "uptime_manual";
  const observability = incident.sourceType === "observability_alert";
  const confirmedRecovery = observability ? observabilitySource?.recoveryConfirmed === true || incident.recoveryConfirmed === true : incident.status === "resolved";
  const privateDetection = !manual && (incident.uptimePublicationState === "detected" || incident.uptimePublicationState === "ignored" || observability && incident.uptimePublicationState !== "published");
  const detected = privateDetection && incident.uptimePublicationState !== "ignored" && incident.status === "open";
  const editable = canManage && (manual ? incident.status !== "resolved" :
    incident.uptimePublicationState !== "ignored" && (incident.uptimePublicationState === "published" || incident.status === "open"));
  const components = [...(pageResource.data?.standaloneComponents || []), ...(pageResource.data?.groups.flatMap((group) => group.components) || [])];
  const affected = affectedComponentNames({ ...incident, componentIds }, components);
  const published = publishedIncidentUpdates(updates);
  const automaticEvents = manual ? [] : [
    ...published.map((update) => ({ kind: "update" as const, at: update.publishedAt!, id: update.id, update })),
    { kind: "detected" as const, at: incident.startedAt || incident.createdAt || "", id: "detected" },
    ...(incident.resolvedAt && (!observability || confirmedRecovery) ? [{ kind: "recovered" as const, at: incident.resolvedAt, id: "recovered" }] : []),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at) || right.id.localeCompare(left.id));
  const timelineEvents: IncidentTimelineEvent[] = manual
    ? published.map((update) => ({ id: update.id, at: update.publishedAt!, stage: update.status, update }))
    : automaticEvents.map((event) => event.kind === "update"
      ? { id: event.id, at: event.at, kind: event.kind, stage: event.update.status, title: "Team update", update: event.update }
      : {
        id: event.id, at: event.at, kind: event.kind, stage: event.kind === "recovered" ? "recovered" : "down",
        title: event.kind === "recovered" ? "Recovery confirmed" : observability ? "Alert issue detected" : "Downtime detected",
        description: observability
          ? event.kind === "recovered" ? "Confirmed recovery closed this alert issue and released its public component impact." : "The alert created this private detected issue. Publishing requires team approval."
          : event.kind === "recovered" ? "The monitor confirmed recovery and resolved this issue automatically." : incident.uptimePublicationState === "detected" || incident.uptimePublicationState === "ignored" ? "The monitor confirmed downtime and created a private detected issue." : "The monitor confirmed downtime.",
      });
  const draftOnly = manual && published.length === 0;
  const drafts = updates.filter((update) => !update.publishedAt).sort((left, right) =>
    Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id));
  const page = pageResource.data?.page;
  const publicComponents = [
    ...(pageResource.data?.standaloneComponents.filter((component) => component.visible) || []),
    ...(pageResource.data?.groups.filter((group) => group.visible).flatMap((group) => group.components.filter((component) => component.visible)) || []),
  ];
  const publicReportAvailable = page?.published && (manual ? published.length > 0 : incident.uptimePublicationState === "published") && (manual && componentIds.length === 0 || publicComponents.some((component) => componentIds.includes(component.id)));
  const monitorName = typeof incident.sourceSnapshot?.monitorName === "string" ? incident.sourceSnapshot.monitorName : "Originating monitor";
  const monitorLink = monitorAvailable && incident.sourceId ? <Link to="/$orgSlug/uptime/monitors/$monitorId" params={{ orgSlug, monitorId: incident.sourceId }} className={`inline-flex items-center gap-1 text-zinc-300 hover:text-white ${focusClass}`}>{monitorName}<ArrowUpRight size={13} aria-hidden="true" /></Link> : <span>{monitorName}{!monitorAvailable && " (unavailable)"}</span>;
  const sourceAlertId = observabilitySource?.alertId || incident.sourceId;
  const sourceAlertName = observabilitySource?.alertName || incident.sourceSnapshot?.alertName || "Originating alert";
  const sourceService = observabilitySource?.service || incident.sourceSnapshot?.service;
  const publicTitle = incident.publicTitle || observabilitySource?.publicTitle || null;
  const sourceLink = observability ? observabilitySource?.alertAvailable && sourceAlertId ? <Link to="/$orgSlug/observability/alerts/$alertId" params={{ orgSlug, alertId: sourceAlertId }} className={`inline-flex items-center gap-1 text-zinc-300 hover:text-white ${focusClass}`}>{sourceAlertName}<ArrowUpRight size={13} aria-hidden="true" /></Link> : <span>{sourceAlertName} (unavailable)</span> : monitorLink;

  const ignoreDetection = async () => {
    if (!detected || !canManage || ignoring) return;
    setIgnoring(true); setIgnoreError(null);
    try {
      await uptimeRequest(orgSlug, `/incidents/${encodeURIComponent(incidentId)}/decision`, { method: "POST", body: JSON.stringify({ action: "ignore" }) });
      setIgnoreOpen(false);
      setFeedback("Detection ignored. Source checks and component health are unchanged; no public incident was created.");
      await queryClient.invalidateQueries({ queryKey: ["uptime", orgSlug] });
    } catch (cause) { setIgnoreError(cause instanceof Error ? cause.message : "Could not ignore this detection."); }
    finally { setIgnoring(false); }
  };

  return <div className="mx-auto w-full max-w-[1440px] pb-12">
    {back}
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-[20px] font-normal tracking-[-0.035em] text-zinc-100">{incident.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"><IncidentBadge incident={incident} updates={updates} /><p className="text-[12px] leading-5 text-zinc-500">{manual ? "Team updates and publication history." : observability ? "Observability detection and confirmed recovery, with team-approved public updates." : "Monitor detection and recovery, with team-published updates."}</p></div>
        {observability && <p className="mt-2 text-xs leading-5 text-zinc-500">Customer-facing title: <span className="text-zinc-300">{publicTitle || "Required before publication"}</span></p>}
      </div>
      {publicReportAvailable && page && <a className={secondaryButtonMedium} href={statusIncidentUrl(statusBase, page.slug, incident.id)} target="_blank" rel="noopener noreferrer">Public report<ArrowUpRight size={14} aria-hidden="true" /></a>}
    </header>

    {resource.isError && <div className="mb-5"><UptimeError message={`The latest refresh failed. Showing the last loaded incident. ${resource.error.message}`} /></div>}
    {pageResource.isError && <div className="mb-5"><UptimeError message={`Could not refresh status-page settings. ${pageResource.error.message}`} /><Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => void pageResource.refetch()}>Retry settings</Button></div>}
    {feedback && <p role="status" className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-[12px] leading-5 text-zinc-300">{feedback}</p>}
    {privateDetection && <section aria-label="Private detected issue" className="mb-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.025] p-4">
      <p className="text-[12px] font-medium text-amber-200">{incident.uptimePublicationState === "ignored" ? "Detection ignored" : incident.status === "resolved" && (!observability || confirmedRecovery) ? "Recovered without a public incident" : observability ? "Alert detected an issue · not published" : "Downtime detected · not published"}</p>
      <p className="mt-1.5 max-w-3xl text-[11px] leading-5 text-zinc-400">{observability ? "This is the same private incident created by the alert. Component impact requires an approved public update; raw telemetry stays private." : "The monitor and linked components reflect their checks."} No public incident report or subscriber email was created for this detection. Team alert delivery is tracked below.</p>
      {canManage && detected && !editor && <div className="mt-3 flex flex-wrap gap-2"><Button ref={composerTrigger} type="button" size="md" aria-haspopup="dialog" onClick={() => { setFeedback(null); setEditor({}); }}>Acknowledge &amp; publish</Button><Button type="button" variant="secondary" size="md" aria-haspopup="dialog" onClick={() => { setIgnoreError(null); setIgnoreOpen(true); }}>Ignore detection</Button></div>}
    </section>}

    {observability && <section aria-label="Private observability evidence" className="mb-5 rounded-xl border border-white/[0.08] bg-[#111112] p-4">
      <h2 className="text-xs font-medium text-zinc-200">Private observability evidence</h2><p className="mt-1.5 text-[11px] leading-5 text-zinc-500">These links require organization access. Alert names, services, logs, and traces are never included automatically in public reports.</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">{sourceLink}{sourceService && <><Link to="/$orgSlug/observability/services/$serviceId" params={{ orgSlug, serviceId: sourceService }} search={{ range: "24h" }} className={`text-zinc-300 hover:text-white ${focusClass}`}>Service: {sourceService}</Link><Link to="/$orgSlug/observability/logs" params={{ orgSlug }} search={{ service: sourceService, range: "24h" }} className={`text-zinc-300 hover:text-white ${focusClass}`}>Logs</Link><Link to="/$orgSlug/observability/traces" params={{ orgSlug }} search={{ search: sourceService, range: "24h" }} className={`text-zinc-300 hover:text-white ${focusClass}`}>Traces</Link></>}{observabilitySource?.alertAvailable && sourceAlertId && <Link to="/$orgSlug/observability/alerts/$alertId/status-page" params={{ orgSlug, alertId: sourceAlertId }} className={`text-zinc-300 hover:text-white ${focusClass}`}>Status-page link</Link>}</div>
      <p className="mt-3 text-[11px] leading-5 text-zinc-500">{confirmedRecovery ? "Recovery has been confirmed." : "Recovery has not been confirmed. Missing telemetry, paused or deleted alerts do not restore public component health."}</p>
      {!componentIds.length && <p className="mt-2 text-[11px] leading-5 text-amber-200/80">Link this alert to visible status-page components before approving a public incident.</p>}
    </section>}

    <dl className="grid gap-x-6 gap-y-4 rounded-xl border border-white/[0.08] bg-[#111112] px-5 py-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
      <div className="min-w-0"><dt className="text-[11px] text-zinc-500">Affected components</dt><dd className="mt-1.5 break-words text-[12px] text-zinc-300">{affected.join(", ") || "No components currently linked"}</dd></div>
      <div className="min-w-0"><dt className="text-[11px] text-zinc-500">Source</dt><dd className="mt-1.5 text-[12px] text-zinc-300">{incidentSourceLabel(incident)}</dd>{!manual && <dd className="mt-1 break-words text-[11px] text-zinc-500">{sourceLink}</dd>}</div>
      <div><dt className="text-[11px] text-zinc-500">{draftOnly ? "Created" : "Started"}</dt><dd className="mt-1.5 text-[12px] text-zinc-300">{formatTime(draftOnly ? incident.createdAt || incident.startedAt : incident.startedAt || incident.createdAt)}</dd></div>
      <div><dt className="text-[11px] text-zinc-500">Duration</dt><dd className="mt-1.5 text-[12px] tabular-nums text-zinc-300">{draftOnly ? "Unpublished" : incidentDuration(incident, resource.dataUpdatedAt)}</dd></div>
    </dl>

    <section className="mt-5 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]" aria-labelledby="incident-timeline-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3">
        <h2 id="incident-timeline-title" className="text-[13px] font-medium text-zinc-200">Timeline</h2>
        {editable && !editor && !detected && <Button ref={composerTrigger} type="button" size="md" aria-haspopup="dialog" onClick={() => { draftTrigger.current = null; setFeedback(null); setEditor({}); }}><Plus size={14} aria-hidden="true" />Add update</Button>}
      </div>

      {editor && <IncidentUpdateEditor
        key={editor.draft?.id || "new"}
        orgSlug={orgSlug}
        incidentId={incidentId}
        incidentTitle={incident.title}
        draft={editor.draft}
        defaultStatus={!manual && incident.status === "resolved" ? "resolved" : published[0]?.status ?? "investigating"}
        automatic={!manual}
        observability={observability}
        publicTitle={publicTitle}
        publicTitleEditable={observability && incident.uptimePublicationState !== "published"}
        linkedComponents={componentIds.length > 0}
        firstPublication={detected}
        monitorRecovered={confirmedRecovery}
        pagePublished={!!page?.published}
        editable={editable && (!editor.draft || updates.some((update) => update.id === editor.draft?.id && !update.publishedAt))}
        onSaved={saved}
        onCancel={closeEditor}
      />}

      {manual && incident.status === "resolved" && <p className="border-b border-white/[0.07] px-5 py-3 text-[11px] text-zinc-500">This incident is resolved. Its updates and drafts are read-only.</p>}
      {manual && incident.status !== "resolved" && !canManage && <p className="border-b border-white/[0.07] px-5 py-3 text-[11px] text-zinc-500">Only organization owners and admins can manage updates.</p>}
      {manual && !published.length && <div className="px-5 py-8"><p className="text-[13px] text-zinc-300">No published updates yet</p><p className="mt-1.5 max-w-xl text-[12px] leading-5 text-zinc-500">Drafts are private to your team. Publishing an update makes it public and queues email to confirmed subscribers.</p></div>}
      {timelineEvents.length > 0 ? <IncidentTimeline events={timelineEvents} /> : null}
    </section>

    {drafts.length > 0 && <section aria-labelledby="incident-drafts-title" className="mt-5 rounded-xl border border-dashed border-white/[0.1] px-5 py-4">
      <div className="flex items-center gap-2"><h2 id="incident-drafts-title" className="text-[13px] font-medium text-zinc-200">Drafts</h2><span className="text-[11px] text-zinc-500">{drafts.length}</span></div>
      <p className="mt-1.5 text-[11px] leading-5 text-zinc-500">Visible only to your team. Drafts do not change public status or send email.</p>
      <div className="mt-2 divide-y divide-white/[0.07]">{drafts.map((draft) => <article key={draft.id} className="py-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><StagePill stage="draft" /><span className="text-xs text-zinc-500">Planned stage: {draft.status}</span></div><time dateTime={draft.createdAt} className="text-xs text-zinc-500">Created {formatTime(draft.createdAt)}</time></div><IncidentRichContent body={draft.bodyJson} note={draft.note} />{editable && <Button type="button" variant="secondary" size="md" className="mt-3" aria-haspopup="dialog" disabled={!!editor} onClick={(event) => { draftTrigger.current = event.currentTarget; setFeedback(null); setEditor({ draft }); }}>Edit draft</Button>}</article>)}</div>
    </section>}

    <details className="group mt-5 rounded-xl border border-white/[0.08] bg-[#111112] px-5">
      <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-medium text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${focusClass}`}><span>Recent delivery attempts <span className="ml-2 text-[11px] font-normal text-zinc-500">{notifications.length}</span></span><ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
      <p className="mb-3 text-xs leading-5 text-zinc-500">Queued messages have not necessarily been delivered. Showing up to 100 recent attempts.</p>
      {!notifications.length && <p className="py-3 text-[13px] text-zinc-500">No delivery attempts recorded.</p>}
      <ul className="divide-y divide-white/[0.06]">{notifications.map((notification) => <li key={notification.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs"><span className="text-zinc-300"><span className="capitalize">{notification.channel}</span><span className="mx-2 text-zinc-600">·</span><span className="capitalize">{notification.event.replaceAll("_", " ")}</span></span><span className={notification.status === "failed" ? "text-rose-300" : "text-zinc-500"}><span className="capitalize">{notification.status}</span> · {notification.attempts} {notification.attempts === 1 ? "attempt" : "attempts"} · {formatTime(notification.sentAt || notification.createdAt)}</span></div>{notification.lastError && <p className="mt-2 break-words text-xs text-rose-300/80">{notification.lastError}</p>}</li>)}</ul>
    </details>
    <UptimeDialog open={ignoreOpen} onClose={() => setIgnoreOpen(false)} title="Ignore this detection?" description="No public incident will be created for this occurrence." busy={ignoring} footer={<><Button type="button" variant="secondary" size="sm" onClick={() => setIgnoreOpen(false)} disabled={ignoring}>Keep issue</Button><Button type="button" variant="danger" size="sm" loading={ignoring} onClick={() => void ignoreDetection()}>Ignore detection</Button></>}><p className="text-[13px] leading-6 text-zinc-400">Ignoring only dismisses this private issue. Checks continue and public component health is unchanged. A new detection can be created after confirmed recovery and another issue.</p>{ignoreError && <div className="mt-4"><UptimeError message={ignoreError} /></div>}</UptimeDialog>
  </div>;
}

function IncidentUpdateEditor({ orgSlug, incidentId, incidentTitle, draft, defaultStatus, automatic, observability = false, publicTitle: initialPublicTitle = null, publicTitleEditable = false, linkedComponents = true, firstPublication, monitorRecovered, pagePublished, editable, onSaved, onCancel }: {
  orgSlug: string;
  incidentId: string;
  incidentTitle: string;
  draft?: UptimeIncidentUpdate;
  defaultStatus: UpdateStatus;
  automatic: boolean;
  observability?: boolean;
  publicTitle?: string | null;
  publicTitleEditable?: boolean;
  linkedComponents?: boolean;
  firstPublication: boolean;
  monitorRecovered: boolean;
  pagePublished: boolean;
  editable: boolean;
  onSaved: (published: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState<IncidentDocument>(() => draft?.bodyJson ?? legacyIncidentDocument(draft?.note || ""));
  const [status, setStatus] = useState<UpdateStatus>(draft?.status || defaultStatus);
  const [publicTitle, setPublicTitle] = useState(initialPublicTitle ?? "");
  const [acknowledgeRecovery, setAcknowledgeRecovery] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const submissionPending = useRef(false);
  const optionalInitialUpdate = !automatic && !!draft && !draft.note.trim() && draft.bodyJson === null;
  const bodyDirty = optionalInitialUpdate ? Boolean(incidentPlainText(body)) : JSON.stringify(body) !== JSON.stringify(draft?.bodyJson ?? legacyIncidentDocument(draft?.note || ""));
  const dirty = bodyDirty || status !== (draft?.status || defaultStatus) || publicTitle !== (initialPublicTitle ?? "") || acknowledgeRecovery;
  const blocker = useUptimeUnsavedChanges(dirty || !!saving);
  const currentBlocker = useRef(blocker);

  useEffect(() => { currentBlocker.current = blocker; }, [blocker]);
  useEffect(() => {
    if (saving) return;
    if (fieldError?.field === "note" || fieldError?.field === "body") document.getElementById("incident-update-body")?.focus();
    else if (fieldError?.field === "status") document.getElementById("incident-update-status")?.focus();
    else if (fieldError?.field === "publicTitle") document.getElementById("incident-update-publicTitle")?.focus();
    else if (fieldError?.field === "acknowledgeRecovery") document.getElementById("incident-update-recovery")?.focus();
    else if (error) errorRef.current?.focus();
  }, [fieldError, error, saving]);

  const save = async (publish: boolean) => {
    if (!editable || submissionPending.current) return;
    setError(null);
    setFieldError(null);
    if (publish && observability && !publicTitle.trim()) {
      setFieldError({ field: "publicTitle", message: "Write a customer-facing title before publishing. The private alert name is not used automatically." });
      return;
    }
    if (publish && observability && !linkedComponents) {
      setError("Link this alert to visible status-page components before approving a public incident.");
      return;
    }
    if (publish && observability && status === "resolved" && !monitorRecovered && !acknowledgeRecovery) {
      setFieldError({ field: "acknowledgeRecovery", message: "Confirm recovery independently before publishing a resolved update. Missing telemetry is not recovery." });
      return;
    }
    if (!parseIncidentDocument(body, { allowEmpty: optionalInitialUpdate })) {
      setFieldError({ field: "body", message: "Write an update using supported formatting before saving." });
      return;
    }
    submissionPending.current = true;
    setSaving(publish ? "publish" : "draft");
    try {
      await uptimeRequest(orgSlug, `/incidents/${encodeURIComponent(incidentId)}/updates${draft ? `/${encodeURIComponent(draft.id)}` : ""}`, {
        method: draft ? "PATCH" : "POST",
        body: JSON.stringify({ body, status, publish, ...(observability && publicTitleEditable && publicTitle.trim() ? { publicTitle: publicTitle.trim() } : {}), ...(publish && observability && status === "resolved" && acknowledgeRecovery ? { acknowledgeRecovery: true } : {}), ...(draft?.componentStates ? { componentStates: draft.componentStates } : {}) }),
      });
      // Resolve a navigation attempt made during the request before this editor unmounts.
      if (currentBlocker.current.status === "blocked") currentBlocker.current.reset();
      await onSaved(publish);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save this update.";
      if (cause instanceof UptimeRequestError && (cause.field === "note" || cause.field === "body" || cause.field === "status" || cause.field === "publicTitle" || cause.field === "acknowledgeRecovery")) setFieldError({ field: cause.field, message });
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

  const requestClose = () => {
    if (saving) return;
    if (dirty) setDiscardOpen(true);
    else onCancel();
  };

  return <><UptimeSideSheet open onClose={requestClose} title={draft ? "Edit update draft" : "Share update"} description={incidentTitle} busy={!!saving} footer={<>
    <Button type="button" variant="secondary" size="sm" className="mr-auto" disabled={!!saving} onClick={requestClose}>Cancel</Button>
    <Button type="submit" variant="secondary" size="sm" form="incident-update-form" loading={saving === "draft"} disabled={saving === "publish" || !editable}>Save draft</Button>
    <Button type="button" size="sm" loading={saving === "publish"} disabled={saving === "draft" || !editable || !pagePublished || observability && (!linkedComponents || status === "resolved" && !monitorRecovered && !acknowledgeRecovery)} onClick={() => void save(true)}>{firstPublication ? "Acknowledge & publish" : "Publish update"}</Button>
  </>}>
    <form id="incident-update-form" aria-busy={!!saving} className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
      {automatic && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3"><span className="text-xs text-zinc-500">{observability ? "Recovery confirmation" : "Monitor state"}</span><StagePill stage={monitorRecovered ? "recovered" : "down"} compact /><span className="text-xs leading-5 text-zinc-500">{observability ? "Only confirmed healthy telemetry or independent team verification clears the incident impact." : "Checks control recovery; your update status describes the team’s progress."}</span></div>}
      {observability && <section aria-labelledby="incident-public-title-heading"><h3 id="incident-public-title-heading" className={labelClass}>Customer-facing incident title</h3>{publicTitleEditable ? <WorkspaceInput id="incident-update-publicTitle" className="mt-1.5" value={publicTitle} maxLength={160} disabled={!editable || !!saving} onChange={(event) => setPublicTitle(event.target.value)} placeholder="Elevated errors affecting checkout" aria-label="Customer-facing incident title" aria-invalid={fieldError?.field === "publicTitle"} aria-describedby={`incident-public-title-help${fieldError?.field === "publicTitle" ? " incident-public-title-error" : ""}`} /> : <p className="mt-1.5 text-xs text-zinc-300">{publicTitle || "No customer-facing title configured"}</p>}<p id="incident-public-title-help" className="mt-2 text-xs leading-5 text-zinc-500">Only this title and your written update are shared publicly. Never include private alert names or raw telemetry. Published titles are fixed.</p>{fieldError?.field === "publicTitle" && <p id="incident-public-title-error" role="alert" className="mt-2 text-xs text-rose-300">{fieldError.message}</p>}</section>}
      <section aria-labelledby="update-status-heading">
        <h3 id="update-status-heading" className={labelClass}>Status for this update</h3>
        <div className="mt-1.5"><IncidentStatusSelect id="incident-update-status" value={status} onChange={setStatus} disabled={!editable || !!saving} allowResolved={!automatic || monitorRecovered || observability} ariaLabel="Update status" invalid={fieldError?.field === "status"} describedBy={fieldError?.field === "status" ? "incident-status-error" : undefined} /></div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">{incidentStageDescriptions[status]}</p>
        {fieldError?.field === "status" && <p id="incident-status-error" role="alert" className="mt-2 text-xs text-rose-300">{fieldError.message}</p>}
      </section>
      {observability && status === "resolved" && !monitorRecovered && <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.025] p-4"><label className="flex items-start gap-2.5 text-xs leading-5 text-zinc-300"><UptimeCheckbox id="incident-update-recovery" checked={acknowledgeRecovery} disabled={!editable || !!saving} onChange={(event) => setAcknowledgeRecovery(event.target.checked)} aria-describedby="incident-recovery-help" aria-invalid={fieldError?.field === "acknowledgeRecovery"} /><span>I independently confirmed recovery</span></label><p id="incident-recovery-help" className="mt-2 text-[11px] leading-5 text-zinc-500">Publishing a resolved update with this confirmation closes the incident and clears its component impact. Do not confirm based only on absent telemetry, pausing, or deleting the alert.</p>{fieldError?.field === "acknowledgeRecovery" && <p role="alert" className="mt-2 text-xs text-rose-300">{fieldError.message}</p>}</div>}
      <section aria-labelledby="update-message-heading">
        <h3 id="update-message-heading" className={labelClass}>Message{optionalInitialUpdate ? <span className="font-normal text-zinc-500"> (optional)</span> : null}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">What happened, what the team is doing, and what people should expect next.</p>
        <IncidentRichEditor id="incident-update-body" initialBody={draft?.bodyJson} initialNote={draft?.note} onChange={setBody} disabled={!editable || !!saving} invalid={fieldError?.field === "body" || fieldError?.field === "note"} />
        {(fieldError?.field === "body" || fieldError?.field === "note") && <p id="incident-update-body-error" role="alert" className="mt-2 text-xs text-rose-300">{fieldError.message}</p>}
      </section>
      <div className="border-t border-white/[0.08] pt-4 text-[11px] leading-5 text-zinc-500"><p className="flex items-start gap-1.5"><Info size={12} className="mt-1 shrink-0" aria-hidden="true" /><span><span className="text-zinc-300">Save draft</span> keeps this private. <span className="text-zinc-300">Publish update</span> adds it to the public report and queues email to confirmed subscribers.</span></p>{!automatic && status === "resolved" && <p className="mt-2">Publishing this status also closes the incident.</p>}</div>
      {!pagePublished && <p className="text-xs leading-5 text-amber-200/80">Publish the status page before publishing an update. You can still save a draft.</p>}
      {observability && !linkedComponents && <p className="text-xs leading-5 text-amber-200/80">Link visible status-page components before publishing. Drafts remain private.</p>}
      {!editable && <p role="status" className="text-xs leading-5 text-amber-200/80">This update is no longer editable. Your text remains here so you can copy it.</p>}
      {error && <div ref={errorRef} tabIndex={-1} className="outline-none"><UptimeError message={error} /></div>}
    </form>
  </UptimeSideSheet><UptimeDialog layer={1} open={discardOpen || blocker.status === "blocked"} onClose={keepEditing} title="Discard unsaved changes?" busy={!!saving} footer={<><Button type="button" variant="secondary" size="sm" data-autofocus onClick={keepEditing} disabled={!!saving}>Keep editing</Button><Button type="button" size="sm" onClick={discard} disabled={!!saving}>Discard changes</Button></>}><p className="text-[13px] leading-6 text-zinc-400">{saving ? "Wait for this update to finish saving before leaving." : "Your unsaved update text and status changes will be lost."}</p></UptimeDialog></>;
}
