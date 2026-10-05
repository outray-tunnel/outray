import { queryOptions } from "@tanstack/react-query";
import type { ObservabilityRange, ServiceOverviewResponse } from "./overview-data";

export type ObservabilityOverviewSnapshot = ServiceOverviewResponse & { receivedAt: number };

export function observabilityOverviewQuery(orgSlug: string, range: ObservabilityRange) {
  return queryOptions({
    queryKey: ["observability", "overview", orgSlug, range] as const,
    queryFn: async ({ signal }): Promise<ObservabilityOverviewSnapshot> => {
      const response = await fetch(
        `/api/${encodeURIComponent(orgSlug)}/observability/services?range=${range}`,
        { signal },
      );
      if (!response.ok) throw new Error("Service telemetry is temporarily unavailable.");
      const data = await response.json() as ServiceOverviewResponse;
      return { ...data, receivedAt: Date.now() };
    },
    enabled: !!orgSlug,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // Range changes keep the layout steady without retaining another team's data.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === orgSlug ? previousData : undefined,
  });
}
