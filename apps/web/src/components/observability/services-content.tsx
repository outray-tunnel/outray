import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleAlert, CircleCheck, CircleDashed, CircleX, Plus, RefreshCw, Search, Server } from "lucide-react";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { Select } from "../arc/select/select";
import { ConnectServiceSheet } from "./connect-service-sheet";
import { filterServiceInventory, parseServiceLastSeen, serviceDisplayHealth, type ServiceInventoryHealth, type ServiceInventoryItem } from "./services-data";
import "../outray-arc-theme.css";

export interface ServicesContentProps {
  orgSlug: string;
  services?: ServiceInventoryItem[];
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  updatedAt?: number;
  onRetry: () => void;
}

const healthOptions = [
  { value: "all", label: "All health states" },
  { value: "healthy", label: "Healthy" },
  { value: "degraded", label: "Degraded" },
  { value: "critical", label: "Critical" },
  { value: "unknown", label: "Unknown" },
];
const healthPresentation = {
  healthy: { label: "Healthy", Icon: CircleCheck, color: "text-emerald-400" },
  degraded: { label: "Degraded", Icon: CircleAlert, color: "text-amber-400" },
  critical: { label: "Critical", Icon: CircleX, color: "text-rose-400" },
  unknown: { label: "Unknown", Icon: CircleDashed, color: "text-zinc-400" },
};
const columns = "xl:grid-cols-[minmax(0,1fr)_110px_110px_95px_100px_110px_16px]";

export function ServicesContent({ orgSlug, services, loading, isFetching, error, updatedAt, onRetry }: ServicesContentProps) {
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("all");
  const [health, setHealth] = useState<"all" | ServiceInventoryHealth>("all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [initialReferenceTime] = useState(() => Date.now());
  const connectTrigger = useRef<HTMLButtonElement>(null);
  const environments = useMemo(() => Array.from(new Set(services?.map((service) => service.environment).filter(Boolean))).sort(), [services]);
  const visibleServices = useMemo(() => filterServiceInventory(services ?? [], query, environment, health), [services, query, environment, health]);
  const hasFilters = !!query || environment !== "all" || health !== "all";
  const hasData = services !== undefined;
  const initialLoading = !hasData && (loading || !error);
  const clearFilters = () => { setQuery(""); setEnvironment("all"); setHealth("all"); };
  const referenceTime = updatedAt ?? initialReferenceTime;

  return (
    <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">Services</h1>
          <p className="mt-1 text-[12px] text-zinc-400">Applications sending telemetry to your workspace.</p>
        </div>
        <Button ref={connectTrigger} aria-haspopup="dialog" aria-expanded={connectOpen} onClick={() => setConnectOpen(true)}>
          <Plus size={15} aria-hidden="true" /> Connect a service
        </Button>
      </header>

      {error && hasData && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-[12px] text-amber-100/75">
          <span>Could not refresh services. Showing the last available data.</span>
          <Button variant="ghost" size="sm" onClick={onRetry} loading={isFetching}>Retry</Button>
        </div>
      )}

      <section aria-label="Service inventory" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
        <div className="flex flex-wrap items-end gap-3 border-b border-white/[0.07] p-4">
          <div className="min-w-0 flex-1 basis-full sm:basis-[240px] sm:max-w-[360px]">
            <SearchField label="Search services" placeholder="Search by name or resource…" value={query} onValueChange={setQuery} disabled={!hasData} />
          </div>
          <div className="min-w-0 flex-1 basis-[150px] sm:max-w-[190px]">
            <Select label="Environment" value={environment} onValueChange={setEnvironment} disabled={!hasData}
              options={[{ value: "all", label: "All environments" }, ...environments.filter((value) => value !== "all").map((value) => ({ value, label: value }))]} />
          </div>
          <div className="min-w-0 flex-1 basis-[150px] sm:max-w-[190px]">
            <Select label="Health" value={health} onValueChange={(value) => setHealth(value as "all" | ServiceInventoryHealth)} disabled={!hasData} options={healthOptions} />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
        </div>

        {initialLoading ? <ServicesSkeleton /> : error && !hasData ? (
          <div role="alert" className="px-5 py-14 text-center">
            <CircleAlert size={22} className="mx-auto text-zinc-400" aria-hidden="true" />
            <h2 className="mt-3 text-[14px] font-medium text-zinc-200">Could not load services</h2>
            <p className="mt-1 text-[12px] leading-5 text-zinc-400">Your services may still be reporting. Try loading the inventory again.</p>
            <Button variant="secondary" className="mt-4" onClick={onRetry} loading={isFetching}><RefreshCw size={14} aria-hidden="true" /> Try again</Button>
          </div>
        ) : !services?.length ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025]"><Server size={19} className="text-zinc-400" aria-hidden="true" /></div>
            <h2 className="mt-3 text-[14px] font-medium text-zinc-200">No reporting services</h2>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-zinc-400">Connect your application with an OutRay SDK. Services appear here when their telemetry arrives.</p>
          </div>
        ) : !visibleServices.length ? (
          <div className="px-5 py-14 text-center">
            <Search size={22} className="mx-auto text-zinc-600" aria-hidden="true" />
            <h2 className="mt-3 text-[14px] font-medium text-zinc-200">No services match these filters</h2>
            <p className="mt-1 text-[12px] leading-5 text-zinc-400">Try another name, environment, or health state.</p>
            <Button variant="secondary" className="mt-4" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : (
          <>
            <div aria-hidden="true" className={`hidden gap-4 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-400 xl:grid ${columns}`}>
              <span>Service</span><span>Health</span><span className="text-right">Throughput</span><span className="text-right">Error rate</span><span className="text-right">P95 latency</span><span className="text-right">Last seen</span><span />
            </div>
            <ul className="divide-y divide-white/[0.06]">
              {visibleServices.map((service) => <ServiceRow key={service.id} service={service} orgSlug={orgSlug} referenceTime={referenceTime} />)}
            </ul>
          </>
        )}

        {hasData && (
          <footer className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-400">
            <span role="status">Showing {visibleServices.length} of {services.length} {services.length === 1 ? "service" : "services"}</span>
            {isFetching ? <span role="status" className="inline-flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Updating</span> : updatedAt && !error ? <span>Updated {new Date(updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span> : null}
          </footer>
        )}
      </section>
      <ConnectServiceSheet key={orgSlug} orgSlug={orgSlug} open={connectOpen} onClose={() => setConnectOpen(false)} onRecheck={onRetry} returnFocusRef={connectTrigger} />
    </div>
  );
}

function ServiceRow({ service, orgSlug, referenceTime }: { service: ServiceInventoryItem; orgSlug: string; referenceTime: number }) {
  const health = serviceDisplayHealth(service);
  const { label, Icon, color } = healthPresentation[health];
  const measured = Number.isFinite(service.operationCount) && service.operationCount > 0;
  const context = [service.environment, service.region, service.namespace, service.version].filter(Boolean).join(" · ");
  const lastSeen = parseServiceLastSeen(service.lastSeen);
  return (
    <li>
      <Link to="/$orgSlug/observability/services/$serviceId" params={{ orgSlug, serviceId: service.id }}
        className={`group grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-white/[0.035] motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent xl:min-h-[72px] ${columns}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-zinc-400 transition-colors group-hover:text-zinc-300 motion-reduce:transition-none"><Server size={15} aria-hidden="true" /></span>
          <div className="min-w-0"><p className="truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">{service.name}</p><p className="mt-0.5 truncate text-[11px] text-zinc-400" title={context}>{context || "No resource attributes"}</p></div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[11px] ${color}`} title={measured ? undefined : "No measured operations to determine health"}><Icon size={13} aria-hidden="true" />{label}</span>
        <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 pl-11 text-[12px] tabular-nums text-zinc-400 xl:contents">
          <span className="xl:text-right" title={service.usesServerSpans ? "Server operations per minute" : "Spans per minute"}><span className="text-[11px] text-zinc-400 xl:sr-only">Throughput </span>{measured ? formatNumber(service.operationsPerMinute) : "—"}{measured && <span className="ml-1 text-[10px] text-zinc-400">{service.usesServerSpans ? "op/min" : "spans/min"}</span>}</span>
          <span className="xl:text-right"><span className="text-[11px] text-zinc-400 xl:sr-only">Errors </span>{measured && isNonnegative(service.errorRate) ? `${formatNumber(service.errorRate)}%` : "—"}</span>
          <span className="xl:text-right"><span className="text-[11px] text-zinc-400 xl:sr-only">P95 </span>{measured ? formatDuration(service.p95Duration) : "—"}</span>
          <span className="ml-auto text-[11px] text-zinc-400 xl:ml-0 xl:text-right"><span className="xl:sr-only">Seen </span>{Number.isFinite(lastSeen) ? <time dateTime={new Date(lastSeen).toISOString()} title={new Date(lastSeen).toLocaleString()}>{relativeTime(lastSeen, referenceTime)}</time> : "Unknown"}</span>
        </div>
        <ArrowRight size={13} className="hidden text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none xl:block" aria-hidden="true" />
      </Link>
    </li>
  );
}

function ServicesSkeleton() {
  return (
    <div role="status" aria-label="Loading services" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading services</span>
      <div className={`hidden gap-4 border-b border-white/[0.06] px-4 py-2.5 xl:grid ${columns}`}>{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-3 w-14 max-w-full rounded bg-zinc-800/70" />)}</div>
      <div aria-hidden="true" className="divide-y divide-white/[0.06]">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 xl:min-h-[72px] ${columns}`}>
            <div className="flex items-center gap-3"><span className="size-8 shrink-0 rounded-lg bg-zinc-800/70" /><div className="min-w-0 space-y-2"><div className="h-3 w-28 max-w-full rounded bg-zinc-800/70" /><div className="h-2.5 w-44 max-w-full rounded bg-zinc-800/40" /></div></div>
            <div className="h-3 w-16 rounded bg-zinc-800/70" />
            <div className="col-span-2 flex gap-5 pl-11 xl:contents">{Array.from({ length: 4 }, (_, metric) => <div key={metric} className="h-3 w-12 rounded bg-zinc-800/50 xl:ml-auto" />)}</div>
            <div className="hidden size-3 rounded bg-zinc-800/50 xl:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function isNonnegative(value: number) { return Number.isFinite(value) && value >= 0; }
function formatNumber(value: number) { return isNonnegative(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"; }
function formatDuration(value: number) { return isNonnegative(value) ? value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s` : "—"; }
function relativeTime(timestamp: number, reference: number) {
  const seconds = Math.max(0, Math.floor((reference - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
