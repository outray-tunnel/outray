import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight, CircleCheck, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CreateIncidentDialog } from "@/components/uptime/create-incident-dialog";
import { IncidentBadge } from "@/components/uptime/incident-ui";
import { formatTime, type UptimeIncidentListResponse, type UptimePageResponse, uptimeRequest } from "@/components/uptime/uptime-client";
import { UptimeRowsSkeleton, UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { primaryButton, secondaryButton, UptimeError, UptimePageHeading } from "@/components/uptime/uptime-ui";
import { affectedComponentNames, incidentDuration, incidentLabel, incidentSearch, pageComponents, type IncidentSearch } from "@/lib/uptime/incident-display";

export const Route = createFileRoute("/$orgSlug/uptime/incidents")({
  head: () => ({ meta: [{ title: "Incidents - OutRay Uptime" }] }),
  validateSearch: incidentSearch,
  component: UptimeIncidentsRoute,
});

const views = [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "resolved", label: "Resolved" }, { value: "drafts", label: "Drafts" }] as const;

function UptimeIncidentsRoute() {
  const { orgSlug } = Route.useParams();
  return <UptimeIncidents key={orgSlug} />;
}

function UptimeIncidents() {
  const { orgSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [searchText, setSearchText] = useState(search.q ?? "");
  const [previousQuery, setPreviousQuery] = useState(search.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Restore external URL changes without resetting the input on background refreshes.
  if (previousQuery !== search.q) {
    setPreviousQuery(search.q);
    setSearchText(search.q ?? "");
  }
  const incidents = useInfiniteQuery({
    queryKey: ["uptime", orgSlug, "incidents", search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: "25", view: search.view ?? "all", source: search.source ?? "all" });
      if (search.q) params.set("q", search.q);
      if (pageParam) params.set("cursor", pageParam);
      return uptimeRequest<UptimeIncidentListResponse>(orgSlug, `/incidents?${params}`, { signal });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
    gcTime: 30 * 60_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  const page = useQuery({ queryKey: ["uptime", orgSlug, "page"], queryFn: ({ signal }) => uptimeRequest<UptimePageResponse>(orgSlug, "/page", { signal }) });
  const rows = Array.from(new Map((incidents.data?.pages.flatMap((part) => part.incidents) ?? []).map((incident) => [incident.id, incident])).values());
  const components = pageComponents(page.data);
  const canManage = incidents.data?.pages[0].canManage ?? false;
  const filtered = Boolean(search.q || search.view && search.view !== "all" || search.source && search.source !== "all");

  useEffect(() => {
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search.q]);

  const changeSearch = (value: string) => {
    setSearchText(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void navigate({ search: (previous) => incidentSearch({ ...previous, q: value }), replace: true, resetScroll: false });
    }, 250);
  };
  const changeFilter = (next: Partial<IncidentSearch>) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    void navigate({ search: incidentSearch({ ...search, q: searchText, ...next }), replace: true, resetScroll: false });
  };
  const clearFilters = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchText("");
    void navigate({ search: {}, replace: true, resetScroll: false });
  };

  return <div className="mx-auto max-w-[1320px]">
    <UptimePageHeading title="Incidents" description="Track issues, share updates, and follow recovery." action={canManage ? <button type="button" className={`${primaryButton} gap-2`} onClick={() => setCreating(true)}><Plus size={15} aria-hidden="true" />Create incident</button> : undefined} />
    <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <nav aria-label="Filter incidents by status" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.015] p-1">
        {views.map((view) => <button type="button" key={view.value} aria-pressed={(search.view ?? "all") === view.value} onClick={() => changeFilter({ view: view.value })} className={`min-h-9 shrink-0 rounded-lg px-4 text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-400 ${(search.view ?? "all") === view.value ? "bg-white/[0.07] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"}`}>{view.label}</button>)}
      </nav>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-[#0d0d0f] px-3 focus-within:border-violet-400/40 sm:w-64"><Search size={15} className="shrink-0 text-zinc-600" aria-hidden="true" /><input type="search" value={searchText} onChange={(event) => changeSearch(event.target.value)} aria-label="Search incidents by title" placeholder="Search incidents" className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600" /></div>
        <select aria-label="Incident source" className="min-h-10 rounded-xl border border-white/[0.09] bg-[#0d0d0f] px-3 text-[13px] text-zinc-400 outline-none focus:border-violet-400/40" value={search.source ?? "all"} onChange={(event) => changeFilter({ source: event.target.value as IncidentSearch["source"] })}><option value="all">All sources</option><option value="automatic">Automatic</option><option value="manual">Manual</option></select>
      </div>
    </div>
    {incidents.error && <div className="mb-4 space-y-2"><UptimeError message={incidents.error instanceof Error ? incidents.error.message : "Could not load incidents."} /><button type="button" className={secondaryButton} onClick={() => void incidents.refetch()}>Try again</button></div>}
    {page.isError && <p className="mb-4 text-xs text-zinc-500">Component details are temporarily unavailable. <button type="button" onClick={() => void page.refetch()} className="text-zinc-300 underline underline-offset-4">Retry</button></p>}
    <section aria-label="Incident history" className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0d0f]">
      <div className="hidden grid-cols-[minmax(0,1fr)_100px_130px_110px_20px] gap-5 border-b border-white/[0.07] px-5 py-3 text-xs text-zinc-600 lg:grid"><span>Incident</span><span>Source</span><span>Started</span><span>Duration</span><span /></div>
      {incidents.isPending && <UptimeSkeleton label="Loading incidents"><UptimeRowsSkeleton rows={5} /></UptimeSkeleton>}
      {!incidents.isPending && !incidents.isError && !rows.length && <div className="flex flex-col items-center px-6 py-14 text-center"><CircleCheck size={26} strokeWidth={1.4} className="mb-4 text-zinc-600" aria-hidden="true" /><h2 className="text-sm font-medium text-zinc-200">{filtered ? "No matching incidents" : "No incidents yet"}</h2><p className="mt-2 max-w-sm text-[13px] leading-6 text-zinc-500">{filtered ? "Try a different search or filter to find what you need." : "Monitor-detected issues and updates from your team will appear here."}</p>{filtered ? <button type="button" className={`${secondaryButton} mt-5 gap-2`} onClick={clearFilters}><X size={13} aria-hidden="true" />Clear filters</button> : !page.isPending && !page.isError && !page.data?.page && canManage ? <Link to="/$orgSlug/uptime/status-page" params={{ orgSlug }} className={`${secondaryButton} mt-5 gap-2`}>Set up your status page<ArrowUpRight size={14} aria-hidden="true" /></Link> : canManage && <button type="button" className={`${secondaryButton} mt-5`} onClick={() => setCreating(true)}>Create incident</button>}</div>}
      {rows.map((incident) => {
        const names = affectedComponentNames(incident, components);
        const label = incidentLabel(incident);
        return <Link key={incident.id} to="/$orgSlug/uptime/incidents/$incidentId" params={{ orgSlug, incidentId: incident.id }} search={search} className="group grid gap-3 border-b border-white/[0.06] px-5 py-5 transition-colors last:border-b-0 hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-400 motion-reduce:transition-none lg:grid-cols-[minmax(0,1fr)_100px_130px_110px_20px] lg:items-center lg:gap-5">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className="min-w-0 break-words text-sm font-medium text-zinc-200 group-hover:text-white">{incident.title}</span><IncidentBadge incident={incident} /></div><p className="mt-2 truncate text-xs text-zinc-500" title={names.join(", ")}>{names.length ? names.join(", ") : "No status-page components linked"}</p></div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500 lg:contents">
          <span>{incident.sourceType === "uptime_manual" ? "Manual" : "Automatic"}</span>
          <time className="text-xs text-zinc-500" dateTime={incident.startedAt || incident.createdAt} title={formatTime(incident.startedAt || incident.createdAt)}>{new Date(incident.startedAt || incident.createdAt || "").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>
          <span className="text-xs text-zinc-500">{label === "Draft" ? "Unpublished" : `${incidentDuration(incident)}${incident.status === "open" ? " · ongoing" : ""}`}</span>
          </div>
          <ChevronRight size={15} className="hidden text-zinc-600 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none lg:block" aria-hidden="true" />
        </Link>;
      })}
    </section>
    {rows.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-zinc-600">{rows.length} {rows.length === 1 ? "incident" : "incidents"} shown{incidents.isFetching && !incidents.isFetchingNextPage ? " · refreshing" : ""}</p>{incidents.hasNextPage && <button type="button" className={secondaryButton} disabled={incidents.isFetching} onClick={() => void incidents.fetchNextPage()}>{incidents.isFetchingNextPage ? "Loading more…" : "Load more"}</button>}</div>}
    {creating && canManage && <CreateIncidentDialog orgSlug={orgSlug} onClose={() => setCreating(false)} onCreated={(incidentId) => {
      void queryClient.invalidateQueries({ queryKey: ["uptime", orgSlug, "incidents"] });
      setCreating(false);
      void navigate({ to: "/$orgSlug/uptime/incidents/$incidentId", params: { orgSlug, incidentId }, search, ignoreBlocker: true });
    }} />}
  </div>;
}
