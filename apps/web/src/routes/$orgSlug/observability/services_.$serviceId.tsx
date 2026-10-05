import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ServiceDetailContent } from "@/components/observability/service-detail-content";
import { normalizeServiceDetailRange, type ServiceDetailRange } from "@/components/observability/service-detail-data";
import { observabilityServiceDetailQuery } from "@/components/observability/service-detail-query";

export const Route = createFileRoute(
  "/$orgSlug/observability/services_/$serviceId",
)({
  head: () => ({ meta: [{ title: "Service - OutRay Observability" }] }),
  validateSearch: (search: Record<string, unknown>): { range?: ServiceDetailRange } => ({
    range: normalizeServiceDetailRange(search.range),
  }),
  component: ServiceView,
});

function ServiceView() {
  const { orgSlug, serviceId } = Route.useParams();
  const range = normalizeServiceDetailRange(Route.useSearch().range);
  const navigate = Route.useNavigate();
  const { data, isPending, isFetching, error, refetch } = useQuery(
    observabilityServiceDetailQuery(orgSlug, serviceId, range),
  );

  return (
    <ServiceDetailContent
      key={`${orgSlug}:${serviceId}`}
      orgSlug={orgSlug}
      serviceId={serviceId}
      data={data}
      range={range}
      onRangeChange={(nextRange) => {
        if (nextRange !== range) {
          void navigate({
            search: (previous) => ({ ...previous, range: nextRange }),
            replace: true,
          });
        }
      }}
      loading={isPending && !data}
      isFetching={isFetching}
      error={error?.message ?? null}
      onRetry={() => void refetch()}
    />
  );
}
