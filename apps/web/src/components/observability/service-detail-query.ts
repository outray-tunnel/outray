import { queryOptions } from "@tanstack/react-query";
import type { ServiceDetailRange, ServiceDetailResponse, ServiceDetailSnapshot } from "./service-detail-data";

export type { ServiceDetailSnapshot } from "./service-detail-data";

export function observabilityServiceDetailQuery(orgSlug: string, serviceId: string, range: ServiceDetailRange) {
  return queryOptions({
    queryKey: ["observability", "service-detail", orgSlug, serviceId, range] as const,
    queryFn: async ({ signal }): Promise<ServiceDetailSnapshot> => {
      const parameters = new URLSearchParams({ service: serviceId, range });
      const response = await fetch(
        `/api/${encodeURIComponent(orgSlug)}/observability/services?${parameters}`,
        { signal },
      );
      if (!response.ok) throw new Error("Service telemetry is temporarily unavailable.");
      const data = await response.json() as ServiceDetailResponse;
      return { ...data, receivedAt: Date.now() };
    },
    enabled: !!orgSlug && !!serviceId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // Keep prior range evidence, never another service's or organization's data.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === orgSlug && previousQuery.queryKey[3] === serviceId
        ? previousData
        : undefined,
  });
}
