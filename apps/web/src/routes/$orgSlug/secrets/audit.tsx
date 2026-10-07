import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SecretsAuditContent } from "@/components/secrets/audit-content";
import { AuditEventSheet } from "@/components/secrets/audit-event-sheet";
import { mergeAuditPages } from "@/components/secrets/audit-data";
import { secretsClient, type SecretAuditEvent } from "@/lib/secrets-client";

export const Route = createFileRoute("/$orgSlug/secrets/audit")({
  head: () => ({ meta: [{ title: "Audit log - OutRay Secrets" }] }),
  component: SecretsAuditPage,
});

function SecretsAuditPage() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceAuditPage key={orgSlug} orgSlug={orgSlug} />;
}

export function WorkspaceAuditPage({ orgSlug }: { orgSlug: string }) {
  const navigate = Route.useNavigate();
  const query = useInfiniteQuery({
    queryKey: ["secrets", orgSlug, "audit"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => secretsClient.audit(orgSlug, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    // Avoid refetching a long, paginated history every time the tab gains focus.
    refetchOnWindowFocus: false,
  });
  const events = useMemo(() => query.data ? mergeAuditPages(query.data.pages) : undefined, [query.data]);
  const [search, setSearch] = useState("");
  const [resource, setResource] = useState("all");
  const [actor, setActor] = useState("all");
  const [vault, setVault] = useState("all");
  const [selected, setSelected] = useState<SecretAuditEvent | null>(null);
  const paging = useRef(false);
  const refreshing = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  const loadMore = async () => {
    if (!query.hasNextPage || query.isFetching || paging.current || refreshing.current) return;
    paging.current = true;
    try { await query.fetchNextPage({ cancelRefetch: false }); }
    catch { /* React Query records the request failure; keep existing pages. */ }
    finally { paging.current = false; }
  };
  const refresh = async () => {
    if (query.isFetching || paging.current || refreshing.current) return;
    refreshing.current = true;
    try { await query.refetch({ cancelRefetch: false }); }
    catch { /* React Query records the request failure; keep existing pages. */ }
    finally { refreshing.current = false; }
  };

  return <>
    <SecretsAuditContent events={events} loading={query.isPending} refreshing={query.isFetching && !query.isFetchingNextPage && Boolean(query.data)}
      error={query.isFetchNextPageError ? null : query.error?.message} hasMore={Boolean(query.hasNextPage)} loadingMore={query.isFetchingNextPage}
      loadMoreError={query.isFetchNextPageError ? query.error?.message : null} search={search} resource={resource} actor={actor} vault={vault} selectedId={selected?.id}
      onSearchChange={setSearch} onResourceChange={setResource} onActorChange={setActor} onVaultChange={setVault}
      onClearFilters={() => { setSearch(""); setResource("all"); setActor("all"); setVault("all"); }}
      onChooseVaults={() => void navigate({ to: "/$orgSlug/secrets/vaults", params: { orgSlug } })}
      onRetry={() => { void refresh(); }} onLoadMore={() => { void loadMore(); }}
      onOpenEvent={(event) => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelected(event); }} />
    <AuditEventSheet event={selected} onClose={() => setSelected(null)} returnFocusRef={opener} />
  </>;
}
