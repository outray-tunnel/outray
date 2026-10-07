import type { SecretAuditEvent, SecretAuditPage } from "@/lib/secrets-client";

export type AuditCategory = "access" | "change" | "delete" | "security";
export interface AuditFilters { search: string; resource: string; actor: string; vault: string }
export interface AuditMetadataRow { label: string; value: string }
export interface AuditDay { key: string; label: string; events: SecretAuditEvent[] }

const resourceLabels: Record<string, string> = {
  project: "Vault", environment: "Environment", secret: "Secret", bulk: "Secret batch",
  share: "Share", machine_token: "Machine token", organization_key: "Workspace key",
};

export function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "secrets.bulk_deleted": "Secrets deleted", "secrets.bulk_moved": "Secrets moved",
    "secret.rolled_back": "Secret version restored", "share.snapshot_revealed": "Share snapshot accessed",
  };
  if (labels[action]) return labels[action];
  return action.replace(/[._-]+/g, " ").replace(/\bprojects?\b/gi, (word) => word.toLowerCase() === "projects" ? "vaults" : "vault")
    .replace(/\borganization key\b/gi, "workspace key").replace(/\bruntime read\b/gi, "runtime access")
    .trim().replace(/^./, (letter) => letter.toUpperCase()) || "Activity recorded";
}

export function auditCategory(action: string): AuditCategory {
  action = action.toLowerCase();
  if (/(?:deleted|purged)$/.test(action)) return "delete";
  if (/(?:revealed|copied|exported|runtime_read)$/.test(action)) return "access";
  if (/^(?:machine_token|organization_key|share)\./.test(action)) return "security";
  return "change";
}

export function auditResourceType(event: SecretAuditEvent): string {
  return event.targetType || event.resourceType;
}

export function auditResourceLabel(event: SecretAuditEvent): string {
  return resourceLabels[auditResourceType(event)] ?? "Resource";
}

export function auditResourceName(event: SecretAuditEvent): string {
  return event.resourceName || auditResourceLabel(event);
}

function metadataText(event: SecretAuditEvent, key: string, maxLength = 100): string | null {
  const value = event.metadata?.[key];
  return typeof value === "string" && value.trim() && value.length <= maxLength ? value.trim() : null;
}

export function auditActorLabel(event: SecretAuditEvent): string {
  if (event.actorType === "system") return "System";
  return event.actorName || event.actorEmail || (event.actorType === "machine" ? metadataText(event, "machineTokenName") || "Machine token" : "Member");
}

export function auditActorDetail(event: SecretAuditEvent): string {
  if (event.actorType === "system") return "System activity";
  if (event.actorType === "machine") {
    const prefix = metadataText(event, "machineTokenPrefix", 64);
    return prefix ? `Token · ${prefix}` : "Machine token";
  }
  return event.actorCredential === "cli" ? "CLI" : event.actorCredential === "session" ? "Session" : "Member";
}

export function auditLocation(event: SecretAuditEvent): string {
  const vault = event.projectName || event.projectSlug || (event.projectId ? `Vault · ${event.projectId.slice(0, 8)}` : null);
  const environment = event.environmentName || event.environmentSlug || (event.environmentId ? `Environment · ${event.environmentId.slice(0, 8)}` : null);
  return [vault, environment].filter(Boolean).join(" / ") || "Workspace";
}

export function auditVaultKey(event: SecretAuditEvent): string | null {
  return event.projectId || event.projectSlug || event.projectName || null;
}

export function auditVaultOptions(events: SecretAuditEvent[]): { value: string; label: string }[] {
  const vaults = new Map<string, string>();
  for (const event of events) {
    const key = auditVaultKey(event);
    if (key) vaults.set(key, event.projectName || event.projectSlug || `Vault · ${key.slice(0, 8)}`);
  }
  return [{ value: "all", label: "All vaults" }, ...Array.from(vaults, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))];
}

export function filterAuditEvents(events: SecretAuditEvent[], filters: AuditFilters): SecretAuditEvent[] {
  const search = filters.search.trim().toLowerCase();
  return events.filter((event) => (filters.resource === "all" || auditResourceType(event) === filters.resource) &&
    (filters.actor === "all" || event.actorType === filters.actor) &&
    (filters.vault === "all" || auditVaultKey(event) === filters.vault) &&
    (!search || [event.action, auditActionLabel(event.action), auditResourceName(event), auditResourceLabel(event),
      auditActorLabel(event), auditActorDetail(event), event.actorEmail, event.actorId, event.projectId, event.environmentId, auditLocation(event)]
      .filter(Boolean).join(" ").toLowerCase().includes(search)));
}

/** Cursor page boundaries can overlap after new events arrive. Keep each ID once. */
export function mergeAuditPages(pages: SecretAuditPage[]): SecretAuditEvent[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }));
}

function calendarKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function groupAuditEvents(events: SecretAuditEvent[], now = Date.now()): AuditDay[] {
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const todayKey = calendarKey(today);
  const yesterdayKey = calendarKey(yesterday);
  const days = new Map<string, AuditDay>();
  for (const event of events) {
    const date = new Date(event.createdAt);
    const valid = Number.isFinite(date.getTime());
    const key = valid ? calendarKey(date) : "unrecorded";
    if (!days.has(key)) {
      const label = !valid ? "Not recorded" : key === todayKey ? "Today" : key === yesterdayKey ? "Yesterday" : new Intl.DateTimeFormat(undefined, {
        weekday: "short", month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
      }).format(date);
      days.set(key, { key, label, events: [] });
    }
    days.get(key)!.events.push(event);
  }
  return [...days.values()];
}

/** Explicitly project known, non-value fields. Never render arbitrary audit JSON. */
export function auditMetadataRows(event: SecretAuditEvent): AuditMetadataRow[] {
  const metadata = event.metadata ?? {};
  const rows: AuditMetadataRow[] = [];
  const counts: Record<string, string> = {
    version: "Version", sourceVersion: "Source version", previousVersion: "Previous version",
    revision: "Revision", environmentRevision: "Environment revision", previousRevision: "Previous revision",
    count: "Secrets", itemCount: "Items", created: "Created", updated: "Updated", unchanged: "Unchanged", moved: "Moved", skipped: "Skipped", maxViews: "Maximum reveals",
  };
  for (const [key, label] of Object.entries(counts)) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) rows.push({ label, value: value.toLocaleString() });
  }
  for (const [key, label] of Object.entries({ renamed: "Renamed", valueChanged: "Value changed", descriptionChanged: "Description changed", isProduction: "Production", filtered: "Filtered", cli: "CLI action" })) {
    if (typeof metadata[key] === "boolean") rows.push({ label, value: metadata[key] ? "Yes" : "No" });
  }
  for (const [key, label] of Object.entries({ slug: "Slug", previousSlug: "Previous slug", batchId: "Batch ID", targetEnvironmentId: "Destination environment ID", conflictMode: "Duplicate handling", wrappingKeyId: "Wrapping key ID", previousWrappingKeyId: "Previous wrapping key ID" })) {
    const value = metadataText(event, key);
    if (value) rows.push({ label, value });
  }
  const expiresAt = metadataText(event, "expiresAt");
  if (expiresAt && Number.isFinite(Date.parse(expiresAt))) rows.push({ label: "Expires", value: new Date(expiresAt).toISOString() });
  const scopes = metadata.scopes;
  if (Array.isArray(scopes) && scopes.length <= 20 && scopes.every((value) => typeof value === "string" && /^[a-z_]+:[a-z_]+$/.test(value) && value.length <= 60)) {
    if (scopes.length) rows.push({ label: "Scopes", value: scopes.join(", ") });
  }
  return rows;
}
