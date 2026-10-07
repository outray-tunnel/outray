import { useId, useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Eye, History, LockKeyhole, PencilLine, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import type { SecretAuditEvent } from "@/lib/secrets-client";
import { auditActionLabel, auditActorDetail, auditActorLabel, auditCategory, auditLocation, auditResourceName, auditVaultOptions, filterAuditEvents, groupAuditEvents, type AuditCategory, type AuditDay } from "./audit-data";
import { formatSecretDate } from "./utils";
import "../outray-arc-theme.css";

export interface SecretsAuditContentProps {
  events?: SecretAuditEvent[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError?: string | null;
  search: string;
  resource: string;
  actor: string;
  vault: string;
  selectedId?: string | null;
  onSearchChange: (value: string) => void;
  onResourceChange: (value: string) => void;
  onActorChange: (value: string) => void;
  onVaultChange: (value: string) => void;
  onClearFilters: () => void;
  onChooseVaults: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenEvent: (event: SecretAuditEvent) => void;
}

const resources = [
  { value: "all", label: "All resources" }, { value: "secret", label: "Secrets" }, { value: "bulk", label: "Secret batches" },
  { value: "project", label: "Vaults" }, { value: "environment", label: "Environments" }, { value: "share", label: "Shares" },
  { value: "machine_token", label: "Machine tokens" }, { value: "organization_key", label: "Workspace keys" },
];
const categoryDetails: Record<AuditCategory, { icon: typeof Eye; color: string }> = {
  access: { icon: Eye, color: "text-sky-300/65" }, change: { icon: PencilLine, color: "text-zinc-400" },
  delete: { icon: Trash2, color: "text-rose-300/65" }, security: { icon: ShieldCheck, color: "text-amber-200/65" },
};

export function SecretsAuditContent({ events, loading, refreshing, error, hasMore, loadingMore, loadMoreError, search, resource, actor, vault, selectedId,
  onSearchChange, onResourceChange, onActorChange, onVaultChange, onClearFilters, onChooseVaults, onRetry, onLoadMore, onOpenEvent }: SecretsAuditContentProps) {
  const records = events ?? [];
  const matches = useMemo(() => filterAuditEvents(events ?? [], { search, resource, actor, vault }), [events, search, resource, actor, vault]);
  const days = useMemo(() => groupAuditEvents(matches), [matches]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const vaultOptions = useMemo(() => auditVaultOptions(events ?? []), [events]);
  // Keep the chosen filter visible even if a refresh no longer includes that vault.
  const selectedVaultOptions = vaultOptions.some((option) => option.value === vault) ? vaultOptions : [...vaultOptions, { value: vault, label: "Previously selected vault" }];
  const filtered = Boolean(search.trim()) || resource !== "all" || actor !== "all" || vault !== "all";
  const busy = refreshing || loadingMore;
  const allCollapsed = days.length > 0 && days.every((day) => collapsed.has(day.key));
  const changeFilter = (callback: (value: string) => void) => (value: string) => { setCollapsed(new Set()); callback(value); };
  const clearFilters = () => { setCollapsed(new Set()); onClearFilters(); };
  const toggleDay = (key: string, open: boolean) => setCollapsed((current) => {
    if (current.has(key) === !open) return current;
    const next = new Set(current);
    if (open) next.delete(key); else next.add(key);
    return next;
  });

  return <div data-private-product="secrets" className="outray-arc ph-no-capture mx-auto w-full max-w-[1440px] space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0"><h1 data-audit-heading tabIndex={-1} className="text-[20px] font-normal tracking-[-0.035em] text-white">Audit log</h1>
        <p className="mt-1 text-[12px] leading-5 text-zinc-500">Who accessed or changed your secrets, and when.</p></div>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"><LockKeyhole size={12} aria-hidden="true" />Metadata only</span>
    </header>

    {loading && !events ? <AuditSkeleton /> : !events ? <section role="alert" className="rounded-xl border border-white/[0.08] bg-[#111112] px-6 py-14 text-center">
      <History size={22} className="mx-auto text-zinc-500" aria-hidden="true" /><h2 className="mt-4 text-[14px] font-medium text-zinc-200">Could not load audit activity</h2>
      <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-zinc-500">{error || "Try again to load your audit log."}</p><Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Try again</Button>
    </section> : <>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75"><span>Could not refresh the audit log. Showing the last available activity.</span><Button variant="ghost" size="sm" disabled={busy} onClick={onRetry}>Retry</Button></div>}
      {records.length === 0 ? <section className="rounded-xl border border-white/[0.08] bg-white/[0.015] px-6 py-14 text-center sm:py-20" aria-labelledby="audit-empty-title">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.025] text-zinc-400"><History size={22} aria-hidden="true" /></div>
        <h2 id="audit-empty-title" className="mt-5 text-[16px] font-medium tracking-[-0.02em] text-zinc-200">No activity yet</h2>
        <p className="mx-auto mt-2 max-w-[430px] text-[13px] leading-6 text-zinc-500">Reveals, copies, changes, and deletions will appear here as people or machine tokens use your vaults. Secret values are never shown in this log.</p>
        <Button variant="secondary" size="md" className="mt-6" onClick={onChooseVaults}>View vaults<ArrowRight size={14} aria-hidden="true" /></Button>
      </section> : <section aria-label="Audit activity" className="@container/audit-log space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="outray-arc-requests-search min-w-0 flex-1 basis-full @[720px]/audit-log:basis-[200px]"><SearchField appearance="workspace" label="Search loaded audit events" value={search} onValueChange={changeFilter(onSearchChange)} placeholder="Search loaded activity…" maxLength={200} autoComplete="off" spellCheck={false} /></div>
          <div className="outray-arc-address-filter min-w-0 flex-1 basis-[154px] @[720px]/audit-log:max-w-[166px]"><Select label="Filter by resource" value={resource} onValueChange={changeFilter(onResourceChange)} options={resources} /></div>
          <div className="outray-arc-address-filter min-w-0 flex-1 basis-[140px] @[720px]/audit-log:max-w-[145px]"><Select label="Filter by actor" value={actor} onValueChange={changeFilter(onActorChange)} options={[{ value: "all", label: "All actors" }, { value: "user", label: "Members" }, { value: "machine", label: "Machine tokens" }, { value: "system", label: "System" }]} /></div>
          <div className="outray-arc-address-filter min-w-0 flex-1 basis-[160px] @[720px]/audit-log:max-w-[190px]"><Select label="Filter by vault" value={vault} onValueChange={changeFilter(onVaultChange)} options={selectedVaultOptions} /></div>
          <Button variant="ghost" size="sm" disabled={busy} aria-label="Refresh audit log" title="Refresh audit log" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /></Button>
        </div>

        {matches.length === 0 ? <div className="rounded-xl border border-white/[0.08] bg-[#111112] px-6 py-14 text-center"><Search size={22} className="mx-auto text-zinc-500" aria-hidden="true" /><h2 className="mt-4 text-[14px] font-medium text-zinc-200">No matching activity</h2>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-zinc-500">No loaded events match these filters.{hasMore ? " Load older activity to search more history, or clear your filters." : " Try another name or clear your filters."}</p><Button variant="ghost" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
        </div> : <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-3 px-1"><span className="text-[11px] text-zinc-500">Activity timeline</span><Button variant="ghost" size="sm" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(days.map((day) => day.key)))}>{allCollapsed ? "Expand all" : "Collapse all"}</Button></div>
          {days.map((day) => <AuditDayGroup key={day.key} day={day} open={!collapsed.has(day.key)} onToggle={(open) => toggleDay(day.key, open)} selectedId={selectedId} onOpenEvent={onOpenEvent} />)}
        </div>}

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-[11px] leading-5 text-zinc-500">
          <p className="inline-flex items-center gap-1.5"><ShieldCheck size={12} aria-hidden="true" />Open an event for its recorded details. No secret values are included.</p>
          <p role="status" aria-live="polite" className="inline-flex items-center gap-1.5 tabular-nums">{refreshing && <RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{refreshing ? "Updating activity" : filtered ? `${matches.length.toLocaleString()} of ${records.length.toLocaleString()} loaded events` : `${records.length.toLocaleString()} events loaded`}</p>
        </div>
        {hasMore && <p className="text-[11px] leading-5 text-zinc-500">Search and filters apply to loaded events. Load older activity to search more history.</p>}
        {loadMoreError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-400/15 bg-rose-400/[0.035] px-4 py-2.5 text-[12px] text-rose-100/75"><span>{loadMoreError}</span><Button variant="ghost" size="sm" disabled={busy} onClick={onLoadMore}>Retry loading older activity</Button></div>}
        {hasMore && <div className="flex justify-center pt-1"><Button variant="secondary" size="sm" loading={loadingMore} disabled={refreshing} onClick={onLoadMore}>Load older activity</Button></div>}
      </section>}
    </>}
  </div>;
}

function AuditDayGroup({ day, open, onToggle, selectedId, onOpenEvent }: { day: AuditDay; open: boolean; onToggle: (open: boolean) => void; selectedId?: string | null; onOpenEvent: (event: SecretAuditEvent) => void }) {
  const id = useId();
  return <details data-audit-day={day.key} open={open} onToggle={(event) => onToggle(event.currentTarget.open)} className="group/day overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.01]">
    <summary id={`${id}-heading`} aria-expanded={open} aria-controls={`${id}-events`} className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-zinc-400 transition-colors hover:bg-white/[0.025] hover:text-zinc-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-500 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
      <ChevronRight size={13} className="shrink-0 transition-transform duration-150 group-open/day:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      <h2 className="text-[12px] font-medium text-zinc-300">{day.label}</h2>
      <span className="ml-auto rounded-md bg-white/[0.035] px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500">{day.events.length} {day.events.length === 1 ? "event" : "events"}</span>
    </summary>
    <ol id={`${id}-events`} aria-label={`${day.label} audit events`} aria-labelledby={`${id}-heading`} className="px-2 pb-2 sm:px-4">
      {day.events.map((event) => <AuditRow key={event.id} event={event} selected={selectedId === event.id} onOpen={onOpenEvent} />)}
    </ol>
  </details>;
}

function AuditRow({ event, selected, onOpen }: { event: SecretAuditEvent; selected: boolean; onOpen: (event: SecretAuditEvent) => void }) {
  const { icon: Icon, color } = categoryDetails[auditCategory(event.action)];
  const actor = auditActorLabel(event);
  const date = new Date(event.createdAt);
  const time = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date) : "Unknown";
  return <li data-audit-event={event.id} className="relative before:absolute before:bottom-0 before:left-[22px] before:top-0 before:w-px before:bg-white/[0.07] first:before:top-7 last:before:bottom-auto last:before:h-7 only:before:hidden">
    <button type="button" aria-haspopup="dialog" aria-expanded={selected} aria-label={`${auditActionLabel(event.action)}: ${auditResourceName(event)}, by ${actor}. View event details.`}
      className={`group relative grid min-h-[84px] w-full min-w-0 grid-cols-[28px_minmax(0,1fr)_12px] items-start gap-x-3 gap-y-1 rounded-lg px-2 py-3.5 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-500 motion-reduce:transition-none sm:grid-cols-[28px_minmax(0,1fr)_80px_12px] ${selected ? "bg-white/[0.035]" : ""}`}
      onClick={(click) => { click.currentTarget.focus({ preventScroll: true }); onOpen(event); }}>
      <span className={`relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#161617] ${color}`}><Icon size={13} aria-hidden="true" /></span>
      <span className="min-w-0 pt-0.5">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] leading-5"><span className="font-medium text-zinc-200">{auditActionLabel(event.action)}</span><span className="max-w-full truncate font-mono text-[11px] text-zinc-500">{auditResourceName(event)}</span></span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-5">
          <span className="max-w-full truncate text-zinc-400">{actor}</span><span className="text-zinc-700" aria-hidden="true">·</span><span className="text-zinc-600">{auditActorDetail(event)}</span>
          <span className="text-zinc-700" aria-hidden="true">·</span><span className="max-w-full truncate text-zinc-500">{auditLocation(event)}</span>
        </span>
        {event.result === "failure" || event.result === "denied" ? <span className={`mt-1 block text-[10px] ${event.result === "failure" ? "text-rose-300/75" : "text-amber-200/75"}`}>{event.result === "failure" ? "Failed" : "Denied"}</span> : null}
      </span>
      <time dateTime={event.createdAt} title={formatSecretDate(event.createdAt)} className="col-start-2 row-start-2 text-[10px] leading-5 tabular-nums text-zinc-600 sm:col-start-3 sm:row-start-1 sm:pt-1 sm:text-right">{time}</time>
      <ChevronRight size={12} className="col-start-3 row-start-1 mt-1.5 text-zinc-700 transition-colors group-hover:text-zinc-400 motion-reduce:transition-none sm:col-start-4" aria-hidden="true" />
      {event.result === "success" && <span className="sr-only">Successful event</span>}
    </button>
  </li>;
}

function AuditSkeleton() {
  return <section aria-label="Loading audit activity" aria-busy="true" className="@container/audit-log space-y-3 animate-pulse motion-reduce:animate-none">
    <div aria-hidden="true" className="flex flex-wrap gap-2"><div className="h-9 min-w-[200px] flex-1 rounded-lg bg-white/[0.04]" /><div className="h-9 w-40 rounded-lg bg-white/[0.04]" /><div className="h-9 w-36 rounded-lg bg-white/[0.04]" /><div className="h-9 w-44 rounded-lg bg-white/[0.04]" /></div>
    {[3, 2].map((rows, day) => <div key={day} aria-hidden="true" className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.01]">
      <div className="flex h-12 items-center gap-3 px-4"><div className="size-3 rounded bg-white/[0.04]" /><div className="h-3 w-20 rounded bg-white/[0.06]" /><div className="ml-auto h-5 w-14 rounded-md bg-white/[0.04]" /></div>
      <div className="px-4 pb-2">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex min-h-[84px] items-start gap-3 px-2 py-3.5"><div className="size-7 shrink-0 rounded-full bg-white/[0.04]" /><div className="min-w-0 flex-1"><div className="h-3 w-36 max-w-full rounded bg-white/[0.06]" /><div className="mt-3 h-2.5 w-64 max-w-full rounded bg-white/[0.04]" /></div><div className="mt-1 h-2.5 w-14 rounded bg-white/[0.04]" /></div>)}</div>
    </div>)}
  </section>;
}
