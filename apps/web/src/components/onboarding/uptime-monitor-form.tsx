import { useId, useRef, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowDown01Icon from "@outray/icons/stroke/ArrowDown01Icon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { Button } from "../arc/button/button";
import { Select } from "../ui/select";
import { WorkspaceInput, WorkspaceTextarea } from "../ui/workspace-input";
import { UptimeEmailRecipients } from "../uptime/email-recipients";
import { uptimeRequest, UptimeRequestError, type UptimeMonitor } from "../uptime/uptime-client";
import {
  createUptimeMonitorDraft,
  isUptimeMonitorField,
  validateUptimeMonitorDraft,
  type MonitorField,
  type UptimeMonitorDraft,
} from "./uptime-monitor-input";
import "../outray-arc-theme.css";

export interface UptimeMonitorFormProps {
  orgSlug: string;
  onCreated: (monitor: UptimeMonitor) => void;
}

const selectClass = "h-9 rounded-lg focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none";
const selectMenuClass = "[&_.text-zinc-700]:text-zinc-400";
const publishingModes = [
  { value: "manual", label: "Manual", description: "Publish a public incident yourself." },
  { value: "after_confirmation", label: "After confirmation", description: "Publish if the monitor stays Down." },
  { value: "automatic", label: "Automatic", description: "Publish once Down is confirmed." },
];

export function UptimeMonitorForm({ orgSlug, onCreated }: UptimeMonitorFormProps) {
  const [draft, setDraft] = useState(createUptimeMonitorDraft);
  const [moreOptions, setMoreOptions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ field?: MonitorField; message: string } | null>(null);
  const [created, setCreated] = useState<UptimeMonitor | null>(null);
  const submissionLocked = useRef(false);
  const id = useId();

  function update<K extends keyof UptimeMonitorDraft>(field: K, value: UptimeMonitorDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function errorId(field: MonitorField) {
    return error?.field === field ? `${id}-${field}-error` : undefined;
  }

  function fieldError(field: MonitorField) {
    return error?.field === field ? <p id={errorId(field)} role="alert" className="mt-1.5 text-[12px] leading-5 text-rose-300">{error.message}</p> : null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current || created) return;
    const validation = validateUptimeMonitorDraft(draft);
    if (!validation.success) {
      setError({ field: validation.field, message: validation.error });
      if (validation.field !== "name" && validation.field !== "url") setMoreOptions(true);
      return;
    }
    submissionLocked.current = true;
    setIsSaving(true);
    setError(null);
    let monitor: UptimeMonitor;
    try {
      const result = await uptimeRequest<{ monitor: UptimeMonitor }>(orgSlug, "/monitors", {
        method: "POST", body: JSON.stringify(validation.data),
      });
      if (!result.monitor?.id) throw new Error("The server did not return the created monitor.");
      monitor = result.monitor;
    } catch (cause) {
      const field = cause instanceof UptimeRequestError && isUptimeMonitorField(cause.field) ? cause.field : undefined;
      setError({ field, message: cause instanceof Error ? cause.message : "Could not create the monitor. Please try again." });
      if (field && field !== "name" && field !== "url") setMoreOptions(true);
      submissionLocked.current = false;
      setIsSaving(false);
      return;
    }
    setDraft((current) => ({ ...current, headers: "" }));
    setCreated(monitor);
    setIsSaving(false);
    // Keep the successful form locked, even if a stale submit event arrives.
    try { onCreated(monitor); } catch {
      setError({ message: "The monitor was created, but setup verification could not be refreshed. You can check it in the console." });
    }
  }

  if (created) {
    return (
      <section aria-label="Created monitor" className="space-y-3">
        <div role="status" className="flex items-center gap-2 text-[13px] text-zinc-100">
          <HugeiconsIcon icon={Tick02Icon} size={16} className="text-emerald-400" aria-hidden="true" /> Monitor created
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-3">
          <p className="break-words text-[13px] text-zinc-200">{created.name}</p>
          <p className="mt-1 break-all font-mono text-[11px] leading-5 text-zinc-400">{created.method} {created.url}</p>
        </div>
        <p className="text-[12px] leading-5 text-zinc-400">Your monitor starts as Unknown. We’ll verify its first check here automatically.</p>
        {error && <p role="alert" className="text-[12px] leading-5 text-amber-300">{error.message}</p>}
      </section>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-busy={isSaving} className="outray-arc space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1.5 block text-[13px] text-zinc-300">Monitor name</label>
          <WorkspaceInput id={`${id}-name`} value={draft.name} onChange={(event) => update("name", event.target.value)} required maxLength={120} readOnly={isSaving} autoComplete="off" placeholder="Public API" aria-invalid={!!errorId("name")} aria-describedby={errorId("name")} />
          {fieldError("name")}
        </div>
        <div>
          <label htmlFor={`${id}-url`} className="mb-1.5 block text-[13px] text-zinc-300">Public URL</label>
          <WorkspaceInput id={`${id}-url`} value={draft.url} onChange={(event) => update("url", event.target.value)} required type="url" maxLength={2_048} readOnly={isSaving} autoComplete="url" placeholder="https://api.example.com/health" aria-invalid={!!errorId("url")} aria-describedby={[`${id}-url-hint`, errorId("url")].filter(Boolean).join(" ")} />
          {fieldError("url")}
        </div>
      </div>
      <p id={`${id}-url-hint`} className="text-[12px] leading-5 text-zinc-400">Use a public HTTP or HTTPS endpoint. Private addresses and custom ports are not supported.</p>

      <Button type="button" variant="ghost" size="sm" disabled={isSaving} aria-expanded={moreOptions} aria-controls={`${id}-options`} onClick={() => setMoreOptions((current) => !current)}>
        More options <HugeiconsIcon icon={ArrowDown01Icon} size={13} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${moreOptions ? "rotate-180" : ""}`} />
      </Button>

      <div id={`${id}-options`} hidden={!moreOptions}>
        {moreOptions && <fieldset disabled={isSaving} className="space-y-4 border-t border-white/[0.07] pt-4">
          <legend className="sr-only">Monitor options</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div role="group" aria-label="Method" aria-describedby={errorId("method")}>
              <p className="mb-1.5 text-[13px] text-zinc-300">Method</p>
              <Select ariaLabel="Method" value={draft.method} disabled={isSaving} onChange={(value) => update("method", value as UptimeMonitorDraft["method"])} options={[{ value: "GET", label: "GET" }, { value: "HEAD", label: "HEAD" }]} triggerClassName={selectClass} menuClassName={selectMenuClass} />
              {fieldError("method")}
            </div>
            <div role="group" aria-label="Expected status" aria-describedby={errorId("expectedStatus")}>
              <p className="mb-1.5 text-[13px] text-zinc-300">Expected status</p>
              <Select ariaLabel="Expected status" value={draft.statusMode} disabled={isSaving} onChange={(value) => update("statusMode", value as UptimeMonitorDraft["statusMode"])} options={[{ value: "range", label: "Any 200–399" }, { value: "exact", label: "Exact code" }]} triggerClassName={selectClass} menuClassName={selectMenuClass} />
              {draft.statusMode === "exact" && <WorkspaceInput aria-label="Exact HTTP status code" aria-invalid={!!errorId("expectedStatus")} aria-describedby={errorId("expectedStatus")} type="number" min={100} max={599} required value={draft.expectedStatus} onChange={(event) => update("expectedStatus", event.target.value)} readOnly={isSaving} className="mt-2" />}
              {fieldError("expectedStatus")}
            </div>
          </div>
          {draft.method === "GET" && <div>
            <label htmlFor={`${id}-responseText`} className="mb-1.5 block text-[13px] text-zinc-300">Response text <span className="text-zinc-400">(optional)</span></label>
            <WorkspaceInput id={`${id}-responseText`} value={draft.responseText} onChange={(event) => update("responseText", event.target.value)} maxLength={256} readOnly={isSaving} autoComplete="off" placeholder="healthy" aria-invalid={!!errorId("responseText")} aria-describedby={[`${id}-text-hint`, errorId("responseText")].filter(Boolean).join(" ")} />
            <p id={`${id}-text-hint`} className="mt-1.5 text-[11px] leading-5 text-zinc-400">Literal, case-sensitive match, up to 256 characters. Response content is not stored.</p>
            {fieldError("responseText")}
          </div>}
          <div>
            <label htmlFor={`${id}-headers`} className="mb-1.5 block text-[13px] text-zinc-300">Headers <span className="text-zinc-400">(optional)</span></label>
            <WorkspaceTextarea id={`${id}-headers`} value={draft.headers} onChange={(event) => update("headers", event.target.value)} rows={3} readOnly={isSaving} autoComplete="off" spellCheck={false} placeholder="Authorization: Bearer …" aria-invalid={!!errorId("headers")} aria-describedby={[`${id}-headers-hint`, errorId("headers")].filter(Boolean).join(" ")} className="ph-no-capture font-mono" />
            <p id={`${id}-headers-hint`} className="mt-1.5 text-[11px] leading-5 text-zinc-400">One Name: Value per line. Values are encrypted at rest and are not shown after saving. Host, Cookie, and proxy headers are not allowed.</p>
            {fieldError("headers")}
          </div>
          <div role="group" aria-label="Team recipients" aria-describedby={errorId("notificationEmails")} className="[&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
            <UptimeEmailRecipients orgSlug={orgSlug} value={draft.notificationEmails} onChange={(value) => update("notificationEmails", value)} />
            {fieldError("notificationEmails")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div role="group" aria-label="Failure confirmation" aria-describedby={errorId("failureThreshold")}>
              <p className="mb-1.5 text-[13px] text-zinc-300">Confirm Down after</p>
              <Select ariaLabel="Failed checks to confirm Down" value={String(draft.failureThreshold)} disabled={isSaving} onChange={(value) => update("failureThreshold", Number(value))} options={[2, 3, 4, 5].map((count) => ({ value: String(count), label: `${count} failed checks` }))} triggerClassName={selectClass} menuClassName={selectMenuClass} />
              {fieldError("failureThreshold")}
            </div>
            <div role="group" aria-label="Incident publishing" aria-describedby={errorId("incidentPublishing")}>
              <p className="mb-1.5 text-[13px] text-zinc-300">Public incidents</p>
              <Select ariaLabel="Incident publishing mode" value={draft.incidentPublishing} disabled={isSaving} onChange={(value) => update("incidentPublishing", value as UptimeMonitorDraft["incidentPublishing"])} options={publishingModes} triggerClassName={selectClass} menuClassName={selectMenuClass} />
              {fieldError("incidentPublishing")}
            </div>
          </div>
          {draft.incidentPublishing === "after_confirmation" && <div>
            <label htmlFor={`${id}-publishAfterMinutes`} className="mb-1.5 block text-[13px] text-zinc-300">Publish if still Down after (minutes)</label>
            <WorkspaceInput id={`${id}-publishAfterMinutes`} type="number" min={1} max={60} required value={draft.publishAfterMinutes} onChange={(event) => update("publishAfterMinutes", event.target.value)} readOnly={isSaving} aria-invalid={!!errorId("publishAfterMinutes")} aria-describedby={errorId("publishAfterMinutes")} className="max-w-28" />
            {fieldError("publishAfterMinutes")}
          </div>}
          <p className="text-[11px] leading-5 text-zinc-400">Manual is the default. Public incidents need a published status page and a linked, visible component; monitor health is checked regardless.</p>
        </fieldset>}
      </div>

      {error && !error.field && <p role="alert" className="text-[12px] leading-5 text-rose-300">{error.message}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" loading={isSaving}>Create monitor</Button>
        <p className="text-[11px] leading-5 text-zinc-400">Checks run every minute. New monitors start as Unknown.</p>
      </div>
    </form>
  );
}
