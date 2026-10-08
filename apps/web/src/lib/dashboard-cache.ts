type CacheEntry<T> =
  | { expiresAt: number; value: T }
  | { promise: Promise<T> };

const cache = new Map<string, CacheEntry<unknown>>();
const ttlMs = Math.max(0, Number(process.env.DASHBOARD_QUERY_CACHE_TTL_MS || 30_000));
const maxEntries = 1_000;

function evictOldestEntries() {
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}

export function dashboardCacheKey(
  endpoint: string,
  parameters: Record<string, string | number | undefined>,
) {
  return `${endpoint}?${Object.entries(parameters)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&")}`;
}

/** Authorization must happen before calling this function. */
export async function cachedDashboardRead<T>(
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  if (ttlMs <= 0) return read();

  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing) {
    if ("promise" in existing) return existing.promise;
    if (existing.expiresAt > Date.now()) return existing.value;
    cache.delete(key);
  }

  const promise = read();
  cache.set(key, { promise });
  evictOldestEntries();
  try {
    const value = await promise;
    cache.set(key, { expiresAt: Date.now() + ttlMs, value });
    evictOldestEntries();
    return value;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}
