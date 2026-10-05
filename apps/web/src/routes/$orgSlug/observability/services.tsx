import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ServicesContent } from "@/components/observability/services-content";
import { observabilityServicesQuery } from "@/components/observability/services-query";

export const Route = createFileRoute("/$orgSlug/observability/services")({
  head: () => ({ meta: [{ title: "Services - OutRay Observability" }] }),
  component: ServicesView,
});

function ServicesView() {
  const { orgSlug } = Route.useParams();
  const { data, isPending, isFetching, error, refetch, dataUpdatedAt } = useQuery(observabilityServicesQuery(orgSlug));
  return (
    <ServicesContent
      key={orgSlug}
      orgSlug={orgSlug}
      services={data?.services}
      loading={isPending && !data}
      isFetching={isFetching}
      error={error?.message ?? null}
      updatedAt={dataUpdatedAt || undefined}
      onRetry={() => void refetch()}
    />
  );
}
