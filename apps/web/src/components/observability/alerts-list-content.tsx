import { useMemo, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, CircleAlert, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { ALERT_STATUS, AlertIcon, AlertStatePill } from "./alert-status-badge";
import { ALERT_STATES, alertServiceOptions, conditionLabel, filterAlerts, formatAlertValue, formatClockTime, formatRelativeTime, signalLabel, signalOptions, type AlertRecord, type AlertsSearch, type AlertsSnapshot, type AlertState } from "./alerts-data";
import "../outray-arc-theme.css";

export interface AlertsListContentProps {
  orgSlug: string;
  data?: AlertsSnapshot;
  filters: AlertsSearch;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onFiltersChange: (patch: Partial<AlertsSearch>) => void;
  onClearFilters: () => void;
  onCreate: () => void;
  onRetry: () => void;
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  createRef?: RefObject<HTMLButtonElement | null>;
}

const columns = "xl:grid-cols-[minmax(200px,1.3fr)_minmax(130px,.7fr)_minmax(190px,1fr)_100px_100px_110px_14px]";

export function AlertsListContent({ orgSlug, data, filters, searchInput, onSearchInputChange, onFiltersChange, onClearFilters, onCreate, onRetry, loading, isFetching, error, createRef }: AlertsListContentProps) {
  const alerts = useMemo(() => filterAlerts(data?.alerts ?? [], filters), [data?.alerts, filters]);
  const services = useMemo(() => alertServiceOptions(data, filters.service), [data, filters.service]);
  const hasFilters = !!filters.search || !!filters.service || !!filters.signal || !!filters.state;
  const initialLoading = !data && (loading || !error);
  const stateCount = (state: AlertState) => data?.summary[state === "no_data" ? "noData" : state] ?? 0;

  return <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 pb-1">
      <div><h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Alerts</h1><p className="mt-1 text-[12px] text-zinc-400">Watch your services and get notified when a condition needs attention.</p></div>
      <Button ref={createRef} onClick={onCreate} aria-haspopup="dialog"><Plus size={15} aria-hidden="true" /> New alert</Button>
    </header>

    <section aria-label="Alert rules" className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
      <div aria-label="Filter by alert state" className="flex overflow-x-auto border-b border-white/[0.07] bg-white/[0.01]">
        {[undefined, ...ALERT_STATES].map((state) => {
          const selected = filters.state === state;
          const status = state ? ALERT_STATUS[state] : null;
          const Icon = status?.icon ?? Bell;
          const count = state ? stateCount(state) : data?.summary.total;
          return <button key={state ?? "all"} type="button" aria-pressed={selected} onClick={() => onFiltersChange({ state })}
            className={`relative flex min-w-[95px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-3 text-[12px] transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${selected ? "bg-white/[0.035] text-zinc-100" : "text-zinc-400"}`}>
            <Icon size={13} aria-hidden="true" className={status?.tone ?? "text-zinc-400"} /><span>{status?.label ?? "All rules"}</span>
            {initialLoading ? <span className="h-3 w-3 animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none" aria-hidden="true" /> : <span className="ml-0.5 tabular-nums text-zinc-500">{data ? count : "—"}</span>}
            {selected && <span className="absolute inset-x-3 bottom-0 h-px bg-zinc-300" aria-hidden="true" />}
          </button>;
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-white/[0.07] p-4">
        <div className="outray-arc-requests-search min-w-0 flex-1 basis-full sm:basis-[260px]"><SearchField label="Search alert rules" value={searchInput} onValueChange={onSearchInputChange} placeholder="Search rules, services or signals…" autoComplete="off" spellCheck={false} /></div>
        <div className="min-w-0 flex-1 basis-[160px] sm:max-w-[200px]"><Select label="Service" value={filters.service ? `service:${filters.service}` : "all"} onValueChange={(value) => onFiltersChange({ service: value === "all" ? undefined : value.slice(8) })} options={[{ value: "all", label: "All services" }, ...services.map((name) => ({ value: `service:${name}`, label: name }))]} /></div>
        <div className="min-w-0 flex-1 basis-[180px] sm:max-w-[210px]"><Select label="Signal" value={filters.signal ?? "all"} onValueChange={(value) => onFiltersChange({ signal: value === "all" ? undefined : value as AlertsSearch["signal"] })} options={[{ value: "all", label: "All signals" }, ...signalOptions.map(({ value, label }) => ({ value, label }))]} /></div>
        {hasFilters && <Button variant="ghost" size="sm" onClick={onClearFilters}>Clear filters</Button>}
      </div>

      {error && data && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/80"><span>Could not refresh alerts. Showing the last available rules.</span><Button variant="ghost" size="sm" onClick={onRetry} loading={isFetching}>Retry</Button></div>}

      {(initialLoading || alerts.length > 0) && <div aria-hidden="true" className={`hidden items-center gap-4 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-400 xl:grid ${columns}`}><span>Rule</span><span>Service</span><span>Condition</span><span>Last value</span><span>Status</span><span>Evaluated</span><span /></div>}
      {initialLoading ? <AlertListSkeleton /> : error && !data ? <ListMessage icon={<CircleAlert size={21} aria-hidden="true" />} title="Alerts unavailable" detail="We could not load your alert rules. Try again to reconnect." alert><Button variant="secondary" className="mt-4" onClick={onRetry} loading={isFetching}><RefreshCw size={14} aria-hidden="true" /> Try again</Button></ListMessage> : !alerts.length && hasFilters ? <ListMessage icon={<Search size={21} aria-hidden="true" />} title="No matching alerts" detail="No rules match this selection. Try another query or clear your filters."><Button variant="secondary" className="mt-4" onClick={onClearFilters}>Clear filters</Button></ListMessage> : !alerts.length ? <ListMessage icon={<Bell size={21} aria-hidden="true" />} title="Create your first alert" detail="Choose a service and signal, define when it should fire, and select who gets notified."><Button variant="secondary" className="mt-4" onClick={onCreate} aria-haspopup="dialog"><Plus size={14} aria-hidden="true" /> Create alert</Button></ListMessage> : <ul className="divide-y divide-white/[0.06]">{alerts.map((alert) => <AlertRow key={alert.id} orgSlug={orgSlug} alert={alert} filters={filters} />)}</ul>}

      {data && <footer className="flex min-h-11 flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-400"><span>{alerts.length.toLocaleString()} {alerts.length === 1 ? "rule" : "rules"}{hasFilters ? ` of ${data.alerts.length.toLocaleString()}` : ""}</span><span role="status" className="inline-flex items-center gap-1.5">{isFetching ? <><RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Updating</> : error ? "Refresh failed" : `Updated ${formatClockTime(data.receivedAt)}`}</span></footer>}
    </section>
  </div>;
}

function AlertRow({ alert, orgSlug, filters }: { alert: AlertRecord; orgSlug: string; filters: AlertsSearch }) {
  const evaluatedDate = alert.lastEvaluatedAt ? new Date(alert.lastEvaluatedAt) : null;
  const evaluationTitle = evaluatedDate && Number.isFinite(evaluatedDate.getTime()) ? evaluatedDate.toLocaleString() : "Not evaluated yet";
  return <li><Link to="/$orgSlug/observability/alerts/$alertId" params={{ orgSlug, alertId: alert.id }} search={filters}
    className={`group grid min-h-[82px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${columns}`}>
    <span className="flex min-w-0 items-start gap-3"><span className="mt-0.5"><AlertIcon alert={alert} size={18} /></span><span className="min-w-0"><span className="block truncate text-[13px] text-zinc-200" title={alert.name}>{alert.name}</span><span className="mt-1 block truncate text-[11px] text-zinc-500" title={alert.description || signalLabel(alert.signal)}>{alert.description || signalLabel(alert.signal)}</span></span></span>
    <span className="col-span-2 min-w-0 xl:col-span-1"><span className="block truncate text-[12px] text-zinc-300" title={alert.service}>{alert.service || "Unknown service"}</span><span className="mt-0.5 block truncate text-[11px] text-zinc-500">{alert.environment || "All environments"}</span></span>
    <span className="col-span-2 line-clamp-2 min-w-0 text-[12px] leading-5 text-zinc-400 xl:col-span-1" title={conditionLabel(alert)}>{conditionLabel(alert)}</span>
    <span className="min-w-0 font-mono text-[12px] tabular-nums text-zinc-300"><span className="mr-1 font-sans text-[11px] text-zinc-500 xl:sr-only">Last value</span>{formatAlertValue(alert.currentValue, alert)}</span>
    <span className="row-start-1 justify-self-end xl:row-auto xl:justify-self-start"><AlertStatePill alert={alert} /></span>
    <time dateTime={evaluatedDate && Number.isFinite(evaluatedDate.getTime()) ? evaluatedDate.toISOString() : undefined} title={evaluationTitle} className="text-right text-[11px] tabular-nums text-zinc-500 xl:text-left">{formatRelativeTime(alert.lastEvaluatedAt)}</time>
    <ArrowRight size={13} aria-hidden="true" className="hidden text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none xl:block" />
  </Link></li>;
}

export function AlertListSkeleton() {
  return <div role="status" aria-label="Loading alert rules" aria-busy="true" className="animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading alert rules</span><div aria-hidden="true" className="divide-y divide-white/[0.06]">{Array.from({ length: 6 }, (_, index) => <div key={index} className={`grid min-h-[82px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 ${columns}`}><div className="flex items-center gap-3"><div className="size-4 shrink-0 rounded-full bg-white/[0.06]" /><div className="w-full space-y-2"><div className="h-3 w-40 max-w-full rounded bg-white/[0.065]" /><div className="h-2.5 w-32 max-w-full rounded bg-white/[0.035]" /></div></div><div className="col-span-2 h-3 w-24 max-w-full rounded bg-white/[0.04] xl:col-span-1" /><div className="col-span-2 h-3 w-44 max-w-full rounded bg-white/[0.035] xl:col-span-1" /><div className="h-3 w-12 rounded bg-white/[0.04]" /><div className="row-start-1 h-5 w-16 justify-self-end rounded-md bg-white/[0.05] xl:row-auto xl:justify-self-start" /><div className="h-3 w-14 rounded bg-white/[0.035]" /><div className="hidden size-3 rounded bg-white/[0.03] xl:block" /></div>)}</div></div>;
}

function ListMessage({ icon, title, detail, children, alert }: { icon: ReactNode; title: string; detail: string; children?: ReactNode; alert?: boolean }) {
  return <div role={alert ? "alert" : undefined} className="px-5 py-14 text-center"><span className="mx-auto flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-400">{icon}</span><h2 className="mt-3 text-[14px] font-medium text-zinc-200">{title}</h2><p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-zinc-400">{detail}</p>{children}</div>;
}
