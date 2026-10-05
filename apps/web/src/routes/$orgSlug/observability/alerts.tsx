import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertsListContent } from "@/components/observability/alerts-list-content";
import { AlertFormModal } from "@/components/observability/alert-form";
import { alertServiceOptions, normalizeAlertsSearch, summarizeAlerts, type AlertRecord, type AlertsSearch, type AlertsSnapshot } from "@/components/observability/alerts-data";
import { observabilityAlertsQuery } from "@/components/observability/alerts-query";

export { AlertFormModal } from "@/components/observability/alert-form";
export { AlertIcon, AlertStatePill } from "@/components/observability/alert-status-badge";
export type { AlertRecord, AlertSignal, AlertOperator, AlertState } from "@/components/observability/alerts-data";

export const Route = createFileRoute("/$orgSlug/observability/alerts")({
  head: () => ({ meta: [{ title: "Alerts - OutRay Observability" }] }),
  validateSearch: (search: Record<string, unknown>): AlertsSearch => normalizeAlertsSearch(search),
  component: AlertsView,
});

function AlertsView() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceAlerts key={orgSlug} orgSlug={orgSlug} />;
}

function WorkspaceAlerts({ orgSlug }: { orgSlug: string }) {
  const filters = normalizeAlertsSearch(Route.useSearch());
  const navigate = Route.useNavigate();
  const client = useQueryClient();
  const search = filters.search ?? "";
  const scopeKey = JSON.stringify(filters);
  const [activeScope, setActiveScope] = useState(scopeKey);
  const [searchInput, setSearchInput] = useState(search);
  const [isCreating, setIsCreating] = useState(false);
  const createRef = useRef<HTMLButtonElement | null>(null);
  const options = observabilityAlertsQuery(orgSlug);
  const { data, isPending, isFetching, error, refetch } = useQuery(options);

  // Back/Forward must cancel a pending old search rather than overwrite the URL.
  if (scopeKey !== activeScope) {
    setActiveScope(scopeKey);
    setSearchInput(search);
  }

  useEffect(() => {
    if (searchInput.trim() === search) return;
    const timeout = window.setTimeout(() => {
      void navigate({ search: (previous) => normalizeAlertsSearch({ ...previous, search: searchInput }), replace: true, resetScroll: false });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [navigate, search, scopeKey, searchInput]);

  function changeFilters(patch: Partial<AlertsSearch>) {
    const next = normalizeAlertsSearch({ ...filters, search: searchInput, ...patch });
    if (JSON.stringify(next) !== JSON.stringify(filters)) void navigate({ search: next, resetScroll: false });
  }

  function saved(alert: AlertRecord, setupProviders: Array<"slack" | "discord">) {
    setIsCreating(false);
    // Keep the new rule visible immediately; a refetch supplies exact counts.
    client.setQueryData<AlertsSnapshot>(options.queryKey, (current) => {
      if (!current) return current;
      const alerts = [alert, ...current.alerts.filter((item) => item.id !== alert.id)];
      return { ...current, alerts, summary: summarizeAlerts(alerts) };
    });
    void client.invalidateQueries({ queryKey: options.queryKey });
    if (setupProviders.length) {
      try { window.sessionStorage.setItem(`outray-alert-setup:${alert.id}`, JSON.stringify(setupProviders)); } catch { /* URL retains the OAuth setup queue when storage is unavailable. */ }
      const parameters = new URLSearchParams({ ...filters, setup: setupProviders.join(",") });
      window.location.assign(`/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alert.id)}/notifications?${parameters}`);
    }
  }

  return <>
    <AlertsListContent orgSlug={orgSlug} data={data} filters={filters} searchInput={searchInput} onSearchInputChange={setSearchInput}
      onFiltersChange={changeFilters} onClearFilters={() => { setSearchInput(""); changeFilters({ search: undefined, service: undefined, signal: undefined, state: undefined }); }}
      onCreate={() => setIsCreating(true)} createRef={createRef} onRetry={() => void refetch()}
      loading={isPending && !data} isFetching={isFetching} error={error?.message ?? null} />
    <AlertFormModal isOpen={isCreating} onClose={() => setIsCreating(false)} orgSlug={orgSlug} services={alertServiceOptions(data)}
      integrationAvailability={data?.integrationAvailability} onSaved={saved} />
  </>;
}
