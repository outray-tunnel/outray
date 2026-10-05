import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TracesContent } from "@/components/observability/traces-content";
import { TraceInspector } from "@/components/observability/trace-inspector";
import { normalizeTracesSearch, traceIdentity, type TraceSummary, type TracesRange, type TracesSearch, type TracesSnapshot } from "@/components/observability/traces-data";
import { observabilityTracesQuery } from "@/components/observability/traces-query";

export const Route = createFileRoute("/$orgSlug/observability/traces")({
  head: () => ({ meta: [{ title: "Traces - OutRay Observability" }] }),
  // Existing trace links need only a search string; omitted controls use defaults.
  validateSearch: (search: Record<string, unknown>): TracesSearch => normalizeTracesSearch(search),
  component: TracesView,
});

function TracesView() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceTraces key={orgSlug} orgSlug={orgSlug} />;
}

function WorkspaceTraces({ orgSlug }: { orgSlug: string }) {
  const filters = normalizeTracesSearch(Route.useSearch());
  const navigate = Route.useNavigate();
  const query = filters.search ?? "";
  const scopeKey = JSON.stringify([query, filters.errorsOnly ?? false, filters.range]);
  const [activeScope, setActiveScope] = useState(scopeKey);
  const [searchInput, setSearchInput] = useState(query);
  const [isLive, setIsLive] = useState(true);
  const [selection, setSelection] = useState<{ trace: TraceSummary; scope: string; range: TracesRange } | null>(null);
  const inspectorTrigger = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selected = selection?.scope === scopeKey ? selection.trace : null;
  const { data, isPending, isFetching, error, refetch } = useQuery(observabilityTracesQuery(orgSlug, filters, isLive));
  const [retainedData, setRetainedData] = useState<TracesSnapshot | undefined>(data);
  // A failed new filter drops React Query's placeholder. Retain the prior
  // snapshot with its original provenance, never as a successful new result.
  if (data && data !== retainedData) setRetainedData(data);
  const displayedData = data ?? retainedData;

  // Restore Back/Forward before committing, canceling an old search debounce and
  // preventing a previous selection from reopening when returning to its scope.
  if (activeScope !== scopeKey) {
    setActiveScope(scopeKey);
    setSearchInput(query);
    setSelection(null);
  }

  useEffect(() => {
    if (!inspectorTrigger.current?.isConnected) inspectorTrigger.current = searchRef.current;
  }, [scopeKey]);

  useEffect(() => {
    if (searchInput.trim() === query) return;
    const timeout = window.setTimeout(() => {
      void navigate({ search: (previous) => normalizeTracesSearch({ ...previous, search: searchInput }), replace: true, resetScroll: false });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [navigate, query, scopeKey, searchInput]);

  function changeFilters(patch: Partial<TracesSearch>) {
    const next = normalizeTracesSearch({ ...filters, search: searchInput, ...patch });
    if (JSON.stringify(next) !== JSON.stringify(filters)) void navigate({ search: next, resetScroll: false });
  }

  function closeInspector() {
    if (!inspectorTrigger.current?.isConnected) inspectorTrigger.current = searchRef.current;
    setSelection(null);
  }

  return <>
    <TracesContent orgSlug={orgSlug} data={displayedData} filters={filters} searchInput={searchInput} onSearchInputChange={setSearchInput}
      onFiltersChange={changeFilters} onClearFilters={() => { setSearchInput(""); changeFilters({ search: undefined, errorsOnly: undefined }); }}
      isLive={isLive} onToggleLive={() => setIsLive((previous) => !previous)} loading={isPending && !displayedData} isFetching={isFetching} error={error?.message ?? null}
      onRetry={() => void refetch()} onInspect={(trace, trigger) => { inspectorTrigger.current = trigger; setSelection({ trace, scope: scopeKey, range: displayedData?.requestedSearch.range ?? filters.range }); }}
      selectedId={selected ? traceIdentity(selected) : undefined} searchRef={searchRef} />
    <TraceInspector trace={selected} orgSlug={orgSlug} range={selection?.range ?? filters.range} onClose={closeInspector} returnFocusRef={inspectorTrigger} />
  </>;
}
