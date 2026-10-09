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
  | { expiresAt: number; value: unknown[]; refresh?: Promise<unknown[]> }
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
  options: { cache?: "default" | "no-store"; signal?: AbortSignal; maximumResponseBytes?: number } = {},
): Promise<T[]> {
  const { apiHost, token } = tinybirdConfig();
  const cacheKey = queryCacheKey(endpoint, parameters);

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const load = async (): Promise<unknown[]> => {
    const response = await fetch(
      `${apiHost}/v0/pipes/${encodeURIComponent(endpoint)}.json?${search}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      if (options.cache === "no-store") {
        // Error pages are not evidence. Cancel without reading potentially large
        // bodies or carrying their raw details into an investigation exception.
        await response.body?.cancel();
        throw new Error(`Tinybird query failed (${response.status})`);
      }
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Tinybird query failed (${response.status}): ${detail}`);
    }

    let result: TinybirdResponse<T>;
    if (options.cache === "no-store") {
      // Bound investigations even when a legacy pipe (trace_details) does not
      // have a SQL limit. Existing dashboard query behavior stays unchanged.
      const requestedMaximum = options.maximumResponseBytes;
      const maximum = typeof requestedMaximum === "number" && Number.isSafeInteger(requestedMaximum) && requestedMaximum > 0
        ? Math.min(requestedMaximum, 4 * 1_048_576)
        : 1_048_576;
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Malformed Tinybird evidence response");
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > maximum) { await reader.cancel(); throw new Error("Tinybird evidence response is too large"); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      result = JSON.parse(new TextDecoder().decode(buffer)) as TinybirdResponse<T>;
      if (!result || !Array.isArray(result.data)) throw new Error("Malformed Tinybird evidence response");
    } else result = (await response.json()) as TinybirdResponse<T>;
    return result.data || [];
  };

  // Investigations must distinguish fresh evidence from failed queries. They
  // opt out of the dashboard's stale-while-refresh cache without changing it.
  if (options.cache === "no-store") return (await load()) as T[];

  if (queryCacheTtlMs > 0) {
    const cached = queryCache.get(cacheKey);
    if (cached) {
      if ("promise" in cached) return (await cached.promise) as T[];
      if (cached.expiresAt > Date.now()) return cached.value as T[];

      // Keep serving the last successful result while one request refreshes
      // it. Remote Tinybird queries can occasionally take several seconds;
      // dashboard reads should not turn that refresh into a user-visible
      // timeout or a thundering herd.
      if (!cached.refresh) {
        cached.refresh = load()
          .then((value) => {
            queryCache.set(cacheKey, {
              expiresAt: Date.now() + queryCacheTtlMs,
              value,
            });
            return value;
          })
          .catch(() => {
            cached.expiresAt = Date.now() + 5_000;
            return cached.value;
          })
          .finally(() => {
            const current = queryCache.get(cacheKey);
            if (current && "value" in current) delete current.refresh;
          });
      }
      return cached.value as T[];
    }
  }

  const request = load();

  if (queryCacheTtlMs <= 0) return (await request) as T[];
  queryCache.set(cacheKey, { promise: request as Promise<unknown[]> });
  evictOldestCacheEntries();
  try {
    const value = await request;
    queryCache.set(cacheKey, {
      expiresAt: Date.now() + queryCacheTtlMs,
      value,
    });
    evictOldestCacheEntries();
    return value as T[];
  } catch (error) {
    queryCache.delete(cacheKey);
    throw error;
  }
}
