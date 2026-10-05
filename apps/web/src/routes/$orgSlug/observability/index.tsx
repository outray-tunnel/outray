import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ObservabilityOverviewContent } from "@/components/observability/overview-content";
import { normalizeObservabilityRange } from "@/components/observability/overview-data";
import { observabilityOverviewQuery } from "@/components/observability/overview-query";

export const Route = createFileRoute("/$orgSlug/observability/")({
  head: () => ({ meta: [{ title: "Observability - OutRay" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    range: normalizeObservabilityRange(search.range),
  }),
  component: ObservabilityOverview,
});

function ObservabilityOverview() {
  const { orgSlug } = Route.useParams();
  const { range } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data, isPending, isFetching, error, refetch } = useQuery(
    observabilityOverviewQuery(orgSlug, range),
  );

  return (
    <ObservabilityOverviewContent
      key={orgSlug}
      orgSlug={orgSlug}
      data={data}
      referenceTime={data?.receivedAt ?? 0}
      range={range}
      onRangeChange={(nextRange) => {
        if (nextRange !== range) {
          void navigate({ search: (previous) => ({ ...previous, range: nextRange }), replace: true });
        }
      }}
      loading={isPending && !data}
      isFetching={isFetching && !!data}
      error={error?.message ?? null}
      onRetry={() => void refetch()}
    />
  );
}
