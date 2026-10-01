import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { secretDeletionBatches, secretEntries, secretEnvironments, secretVersions } from "../../db/secrets-schema";
import { activeOrganizationKey, auditEvent, lockOrganization, resolveEnvironment, resolveProject, transactionKeyForVersion } from "./database";
import { decryptSecretValue, encryptSecretValue } from "./crypto";
import { optionalNonNegativeInteger, requireProductionConfirmation, validateSlug } from "./validation";
import type { SecretsAccess } from "./types";
import { SecretsError } from "./types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Entry = typeof secretEntries.$inferSelect;
type Version = typeof secretVersions.$inferSelect;

function idsFrom(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100 ||
      value.some((id) => typeof id !== "string" || id.length > 100) || new Set(value).size !== value.length) {
    throw new SecretsError("Choose between 1 and 100 secrets", { code: "VALIDATION_ERROR", status: 400, field: "secretIds" });
  }
  return value as string[];
}

function expectedRevision(value: unknown, field: string): number {
  const revision = optionalNonNegativeInteger(value, field);
  if (revision === undefined) throw new SecretsError(`${field} is required`, { code: "VALIDATION_ERROR", status: 400, field });
  return revision;
}

async function lockEnvironment(tx: Tx, id: string, expected: number) {
  const [environment] = await tx.select().from(secretEnvironments)
    .where(and(eq(secretEnvironments.id, id), isNull(secretEnvironments.deletedAt))).for("update");
  if (!environment) throw new SecretsError("Environment not found", { code: "NOT_FOUND", status: 404 });
  if (environment.revision !== expected) throw new SecretsError("Environment changed; refresh and try again", {
    code: "REVISION_CONFLICT", status: 409, details: { currentRevision: environment.revision },
  });
  return environment;
}

async function bumpRevision(tx: Tx, id: string): Promise<number> {
  const [row] = await tx.update(secretEnvironments).set({
    revision: sql`${secretEnvironments.revision} + 1`, updatedAt: new Date(),
  }).where(eq(secretEnvironments.id, id)).returning({ revision: secretEnvironments.revision });
  if (!row) throw new SecretsError("Environment not found", { code: "NOT_FOUND", status: 404 });
  return row.revision;
}

async function selectedEntries(tx: Tx, access: SecretsAccess, environmentId: string, ids: string[]): Promise<Entry[]> {
  const rows = await tx.select().from(secretEntries).where(and(
    eq(secretEntries.organizationId, access.organization.id),
    eq(secretEntries.environmentId, environmentId),
    inArray(secretEntries.id, ids),
    isNull(secretEntries.deletedAt),
  )).orderBy(secretEntries.key).for("update");
  if (rows.length !== ids.length) throw new SecretsError("Selection changed; refresh and try again", { code: "CONFLICT", status: 409 });
  return rows;
}

async function currentVersion(tx: Tx, entry: Entry): Promise<Version> {
  const [version] = await tx.select().from(secretVersions).where(and(
    eq(secretVersions.entryId, entry.id), eq(secretVersions.version, entry.currentVersion),
  )).limit(1);
  if (!version) throw new SecretsError("Current version is unavailable", { code: "SECRETS_INTEGRITY_ERROR", status: 500 });
  return version;
}

function versionValues(access: SecretsAccess, entry: Entry, version: number, value: string, key: { key: Buffer; version: number }, source: "create" | "write") {
  const encrypted = encryptSecretValue(key.key, {
    organizationId: access.organization.id, projectId: entry.projectId,
    environmentId: entry.environmentId, entryId: entry.id, version,
    keySnapshot: entry.key, organizationKeyVersion: key.version, value,
  });
  return {
    id: crypto.randomUUID(), organizationId: access.organization.id,
    entryId: entry.id, projectId: entry.projectId, environmentId: entry.environmentId,
    keySnapshot: entry.key, organizationKeyVersion: key.version, version,
    ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag,
    algorithm: encrypted.algorithm, valueDigest: encrypted.valueDigest,
    createdByType: access.actor.type, createdById: access.actor.id, source,
  } as const;
}

async function makeBatch(tx: Tx, access: SecretsAccess, projectId: string, environmentId: string, count: number, name: string, reason: "move" | "delete") {
  const id = crypto.randomUUID();
  await tx.insert(secretDeletionBatches).values({
    id, organizationId: access.organization.id, rootType: "bulk", rootId: id,
    rootName: name, projectId, environmentId, itemCount: count,
    metadata: { reason }, deletedByType: access.actor.type, deletedById: access.actor.id,
  });
  return id;
}

export async function deleteSecretsBulk(access: SecretsAccess, projectSlug: string, environmentSlug: string, input: Record<string, unknown>) {
  const project = await resolveProject(access, projectSlug);
  const environment = await resolveEnvironment(access, project, environmentSlug);
  const ids = idsFrom(input.secretIds);
  const revision = expectedRevision(input.expectedRevision, "expectedRevision");
  requireProductionConfirmation(environment, input.confirmProduction);
  if (input.confirmation !== `DELETE ${ids.length}`) throw new SecretsError(`Type DELETE ${ids.length} to continue`, { code: "CONFIRMATION_REQUIRED", status: 400 });
  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const locked = await lockEnvironment(tx, environment.id, revision);
    requireProductionConfirmation(locked, input.confirmProduction);
    const entries = await selectedEntries(tx, access, environment.id, ids);
    const batchId = await makeBatch(tx, access, project.id, environment.id, entries.length, `${entries.length} secrets from ${environment.name}`, "delete");
    await tx.update(secretEntries).set({ deletedAt: new Date(), deletionBatchId: batchId, updatedAt: new Date() })
      .where(inArray(secretEntries.id, entries.map((entry) => entry.id)));
    const nextRevision = await bumpRevision(tx, environment.id);
    await auditEvent(tx, access, { action: "secrets.bulk_deleted", targetType: "bulk", targetId: batchId,
      projectId: project.id, environmentId: environment.id, metadata: { count: entries.length, revision: nextRevision }, });
    return { deleted: entries.length, batchId, revision: nextRevision };
  });
}

export async function moveSecretsBulk(access: SecretsAccess, projectSlug: string, environmentSlug: string, input: Record<string, unknown>) {
  const project = await resolveProject(access, projectSlug);
  const source = await resolveEnvironment(access, project, environmentSlug);
  const targetSlug = validateSlug(String(input.targetEnvironmentSlug || ""), "targetEnvironmentSlug");
  if (targetSlug === source.slug) throw new SecretsError("Choose another environment", { code: "VALIDATION_ERROR", status: 400 });
  const target = await resolveEnvironment(access, project, targetSlug);
  const ids = idsFrom(input.secretIds);
  const sourceRevision = expectedRevision(input.expectedSourceRevision, "expectedSourceRevision");
  const targetRevision = expectedRevision(input.expectedTargetRevision, "expectedTargetRevision");
  const conflictMode = input.conflictMode;
  if (conflictMode !== "skip" && conflictMode !== "overwrite") throw new SecretsError("Choose Skip or Overwrite", { code: "VALIDATION_ERROR", status: 400 });
  requireProductionConfirmation({ isProduction: source.isProduction || target.isProduction }, input.confirmProduction);
  return db.transaction(async (tx) => {
    const activeKey = await activeOrganizationKey(tx, access.organization.id);
    const oldKeys = new Map<number, Buffer>();
    try {
      const expected = new Map([[source.id, sourceRevision], [target.id, targetRevision]]);
      for (const id of [source.id, target.id].sort()) {
        const locked = await lockEnvironment(tx, id, expected.get(id)!);
        requireProductionConfirmation(locked, input.confirmProduction);
      }
      const entries = await selectedEntries(tx, access, source.id, ids);
      const duplicates = await tx.select().from(secretEntries).where(and(
        eq(secretEntries.organizationId, access.organization.id), eq(secretEntries.environmentId, target.id),
        inArray(secretEntries.key, entries.map((entry) => entry.key)), isNull(secretEntries.deletedAt),
      )).for("update");
      const duplicateByKey = new Map(duplicates.map((entry) => [entry.key, entry]));
      const movable = entries.filter((entry) => conflictMode === "overwrite" || !duplicateByKey.has(entry.key));
      const skipped = entries.filter((entry) => conflictMode === "skip" && duplicateByKey.has(entry.key)).map((entry) => entry.key);
      if (movable.length === 0) return { moved: 0, skipped, sourceRevision, targetRevision };
      const batchId = await makeBatch(tx, access, project.id, source.id, movable.length, `${movable.length} moved secrets from ${source.name}`, "move");
      for (const entry of movable) {
        const version = await currentVersion(tx, entry);
        let oldKey = oldKeys.get(version.organizationKeyVersion);
        if (!oldKey) {
          oldKey = version.organizationKeyVersion === activeKey.version
            ? activeKey.key
            : await transactionKeyForVersion(tx, access.organization.id, version.organizationKeyVersion);
          oldKeys.set(version.organizationKeyVersion, oldKey);
        }
        const value = decryptSecretValue(oldKey, {
          organizationId: version.organizationId, projectId: version.projectId,
          environmentId: version.environmentId, entryId: version.entryId,
          version: version.version, keySnapshot: version.keySnapshot,
          organizationKeyVersion: version.organizationKeyVersion,
          ciphertext: version.ciphertext, iv: version.iv, authTag: version.authTag,
        });
        const duplicate = duplicateByKey.get(entry.key);
        if (duplicate) {
          const nextVersion = duplicate.currentVersion + 1;
          await tx.insert(secretVersions).values(versionValues(access, duplicate, nextVersion, value, activeKey, "write"));
          await tx.update(secretEntries).set({ currentVersion: nextVersion, updatedById: access.actor.userId, updatedAt: new Date() })
            .where(eq(secretEntries.id, duplicate.id));
        } else {
          const [created] = await tx.insert(secretEntries).values({
            id: crypto.randomUUID(), organizationId: access.organization.id,
            projectId: project.id, environmentId: target.id, key: entry.key,
            description: entry.description, currentVersion: 1,
            createdById: access.actor.userId, updatedById: access.actor.userId,
          }).returning();
          await tx.insert(secretVersions).values(versionValues(access, created, 1, value, activeKey, "create"));
        }
        await tx.update(secretEntries).set({ deletedAt: new Date(), deletionBatchId: batchId, updatedAt: new Date() })
          .where(eq(secretEntries.id, entry.id));
      }
      const nextSourceRevision = await bumpRevision(tx, source.id);
      const nextTargetRevision = await bumpRevision(tx, target.id);
      await auditEvent(tx, access, { action: "secrets.bulk_moved", targetType: "bulk", targetId: batchId,
        projectId: project.id, environmentId: source.id,
        metadata: { targetEnvironmentId: target.id, moved: movable.length, skipped: skipped.length, conflictMode }, });
      return { moved: movable.length, skipped, batchId, sourceRevision: nextSourceRevision, targetRevision: nextTargetRevision };
    } finally {
      for (const key of oldKeys.values()) if (key !== activeKey.key) key.fill(0);
      activeKey.key.fill(0);
    }
  });
}
