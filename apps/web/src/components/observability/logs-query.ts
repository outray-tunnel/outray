import { queryOptions } from "@tanstack/react-query";
import { normalizeLogsSearch, type LogsResponse, type LogsSearch, type LogsSnapshot } from "./logs-data";

export function observabilityLogsQuery(orgSlug: string, input: LogsSearch, isLive: boolean) {
  const search = normalizeLogsSearch(input);
  return queryOptions({
    queryKey: ["observability", "logs", orgSlug, search.search ?? null, search.service ?? null, search.level ?? null, search.range] as const,
    queryFn: async ({ signal }): Promise<LogsSnapshot> => {
      const parameters = new URLSearchParams({ range: search.range, limit: "250" });
      if (search.search) parameters.set("search", search.search);
      if (search.service) parameters.set("service", search.service);
      if (search.level) parameters.set("level", search.level);
      const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/observability/logs?${parameters}`, { signal });
      if (!response.ok) throw new Error("Log data is temporarily unavailable.");
      const data = await response.json() as LogsResponse;
      return { ...data, receivedAt: Date.now(), requestedSearch: { ...search } };
    },
    enabled: !!orgSlug,
    retry: false,
    refetchInterval: isLive ? 4_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isLive,
    refetchOnReconnect: isLive,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === orgSlug ? previousData : undefined,
  });
}
