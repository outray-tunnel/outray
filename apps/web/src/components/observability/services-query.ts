import { queryOptions } from "@tanstack/react-query";
import type { ServiceInventoryItem } from "./services-data";

export interface ServiceInventoryResponse {
  services: ServiceInventoryItem[];
}

export function observabilityServicesQuery(orgSlug: string) {
  return queryOptions({
    queryKey: ["observability", "services", orgSlug] as const,
    queryFn: async ({ signal }): Promise<ServiceInventoryResponse> => {
      const response = await fetch(
        `/api/${encodeURIComponent(orgSlug)}/observability/services`,
        { signal },
      );
      if (!response.ok) throw new Error("Service telemetry is temporarily unavailable.");
      return await response.json() as ServiceInventoryResponse;
    },
    enabled: !!orgSlug,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // Never show another organization's inventory while a new request loads.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === orgSlug ? previousData : undefined,
  });
}
