import { and, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { parseIncidentDocument, type IncidentDocument } from "@outray/incident-content";
import { incidents, notifications } from "@/db/alerts-schema";
import { organizations } from "@/db/auth-schema";
import {
  uptimeComponentMonitors,
  uptimeIncidentComponents,
  uptimeIncidentUpdates,
  uptimeStatusComponents,
  uptimeStatusGroups,
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
  publicTitle?: string;
  acknowledgeRecovery?: boolean;
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
    inArray(incidents.sourceType, ["uptime_manual", "uptime_monitor", "observability_alert"]),
  )).for("update").limit(1);
  return incident;
}

function assertIncidentEditable(incident: typeof incidents.$inferSelect, componentStates: UpdateInput["componentStates"]) {
  if (incident.sourceType === "uptime_manual" && incident.status === "resolved") {
    throw new PublishError("Resolved incidents are read-only", 409);
  }
  if (incident.sourceType !== "uptime_manual" && Object.keys(componentStates).length) {
    throw new PublishError("Automatic incidents cannot change component states", 400, "componentStates");
  }
}

function assertSourceUpdateStatus(incident: typeof incidents.$inferSelect, data: UpdateInput) {
  const status = data.status;
  if (incident.sourceType === "uptime_monitor" && incident.status !== "resolved" && status === "resolved") {
    throw new PublishError("The monitor has not confirmed recovery", 409, "status");
  }
  if (incident.sourceType === "observability_alert" && status === "resolved" &&
      !(incident.status === "resolved" && incident.recoveryConfirmed) && !data.acknowledgeRecovery) {
    throw new PublishError("Confirm recovery explicitly or wait for the alert to confirm healthy telemetry", 409, "acknowledgeRecovery");
  }
  if (incident.sourceType === "observability_alert" && data.publicTitle !== undefined &&
      incident.uptimePublicationState === "published" && data.publicTitle !== incident.publicTitle) {
    throw new PublishError("The approved public title cannot be changed by an update", 409, "publicTitle");
  }
  if (incident.sourceType === "observability_alert" && data.publish &&
      (!(data.publicTitle ?? incident.publicTitle)?.trim() ||
        !["degraded", "outage"].includes(incident.publicImpact ?? "") ||
        !["detected", "published"].includes(incident.uptimePublicationState ?? ""))) {
    throw new PublishError("Link this alert to status-page components and choose a customer-facing title before publishing", 409, "publicTitle");
  }
}

async function savePublicTitle(tx: SecretsTransaction, incident: typeof incidents.$inferSelect, data: UpdateInput) {
  if (incident.sourceType !== "observability_alert" || data.publicTitle === undefined || data.publicTitle === incident.publicTitle) return;
  await tx.update(incidents).set({ publicTitle: data.publicTitle, updatedAt: new Date() })
    .where(and(eq(incidents.id, incident.id), eq(incidents.organizationId, incident.organizationId)));
}

export async function createUptimeIncidentUpdate(tx: SecretsTransaction, input: {
  organizationId: string; incidentId: string; userId: string; data: UpdateInput;
}) {
  const incident = await lockUptimeIncident(tx, input.organizationId, input.incidentId);
  if (!incident) return null;
  assertIncidentEditable(incident, input.data.componentStates);
  assertSourceUpdateStatus(incident, input.data);
  const data = input.data;
  if (data.publish && incident.uptimePublicationState === "ignored") {
    throw new PublishError("Ignored detections cannot be published", 409);
  }
  if (data.publish && incident.uptimePublicationState === "detected" && incident.status !== "open") {
    throw new PublishError("Recovered detections cannot be published as active incidents", 409);
  }
  await savePublicTitle(tx, incident, data);
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
      title: incident.sourceType === "observability_alert" ? data.publicTitle ?? incident.publicTitle! : incident.title,
      affectedComponentIds: associations.map((link) => link.componentId),
      ...data, applyManualLifecycle: incident.sourceType === "uptime_manual",
      publishMonitorIncident: incident.uptimePublicationState === "detected",
      incidentSourceType: incident.sourceType, now,
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
  // A blank initial declaration still has a status timeline and can be published
  // later without inventing prose. All text-bearing drafts retain strict editing.
  const parseDraft = incident.sourceType === "uptime_manual" && !draft.note.trim() && draft.bodyJson === null
    ? parseInitialIncidentUpdate : parseIncidentUpdate;
  const parsed = parseDraft({
    ...(input.body.body !== undefined ? { body: input.body.body } : { note: input.body.note ?? draft.note }), status: input.body.status ?? draft.status,
    componentStates: input.body.componentStates ?? draft.componentStates, publish: input.body.publish ?? false,
    ...(input.body.publicTitle === undefined ? {} : { publicTitle: input.body.publicTitle }),
    ...(input.body.acknowledgeRecovery === undefined ? {} : { acknowledgeRecovery: input.body.acknowledgeRecovery }),
  });
  if (!parsed.success) throw new PublishError(parsed.error, 400, parsed.field);
  assertIncidentEditable(incident, parsed.data.componentStates);
  assertSourceUpdateStatus(incident, parsed.data);
  const data = parsed.data;
  if (data.publish && incident.uptimePublicationState === "ignored") {
    throw new PublishError("Ignored detections cannot be published", 409);
  }
  if (data.publish && incident.uptimePublicationState === "detected" && incident.status !== "open") {
    throw new PublishError("Recovered detections cannot be published as active incidents", 409);
  }
  await savePublicTitle(tx, incident, data);
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
      title: incident.sourceType === "observability_alert" ? data.publicTitle ?? incident.publicTitle! : incident.title,
      affectedComponentIds: associations.map((link) => link.componentId),
      ...data, applyManualLifecycle: incident.sourceType === "uptime_manual",
      publishMonitorIncident: incident.uptimePublicationState === "detected",
      incidentSourceType: incident.sourceType, now,
    });
    if (!result.success) throw new PublishError(result.error, result.status);
  }
  return updated;
}

type UpdateParseResult = { success: true; data: UpdateInput } | { success: false; error: string; field?: string };

export function parseIncidentUpdate(body: Record<string, unknown>): UpdateParseResult {
  return parseUpdateInput(body);
}

// Incident creation needs only its name and status. This opt-in must not make
// subsequent, explicit incident updates accept empty notes.
export function parseInitialIncidentUpdate(body: Record<string, unknown>): UpdateParseResult {
  return parseUpdateInput(body, { allowEmpty: true, requireStatus: true });
}

function parseUpdateInput(body: Record<string, unknown>, options: { allowEmpty?: boolean; requireStatus?: boolean } = {}):
  { success: true; data: UpdateInput } | { success: false; error: string; field?: string } {
  const parsedBody = body.body === undefined ? null : parseIncidentDocument(body.body, { allowEmpty: options.allowEmpty });
  if (body.body !== undefined && !parsedBody) return { success: false, field: "body", error: "The update contains unsupported formatting or needs text" };
  const note = parsedBody?.note ?? (body.note === undefined && options.allowEmpty ? "" : body.note);
  if (typeof note !== "string" || (!options.allowEmpty && !note.trim()) || note.trim().length > 4_000) {
    return { success: false, field: "note", error: options.allowEmpty
      ? "An update note must be at most 4,000 characters" : "An update note of 1–4,000 characters is required" };
  }
  const status = options.requireStatus ? body.status : body.status ?? "investigating";
  if (status !== "investigating" && status !== "identified" && status !== "monitoring" && status !== "resolved") {
    return { success: false, field: "status", error: "Invalid incident state" };
  }
  const publish = body.publish ?? false;
  if (typeof publish !== "boolean") return { success: false, field: "publish", error: "Publish must be true or false" };
  if (body.publicTitle !== undefined && (typeof body.publicTitle !== "string" || !body.publicTitle.trim() || body.publicTitle.trim().length > 160)) {
    return { success: false, field: "publicTitle", error: "Customer-facing title must be 1–160 characters" };
  }
  if (body.acknowledgeRecovery !== undefined && typeof body.acknowledgeRecovery !== "boolean") {
    return { success: false, field: "acknowledgeRecovery", error: "Recovery confirmation must be true or false" };
  }
  const raw = body.componentStates ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > 100 ||
      Object.entries(raw).some(([id, state]) => !id || id.length > 100 ||
        !["unknown", "operational", "degraded", "outage"].includes(String(state)))) {
    return { success: false, field: "componentStates", error: "Invalid component states" };
  }
  return { success: true, data: {
    note: note.trim(), bodyJson: parsedBody?.note ? parsedBody.body : null, status, publish,
    componentStates: raw as UpdateInput["componentStates"],
    ...(typeof body.publicTitle === "string" ? { publicTitle: body.publicTitle.trim() } : {}),
    ...(typeof body.acknowledgeRecovery === "boolean" ? { acknowledgeRecovery: body.acknowledgeRecovery } : {}),
  } };
}

export function parseComponentIds(value: unknown, options: { allowEmpty?: boolean } = {}): string[] | null {
  if (value === undefined && options.allowEmpty) return [];
  if (!Array.isArray(value) || (!value.length && !options.allowEmpty) || value.length > 100 || value.some((id) => typeof id !== "string" || !id || id.length > 100)) return null;
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
    publishMonitorIncident?: boolean;
    incidentSourceType?: string;
    acknowledgeRecovery?: boolean;
    now: Date;
  },
): Promise<{ success: true; recipients: number } | { success: false; error: string; status: number }> {
  // Serialize the daily publish quota and state application within this organization.
  await lockUptimeOrganization(tx, input.organizationId);
  const [page] = await tx.select().from(uptimeStatusPages)
    .where(eq(uptimeStatusPages.organizationId, input.organizationId)).for("share").limit(1);
  if (!page?.published) return { success: false, error: "Publish the status page before sending an incident update", status: 409 };
  if (input.publishMonitorIncident) {
    if (!input.affectedComponentIds.length) {
      return { success: false, error: "Link this source to a visible status-page component before publishing", status: 409 };
    }
    const [visibleComponent] = await tx.select({ id: uptimeStatusComponents.id })
      .from(uptimeStatusComponents)
      .leftJoin(uptimeStatusGroups, and(
        eq(uptimeStatusGroups.id, uptimeStatusComponents.groupId),
        eq(uptimeStatusGroups.organizationId, input.organizationId),
        eq(uptimeStatusGroups.pageId, page.id),
      ))
      .where(and(
        eq(uptimeStatusComponents.organizationId, input.organizationId),
        eq(uptimeStatusComponents.pageId, page.id),
        eq(uptimeStatusComponents.visible, true),
        inArray(uptimeStatusComponents.id, input.affectedComponentIds),
        or(isNull(uptimeStatusComponents.groupId), eq(uptimeStatusGroups.visible, true)),
      )).limit(1);
    if (!visibleComponent) return { success: false, error: "A visible affected component is required to publish this incident", status: 409 };
  }
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
  if (input.incidentSourceType === "observability_alert" && input.status === "resolved" && input.acknowledgeRecovery) {
    await tx.update(incidents).set({ status: "resolved", recoveryConfirmed: true,
      resolvedAt: input.now, updatedAt: input.now })
      .where(and(eq(incidents.id, input.incidentId), eq(incidents.organizationId, input.organizationId),
        eq(incidents.sourceType, "observability_alert")));
  }
  if (input.publishMonitorIncident) {
    await tx.update(incidents).set({ uptimePublicationState: "published", uptimePublishedAt: input.now,
      updatedAt: input.now }).where(and(eq(incidents.id, input.incidentId),
      eq(incidents.organizationId, input.organizationId), eq(incidents.sourceType, input.incidentSourceType ?? "uptime_monitor"),
      eq(incidents.uptimePublicationState, "detected")));
  }
  const recipients = page.subscriptionsEnabled !== false ? await tx.select({ id: uptimeSubscribers.id, email: uptimeSubscribers.email })
    .from(uptimeSubscribers).where(and(eq(uptimeSubscribers.pageId, page.id),
      eq(uptimeSubscribers.organizationId, input.organizationId), eq(uptimeSubscribers.status, "confirmed")))
    .limit(1_000) : [];
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
