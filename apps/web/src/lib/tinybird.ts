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

// These endpoints declare required Tinybird DateTime64 parameters. Their wire
// format is a UTC SQL timestamp, not the ISO timestamp used by our public APIs.
const tunnelDateTimeEndpoints = new Set([
  "tunnel_http_stats", "tunnel_http_chart", "tunnel_requests",
  "tunnel_protocol_stats", "tunnel_protocol_chart", "tunnel_protocol_recent",
  "tunnel_capture", "tunnel_overview_stats", "tunnel_overview_chart",
  "tunnel_admin_active_series", "tunnel_admin_http_chart",
  "tunnel_admin_active_chart", "tunnel_admin_usage",
]);

function tinybirdDateTime(value: string): string {
  // Already-canonical values and other legacy inputs remain unchanged. Only
  // complete, zoned ISO timestamps are converted; never guess a local timezone.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const invalid = () => new Error("Invalid Tinybird datetime parameter");
  if (!match) throw invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw invalid();
  const zone = match[4];
  const offset = zone === "Z" ? 0
    : (zone.startsWith("+") ? 1 : -1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  // Date parsing can silently roll an impossible date (such as February 30)
  // into another month. Verify the original wall-clock fields before converting.
  const local = new Date(parsed.getTime() + offset * 60_000).toISOString();
  const expected = `${match[1]}T${match[2]}.${(match[3] || "").padEnd(3, "0").slice(0, 3)}Z`;
  if (local !== expected) throw invalid();
  return parsed.toISOString().replace("T", " ").slice(0, -1);
}

function tinybirdWireParameters(
  endpoint: string,
  parameters: Record<string, string | number | boolean | undefined>,
) {
  if (!tunnelDateTimeEndpoints.has(endpoint)) return parameters;
  const result = { ...parameters };
  const keys = ["start", "end",
    ...(endpoint === "tunnel_overview_stats" ? ["previous_start"] : []),
    ...(endpoint === "tunnel_capture" ? ["timestamp"] : []),
  ];
  for (const key of keys) {
    const value = result[key];
    if (typeof value === "string" && value !== "") result[key] = tinybirdDateTime(value);
  }
  return result;
}

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
  const wireParameters = tinybirdWireParameters(endpoint, parameters);
  const cacheKey = queryCacheKey(endpoint, wireParameters);

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(wireParameters)) {
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
