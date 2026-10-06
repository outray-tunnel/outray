import { Link } from "@tanstack/react-router";
import { legacyIncidentDocument, parseIncidentDocument, type IncidentDocument } from "@outray/incident-content";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { pageComponents } from "@/lib/uptime/incident-display";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { workspaceInputShellClassName } from "@/components/ui/workspace-input-styles";
import { IncidentStatusSelect } from "./incident-ui";
import { IncidentRichEditor } from "./incident-rich-editor";
import { UptimeDialog } from "./uptime-dialog";
import { useUptimeUnsavedChanges } from "./use-uptime-unsaved-changes";
import { uptimeRequest, UptimeRequestError, type UptimeIncidentStatus, type UptimePageResponse } from "./uptime-client";
import { UptimeSkeleton } from "./uptime-skeleton";
import { labelClass, primaryButton, secondaryButton, UptimeError } from "./uptime-ui";

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
  const [componentSearch, setComponentSearch] = useState("");
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState(false);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const dirty = Boolean(title || JSON.stringify(body) !== JSON.stringify(legacyIncidentDocument("")) || selected.length || status !== "investigating");
  const blocker = useUptimeUnsavedChanges(dirty);
  const components = pageComponents(page.data);
  const groups = [
    { id: "standalone", name: "Standalone components", components: page.data?.standaloneComponents ?? [] },
    ...(page.data?.groups ?? []),
  ].map((group) => ({ ...group, components: group.components.filter((component) => component.name.toLowerCase().includes(componentSearch.trim().toLowerCase())) })).filter((group) => group.components.length);

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
      <button type="button" onClick={requestClose} className={`${secondaryButton} mr-auto`} disabled={saving !== null}>Cancel</button>
      <button type="submit" form={formId} className={secondaryButton} disabled={saving !== null || !page.data?.page || !components.length}>{saving === "draft" ? "Saving…" : "Save draft"}</button>
      <button type="button" onClick={() => void create(true)} className={primaryButton} disabled={saving !== null || !page.data?.page?.published || !components.length}>{saving === "publish" ? "Publishing…" : "Publish incident"}</button>
    </>}>
      {page.isPending ? <UptimeSkeleton label="Loading components" className="space-y-5"><div className="h-10 rounded-xl bg-white/[0.04]" /><div className="h-32 rounded-xl bg-white/[0.04]" /><div className="h-24 rounded-xl bg-white/[0.04]" /></UptimeSkeleton> : page.isError && !page.data ? <div className="space-y-3"><UptimeError message="Could not load your status page and components." /><button type="button" onClick={() => void page.refetch()} className={secondaryButton}>Try again</button></div> : !page.data?.page || !components.length ? <div className="py-5 text-sm leading-6 text-zinc-400"><p>{!page.data?.page ? "Create a status page before reporting an incident." : "Add a component to your status page before reporting an incident."}</p><Link to="/$orgSlug/uptime/status-page/components" params={{ orgSlug }} className={`${secondaryButton} mt-4`}>Set up components</Link></div> : <form id={formId} ref={formRef} onSubmit={(event) => { event.preventDefault(); void create(false); }} className="space-y-5">
        <fieldset disabled={saving !== null} className="min-w-0 space-y-5">
        <label className={labelClass} htmlFor={`${formId}-title`}>Incident title
          <WorkspaceInput id={`${formId}-title`} data-autofocus className="mt-2" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Elevated errors during checkout" aria-invalid={!!errors.title} aria-describedby={errors.title ? `${formId}-title-error` : undefined} />
          {errors.title && <span role="alert" id={`${formId}-title-error`} className="mt-1.5 block text-xs font-normal text-rose-300">{errors.title}</span>}
        </label>
        <fieldset>
          <legend className={`${labelClass} mb-2`}>Affected components <span className="ml-1 font-normal text-zinc-500">{selected.length ? `${selected.length} selected` : ""}</span></legend>
          <div className="overflow-hidden rounded-xl border border-white/[0.1]">
            <div data-field-size="compact" className={`${workspaceInputShellClassName} gap-2 !rounded-none !border-x-0 !border-t-0 px-3`}><Search size={14} className="text-zinc-600" aria-hidden="true" /><WorkspaceInput id={`${formId}-componentIds`} variant="bare" size="compact" className="min-w-0 flex-1" value={componentSearch} onChange={(event) => setComponentSearch(event.target.value)} aria-label="Find a component" aria-invalid={!!errors.componentIds} aria-describedby={errors.componentIds ? `${formId}-components-error` : undefined} placeholder="Find a component" /></div>
            <div className="max-h-44 overflow-y-auto p-2">
              {groups.map((group) => <div key={group.id} className="mb-2 last:mb-0"><p className="px-2 pb-1 pt-1.5 text-[11px] text-zinc-500">{group.name}</p>{group.components.map((component) => <label key={component.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/[0.04]"><input type="checkbox" className="peer sr-only" checked={selected.includes(component.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, component.id] : ids.filter((id) => id !== component.id))} /><span aria-hidden="true" className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-white/20 text-transparent transition-colors peer-checked:border-violet-400 peer-checked:bg-violet-400 peer-checked:text-black peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet-400">✓</span><span className="min-w-0 flex-1 truncate">{component.name}</span>{!component.visible && <span className="text-[11px] text-zinc-600">Hidden</span>}</label>)}</div>)}
              {!groups.length && <p className="px-2 py-4 text-xs text-zinc-500">No components match your search.</p>}
            </div>
          </div>
          {errors.componentIds && <p id={`${formId}-components-error`} role="alert" className="mt-1.5 text-xs text-rose-300">{errors.componentIds}</p>}
        </fieldset>
        <div className={labelClass} id={`${formId}-status`}>Status
          <div className="mt-2"><IncidentStatusSelect value={status} onChange={setStatus} disabled={saving !== null} /></div>
          {errors.status && <span role="alert" className="mt-1.5 block text-xs text-rose-300">{errors.status}</span>}
        </div>
        <div><p className={labelClass}>First update</p><IncidentRichEditor id={`${formId}-body`} onChange={setBody} disabled={saving !== null} invalid={!!errors.body} />
          {errors.body && <span role="alert" id={`${formId}-body-error`} className="mt-1.5 block text-xs font-normal text-rose-300">{errors.body}</span>}
        </div>
        <p className="text-xs leading-5 text-zinc-500">{page.data.page.published ? "Publishing adds this update to your public status page and queues email for confirmed subscribers. Drafts stay private." : "Your status page is unpublished. Save a draft now, then publish the page before publishing this incident."}</p>
        {errors.form && <UptimeError message={errors.form} />}
        </fieldset>
      </form>}
    </UptimeDialog>
    <UptimeDialog open={discard || blocker.status === "blocked"} onClose={() => { setDiscard(false); blocker.reset?.(); }} title="Discard this draft?" busy={saving !== null} footer={<><button type="button" className={secondaryButton} onClick={() => { setDiscard(false); blocker.reset?.(); }}>Keep editing</button><button type="button" className={primaryButton} disabled={saving !== null} onClick={() => { if (blocker.status === "blocked") blocker.proceed(); onClose(); }}>Discard draft</button></>}><p className="text-sm leading-6 text-zinc-400">Your unsaved incident details will be lost.</p></UptimeDialog>
  </>;
}
