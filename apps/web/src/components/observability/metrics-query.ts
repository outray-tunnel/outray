import { queryOptions } from "@tanstack/react-query";
import { normalizeMetricsSearch, type MetricsResponse, type MetricsSearch, type MetricsSnapshot } from "./metrics-data";

export function observabilityMetricsQuery(orgSlug: string, input: MetricsSearch, isLive: boolean) {
  const search = normalizeMetricsSearch(input);
  return queryOptions({
    queryKey: ["observability", "metrics", orgSlug, search.metric ?? null, search.service ?? null, search.range] as const,
    queryFn: async ({ signal }): Promise<MetricsSnapshot> => {
      const parameters = new URLSearchParams({ range: search.range });
      if (search.metric) parameters.set("metric_key", search.metric);
      if (search.service) parameters.set("service", search.service);
      const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/observability/metrics?${parameters}`, { signal });
      if (!response.ok) throw new Error("Metric data is temporarily unavailable.");
      const data = await response.json() as MetricsResponse;
      return {
        ...data,
        receivedAt: Date.now(),
        requestedMetricKey: search.metric,
        requestedService: search.service,
        requestedRange: search.range,
      };
    },
    enabled: !!orgSlug,
    refetchInterval: isLive ? 4_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isLive,
    refetchOnReconnect: isLive,
    // Range/selection changes can retain evidence, but never another tenant's.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === orgSlug ? previousData : undefined,
  });
}
