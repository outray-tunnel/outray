import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Info } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { IncidentComponentPicker } from "@/components/uptime/incident-component-picker";
import { UptimeDialog } from "@/components/uptime/uptime-dialog";
import { UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { labelClass, secondaryButtonMedium, UptimeError, uptimeControlsClassName } from "@/components/uptime/uptime-ui";
import { useUptimeUnsavedChanges } from "@/components/uptime/use-uptime-unsaved-changes";
import { useAlertDetail } from "./alert-detail-context";
import { alertStatusPageComponents, requestAlertStatusPage, type AlertStatusPageLink, type AlertStatusPageResponse } from "./alert-status-page-data";

export function AlertStatusPageTab() {
  const { data: detail, orgSlug, onReload } = useAlertDetail();
  const alertId = detail.alert.id;
  const [pageId, setPageId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["observability", orgSlug, "alert-status-page", alertId, pageId],
    queryFn: ({ signal }) => requestAlertStatusPage(orgSlug, alertId, { signal }, pageId),
    retry: false,
  });
  return <section className="space-y-4" aria-labelledby="alert-status-page-heading">
    <header><h2 id="alert-status-page-heading" className="text-[15px] font-medium text-zinc-200">Status page</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Connect this alert to customer-facing components. Your team approves every public update.</p></header>
    {query.isPending ? <UptimeSkeleton label="Loading status-page linking" className="space-y-4"><div className="h-9 rounded-lg bg-white/[0.04]" /><div className="h-40 rounded-xl bg-white/[0.04]" /></UptimeSkeleton> : !query.data ? <div className="space-y-3"><UptimeError message={query.error?.message || "Status-page linking is unavailable."} /><Button type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>Try again</Button></div> : <>
      {query.isError && <UptimeError message={`Could not refresh linking settings. ${query.error.message}`} />}
      {query.data.pages.length > 1 && <div className="max-w-xs"><Select label="Status page" value={query.data.page?.id ?? ""} onValueChange={setPageId} options={query.data.pages.map((page) => ({ value: page.id, label: page.name }))} /></div>}
      <AlertStatusPageForm key={`${orgSlug}:${alertId}:${query.data.page?.id ?? "none"}`} orgSlug={orgSlug} alertId={alertId} data={query.data} onReload={onReload} />
    </>}
  </section>;
}

export function AlertStatusPageForm({ orgSlug, alertId, data, onReload }: { orgSlug: string; alertId: string; data: AlertStatusPageResponse; onReload: () => void }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [publicTitle, setPublicTitle] = useState(data.link?.publicTitle ?? "");
  const [impact, setImpact] = useState<AlertStatusPageLink["impact"]>(data.link?.impact ?? "degraded");
  const [selected, setSelected] = useState(data.link?.componentIds ?? []);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const submitLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const pickerPage = useMemo(() => alertStatusPageComponents(data), [data]);
  const visibleIds = useMemo(() => new Set(data.components.filter((component) => component.visible).map((component) => component.id)), [data.components]);
  const unavailableIds = selected.filter((componentId) => !visibleIds.has(componentId));
  const dirty = publicTitle !== (data.link?.publicTitle ?? "") || impact !== (data.link?.impact ?? "degraded") || JSON.stringify([...selected].sort()) !== JSON.stringify([...(data.link?.componentIds ?? [])].sort());
  const blocker = useUptimeUnsavedChanges(dirty || saving);
  const currentBlocker = useRef(blocker);
  useEffect(() => { currentBlocker.current = blocker; }, [blocker]);
  const disabled = !data.canManage || saving;
  const toggle = useCallback((componentId: string, checked: boolean) => {
    setSelected((ids) => checked ? ids.includes(componentId) ? ids : [...ids, componentId] : ids.filter((value) => value !== componentId));
  }, []);

  const save = async (unlink = false) => {
    if (disabled || submitLock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!unlink && !publicTitle.trim()) nextErrors.publicTitle = "Write a customer-facing title. The private alert name is never used automatically.";
    if (!unlink && (!selected.length || unavailableIds.length)) nextErrors.componentIds = "Choose visible status-page components and remove unavailable selections.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      requestAnimationFrame(() => document.getElementById(`${id}-${nextErrors.publicTitle ? "publicTitle" : "componentIds"}`)?.focus());
      return;
    }
    submitLock.current = true;
    setSaving(true); setErrors({}); setNotice(null);
    try {
      const result = await requestAlertStatusPage(orgSlug, alertId, { method: "PATCH", body: JSON.stringify({ publicTitle: publicTitle.trim(), impact, componentIds: unlink ? [] : selected, pageId: data.page?.id }) }, data.page?.id);
      await queryClient.invalidateQueries({ queryKey: ["observability", orgSlug, "alert-status-page", alertId] });
      setPublicTitle(result.link?.publicTitle ?? ""); setImpact(result.link?.impact ?? "degraded"); setSelected(result.link?.componentIds ?? []);
      if (currentBlocker.current.status === "blocked") currentBlocker.current.reset();
      setNotice(unlink ? "Link removed for future detections. Existing public incidents and their component health are unchanged." : "Link saved. Detections stay private until your team publishes an update.");
      onReload();
      await queryClient.invalidateQueries({ queryKey: ["uptime", orgSlug] });
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : "Could not save linking settings." });
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { submitLock.current = false; setSaving(false); }
  };

  return <>
    <div className="rounded-xl border border-white/[0.08] bg-[#111112] p-5">
      {!data.page ? <div className="text-xs leading-6 text-zinc-400"><p>Create a status page and visible components before linking this alert.</p><Link to="/$orgSlug/uptime/status-page" params={{ orgSlug }} className={`${secondaryButtonMedium} mt-3`}>Set up status page<ArrowUpRight size={14} aria-hidden="true" /></Link></div> : <form className="space-y-5" aria-busy={saving} onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={disabled} className="min-w-0 space-y-5">
          <label className={labelClass} htmlFor={`${id}-publicTitle`}>Customer-facing incident title<WorkspaceInput id={`${id}-publicTitle`} className="mt-1.5" value={publicTitle} maxLength={160} required onChange={(event) => setPublicTitle(event.target.value)} placeholder="Elevated errors affecting checkout" aria-invalid={!!errors.publicTitle} aria-describedby={`${id}-title-help${errors.publicTitle ? ` ${id}-title-error` : ""}`} /><span id={`${id}-title-help`} className="mt-1.5 block text-[11px] leading-5 text-zinc-500">Public reports and subscriber emails use this title, not your private alert name. Already-published incident titles do not change.</span>{errors.publicTitle && <span role="alert" id={`${id}-title-error`} className="mt-1.5 block text-xs text-rose-300">{errors.publicTitle}</span>}</label>
          <div className={uptimeControlsClassName}><Select label="Component impact" value={impact} onValueChange={(value) => setImpact(value as AlertStatusPageLink["impact"])} disabled={disabled} options={[{ value: "degraded", label: "Degraded", description: "The component is working with reduced performance." }, { value: "outage", label: "Outage", description: "The component is unavailable." }]} /></div>
          <IncidentComponentPicker page={pickerPage} selected={selected} onToggle={toggle} id={`${id}-componentIds`} error={errors.componentIds} />
          {!!unavailableIds.length && <div className="text-xs leading-5 text-amber-200/80"><p>{unavailableIds.length} selected {unavailableIds.length === 1 ? "component is" : "components are"} hidden or no longer available.</p><Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setSelected((ids) => ids.filter((componentId) => visibleIds.has(componentId)))}>Remove unavailable selections</Button></div>}
          {!visibleIds.size && <p className="text-xs leading-5 text-zinc-500">No visible components are available. <Link to="/$orgSlug/uptime/status-page/components" params={{ orgSlug }} search={{ pageId: data.page.id }} className="text-zinc-300 underline underline-offset-4">Manage components</Link></p>}
        </fieldset>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[11px] leading-5 text-zinc-400"><p className="flex items-start gap-2"><Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Manual approval only. Linking does not publish an incident or send subscriber email. Approved updates apply the chosen impact; confirmed recovery clears it. Missing telemetry, pausing, or deleting an alert never count as recovery.</span></p><p className="mt-2">Alert names, service details, logs, and traces stay private. Review every written update before making it public.</p></div>
        {!data.page.published && <p className="text-xs leading-5 text-amber-200/80">Your status page is unpublished. Save the link now, then publish the page before approving a public update.</p>}
        {!data.canManage && <p className="text-xs text-zinc-500">Only organization owners and admins can change this link.</p>}
        {data.canManage && <div className="flex flex-wrap gap-2"><Button type="submit" size="md" loading={saving} disabled={!dirty || !visibleIds.size}>Save link</Button>{data.link && <Button type="button" variant="secondary" size="md" disabled={saving} onClick={() => void save(true)}>Remove link</Button>}</div>}
        {errors.form && <div ref={errorRef} tabIndex={-1} className="outline-none"><UptimeError message={errors.form} /></div>}
        {notice && <p role="status" className="text-xs leading-5 text-zinc-300">{notice}</p>}
      </form>}
      {data.incidentId && <Link to="/$orgSlug/uptime/incidents/$incidentId" params={{ orgSlug, incidentId: data.incidentId }} search={{ source: "observability" }} className={`${secondaryButtonMedium} mt-5`}>Review current incident<ArrowUpRight size={14} aria-hidden="true" /></Link>}
    </div>
    <UptimeDialog open={blocker.status === "blocked"} title="Discard unsaved linking changes?" onClose={() => blocker.reset?.()} busy={saving} footer={<><Button type="button" variant="secondary" size="sm" onClick={() => blocker.reset?.()} disabled={saving}>Keep editing</Button><Button type="button" size="sm" onClick={() => blocker.proceed?.()} disabled={saving}>Discard changes</Button></>}><p className="text-xs leading-6 text-zinc-400">Your unsaved customer-facing title, impact, and component selections will be lost.</p></UptimeDialog>
  </>;
}
