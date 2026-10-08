import { Link } from "@tanstack/react-router";
import { legacyIncidentDocument, parseIncidentDocument, type IncidentDocument } from "@outray/incident-content";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { pageComponents } from "@/lib/uptime/incident-display";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { Button } from "@/components/arc/button/button";
import buttonStyles from "@/components/arc/button/button.module.css";
import { IncidentStatusSelect } from "./incident-ui";
import { IncidentRichEditor } from "./incident-rich-editor";
import { IncidentComponentPicker } from "./incident-component-picker";
import { UptimeDialog } from "./uptime-dialog";
import { useUptimeUnsavedChanges } from "./use-uptime-unsaved-changes";
import { uptimeRequest, UptimeRequestError, type UptimeIncidentStatus, type UptimePageResponse } from "./uptime-client";
import { UptimeSkeleton } from "./uptime-skeleton";
import { labelClass, UptimeError } from "./uptime-ui";

export function CreateIncidentDialog({ orgSlug, onClose, onCreated }: {
  orgSlug: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const page = useQuery({ queryKey: ["uptime", orgSlug, "page"], queryFn: ({ signal }) => uptimeRequest<UptimePageResponse>(orgSlug, "/page", { signal }) });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<IncidentDocument>(() => legacyIncidentDocument(""));
  const [status, setStatus] = useState<UptimeIncidentStatus>("investigating");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState(false);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const dirty = Boolean(title || JSON.stringify(body) !== JSON.stringify(legacyIncidentDocument("")) || selected.length || status !== "investigating");
  const blocker = useUptimeUnsavedChanges(dirty);
  const components = useMemo(() => pageComponents(page.data), [page.data]);
  const toggleComponent = useCallback((id: string, checked: boolean) => {
    setSelected((ids) => checked ? ids.includes(id) ? ids : [...ids, id] : ids.filter((selectedId) => selectedId !== id));
  }, []);

  const requestClose = () => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } };
  const showErrors = (nextErrors: Record<string, string>) => {
    setErrors(nextErrors);
    const firstField = ["title", "componentIds", "status", "body"].find((field) => nextErrors[field]);
    if (firstField) requestAnimationFrame(() => {
      document.getElementById(`${formId}-${firstField}`)?.focus();
    });
  };
  const create = async (publish: boolean) => {
    if (submitting.current) return;
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = "Give this incident a title.";
    if (!selected.length) nextErrors.componentIds = "Choose at least one affected component.";
    if (!parseIncidentDocument(body)) nextErrors.body = "Describe what happened and what your team is doing.";
    if (Object.keys(nextErrors).length) { showErrors(nextErrors); return; }
    if (!formRef.current?.reportValidity()) return;
    submitting.current = true;
    setSaving(publish ? "publish" : "draft"); setErrors({});
    try {
      const result = await uptimeRequest<{ incident: { id: string } }>(orgSlug, "/incidents", {
        method: "POST", body: JSON.stringify({ title: title.trim(), body, status, componentIds: selected, publish }),
      });
      setTitle(""); setBody(legacyIncidentDocument("")); setStatus("investigating"); setSelected([]);
      onCreated(result.incident.id);
    } catch (cause) {
      const field = cause instanceof UptimeRequestError ? cause.field : undefined;
      showErrors({ [field && ["title", "body", "note", "componentIds", "status"].includes(field) ? field === "note" ? "body" : field : "form"]: cause instanceof Error ? cause.message : "Could not create incident. Your draft is still here." });
    } finally { submitting.current = false; setSaving(null); }
  };

  return <>
    <UptimeDialog open onClose={requestClose} title="Create incident" description="Keep customers informed about an issue affecting your services." busy={saving !== null} footer={<>
      <Button type="button" variant="secondary" size="sm" onClick={requestClose} className="mr-auto" disabled={saving !== null}>Cancel</Button>
      <Button type="submit" variant="secondary" size="sm" form={formId} loading={saving === "draft"} disabled={saving === "publish" || !page.data?.page || !components.length}>Save draft</Button>
      <Button type="button" size="sm" onClick={() => void create(true)} loading={saving === "publish"} disabled={saving === "draft" || !page.data?.page?.published || !components.length}>Publish incident</Button>
    </>}>
      {page.isPending ? <UptimeSkeleton label="Loading components" className="space-y-4"><div className="h-9 rounded-lg bg-white/[0.04]" /><div className="h-32 rounded-xl bg-white/[0.04]" /><div className="h-24 rounded-xl bg-white/[0.04]" /></UptimeSkeleton> : page.isError && !page.data ? <div className="space-y-3"><UptimeError message="Could not load your status page and components." /><Button type="button" variant="secondary" size="sm" onClick={() => void page.refetch()}>Try again</Button></div> : !page.data?.page || !components.length ? <div className="py-5 text-sm leading-6 text-zinc-400"><p>{!page.data?.page ? "Create a status page before reporting an incident." : "Add a component to your status page before reporting an incident."}</p><Link to="/$orgSlug/uptime/status-page/components" params={{ orgSlug }} className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm} mt-4`}>Set up components</Link></div> : <form id={formId} ref={formRef} aria-busy={saving !== null} onSubmit={(event) => { event.preventDefault(); void create(false); }} className="space-y-4">
        <fieldset disabled={saving !== null} className="min-w-0 space-y-4">
        <label className={labelClass} htmlFor={`${formId}-title`}>Incident title
          <WorkspaceInput id={`${formId}-title`} data-autofocus size="compact" className="mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Elevated errors during checkout" aria-invalid={!!errors.title} aria-describedby={errors.title ? `${formId}-title-error` : undefined} />
          {errors.title && <span role="alert" id={`${formId}-title-error`} className="mt-1.5 block text-xs font-normal text-rose-300">{errors.title}</span>}
        </label>
        <IncidentComponentPicker page={page.data} selected={selected} onToggle={toggleComponent} id={`${formId}-componentIds`} error={errors.componentIds} />
        <div className={labelClass}>Status
          <div className="mt-1.5"><IncidentStatusSelect id={`${formId}-status`} value={status} onChange={setStatus} disabled={saving !== null} invalid={!!errors.status} describedBy={errors.status ? `${formId}-status-error` : undefined} /></div>
          {errors.status && <span id={`${formId}-status-error`} role="alert" className="mt-1.5 block text-xs text-rose-300">{errors.status}</span>}
        </div>
        <div><p className={labelClass}>First update</p><IncidentRichEditor id={`${formId}-body`} onChange={setBody} disabled={saving !== null} invalid={!!errors.body} />
          {errors.body && <span role="alert" id={`${formId}-body-error`} className="mt-1.5 block text-xs font-normal text-rose-300">{errors.body}</span>}
        </div>
        <p className="flex items-start gap-1.5 text-[11px] leading-5 font-normal text-zinc-500"><Info size={12} className="mt-1 shrink-0" aria-hidden="true" /><span>{page.data.page.published ? "Publishing updates your public page and queues email for confirmed subscribers. Drafts stay private." : "Your status page is unpublished. Save a draft now, then publish the page before publishing this incident."}</span></p>
        {errors.form && <UptimeError message={errors.form} />}
        </fieldset>
      </form>}
    </UptimeDialog>
    <UptimeDialog layer={1} open={discard || blocker.status === "blocked"} onClose={() => { setDiscard(false); blocker.reset?.(); }} title="Discard this draft?" busy={saving !== null} footer={<><Button type="button" variant="secondary" size="sm" onClick={() => { setDiscard(false); blocker.reset?.(); }}>Keep editing</Button><Button type="button" size="sm" disabled={saving !== null} onClick={() => { if (blocker.status === "blocked") blocker.proceed(); onClose(); }}>Discard draft</Button></>}><p className="text-sm leading-6 text-zinc-400">Your unsaved incident details will be lost.</p></UptimeDialog>
  </>;
}
