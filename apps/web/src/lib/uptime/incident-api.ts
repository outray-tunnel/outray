import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { parseIncidentDocument, type IncidentDocument } from "@outray/incident-content";
import { incidents, notifications } from "@/db/alerts-schema";
import { organizations } from "@/db/auth-schema";
import {
  uptimeComponentMonitors,
  uptimeIncidentComponents,
  uptimeIncidentUpdates,
  uptimeStatusComponents,
  uptimeStatusPages,
  uptimeSubscribers,
} from "@/db/uptime-schema";
import type { SecretsTransaction } from "@/lib/secrets/database";

export type UpdateInput = {
  note: string;
  bodyJson: IncidentDocument | null;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  componentStates: Record<string, "unknown" | "operational" | "degraded" | "outage">;
  publish: boolean;
};

export class PublishError extends Error {
  status: number;
  field?: string;
  constructor(message: string, status: number, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

// Every incident mutation locks in this order: organization, incident, update.
// Publication also serializes the organization quota, so locking an incident or
// draft first would allow concurrent publication requests to deadlock.
export async function lockUptimeOrganization(tx: SecretsTransaction, organizationId: string) {
  await tx.select({ id: organizations.id }).from(organizations)
    .where(eq(organizations.id, organizationId)).for("update");
}

async function lockUptimeIncident(tx: SecretsTransaction, organizationId: string, incidentId: string) {
  await lockUptimeOrganization(tx, organizationId);
  const [incident] = await tx.select().from(incidents).where(and(
    eq(incidents.id, incidentId), eq(incidents.organizationId, organizationId),
    inArray(incidents.sourceType, ["uptime_manual", "uptime_monitor"]),
  )).for("update").limit(1);
  return incident;
}

function assertIncidentEditable(incident: typeof incidents.$inferSelect, componentStates: UpdateInput["componentStates"]) {
  if (incident.sourceType === "uptime_manual" && incident.status === "resolved") {
    throw new PublishError("Resolved incidents are read-only", 409);
  }
  if (incident.sourceType === "uptime_monitor" && Object.keys(componentStates).length) {
    throw new PublishError("Monitor incidents cannot change component states", 400, "componentStates");
  }
}

function assertMonitorUpdateStatus(incident: typeof incidents.$inferSelect, status: UpdateInput["status"]) {
  if (incident.sourceType === "uptime_monitor" && incident.status !== "resolved" && status === "resolved") {
    throw new PublishError("The monitor has not confirmed recovery", 409, "status");
  }
}

export async function createUptimeIncidentUpdate(tx: SecretsTransaction, input: {
  organizationId: string; incidentId: string; userId: string; data: UpdateInput;
}) {
  const incident = await lockUptimeIncident(tx, input.organizationId, input.incidentId);
  if (!incident) return null;
  assertIncidentEditable(incident, input.data.componentStates);
  assertMonitorUpdateStatus(incident, input.data.status);
  const data = input.data;
  const associations = await tx.select({ componentId: uptimeIncidentComponents.componentId })
    .from(uptimeIncidentComponents).where(and(
      eq(uptimeIncidentComponents.incidentId, incident.id),
      eq(uptimeIncidentComponents.organizationId, input.organizationId),
    ));
  const now = new Date();
  const [update] = await tx.insert(uptimeIncidentUpdates).values({
    id: crypto.randomUUID(), organizationId: input.organizationId, incidentId: incident.id,
    createdBy: input.userId, note: data.note, bodyJson: data.bodyJson, status: data.status,
    componentStates: data.componentStates, publishedAt: data.publish ? now : null,
  }).returning();
  if (data.publish) {
    const result = await publishUptimeUpdate(tx, {
      organizationId: input.organizationId, incidentId: incident.id, updateId: update.id,
      title: incident.title, affectedComponentIds: associations.map((link) => link.componentId),
      ...data, applyManualLifecycle: incident.sourceType === "uptime_manual", now,
    });
    if (!result.success) throw new PublishError(result.error, result.status);
  }
  return update;
}

export async function editUptimeIncidentDraft(tx: SecretsTransaction, input: {
  organizationId: string; incidentId: string; updateId: string; body: Record<string, unknown>;
}) {
  const incident = await lockUptimeIncident(tx, input.organizationId, input.incidentId);
  if (!incident) return null;
  const [draft] = await tx.select().from(uptimeIncidentUpdates).where(and(
    eq(uptimeIncidentUpdates.id, input.updateId), eq(uptimeIncidentUpdates.incidentId, incident.id),
    eq(uptimeIncidentUpdates.organizationId, input.organizationId),
  )).for("update").limit(1);
  if (!draft) return null;
  if (draft.publishedAt) throw new PublishError("Published updates are immutable", 409);
  assertIncidentEditable(incident, draft.componentStates);
  const parsed = parseIncidentUpdate({
    ...(input.body.body !== undefined ? { body: input.body.body } : { note: input.body.note ?? draft.note }), status: input.body.status ?? draft.status,
    componentStates: input.body.componentStates ?? draft.componentStates, publish: input.body.publish ?? false,
  });
  if (!parsed.success) throw new PublishError(parsed.error, 400, parsed.field);
  assertIncidentEditable(incident, parsed.data.componentStates);
  assertMonitorUpdateStatus(incident, parsed.data.status);
  const data = parsed.data;
  const associations = await tx.select({ componentId: uptimeIncidentComponents.componentId })
    .from(uptimeIncidentComponents).where(and(
      eq(uptimeIncidentComponents.incidentId, incident.id),
      eq(uptimeIncidentComponents.organizationId, input.organizationId),
    ));
  const now = new Date();
  const [updated] = await tx.update(uptimeIncidentUpdates).set({
    note: data.note, bodyJson: input.body.body === undefined && input.body.note === undefined ? draft.bodyJson : data.bodyJson, status: data.status, componentStates: data.componentStates,
    publishedAt: data.publish ? now : null,
  }).where(and(eq(uptimeIncidentUpdates.id, draft.id), eq(uptimeIncidentUpdates.organizationId, input.organizationId))).returning();
  if (data.publish) {
    const result = await publishUptimeUpdate(tx, {
      organizationId: input.organizationId, incidentId: incident.id, updateId: draft.id,
      title: incident.title, affectedComponentIds: associations.map((link) => link.componentId),
      ...data, applyManualLifecycle: incident.sourceType === "uptime_manual", now,
    });
    if (!result.success) throw new PublishError(result.error, result.status);
  }
  return updated;
}

export function parseIncidentUpdate(body: Record<string, unknown>):
  { success: true; data: UpdateInput } | { success: false; error: string; field?: string } {
  const parsedBody = body.body === undefined ? null : parseIncidentDocument(body.body);
  if (body.body !== undefined && !parsedBody) return { success: false, field: "body", error: "The update contains unsupported formatting or needs text" };
  const note = parsedBody?.note ?? body.note;
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
    note: note.trim(), bodyJson: parsedBody?.body ?? null, status, publish,
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
    applyManualLifecycle: boolean;
    now: Date;
  },
): Promise<{ success: true; recipients: number } | { success: false; error: string; status: number }> {
  // Serialize the daily publish quota and state application within this organization.
  await lockUptimeOrganization(tx, input.organizationId);
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
  if (input.applyManualLifecycle && input.status === "resolved") {
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
