import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/auth-schema";
import {
  machineTokens,
  secretAuditEvents,
  secretDeletionBatches,
  secretEntries,
  secretEnvironments,
  secretOrganizationKeys,
  secretProjects,
} from "../../db/secrets-schema";
import {
  createMachineToken,
  machineTokenExpiry,
  normalizeMachineTokenScopes,
} from "../machine-tokens";
import { assertActorScope } from "./access-policy";
import {
  auditEvent,
  lockOrganization,
} from "./database";
import {
  createOrganizationKey,
  nextOrganizationKeyVersion,
  readSecretsKeyring,
  unwrapOrganizationKey,
  wrapOrganizationKey,
} from "./crypto";
import type { SecretsAccess } from "./types";
import { SecretsError } from "./types";
import {
  readRequiredString,
  requireProductionConfirmation,
  validateSlug,
} from "./validation";

function requireSessionAdmin(access: SecretsAccess) {
  if (
    access.actor.type !== "user" ||
    access.actor.credential !== "session" ||
    (access.actor.role !== "owner" && access.actor.role !== "admin")
  ) {
    throw new SecretsError(
      "Only organization owners and admins can perform this action",
      { code: "FORBIDDEN", status: 403 },
    );
  }
}

export async function listAuditEvents(
  access: SecretsAccess,
  search: URLSearchParams,
) {
  const requestedLimit = Number(search.get("limit") ?? "50");
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;
  const conditions = [
    eq(secretAuditEvents.organizationId, access.organization.id),
  ];
  if (access.actor.type === "machine" && access.actor.projectId) {
    conditions.push(eq(secretAuditEvents.projectId, access.actor.projectId));
  }
  if (access.actor.type === "machine" && access.actor.environmentId) {
    conditions.push(
      eq(secretAuditEvents.environmentId, access.actor.environmentId),
    );
  }
  const action = search.get("action")?.trim();
  if (action) conditions.push(eq(secretAuditEvents.action, action));
  const cursor = search.get("cursor");
  let cursorValue: { createdAt: Date; id: string } | null = null;
  if (cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
        createdAt?: unknown;
        id?: unknown;
      };
      const createdAt = new Date(String(parsed.createdAt));
      if (Number.isNaN(createdAt.getTime()) || typeof parsed.id !== "string") {
        throw new Error("invalid cursor");
      }
      cursorValue = { createdAt, id: parsed.id };
    } catch {
      throw new SecretsError("cursor is invalid", {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "cursor",
      });
    }
  }
  const before = search.get("before");
  if (!cursorValue && before) {
    const date = new Date(before);
    if (Number.isNaN(date.getTime())) {
      throw new SecretsError("before must be an ISO timestamp", {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "before",
      });
    }
    conditions.push(lt(secretAuditEvents.createdAt, date));
  }
  if (cursorValue) {
    conditions.push(
      or(
        lt(secretAuditEvents.createdAt, cursorValue.createdAt),
        and(
          eq(secretAuditEvents.createdAt, cursorValue.createdAt),
          lt(secretAuditEvents.id, cursorValue.id),
        ),
      )!,
    );
  }
  const rows = await db
    .select({
      id: secretAuditEvents.id,
      projectId: secretAuditEvents.projectId,
      environmentId: secretAuditEvents.environmentId,
      entryId: secretAuditEvents.entryId,
      actorType: secretAuditEvents.actorType,
      actorCredential: secretAuditEvents.actorCredential,
      actorId: secretAuditEvents.actorId,
      actorTokenId: secretAuditEvents.actorTokenId,
      userName: users.name,
      userEmail: users.email,
      machineTokenName: machineTokens.name,
      machineTokenPrefix: machineTokens.prefix,
      action: secretAuditEvents.action,
      result: secretAuditEvents.result,
      requestId: secretAuditEvents.requestId,
      targetType: secretAuditEvents.targetType,
      targetId: secretAuditEvents.targetId,
      targetName: secretAuditEvents.targetName,
      metadata: secretAuditEvents.metadata,
      ipAddress: secretAuditEvents.ipAddress,
      userAgent: secretAuditEvents.userAgent,
      createdAt: secretAuditEvents.createdAt,
    })
    .from(secretAuditEvents)
    .leftJoin(
      users,
      and(
        eq(secretAuditEvents.actorType, "user"),
        eq(secretAuditEvents.actorId, users.id),
      ),
    )
    .leftJoin(
      machineTokens,
      and(
        eq(secretAuditEvents.actorType, "machine"),
        eq(secretAuditEvents.actorTokenId, machineTokens.id),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(secretAuditEvents.createdAt), desc(secretAuditEvents.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const selectedRows = rows.slice(0, limit);
  const last = selectedRows.at(-1);
  const events = selectedRows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    entryId: row.entryId,
    actorType: row.actorType,
    actorCredential: row.actorCredential,
    actorId: row.actorId,
    actorTokenId: row.actorTokenId,
    actorName:
      row.actorType === "machine" ? row.machineTokenName : row.userName,
    actorEmail: row.actorType === "user" ? row.userEmail : null,
    action: row.action,
    result: row.result,
    requestId: row.requestId,
    targetType: row.targetType,
    targetId: row.targetId,
    targetName: row.targetName,
    metadata: {
      ...row.metadata,
      ...(row.machineTokenName
        ? { machineTokenName: row.machineTokenName }
        : {}),
      ...(row.machineTokenPrefix
        ? { machineTokenPrefix: row.machineTokenPrefix }
        : {}),
    },
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  }));
  return {
    events,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            }),
          ).toString("base64url")
        : null,
  };
}

export async function listTrash(access: SecretsAccess) {
  const conditions = [
    eq(secretDeletionBatches.organizationId, access.organization.id),
    eq(secretDeletionBatches.status, "active"),
  ];
  if (access.actor.type === "machine" && access.actor.projectId) {
    conditions.push(eq(secretDeletionBatches.projectId, access.actor.projectId));
  }
  if (access.actor.type === "machine" && access.actor.environmentId) {
    conditions.push(
      eq(secretDeletionBatches.environmentId, access.actor.environmentId),
    );
  }
  const rows = await db
    .select()
    .from(secretDeletionBatches)
    .where(and(...conditions))
    .orderBy(desc(secretDeletionBatches.deletedAt));
  const projectBatchIds = rows
    .filter((row) => row.rootType === "project")
    .map((row) => row.id);
  const environmentIds = rows
    .filter((row) => row.rootType !== "project" && row.environmentId)
    .map((row) => row.environmentId as string);
  const productionConditions = [];
  if (projectBatchIds.length) {
    productionConditions.push(
      inArray(secretEnvironments.deletionBatchId, projectBatchIds),
    );
  }
  if (environmentIds.length) {
    productionConditions.push(inArray(secretEnvironments.id, environmentIds));
  }
  const environmentRows = productionConditions.length
    ? await db
        .select({
          id: secretEnvironments.id,
          deletionBatchId: secretEnvironments.deletionBatchId,
          isProduction: secretEnvironments.isProduction,
        })
        .from(secretEnvironments)
        .where(or(...productionConditions))
    : [];
  const productionEnvironmentIds = new Set(
    environmentRows
      .filter((row) => row.isProduction)
      .map((row) => row.id),
  );
  const productionProjectBatchIds = new Set(
    environmentRows
      .filter((row) => row.isProduction && row.deletionBatchId)
      .map((row) => row.deletionBatchId as string),
  );
  return rows.map((row) => ({
    id: row.rootId,
    batchId: row.id,
    type: row.rootType,
    name: row.rootName,
    projectId: row.projectId,
    environmentId: row.environmentId,
    itemCount: row.itemCount,
    metadata: row.metadata,
    isProduction:
      row.rootType === "project"
        ? productionProjectBatchIds.has(row.id)
        : !!row.environmentId && productionEnvironmentIds.has(row.environmentId),
    deletedByType: row.deletedByType,
    deletedById: row.deletedById,
    deletedAt: row.deletedAt,
    expiresAt: row.expiresAt,
  }));
}

function trashType(value: unknown): "project" | "environment" | "secret" {
  if (value !== "project" && value !== "environment" && value !== "secret") {
    throw new SecretsError("type must be project, environment, or secret", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "type",
    });
  }
  return value;
}

async function deletionBatch(
  organizationId: string,
  type: "project" | "environment" | "secret",
  id: string,
) {
  const [batch] = await db
    .select()
    .from(secretDeletionBatches)
    .where(
      and(
        eq(secretDeletionBatches.organizationId, organizationId),
        eq(secretDeletionBatches.rootType, type),
        eq(secretDeletionBatches.status, "active"),
        or(
          eq(secretDeletionBatches.rootId, id),
          eq(secretDeletionBatches.id, id),
        ),
      ),
    )
    .limit(1);
  if (!batch) {
    throw new SecretsError("Deleted item not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  return batch;
}

function validRestoreConfirmation(value: unknown, name: string) {
  return value === name;
}

function validPurgeConfirmation(value: unknown, name: string) {
  return value === `PURGE ${name}`;
}

export async function restoreTrash(
  access: SecretsAccess,
  input: Record<string, unknown>,
) {
  requireSessionAdmin(access);
  const type = trashType(input.type);
  const id = readRequiredString(input, "id", { maxLength: 100 });
  const batch = await deletionBatch(access.organization.id, type, id);
  assertActorScope(access.actor, {
    projectId: batch.projectId ?? undefined,
    environmentId: batch.environmentId ?? undefined,
  });
  if (!validRestoreConfirmation(input.confirmation, batch.rootName)) {
    throw new SecretsError(
      "confirmation must exactly match the deleted item name",
      { code: "CONFIRMATION_REQUIRED", status: 400, field: "confirmation" },
    );
  }

  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const [lockedBatch] = await tx
      .select()
      .from(secretDeletionBatches)
      .where(
        and(
          eq(secretDeletionBatches.id, batch.id),
          eq(secretDeletionBatches.status, "active"),
        ),
      )
      .for("update");
    if (!lockedBatch) {
      throw new SecretsError("Deleted item is no longer restorable", {
        code: "CONFLICT",
        status: 409,
      });
    }
    if (!validRestoreConfirmation(input.confirmation, lockedBatch.rootName)) {
      throw new SecretsError(
        "Deleted item name changed; confirmation is no longer valid",
        { code: "CONFIRMATION_REQUIRED", status: 409, field: "confirmation" },
      );
    }
    if (type === "project") {
      const [project] = await tx
        .select()
        .from(secretProjects)
        .where(eq(secretProjects.id, lockedBatch.rootId))
        .limit(1)
        .for("update");
      if (!project) throw new SecretsError("Project was already purged", { code: "NOT_FOUND", status: 404 });
      const projectEnvironments = await tx
        .select({
          id: secretEnvironments.id,
          isProduction: secretEnvironments.isProduction,
        })
        .from(secretEnvironments)
        .where(eq(secretEnvironments.deletionBatchId, lockedBatch.id))
        .for("update");
      requireProductionConfirmation(
        { isProduction: projectEnvironments.some((row) => row.isProduction) },
        input.confirmProduction,
      );
      const [duplicate] = await tx
        .select({ id: secretProjects.id })
        .from(secretProjects)
        .where(
          and(
            eq(secretProjects.organizationId, access.organization.id),
            eq(secretProjects.slug, project.slug),
            isNull(secretProjects.deletedAt),
          ),
        )
        .limit(1);
      if (duplicate) throw new SecretsError("A project now uses this slug", { code: "RESTORE_CONFLICT", status: 409 });
      await tx
        .update(secretProjects)
        .set({ deletedAt: null, deletionBatchId: null, updatedAt: new Date() })
        .where(eq(secretProjects.deletionBatchId, lockedBatch.id));
      await tx
        .update(secretEnvironments)
        .set({
          deletedAt: null,
          deletionBatchId: null,
          revision: sql`${secretEnvironments.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(secretEnvironments.deletionBatchId, lockedBatch.id));
      await tx
        .update(secretEntries)
        .set({ deletedAt: null, deletionBatchId: null, updatedAt: new Date() })
        .where(eq(secretEntries.deletionBatchId, lockedBatch.id));
    } else if (type === "environment") {
      const [environment] = await tx
        .select()
        .from(secretEnvironments)
        .where(eq(secretEnvironments.id, lockedBatch.rootId))
        .limit(1)
        .for("update");
      if (!environment) throw new SecretsError("Environment was already purged", { code: "NOT_FOUND", status: 404 });
      requireProductionConfirmation(environment, input.confirmProduction);
      const [parent] = await tx
        .select({ id: secretProjects.id })
        .from(secretProjects)
        .where(
          and(
            eq(secretProjects.id, environment.projectId),
            isNull(secretProjects.deletedAt),
          ),
        )
        .limit(1);
      if (!parent) {
        throw new SecretsError(
          "Restore the parent project before restoring this environment",
          { code: "PARENT_DELETED", status: 409 },
        );
      }
      const [duplicate] = await tx
        .select({ id: secretEnvironments.id })
        .from(secretEnvironments)
        .where(
          and(
            eq(secretEnvironments.projectId, environment.projectId),
            eq(secretEnvironments.slug, environment.slug),
            isNull(secretEnvironments.deletedAt),
          ),
        )
        .limit(1);
      if (duplicate) throw new SecretsError("An environment now uses this slug", { code: "RESTORE_CONFLICT", status: 409 });
      await tx
        .update(secretEnvironments)
        .set({
          deletedAt: null,
          deletionBatchId: null,
          revision: sql`${secretEnvironments.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(secretEnvironments.deletionBatchId, lockedBatch.id));
      await tx
        .update(secretEntries)
        .set({ deletedAt: null, deletionBatchId: null, updatedAt: new Date() })
        .where(eq(secretEntries.deletionBatchId, lockedBatch.id));
    } else {
      const [entry] = await tx
        .select()
        .from(secretEntries)
        .where(eq(secretEntries.id, lockedBatch.rootId))
        .limit(1)
        .for("update");
      if (!entry) throw new SecretsError("Secret was already purged", { code: "NOT_FOUND", status: 404 });
      const [parentEnvironment] = await tx
        .select({
          environmentId: secretEnvironments.id,
          projectId: secretEnvironments.projectId,
          isProduction: secretEnvironments.isProduction,
        })
        .from(secretEnvironments)
        .where(
          and(
            eq(secretEnvironments.id, entry.environmentId),
            isNull(secretEnvironments.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      const [parentProject] = parentEnvironment
        ? await tx
            .select({ id: secretProjects.id })
            .from(secretProjects)
            .where(
              and(
                eq(secretProjects.id, parentEnvironment.projectId),
                isNull(secretProjects.deletedAt),
              ),
            )
            .limit(1)
            .for("update")
        : [];
      if (!parentEnvironment || !parentProject) {
        throw new SecretsError(
          "Restore the parent project and environment before restoring this secret",
          { code: "PARENT_DELETED", status: 409 },
        );
      }
      requireProductionConfirmation(
        parentEnvironment,
        input.confirmProduction,
      );
      const [duplicate] = await tx
        .select({ id: secretEntries.id })
        .from(secretEntries)
        .where(
          and(
            eq(secretEntries.environmentId, entry.environmentId),
            eq(secretEntries.key, entry.key),
            isNull(secretEntries.deletedAt),
          ),
        )
        .limit(1);
      if (duplicate) throw new SecretsError("A secret now uses this key", { code: "RESTORE_CONFLICT", status: 409 });
      await tx
        .update(secretEntries)
        .set({ deletedAt: null, deletionBatchId: null, updatedAt: new Date() })
        .where(eq(secretEntries.id, entry.id));
      await tx
        .update(secretEnvironments)
        .set({
          revision: sql`${secretEnvironments.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(secretEnvironments.id, entry.environmentId));
    }
    const now = new Date();
    await tx
      .update(secretDeletionBatches)
      .set({
        status: "restored",
        restoredAt: now,
        restoredByType: access.actor.type,
        restoredById: access.actor.id,
      })
      .where(eq(secretDeletionBatches.id, lockedBatch.id));
    await auditEvent(tx, access, {
      action: `${type}.restored`,
      targetType: type,
      targetId: lockedBatch.rootId,
      targetName: lockedBatch.rootName,
      projectId: lockedBatch.projectId,
      environmentId: lockedBatch.environmentId,
      entryId: type === "secret" ? lockedBatch.rootId : null,
      metadata: { batchId: lockedBatch.id, itemCount: lockedBatch.itemCount },
    });
    return {
      restored: true,
      type,
      id: lockedBatch.rootId,
      batchId: lockedBatch.id,
    };
  });
}

export async function purgeTrash(
  access: SecretsAccess,
  input: Record<string, unknown>,
) {
  requireSessionAdmin(access);
  const type = trashType(input.type);
  const id = readRequiredString(input, "id", { maxLength: 100 });
  const initialBatch = await deletionBatch(access.organization.id, type, id);
  if (!validPurgeConfirmation(input.confirmation, initialBatch.rootName)) {
    throw new SecretsError(
      "confirmation must exactly match PURGE followed by the deleted item name",
      { code: "CONFIRMATION_REQUIRED", status: 400, field: "confirmation" },
    );
  }
  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const [batch] = await tx
      .select()
      .from(secretDeletionBatches)
      .where(
        and(
          eq(secretDeletionBatches.id, initialBatch.id),
          eq(secretDeletionBatches.organizationId, access.organization.id),
          eq(secretDeletionBatches.rootType, type),
          eq(secretDeletionBatches.status, "active"),
        ),
      )
      .for("update");
    if (!batch) {
      throw new SecretsError("Deleted item is no longer purgeable", {
        code: "CONFLICT",
        status: 409,
      });
    }
    if (!validPurgeConfirmation(input.confirmation, batch.rootName)) {
      throw new SecretsError(
        "Deleted item name changed; purge confirmation is no longer valid",
        { code: "CONFIRMATION_REQUIRED", status: 409, field: "confirmation" },
      );
    }
    const now = new Date();
    if (type === "project") {
      const [project] = await tx
        .select({ id: secretProjects.id })
        .from(secretProjects)
        .where(
          and(
            eq(secretProjects.id, batch.rootId),
            eq(secretProjects.organizationId, access.organization.id),
          ),
        )
        .limit(1)
        .for("update");
      if (!project) {
        throw new SecretsError("Project was already purged", {
          code: "NOT_FOUND",
          status: 404,
        });
      }
      const projectEnvironments = await tx
        .select({
          id: secretEnvironments.id,
          isProduction: secretEnvironments.isProduction,
        })
        .from(secretEnvironments)
        .where(eq(secretEnvironments.deletionBatchId, batch.id))
        .for("update");
      requireProductionConfirmation(
        { isProduction: projectEnvironments.some((row) => row.isProduction) },
        input.confirmProduction,
      );
      const [dependentBatch] = await tx
        .select({ id: secretDeletionBatches.id })
        .from(secretDeletionBatches)
        .where(
          and(
            eq(secretDeletionBatches.organizationId, access.organization.id),
            eq(secretDeletionBatches.projectId, batch.rootId),
            eq(secretDeletionBatches.status, "active"),
            ne(secretDeletionBatches.id, batch.id),
          ),
        )
        .limit(1);
      if (dependentBatch) {
        throw new SecretsError(
          "Purge or restore nested Trash items before purging this project",
          { code: "DEPENDENT_TRASH_BATCHES", status: 409 },
        );
      }
      const projectEnvironmentIds = projectEnvironments.map((row) => row.id);
      const tokenTarget = projectEnvironmentIds.length
        ? or(
            eq(machineTokens.projectId, batch.rootId),
            inArray(machineTokens.environmentId, projectEnvironmentIds),
          )
        : eq(machineTokens.projectId, batch.rootId);
      await tx
        .update(machineTokens)
        .set({
          revokedAt: sql`coalesce(${machineTokens.revokedAt}, ${now})`,
          revokedById: sql`case when ${machineTokens.revokedAt} is null then ${access.actor.userId} else ${machineTokens.revokedById} end`,
          projectId: null,
          environmentId: null,
        })
        .where(
          and(
            eq(machineTokens.organizationId, access.organization.id),
            tokenTarget,
          ),
        );
      await tx.delete(secretProjects).where(eq(secretProjects.id, batch.rootId));
    } else if (type === "environment") {
      const [environment] = await tx
        .select({
          id: secretEnvironments.id,
          isProduction: secretEnvironments.isProduction,
        })
        .from(secretEnvironments)
        .where(
          and(
            eq(secretEnvironments.id, batch.rootId),
            eq(secretEnvironments.organizationId, access.organization.id),
          ),
        )
        .limit(1)
        .for("update");
      if (!environment) {
        throw new SecretsError("Environment was already purged", {
          code: "NOT_FOUND",
          status: 404,
        });
      }
      requireProductionConfirmation(environment, input.confirmProduction);
      const [dependentBatch] = await tx
        .select({ id: secretDeletionBatches.id })
        .from(secretDeletionBatches)
        .where(
          and(
            eq(secretDeletionBatches.organizationId, access.organization.id),
            eq(secretDeletionBatches.environmentId, batch.rootId),
            eq(secretDeletionBatches.status, "active"),
            ne(secretDeletionBatches.id, batch.id),
          ),
        )
        .limit(1);
      if (dependentBatch) {
        throw new SecretsError(
          "Purge or restore nested Trash items before purging this environment",
          { code: "DEPENDENT_TRASH_BATCHES", status: 409 },
        );
      }
      await tx
        .update(machineTokens)
        .set({
          revokedAt: sql`coalesce(${machineTokens.revokedAt}, ${now})`,
          revokedById: sql`case when ${machineTokens.revokedAt} is null then ${access.actor.userId} else ${machineTokens.revokedById} end`,
          projectId: null,
          environmentId: null,
        })
        .where(
          and(
            eq(machineTokens.organizationId, access.organization.id),
            eq(machineTokens.environmentId, batch.rootId),
          ),
        );
      await tx
        .delete(secretEnvironments)
        .where(eq(secretEnvironments.id, batch.rootId));
    } else {
      const [entry] = await tx
        .select({
          id: secretEntries.id,
          environmentId: secretEntries.environmentId,
        })
        .from(secretEntries)
        .where(
          and(
            eq(secretEntries.id, batch.rootId),
            eq(secretEntries.organizationId, access.organization.id),
          ),
        )
        .limit(1)
        .for("update");
      if (!entry) {
        throw new SecretsError("Secret was already purged", {
          code: "NOT_FOUND",
          status: 404,
        });
      }
      const [parentEnvironment] = await tx
        .select({ isProduction: secretEnvironments.isProduction })
        .from(secretEnvironments)
        .where(
          and(
            eq(secretEnvironments.id, entry.environmentId),
            eq(secretEnvironments.organizationId, access.organization.id),
          ),
        )
        .limit(1)
        .for("update");
      if (!parentEnvironment) {
        throw new SecretsError("Secret environment was already purged", {
          code: "CONFLICT",
          status: 409,
        });
      }
      requireProductionConfirmation(
        parentEnvironment,
        input.confirmProduction,
      );
      await tx.delete(secretEntries).where(eq(secretEntries.id, entry.id));
    }
    await tx
      .update(secretDeletionBatches)
      .set({
        status: "purged",
        purgedAt: now,
        purgedByType: access.actor.type,
        purgedById: access.actor.id,
      })
      .where(eq(secretDeletionBatches.id, batch.id));
    await auditEvent(tx, access, {
      action: `${type}.purged`,
      targetType: type,
      targetId: batch.rootId,
      targetName: batch.rootName,
      projectId: batch.projectId,
      environmentId: batch.environmentId,
      entryId: type === "secret" ? batch.rootId : null,
      metadata: { batchId: batch.id, itemCount: batch.itemCount },
    });
    return { purged: true, type, id: batch.rootId, batchId: batch.id };
  });
}

function serializeMachineToken(row: typeof machineTokens.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    projectId: row.projectId,
    environmentId: row.environmentId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

export async function listMachineTokens(access: SecretsAccess) {
  requireSessionAdmin(access);
  const rows = await db
    .select()
    .from(machineTokens)
    .where(eq(machineTokens.organizationId, access.organization.id))
    .orderBy(desc(machineTokens.createdAt));
  return rows.map(serializeMachineToken);
}

export async function createSecretsMachineToken(
  access: SecretsAccess,
  input: Record<string, unknown>,
) {
  requireSessionAdmin(access);
  const name = readRequiredString(input, "name", { maxLength: 100 });
  const scopes = normalizeMachineTokenScopes(input.scopes);
  if (!scopes) {
    throw new SecretsError("scopes contains an unsupported machine-token scope", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "scopes",
    });
  }
  const expiresAt = machineTokenExpiry(input.expiresIn);
  if (expiresAt === undefined) {
    throw new SecretsError("expiresIn must be 30d, 90d, 1y, or never", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "expiresIn",
    });
  }
  const projectSlug =
    input.projectSlug === undefined
      ? undefined
      : validateSlug(
          readRequiredString(input, "projectSlug", { maxLength: 63 }),
          "projectSlug",
        );
  const environmentSlug =
    input.environmentSlug === undefined
      ? undefined
      : validateSlug(
          readRequiredString(input, "environmentSlug", { maxLength: 63 }),
          "environmentSlug",
        );
  if (environmentSlug && !projectSlug) {
    throw new SecretsError("projectSlug is required with environmentSlug", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "projectSlug",
    });
  }
  const generated = createMachineToken();
  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    let projectId: string | null = null;
    let environmentId: string | null = null;
    if (projectSlug) {
      const [project] = await tx
        .select({ id: secretProjects.id })
        .from(secretProjects)
        .where(
          and(
            eq(secretProjects.organizationId, access.organization.id),
            eq(secretProjects.slug, projectSlug),
            isNull(secretProjects.deletedAt),
          ),
        )
        .for("share");
      if (!project) {
        throw new SecretsError("Project not found", {
          code: "NOT_FOUND",
          status: 404,
          field: "projectSlug",
        });
      }
      projectId = project.id;
      if (environmentSlug) {
        const [environment] = await tx
          .select({ id: secretEnvironments.id })
          .from(secretEnvironments)
          .where(
            and(
              eq(secretEnvironments.organizationId, access.organization.id),
              eq(secretEnvironments.projectId, project.id),
              eq(secretEnvironments.slug, environmentSlug),
              isNull(secretEnvironments.deletedAt),
            ),
          )
          .for("share");
        if (!environment) {
          throw new SecretsError("Environment not found", {
            code: "NOT_FOUND",
            status: 404,
            field: "environmentSlug",
          });
        }
        environmentId = environment.id;
      }
    }
    const [created] = await tx
      .insert(machineTokens)
      .values({
        id: crypto.randomUUID(),
        name,
        organizationId: access.organization.id,
        projectId,
        environmentId,
        tokenHash: generated.tokenHash,
        prefix: generated.prefix,
        scopes,
        createdById: access.actor.userId,
        expiresAt,
      })
      .returning();
    await auditEvent(tx, access, {
      action: "machine_token.created",
      targetType: "machine_token",
      targetId: created.id,
      targetName: created.name,
      projectId,
      environmentId,
      metadata: { prefix: created.prefix, scopes: created.scopes, expiresAt },
    });
    return { token: generated.token, machineToken: serializeMachineToken(created) };
  });
}

export async function revokeMachineToken(
  access: SecretsAccess,
  tokenId: string,
) {
  requireSessionAdmin(access);
  return db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(machineTokens)
      .set({ revokedAt: new Date(), revokedById: access.actor.userId })
      .where(
        and(
          eq(machineTokens.id, tokenId),
          eq(machineTokens.organizationId, access.organization.id),
          isNull(machineTokens.revokedAt),
        ),
      )
      .returning();
    if (!revoked) {
      throw new SecretsError("Machine token not found or already revoked", {
        code: "NOT_FOUND",
        status: 404,
      });
    }
    await auditEvent(tx, access, {
      action: "machine_token.revoked",
      targetType: "machine_token",
      targetId: revoked.id,
      targetName: revoked.name,
      projectId: revoked.projectId,
      environmentId: revoked.environmentId,
      metadata: { prefix: revoked.prefix },
    });
    return { revoked: true, machineToken: serializeMachineToken(revoked) };
  });
}

export async function rewrapOrganizationKeys(
  access: SecretsAccess,
) {
  requireSessionAdmin(access);
  const keyring = readSecretsKeyring();
  const rows = await db
    .select()
    .from(secretOrganizationKeys)
    .where(eq(secretOrganizationKeys.organizationId, access.organization.id))
    .orderBy(asc(secretOrganizationKeys.version));
  let rewrapped = 0;
  let alreadyActive = 0;
  for (const row of rows) {
    if (row.wrappingKeyId === keyring.active.id) {
      alreadyActive += 1;
      continue;
    }
    const organizationKey = unwrapOrganizationKey(
      row.organizationId,
      {
        ciphertext: row.wrappedKey,
        iv: row.iv,
        authTag: row.authTag,
        algorithm: "AES-256-GCM",
        wrappingKeyId: row.wrappingKeyId,
        organizationKeyVersion: row.version,
      },
      keyring,
    );
    try {
      const wrapped = wrapOrganizationKey(
        row.organizationId,
        row.version,
        organizationKey,
        keyring.active,
      );
      const changed = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(secretOrganizationKeys)
          .set({
            wrappedKey: wrapped.ciphertext,
            iv: wrapped.iv,
            authTag: wrapped.authTag,
            wrappingKeyId: wrapped.wrappingKeyId,
            rewrappedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(secretOrganizationKeys.id, row.id),
              eq(secretOrganizationKeys.wrappingKeyId, row.wrappingKeyId),
            ),
          )
          .returning({ id: secretOrganizationKeys.id });
        if (updated) {
          await auditEvent(tx, access, {
            action: "organization_key.rewrapped",
            targetType: "organization_key",
            targetId: row.id,
            targetName: `v${row.version}`,
            metadata: {
              version: row.version,
              previousWrappingKeyId: row.wrappingKeyId,
              wrappingKeyId: keyring.active.id,
            },
          });
        }
        return Boolean(updated);
      });
      if (changed) rewrapped += 1;
      else alreadyActive += 1;
    } finally {
      organizationKey.fill(0);
    }
  }
  return { scanned: rows.length, rewrapped, alreadyActive };
}

export async function rotateOrganizationDataKey(
  access: SecretsAccess,
  input: Record<string, unknown>,
) {
  requireSessionAdmin(access);
  if (input.confirmation !== "ROTATE") {
    throw new SecretsError("confirmation must exactly match ROTATE", {
      code: "CONFIRMATION_REQUIRED",
      status: 400,
      field: "confirmation",
    });
  }
  const keyring = readSecretsKeyring();
  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const rows = await tx
      .select()
      .from(secretOrganizationKeys)
      .where(eq(secretOrganizationKeys.organizationId, access.organization.id))
      .orderBy(asc(secretOrganizationKeys.version))
      .for("update");
    const activeRows = rows.filter((row) => row.status === "active");
    if (activeRows.length > 1) {
      throw new SecretsError("Organization has multiple active data keys", {
        code: "SECRETS_INTEGRITY_ERROR",
        status: 500,
      });
    }
    const version = nextOrganizationKeyVersion(
      rows.map((row) => row.version),
    );
    const organizationKey = createOrganizationKey();
    try {
      const wrapped = wrapOrganizationKey(
        access.organization.id,
        version,
        organizationKey,
        keyring.active,
      );
      if (activeRows[0]) {
        await tx
          .update(secretOrganizationKeys)
          .set({ status: "retired", updatedAt: new Date() })
          .where(eq(secretOrganizationKeys.id, activeRows[0].id));
      }
      const [created] = await tx
        .insert(secretOrganizationKeys)
        .values({
          id: crypto.randomUUID(),
          organizationId: access.organization.id,
          version,
          status: "active",
          wrappedKey: wrapped.ciphertext,
          iv: wrapped.iv,
          authTag: wrapped.authTag,
          wrappingKeyId: wrapped.wrappingKeyId,
          algorithm: wrapped.algorithm,
        })
        .returning();
      await auditEvent(tx, access, {
        action: "organization_key.rotated",
        targetType: "organization_key",
        targetId: created.id,
        targetName: `v${created.version}`,
        metadata: {
          previousVersion: activeRows[0]?.version ?? null,
          version: created.version,
          wrappingKeyId: created.wrappingKeyId,
        },
      });
      return {
        rotated: true,
        previousVersion: activeRows[0]?.version ?? null,
        version: created.version,
        createdAt: created.createdAt,
      };
    } finally {
      organizationKey.fill(0);
    }
  });
}

export async function listSecretTargets(accesses: SecretsAccess[]) {
  const organizations = [];
  for (const access of accesses) {
    const projectConditions = [
      eq(secretProjects.organizationId, access.organization.id),
      isNull(secretProjects.deletedAt),
    ];
    if (access.actor.type === "machine" && access.actor.projectId) {
      projectConditions.push(eq(secretProjects.id, access.actor.projectId));
    }
    const projects = await db
      .select()
      .from(secretProjects)
      .where(and(...projectConditions))
      .orderBy(asc(secretProjects.name));
    const environments = projects.length
      ? await db
          .select()
          .from(secretEnvironments)
          .where(
            and(
              inArray(
                secretEnvironments.projectId,
                projects.map((project) => project.id),
              ),
              isNull(secretEnvironments.deletedAt),
              ...(access.actor.type === "machine" && access.actor.environmentId
                ? [eq(secretEnvironments.id, access.actor.environmentId)]
                : []),
            ),
          )
          .orderBy(asc(secretEnvironments.name))
      : [];
    organizations.push({
      ...access.organization,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        environments: environments
          .filter((environment) => environment.projectId === project.id)
          .map((environment) => ({
            id: environment.id,
            name: environment.name,
            slug: environment.slug,
            isProduction: environment.isProduction,
          })),
      })),
    });
  }
  return organizations;
}
