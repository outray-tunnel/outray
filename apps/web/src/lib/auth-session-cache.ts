import { createHash } from "node:crypto";

type Session = { user: { id: string } };
type SessionLoader = (request: Request) => Promise<Session | null>;

type Entry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const entries = new Map<string, Entry<unknown>>();
// Keep authenticated dashboard reads from re-querying the session database on
// every request during a burst. This is deliberately short so revocations are
// observed quickly while concurrent requests can share one lookup.
const defaultTtlMs = 2_000;
const defaultMaxEntries = 1_000;

function configuredNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function cacheKey(request: Request, namespace: string): string | null {
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (!cookie && !authorization) return null;

  return createHash("sha256")
    .update(namespace)
    .update("\0")
    .update(cookie || "")
    .update("\0")
    .update(authorization || "")
    .digest("hex");
}

function prune(now: number, maxEntries: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  while (entries.size >= maxEntries) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) return;
    entries.delete(oldest);
  }
}

/**
 * Coalesces the session lookup for the same authenticated request identity.
 * Membership/organization authorization is intentionally not cached here.
 */
export function getCachedAuthSession(
  request: Request,
  load: SessionLoader,
): Promise<Session | null> {
  return getCachedAuthValue(request, "session", () => load(request), {
    environmentVariable: "AUTH_SESSION_CACHE_TTL_MS",
    shouldCache: (session) => session !== null,
  });
}

export function getCachedAuthValue<T>(
  request: Request,
  namespace: string,
  load: () => Promise<T>,
  options: {
    environmentVariable: string;
    shouldCache?: (value: T) => boolean;
  },
): Promise<T> {
  const key = cacheKey(request, namespace);
  const ttlMs = configuredNumber(options.environmentVariable, defaultTtlMs);
  if (!key || ttlMs === 0) return load();

  const now = Date.now();
  const existing = entries.get(key) as Entry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.value;
  if (existing) entries.delete(key);

  prune(now, configuredNumber("AUTH_SESSION_CACHE_MAX_ENTRIES", defaultMaxEntries));
  const value = Promise.resolve()
    .then(load)
    .then(
      (result) => {
        if (options.shouldCache && !options.shouldCache(result)) entries.delete(key);
        return result;
      },
      (error) => {
        entries.delete(key);
        throw error;
      },
    );
  entries.set(key, { expiresAt: now + ttlMs, value });
  return value;
}
