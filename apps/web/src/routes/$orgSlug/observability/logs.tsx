import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogsContent } from "@/components/observability/logs-content";
import { LogInspector } from "@/components/observability/log-inspector";
import { logIdentity, normalizeLogsSearch, type LogEvent, type LogsSearch } from "@/components/observability/logs-data";
import { observabilityLogsQuery } from "@/components/observability/logs-query";

export const Route = createFileRoute("/$orgSlug/observability/logs")({
  head: () => ({ meta: [{ title: "Logs - OutRay Observability" }] }),
  validateSearch: normalizeLogsSearch,
  component: LogsView,
});

function LogsView() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceLogs key={orgSlug} orgSlug={orgSlug} />;
}

function WorkspaceLogs({ orgSlug }: { orgSlug: string }) {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = filters.search ?? "";
  const scopeKey = JSON.stringify([query, filters.service ?? "", filters.level ?? "all", filters.range]);
  const [activeScope, setActiveScope] = useState(scopeKey);
  const [searchInput, setSearchInput] = useState(query);
  const [isLive, setIsLive] = useState(true);
  const [selection, setSelection] = useState<{ event: LogEvent; scope: string } | null>(null);
  const inspectorTrigger = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selected = selection?.scope === scopeKey ? selection.event : null;
  const { data, isPending, isFetching, error, refetch } = useQuery(
    observabilityLogsQuery(orgSlug, filters, isLive),
  );

  // Restore external navigation before committing a render. That also cancels
  // the old search debounce and prevents reopening an old selection on Back.
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
      void navigate({
        search: (previous) => normalizeLogsSearch({ ...previous, search: searchInput }),
        replace: true,
        resetScroll: false,
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [navigate, query, scopeKey, searchInput]);

  function changeFilters(patch: Partial<LogsSearch>) {
    const next = normalizeLogsSearch({ ...filters, search: searchInput, ...patch });
    if (JSON.stringify(next) !== JSON.stringify(filters)) {
      void navigate({ search: next, resetScroll: false });
    }
  }

  function closeInspector() {
    if (!inspectorTrigger.current?.isConnected) inspectorTrigger.current = searchRef.current;
    setSelection(null);
  }

  return (
    <>
      <LogsContent
        orgSlug={orgSlug}
        data={data}
        filters={filters}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onFiltersChange={changeFilters}
        onClearFilters={() => {
          setSearchInput("");
          changeFilters({ search: undefined, service: undefined, level: undefined });
        }}
        isLive={isLive}
        onToggleLive={() => setIsLive((previous) => !previous)}
        loading={isPending && !data}
        isFetching={isFetching}
        error={error?.message ?? null}
        onRetry={() => void refetch()}
        onInspect={(event, trigger) => {
          inspectorTrigger.current = trigger;
          setSelection({ event, scope: scopeKey });
        }}
        selectedId={selected ? logIdentity(selected) : undefined}
        searchRef={searchRef}
      />
      <LogInspector event={selected} orgSlug={orgSlug} onClose={closeInspector} returnFocusRef={inspectorTrigger} />
    </>
  );
}
