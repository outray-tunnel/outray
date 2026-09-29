import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { incidents, notifications } from "@/db/alerts-schema";
import { organizations } from "@/db/auth-schema";
import {
  uptimeComponentMonitors,
  uptimeIncidentUpdates,
  uptimeStatusComponents,
  uptimeStatusPages,
  uptimeSubscribers,
} from "@/db/uptime-schema";
import type { SecretsTransaction } from "@/lib/secrets/database";

export type UpdateInput = {
  note: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  componentStates: Record<string, "unknown" | "operational" | "degraded" | "outage">;
  publish: boolean;
};

export function parseIncidentUpdate(body: Record<string, unknown>):
  { success: true; data: UpdateInput } | { success: false; error: string; field?: string } {
  const note = body.note;
  if (typeof note !== "string" || !note.trim() || note.trim().length > 4_000) {
    return { success: false, field: "note", error: "An update note of 1–4,000 characters is required" };
  }
  const status = body.status ?? "investigating";
  if (status !== "investigating" && status !== "identified" && status !== "monitoring" && status !== "resolved") {
    return { success: false, field: "status", error: "Invalid incident state" };
  }
  const publish = body.publish ?? false;
  if (typeof publish !== "boolean") return { success: false, field: "publish", error: "Publish must be true or false" };
  const raw = body.componentStates ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > 100 ||
      Object.entries(raw).some(([id, state]) => !id || id.length > 100 ||
        !["unknown", "operational", "degraded", "outage"].includes(String(state)))) {
    return { success: false, field: "componentStates", error: "Invalid component states" };
  }
  return { success: true, data: {
    note: note.trim(), status, publish,
    componentStates: raw as UpdateInput["componentStates"],
  } };
}

export function parseComponentIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some((id) => typeof id !== "string" || !id || id.length > 100)) return null;
  return Array.from(new Set(value as string[]));
}

export async function validateManualStates(
  tx: SecretsTransaction,
  organizationId: string,
  affectedComponentIds: string[],
  states: UpdateInput["componentStates"],
) {
  const ids = Object.keys(states);
  if (!ids.length) return true;
  if (ids.some((id) => !affectedComponentIds.includes(id))) return false;
  const mapped = await tx.select({ componentId: uptimeComponentMonitors.componentId })
    .from(uptimeComponentMonitors).where(and(
      eq(uptimeComponentMonitors.organizationId, organizationId),
      inArray(uptimeComponentMonitors.componentId, ids),
    ));
  return mapped.length === 0;
}

export async function publishUptimeUpdate(
  tx: SecretsTransaction,
  input: {
    organizationId: string;
    incidentId: string;
    updateId: string;
    title: string;
    affectedComponentIds: string[];
    note: string;
    status: UpdateInput["status"];
    componentStates: UpdateInput["componentStates"];
    now: Date;
  },
): Promise<{ success: true; recipients: number } | { success: false; error: string; status: number }> {
  // Serialize the daily publish quota and state application within this organization.
  await tx.select({ id: organizations.id }).from(organizations)
    .where(eq(organizations.id, input.organizationId)).for("update");
  const [page] = await tx.select().from(uptimeStatusPages)
    .where(eq(uptimeStatusPages.organizationId, input.organizationId)).limit(1);
  if (!page?.published) return { success: false, error: "Publish the status page before sending an incident update", status: 409 };
  const [daily] = await tx.select({ count: sql<number>`count(*)::int` })
    .from(uptimeIncidentUpdates).where(and(
      eq(uptimeIncidentUpdates.organizationId, input.organizationId),
      ne(uptimeIncidentUpdates.id, input.updateId),
      isNotNull(uptimeIncidentUpdates.publishedAt),
      gte(uptimeIncidentUpdates.publishedAt, new Date(input.now.getTime() - 86_400_000)),
    ));
  if (daily.count >= 20) return { success: false, error: "Daily incident publish limit reached (20)", status: 429 };
  if (!await validateManualStates(tx, input.organizationId, input.affectedComponentIds, input.componentStates)) {
    return { success: false, error: "Only affected manual-only components can be changed by an update", status: 400 };
  }
  for (const [componentId, manualState] of Object.entries(input.componentStates)) {
    await tx.update(uptimeStatusComponents).set({ manualState, manualUpdatedAt: input.now, updatedAt: input.now })
      .where(and(eq(uptimeStatusComponents.id, componentId),
        eq(uptimeStatusComponents.organizationId, input.organizationId)));
  }
  if (input.status === "resolved") {
    await tx.update(incidents).set({ status: "resolved", resolvedAt: input.now, updatedAt: input.now })
      .where(and(eq(incidents.id, input.incidentId), eq(incidents.organizationId, input.organizationId)));
  }
  const recipients = await tx.select({ id: uptimeSubscribers.id, email: uptimeSubscribers.email })
    .from(uptimeSubscribers).where(and(eq(uptimeSubscribers.pageId, page.id),
      eq(uptimeSubscribers.organizationId, input.organizationId), eq(uptimeSubscribers.status, "confirmed")))
    .limit(1_000);
  if (recipients.length) {
    await tx.insert(notifications).values(recipients.map((subscriber) => ({
      id: crypto.randomUUID(), organizationId: input.organizationId,
      incidentId: input.incidentId, sourceType: "uptime_incident_update",
      sourceId: input.updateId, event: "published", channel: "email",
      recipient: subscriber.email,
      idempotencyKey: `uptime:subscriber:${input.updateId}:${subscriber.id}`,
      payload: {
        pageId: page.id, pageSlug: page.slug,
        incidentId: input.incidentId, updateId: input.updateId,
        subscriberId: subscriber.id, title: input.title,
        note: input.note, status: input.status,
      },
    }))).onConflictDoNothing({ target: notifications.idempotencyKey });
  }
  return { success: true, recipients: recipients.length };
}
