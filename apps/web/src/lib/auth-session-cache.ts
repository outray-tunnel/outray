import { createHash } from "node:crypto";

type Session = { user: { id: string } };
type SessionLoader = (request: Request) => Promise<Session | null>;

type Entry = {
  expiresAt: number;
  value: Promise<Session | null>;
};

const entries = new Map<string, Entry>();
const defaultTtlMs = 250;
const defaultMaxEntries = 1_000;

function configuredNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function cacheKey(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (!cookie && !authorization) return null;

  return createHash("sha256")
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
  const key = cacheKey(request);
  const ttlMs = configuredNumber("AUTH_SESSION_CACHE_TTL_MS", defaultTtlMs);
  if (!key || ttlMs === 0) return load(request);

  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.expiresAt > now) return existing.value;
  if (existing) entries.delete(key);

  prune(now, configuredNumber("AUTH_SESSION_CACHE_MAX_ENTRIES", defaultMaxEntries));
  const value = Promise.resolve()
    .then(() => load(request))
    .then(
      (session) => {
        if (!session) entries.delete(key);
        return session;
      },
      (error) => {
        entries.delete(key);
        throw error;
      },
    );
  entries.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

