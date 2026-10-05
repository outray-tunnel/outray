import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MetricsContent } from "@/components/observability/metrics-content";
import { normalizeMetricsSearch } from "@/components/observability/metrics-data";
import { observabilityMetricsQuery } from "@/components/observability/metrics-query";

export const Route = createFileRoute("/$orgSlug/observability/metrics")({
  head: () => ({ meta: [{ title: "Metrics - OutRay Observability" }] }),
  validateSearch: normalizeMetricsSearch,
  component: MetricsView,
});

function MetricsView() {
  const { orgSlug } = Route.useParams();
  return <WorkspaceMetrics key={orgSlug} orgSlug={orgSlug} />;
}

function WorkspaceMetrics({ orgSlug }: { orgSlug: string }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [isLive, setIsLive] = useState(true);
  const { data, isPending, isFetching, error, refetch } = useQuery(
    observabilityMetricsQuery(orgSlug, search, isLive),
  );

  return (
    <MetricsContent
      orgSlug={orgSlug}
      data={data}
      search={search}
      onSearchChange={(next) => {
        if (next.range !== search.range || next.metric !== search.metric || next.service !== search.service) {
          void navigate({ search: normalizeMetricsSearch(next), resetScroll: false });
        }
      }}
      isLive={isLive}
      onToggleLive={() => setIsLive((previous) => !previous)}
      loading={isPending && !data}
      isFetching={isFetching}
      error={error?.message ?? null}
      onRetry={() => void refetch()}
    />
  );
}
