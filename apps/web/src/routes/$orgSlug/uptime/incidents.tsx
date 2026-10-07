import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight, CircleCheck, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CreateIncidentDialog } from "@/components/uptime/create-incident-dialog";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Select } from "@/components/arc/select/select";
import "@/components/outray-arc-theme.css";
import { IncidentBadge } from "@/components/uptime/incident-ui";
import { formatTime, type UptimeIncidentListResponse, type UptimePageResponse, uptimeRequest } from "@/components/uptime/uptime-client";
import { UptimeRowsSkeleton, UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { secondaryButton, UptimeError, UptimePageHeading } from "@/components/uptime/uptime-ui";
import { affectedComponentNames, incidentDuration, incidentLabel, incidentSearch, pageComponents, type IncidentSearch } from "@/lib/uptime/incident-display";

export const Route = createFileRoute("/$orgSlug/uptime/incidents")({
  head: () => ({ meta: [{ title: "Incidents - OutRay Uptime" }] }),
  validateSearch: incidentSearch,
  component: UptimeIncidentsRoute,
});

const views = [{ value: "all", label: "All" }, { value: "detected", label: "Detected" }, { value: "active", label: "Active" }, { value: "resolved", label: "Resolved" }, { value: "drafts", label: "Drafts" }] as const;

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

  return <div className="outray-arc mx-auto w-full max-w-[1440px]">
    <UptimePageHeading title="Incidents" description="Track issues, share updates, and follow recovery." action={canManage ? <Button type="button" size="md" aria-haspopup="dialog" onClick={() => setCreating(true)}><Plus size={15} aria-hidden="true" />Create incident</Button> : undefined} />
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <SegmentedControl label="Filter incidents by status" options={Array.from(views)} value={search.view ?? "all"} onValueChange={(value) => changeFilter({ view: value as IncidentSearch["view"] })} />
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <div className="outray-arc-requests-search min-w-0 sm:w-60"><SearchField appearance="workspace" label="Search incidents by title" value={searchText} onValueChange={changeSearch} placeholder="Search incidents…" autoComplete="off" /></div>
        <div className="outray-arc-address-filter min-w-0 sm:w-40"><Select label="Incident source" value={search.source ?? "all"} onValueChange={(value) => changeFilter({ source: value as IncidentSearch["source"] })} options={[{ value: "all", label: "All sources" }, { value: "automatic", label: "Automatic" }, { value: "manual", label: "Manual" }]} /></div>
      </div>
    </div>
    {incidents.error && <div className="mb-4 space-y-2"><UptimeError message={incidents.error instanceof Error ? incidents.error.message : "Could not load incidents."} /><Button type="button" variant="secondary" size="sm" loading={incidents.isFetching} onClick={() => void incidents.refetch()}>Try again</Button></div>}
    {page.isError && <p className="mb-4 text-xs text-zinc-500">Component details are temporarily unavailable. <button type="button" onClick={() => void page.refetch()} className="text-zinc-300 underline underline-offset-4">Retry</button></p>}
    <section aria-label="Incident history" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_90px_112px_120px_14px] gap-4 border-b border-white/[0.07] bg-white/[0.015] px-5 py-2.5 text-[11px] text-zinc-500 lg:grid"><span>Incident</span><span>Source</span><span>Started</span><span>Duration</span><span /></div>
      {incidents.isPending && <UptimeSkeleton label="Loading incidents"><UptimeRowsSkeleton rows={5} /></UptimeSkeleton>}
      {!incidents.isPending && !incidents.isError && !rows.length && <div className="flex flex-col items-center px-6 py-14 text-center"><CircleCheck size={26} strokeWidth={1.4} className="mb-4 text-zinc-600" aria-hidden="true" /><h2 className="text-sm font-medium text-zinc-200">{filtered ? "No matching incidents" : "No incidents yet"}</h2><p className="mt-2 max-w-sm text-[13px] leading-6 text-zinc-500">{filtered ? "Try a different search or filter to find what you need." : "Monitor-detected issues and updates from your team will appear here."}</p>{filtered ? <button type="button" className={`${secondaryButton} mt-5 gap-2`} onClick={clearFilters}><X size={13} aria-hidden="true" />Clear filters</button> : !page.isPending && !page.isError && !page.data?.page && canManage ? <Link to="/$orgSlug/uptime/status-page" params={{ orgSlug }} className={`${secondaryButton} mt-5 gap-2`}>Set up your status page<ArrowUpRight size={14} aria-hidden="true" /></Link> : canManage && <Button type="button" variant="secondary" size="md" className="mt-5" aria-haspopup="dialog" onClick={() => setCreating(true)}>Create incident</Button>}</div>}
      {rows.map((incident) => {
        const names = affectedComponentNames(incident, components);
        const label = incidentLabel(incident);
        return <Link key={incident.id} to="/$orgSlug/uptime/incidents/$incidentId" params={{ orgSlug, incidentId: incident.id }} search={search} className="group grid gap-2 border-b border-white/[0.06] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-500 motion-reduce:transition-none lg:grid-cols-[minmax(0,1fr)_90px_112px_120px_14px] lg:items-center lg:gap-4">
          <div className="min-w-0"><p className="min-w-0 break-words text-[13px] font-medium text-zinc-200 group-hover:text-white">{incident.title}</p><div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5"><IncidentBadge incident={incident} /><p className="min-w-0 truncate text-[11px] text-zinc-500" title={names.join(", ")}>{names.length ? names.join(", ") : "No status-page components linked"}</p></div></div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-zinc-500 lg:contents">
          <span>{incident.sourceType === "uptime_manual" ? "Manual" : "Automatic"}</span>
          <time className="text-[11px] text-zinc-500" dateTime={incident.startedAt || incident.createdAt} title={formatTime(incident.startedAt || incident.createdAt)}>{new Date(incident.startedAt || incident.createdAt || "").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>
          <span className="text-[11px] text-zinc-500">{label === "Draft" ? "Unpublished" : `${incidentDuration(incident)}${incident.status === "open" ? " · ongoing" : ""}`}</span>
          </div>
          <ChevronRight size={15} className="hidden text-zinc-600 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none lg:block" aria-hidden="true" />
        </Link>;
      })}
    </section>
    {rows.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-[11px] text-zinc-500">{rows.length} {rows.length === 1 ? "incident" : "incidents"} shown{incidents.isFetching && !incidents.isFetchingNextPage ? " · refreshing" : ""}</p>{incidents.hasNextPage && <Button type="button" variant="secondary" size="sm" loading={incidents.isFetchingNextPage} disabled={incidents.isFetching && !incidents.isFetchingNextPage} onClick={() => void incidents.fetchNextPage()}>Load more</Button>}</div>}
    {creating && canManage && <CreateIncidentDialog orgSlug={orgSlug} onClose={() => setCreating(false)} onCreated={(incidentId) => {
      void queryClient.invalidateQueries({ queryKey: ["uptime", orgSlug, "incidents"] });
      setCreating(false);
      void navigate({ to: "/$orgSlug/uptime/incidents/$incidentId", params: { orgSlug, incidentId }, search, ignoreBlocker: true });
    }} />}
  </div>;
}
