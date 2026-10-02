import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { incidents } from "@/db/alerts-schema";
import { uptimeIncidentComponents, uptimeIncidentUpdates } from "@/db/uptime-schema";
import type { SecretsTransaction } from "@/lib/secrets/database";

export type IncidentCursor = { startedAt: Date; id: string };
export type IncidentListQuery = {
  q: string;
  view: "all" | "detected" | "active" | "resolved" | "drafts";
  source: "all" | "manual" | "automatic";
  cursor: IncidentCursor | null;
  limit: number;
};

export function encodeIncidentCursor(row: IncidentCursor) {
  return Buffer.from(JSON.stringify({ v: 1, startedAt: row.startedAt.toISOString(), id: row.id })).toString("base64url");
}

export function decodeIncidentCursor(value: string): IncidentCursor | null {
  if (!value || value.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    if (row.v !== 1 || typeof row.id !== "string" || !row.id || row.id.length > 200 ||
        typeof row.startedAt !== "string") return null;
    const startedAt = new Date(row.startedAt);
    if (!Number.isFinite(startedAt.getTime()) || startedAt.toISOString() !== row.startedAt) return null;
    return { startedAt, id: row.id };
  } catch {
    return null;
  }
}

export function parseIncidentListQuery(params: URLSearchParams):
  | { success: true; data: IncidentListQuery }
  | { success: false; error: string; field: string } {
  const q = (params.get("q") ?? "").trim();
  if (q.length > 160) return { success: false, error: "Search must be 160 characters or fewer", field: "q" };
  const view = params.get("view") ?? "all";
  if (view !== "all" && view !== "detected" && view !== "active" && view !== "resolved" && view !== "drafts") {
    return { success: false, error: "Invalid incident view", field: "view" };
  }
  const source = params.get("source") ?? "all";
  if (source !== "all" && source !== "manual" && source !== "automatic") {
    return { success: false, error: "Invalid incident source", field: "source" };
  }
  const rawLimit = params.get("limit") ?? "100";
  const limit = Number(rawLimit);
  if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return { success: false, error: "Limit must be between 1 and 100", field: "limit" };
  }
  const rawCursor = params.get("cursor");
  const cursor = rawCursor === null ? null : decodeIncidentCursor(rawCursor);
  if (rawCursor !== null && !cursor) return { success: false, error: "Invalid incident cursor", field: "cursor" };
  return { success: true, data: { q, view, source, cursor, limit } };
}

export function incidentListWhere(organizationId: string, query: IncidentListQuery) {
  const published = sql`exists (
    select 1 from ${uptimeIncidentUpdates}
    where ${uptimeIncidentUpdates.incidentId} = ${incidents.id}
      and ${uptimeIncidentUpdates.organizationId} = ${organizationId}
      and ${uptimeIncidentUpdates.publishedAt} is not null
  )`;
  return and(
    eq(incidents.organizationId, organizationId),
    inArray(incidents.sourceType, ["uptime_monitor", "uptime_manual"]),
    // strpos treats %, _ and backslashes as literal characters, unlike LIKE.
    query.q ? sql`strpos(lower(${incidents.title}), lower(${query.q})) > 0` : undefined,
    query.source !== "all" ? eq(incidents.sourceType, query.source === "manual" ? "uptime_manual" : "uptime_monitor") : undefined,
    query.view === "detected" ? and(eq(incidents.sourceType, "uptime_monitor"), eq(incidents.status, "open"), eq(incidents.uptimePublicationState, "detected")) : undefined,
    query.view === "active" ? and(eq(incidents.status, "open"), or(and(eq(incidents.sourceType, "uptime_monitor"), sql`${incidents.uptimePublicationState} <> 'ignored'`), published)) : undefined,
    query.view === "resolved" ? eq(incidents.status, "resolved") : undefined,
    query.view === "drafts" ? and(eq(incidents.sourceType, "uptime_manual"), sql`not ${published}`) : undefined,
    query.cursor ? or(
      lt(incidents.startedAt, query.cursor.startedAt),
      and(eq(incidents.startedAt, query.cursor.startedAt), lt(incidents.id, query.cursor.id)),
    ) : undefined,
  );
}

export function incidentListPage<T extends IncidentCursor>(rows: T[], limit: number) {
  const page = rows.slice(0, limit);
  return { rows: page, nextCursor: rows.length > limit && page.length ? encodeIncidentCursor(page[page.length - 1]) : null };
}

export async function loadIncidentList(database: Pick<SecretsTransaction, "select">, organizationId: string, query: IncidentListQuery) {
  const result = await database.select().from(incidents).where(incidentListWhere(organizationId, query))
    .orderBy(desc(incidents.startedAt), desc(incidents.id)).limit(query.limit + 1);
  const { rows, nextCursor } = incidentListPage(result, query.limit);
  const ids = rows.map((row) => row.id);
  const [updates, associations] = ids.length ? await Promise.all([
    database.select().from(uptimeIncidentUpdates).where(and(
      eq(uptimeIncidentUpdates.organizationId, organizationId), inArray(uptimeIncidentUpdates.incidentId, ids),
    )).orderBy(desc(uptimeIncidentUpdates.createdAt), desc(uptimeIncidentUpdates.id)),
    database.select().from(uptimeIncidentComponents).where(and(
      eq(uptimeIncidentComponents.organizationId, organizationId), inArray(uptimeIncidentComponents.incidentId, ids),
    )),
  ]) : [[], []];
  return {
    incidents: rows.map((row) => ({
      ...row,
      componentIds: associations.filter((link) => link.incidentId === row.id).map((link) => link.componentId),
      updates: updates.filter((update) => update.incidentId === row.id),
    })),
    nextCursor,
  };
}
