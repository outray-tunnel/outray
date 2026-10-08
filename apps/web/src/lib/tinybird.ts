interface TinybirdResponse<T> {
  data: T[];
  rows?: number;
  statistics?: {
    elapsed?: number;
    rows_read?: number;
    bytes_read?: number;
  };
}

type QueryCacheEntry =
  | { expiresAt: number; value: unknown[] }
  | { promise: Promise<unknown[]> };

const queryCache = new Map<string, QueryCacheEntry>();
const queryCacheTtlMs = Math.max(
  0,
  Number(process.env.TINYBIRD_QUERY_CACHE_TTL_MS || 30_000),
);
const queryCacheMaxEntries = 1_000;

function queryCacheKey(
  endpoint: string,
  parameters: Record<string, string | number | boolean | undefined>,
) {
  return `${endpoint}?${Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&")}`;
}

function evictOldestCacheEntries() {
  while (queryCache.size > queryCacheMaxEntries) {
    const oldest = queryCache.keys().next().value;
    if (oldest === undefined) return;
    queryCache.delete(oldest);
  }
}

function tinybirdConfig() {
  const apiHost = process.env.TINYBIRD_API_HOST?.replace(/\/$/, "");
  const token = process.env.TINYBIRD_QUERY_TOKEN;
  if (!apiHost || !token) {
    throw new Error("TINYBIRD_API_HOST and TINYBIRD_QUERY_TOKEN are required");
  }
  return { apiHost, token };
}

export async function queryTinybird<T>(
  endpoint: string,
  parameters: Record<string, string | number | boolean | undefined>,
): Promise<T[]> {
  const { apiHost, token } = tinybirdConfig();
  const cacheKey = queryCacheKey(endpoint, parameters);
  if (queryCacheTtlMs > 0) {
    const cached = queryCache.get(cacheKey);
    if (cached) {
      if ("promise" in cached) return (await cached.promise) as T[];
      if (cached.expiresAt > Date.now()) return cached.value as T[];
      queryCache.delete(cacheKey);
    }
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const request = (async () => {
    const response = await fetch(
      `${apiHost}/v0/pipes/${encodeURIComponent(endpoint)}.json?${search}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Tinybird query failed (${response.status}): ${detail}`);
    }

    const result = (await response.json()) as TinybirdResponse<T>;
    return result.data || [];
  })();

  if (queryCacheTtlMs <= 0) return request;
  queryCache.set(cacheKey, { promise: request as Promise<unknown[]> });
  evictOldestCacheEntries();
  try {
    const value = await request;
    queryCache.set(cacheKey, {
      expiresAt: Date.now() + queryCacheTtlMs,
      value,
    });
    evictOldestCacheEntries();
    return value;
  } catch (error) {
    queryCache.delete(cacheKey);
    throw error;
  }
}
