import { queryOptions } from "@tanstack/react-query";
import { secretsClient, type SecretsOverview } from "@/lib/secrets-client";

export type SecretsOverviewSnapshot = SecretsOverview & { receivedAt: number };

export function secretsOverviewQuery(orgSlug: string) {
  return queryOptions({
    queryKey: ["secrets", "overview", orgSlug] as const,
    queryFn: async ({ signal }): Promise<SecretsOverviewSnapshot> => {
      const overview = await secretsClient.overview(orgSlug, signal);
      return { ...overview, receivedAt: Date.now() };
    },
    enabled: !!orgSlug,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // The same key retains successful data during refresh; another organization
    // must resolve its own snapshot without a previous organization's placeholder.
  });
}
