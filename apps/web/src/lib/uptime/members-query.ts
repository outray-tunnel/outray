import { and, eq, gt, or, sql } from "drizzle-orm";
import { members, users } from "@/db/auth-schema";

export type UptimeMemberCursor = { name: string; email: string; id: string; q: string };
export type UptimeMembersQuery = { q: string; limit: number; cursor: UptimeMemberCursor | null };

export function encodeUptimeMemberCursor(row: Pick<UptimeMemberCursor, "name" | "email" | "id">, q: string) {
  return Buffer.from(JSON.stringify({ v: 1, name: row.name, email: row.email, id: row.id, q })).toString("base64url");
}

export function decodeUptimeMemberCursor(value: string): UptimeMemberCursor | null {
  if (!value || value.length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    if (row.v !== 1 || typeof row.id !== "string" || !row.id || row.id.length > 200 ||
        typeof row.name !== "string" || row.name.length > 4_096 ||
        typeof row.email !== "string" || row.email.length > 4_096 ||
        typeof row.q !== "string" || row.q.length > 160) return null;
    return { name: row.name, email: row.email, id: row.id, q: row.q };
  } catch {
    return null;
  }
}

export function parseUptimeMembersQuery(params: URLSearchParams):
  | { success: true; data: UptimeMembersQuery | null }
  | { success: false; error: string; field: string } {
  // Existing clients still receive the complete member list unless they opt in.
  if (!["q", "limit", "cursor"].some((field) => params.has(field))) return { success: true, data: null };
  const q = (params.get("q") ?? "").trim();
  if (q.length > 160) return { success: false, error: "Search must be 160 characters or fewer", field: "q" };
  const rawLimit = params.get("limit") ?? "20";
  const limit = Number(rawLimit);
  if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return { success: false, error: "Limit must be between 1 and 50", field: "limit" };
  }
  const rawCursor = params.get("cursor");
  const cursor = rawCursor === null ? null : decodeUptimeMemberCursor(rawCursor);
  if (rawCursor !== null && (!cursor || cursor.q !== q)) {
    return { success: false, error: "Invalid member cursor", field: "cursor" };
  }
  return { success: true, data: { q, limit, cursor } };
}

export function uptimeMembersWhere(organizationId: string, query: UptimeMembersQuery | null) {
  const cursor = query?.cursor;
  return and(
    eq(members.organizationId, organizationId),
    // Unlike LIKE, strpos treats wildcard characters as literal search text.
    query?.q ? or(
      sql`strpos(lower(${users.name}), lower(${query.q})) > 0`,
      sql`strpos(lower(${users.email}), lower(${query.q})) > 0`,
    ) : undefined,
    cursor ? or(
      gt(users.name, cursor.name),
      and(eq(users.name, cursor.name), gt(users.email, cursor.email)),
      and(eq(users.name, cursor.name), eq(users.email, cursor.email), gt(users.id, cursor.id)),
    ) : undefined,
  );
}

export function uptimeMembersPage<T extends Pick<UptimeMemberCursor, "name" | "email" | "id">>(rows: T[], query: UptimeMembersQuery) {
  const page = rows.slice(0, query.limit);
  return {
    members: page,
    nextCursor: rows.length > query.limit && page.length ? encodeUptimeMemberCursor(page[page.length - 1], query.q) : null,
  };
}
