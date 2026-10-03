export const TUNNEL_RANGES = ["1h", "24h", "7d", "30d"] as const;
export type TunnelRange = (typeof TUNNEL_RANGES)[number];

export function parseTunnelDetailSearch(search: Record<string, unknown>): {
  tab: "overview" | "requests";
  // Optional to TanStack links; validation always supplies the default.
  range?: TunnelRange;
} {
  return {
    tab: search.tab === "requests" ? "requests" : "overview",
    range: TUNNEL_RANGES.includes(search.range as TunnelRange)
      ? (search.range as TunnelRange)
      : "24h",
  };
}

export function retainSameTunnelData<T>(
  previousData: T | undefined,
  previousQueryKey: readonly unknown[] | undefined,
  orgSlug: string,
  tunnelId: string,
): T | undefined {
  return previousQueryKey?.[1] === orgSlug && previousQueryKey[2] === tunnelId
    ? previousData
    : undefined;
}
