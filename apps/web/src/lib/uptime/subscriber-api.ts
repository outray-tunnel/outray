import type { uptimeSubscribers } from "@/db/uptime-schema";

const subscriberStatuses = new Set(["pending", "confirmed", "unsubscribed"]);

export type SubscriberCursor = { createdAt: Date; id: string };
export type SubscriberQuery = {
  q: string;
  status: "pending" | "confirmed" | "unsubscribed" | null;
  limit: number;
  cursor: SubscriberCursor | null;
};

export function parseSubscriberQuery(params: URLSearchParams): SubscriberQuery | { error: string } {
  const q = (params.get("q") ?? "").trim();
  const status = params.get("status");
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  if (q.length > 254) return { error: "Search must be at most 254 characters" };
  if (status && status !== "all" && !subscriberStatuses.has(status)) return { error: "Invalid subscription status" };
  if ((rawLimit !== null && !/^\d+$/.test(rawLimit)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { error: "Limit must be 1–100" };
  }
  const rawCursor = params.get("cursor");
  let cursor: SubscriberCursor | null = null;
  if (rawCursor !== null) {
    if (rawCursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) return { error: "Invalid subscriber cursor" };
    try {
      const decoded = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)
          || Object.keys(decoded).length !== 2 || typeof decoded.id !== "string"
          || !decoded.id.length || decoded.id.length > 256 || typeof decoded.createdAt !== "string") {
        throw new Error();
      }
      const createdAt = new Date(decoded.createdAt);
      if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== decoded.createdAt) throw new Error();
      cursor = { createdAt, id: decoded.id };
    } catch { return { error: "Invalid subscriber cursor" }; }
  }
  return { q, status: status && status !== "all" ? status as SubscriberQuery["status"] : null, limit, cursor };
}

export function subscriberCursor(row: { id: string; createdAt: Date }) {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}

// Treat user input literally, including %, _ and PostgreSQL's escape character.
export function subscriberSearchPattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

export function serializeSubscriber(row: typeof uptimeSubscribers.$inferSelect) {
  return {
    id: row.id, email: row.email, status: row.status,
    createdAt: row.createdAt, confirmedAt: row.confirmedAt,
    unsubscribedAt: row.unsubscribedAt, lastSentAt: row.lastSentAt,
  };
}
