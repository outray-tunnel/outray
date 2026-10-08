type CacheEntry<T> =
  | { expiresAt: number; value: T }
  | { promise: Promise<T> };

const cache = new Map<string, CacheEntry<unknown>>();
const defaultTtlMs = 5_000;
const maxEntries = 1_000;

function configuredTtlMs(): number {
  const value = Number(process.env.DASHBOARD_REDIS_CACHE_TTL_MS);
  return Number.isFinite(value) && value >= 0 ? value : defaultTtlMs;
}

function evictExpired(now: number): void {
  for (const [key, entry] of cache) {
    if ("expiresAt" in entry && entry.expiresAt <= now) cache.delete(key);
  }
}

function evictOldest(): void {
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}

/**
 * Coalesces short-lived dashboard reads that otherwise hit the remote Redis
 * service for every request in a burst. Keys must include the organization and
 * any other input that affects the returned value.
 */
export function cachedDashboardRedisRead<T>(
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  const ttlMs = configuredTtlMs();
  if (ttlMs === 0) return read();

  const now = Date.now();
  evictExpired(now);
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing) {
    if ("promise" in existing) return existing.promise;
    if (existing.expiresAt > now) return Promise.resolve(existing.value);
    cache.delete(key);
  }

  const promise = Promise.resolve().then(read);
  cache.set(key, { promise });
  evictOldest();

  return promise.then(
    (value) => {
      cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      evictOldest();
      return value;
    },
    (error) => {
      cache.delete(key);
      throw error;
    },
  );
}
