import { queryOptions } from "@tanstack/react-query";
import { secretsClient, type SecretsOverview } from "@/lib/secrets-client";

export type SecretsOverviewSnapshot = SecretsOverview & { receivedAt: number };

export function secretsOverviewQuery(orgSlug: string) {
  return queryOptions({
    queryKey: ["secrets", "overview", orgSlug] as const,
    queryFn: async ({ signal }): Promise<SecretsOverviewSnapshot> => {
      try {
        const overview = await secretsClient.overview(orgSlug, signal);
        return { ...overview, receivedAt: Date.now() };
      } catch (error) {
        // A proxy/login HTML response should not expose a JSON parser error.
        if (error instanceof SyntaxError) {
          throw new Error("The Secrets overview returned an invalid response. Please try again.");
        }
        throw error;
      }
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
