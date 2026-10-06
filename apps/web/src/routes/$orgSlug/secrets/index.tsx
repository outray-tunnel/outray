import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProjectDialog } from "@/components/secrets/secret-dialogs";
import { SecretsOverviewContent } from "@/components/secrets/overview-content";
import { normalizeSecretsOverviewSearch, type SecretsVaultSort } from "@/components/secrets/overview-data";
import { secretsOverviewQuery } from "@/components/secrets/overview-query";

export const Route = createFileRoute("/$orgSlug/secrets/")({
  head: () => ({ meta: [{ title: "Secrets - OutRay" }] }),
  validateSearch: normalizeSecretsOverviewSearch,
  component: SecretsOverviewPage,
});

function SecretsOverviewPage() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceSecretsOverview key={orgSlug} orgSlug={orgSlug} />;
}

export function WorkspaceSecretsOverview({ orgSlug }: { orgSlug: string }) {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const [creatingProject, setCreatingProject] = useState(false);
  const queryText = filters.search ?? "";
  const scope = JSON.stringify(filters);
  const [activeScope, setActiveScope] = useState(scope);
  const [searchInput, setSearchInput] = useState(queryText);
  const { data, isPending, isFetching, error, refetch } = useQuery(secretsOverviewQuery(orgSlug));

  // Back/Forward restores the search immediately and cancels an old debounce.
  if (activeScope !== scope) {
    setActiveScope(scope);
    setSearchInput(queryText);
  }

  useEffect(() => {
    if (searchInput.trim() === queryText) return;
    const timer = window.setTimeout(() => {
      void navigate({ search: (previous) => normalizeSecretsOverviewSearch({ ...previous, search: searchInput }), replace: true, resetScroll: false });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [navigate, queryText, scope, searchInput]);

  function changeSort(sort: SecretsVaultSort) {
    void navigate({ search: normalizeSecretsOverviewSearch({ ...filters, search: searchInput, sort }), resetScroll: false });
  }

  return <>
    <SecretsOverviewContent orgSlug={orgSlug} data={data} loading={isPending && !data} isFetching={isFetching}
      error={error?.message ?? null} onRetry={() => void refetch()} onCreate={() => setCreatingProject(true)}
      searchInput={searchInput} onSearchInputChange={setSearchInput} sort={filters.sort ?? "updated"} onSortChange={changeSort}
      onClearSearch={() => { setSearchInput(""); void navigate({ search: normalizeSecretsOverviewSearch({ ...filters, search: undefined }), resetScroll: false }); }} />
    <ProjectDialog open={creatingProject} onClose={() => setCreatingProject(false)} orgSlug={orgSlug} onSaved={() => void refetch()} />
  </>;
}
