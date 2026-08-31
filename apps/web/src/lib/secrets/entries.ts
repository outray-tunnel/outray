import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  secretDeletionBatches,
  secretEntries,
  secretEnvironments,
  secretProjects,
  secretVersions,
} from "../../db/secrets-schema";
import { assertActorScope } from "./access-policy";
import {
  activeOrganizationKey,
  auditEvent,
  lockOrganization,
  lockOrganizationForRead,
  organizationKeyForVersion,
  resolveEnvironment,
  resolveProject,
  transactionKeyForVersion,
} from "./database";
import { decryptSecretValue, encryptSecretValue } from "./crypto";
import type { SecretsAccess } from "./types";
import { serializeSecretMetadata, SecretsError } from "./types";
import {
  optionalNonNegativeInteger,
  parseEnvText,
  readExpectedEnvironmentRevisions,
  readOptionalString,
  requireProductionConfirmation,
  serializeEnvText,
  validateSecretImportSize,
  validateSecretKey,
  validateSecretValue,
  validateSlug,
} from "./validation";

type EntryRow = typeof secretEntries.$inferSelect;
type EnvironmentRow = typeof secretEnvironments.$inferSelect;
type VersionRow = typeof secretVersions.$inferSelect;

function positiveInteger(value: unknown, field: string): number {
  const parsed = optionalNonNegativeInteger(value, field);
  if (parsed === undefined || parsed < 1) {
    throw new SecretsError(`${field} must be a positive integer`, {
      code: "VALIDATION_ERROR",
      status: 400,
      field,
    });
  }
  return parsed;
}

function revisionConflict(currentRevision: number) {
  return new SecretsError("Environment revision has changed", {
    code: "REVISION_CONFLICT",
    status: 409,
    details: { currentRevision },
  });
}

export function assertExpectedSecretVersions(
  expected: Record<string, number | null> | undefined,
  current: ReadonlyMap<string, number>,
) {
  if (!expected) return;
  for (const [key, expectedVersion] of Object.entries(expected)) {
    const currentVersion = current.get(key) ?? null;
    if (expectedVersion !== currentVersion) {
      throw new SecretsError(`Secret version has changed for ${key}`, {
        code: "VERSION_CONFLICT",
        status: 409,
        details: { key, currentVersion },
      });
    }
  }
}

async function lockEnvironment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  environmentId: string,
  expectedRevision?: number,
) {
  const [environment] = await tx
    .select()
    .from(secretEnvironments)
    .where(
      and(
        eq(secretEnvironments.id, environmentId),
        isNull(secretEnvironments.deletedAt),
      ),
    )
    .for("update");
  if (!environment) {
    throw new SecretsError("Environment not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  if (
    expectedRevision !== undefined &&
    environment.revision !== expectedRevision
  ) {
    throw revisionConflict(environment.revision);
  }
  return environment;
}

async function bumpEnvironmentRevision(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  environmentId: string,
) {
  const [updated] = await tx
    .update(secretEnvironments)
    .set({
      revision: sql`${secretEnvironments.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(secretEnvironments.id, environmentId))
    .returning({
      revision: secretEnvironments.revision,
      updatedAt: secretEnvironments.updatedAt,
    });
  if (!updated) {
    throw new SecretsError("Environment not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  return updated;
}

async function resolveContext(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
) {
  const project = await resolveProject(access, projectSlug);
  const environment = await resolveEnvironment(
    access,
    project,
    environmentSlug,
  );
  return { project, environment };
}

async function resolveEntry(
  access: SecretsAccess,
  environment: EnvironmentRow,
  secretId: string,
) {
  const [entry] = await db
    .select()
    .from(secretEntries)
    .where(
      and(
        eq(secretEntries.id, secretId),
        eq(secretEntries.organizationId, access.organization.id),
        eq(secretEntries.environmentId, environment.id),
        isNull(secretEntries.deletedAt),
      ),
    )
    .limit(1);
  if (!entry) {
    throw new SecretsError("Secret not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  assertActorScope(access.actor, {
    projectId: entry.projectId,
    environmentId: entry.environmentId,
  });
  return entry;
}

function encryptedVersionValues(
  access: SecretsAccess,
  entry: Pick<EntryRow, "id" | "projectId" | "environmentId" | "key">,
  version: number,
  organizationKey: { key: Buffer; version: number },
  value: string,
  source: "create" | "write" | "import" | "rollback",
  sourceVersion?: number,
) {
  const encrypted = encryptSecretValue(organizationKey.key, {
    organizationId: access.organization.id,
    projectId: entry.projectId,
    environmentId: entry.environmentId,
    entryId: entry.id,
    version,
    keySnapshot: entry.key,
    organizationKeyVersion: organizationKey.version,
    value,
  });
  return {
    id: crypto.randomUUID(),
    organizationId: access.organization.id,
    entryId: entry.id,
    projectId: entry.projectId,
    environmentId: entry.environmentId,
    keySnapshot: entry.key,
    organizationKeyVersion: organizationKey.version,
    version,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    algorithm: encrypted.algorithm,
    valueDigest: encrypted.valueDigest,
    createdByType: access.actor.type,
    createdById: access.actor.id,
    source,
    sourceVersion: sourceVersion ?? null,
  } as const;
}

function decryptVersion(organizationKey: Buffer, version: VersionRow) {
  return decryptSecretValue(organizationKey, {
    organizationId: version.organizationId,
    projectId: version.projectId,
    environmentId: version.environmentId,
    entryId: version.entryId,
    version: version.version,
    keySnapshot: version.keySnapshot,
    organizationKeyVersion: version.organizationKeyVersion,
    ciphertext: version.ciphertext,
    iv: version.iv,
    authTag: version.authTag,
  });
}

export async function listSecrets(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
) {
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const rows = await db
    .select()
    .from(secretEntries)
    .where(
      and(
        eq(secretEntries.organizationId, access.organization.id),
        eq(secretEntries.projectId, project.id),
        eq(secretEntries.environmentId, environment.id),
        isNull(secretEntries.deletedAt),
      ),
    )
    .orderBy(asc(secretEntries.key));
  return {
    project: { id: project.id, name: project.name, slug: project.slug },
    environment: {
      id: environment.id,
      name: environment.name,
      slug: environment.slug,
      isProduction: environment.isProduction,
      revision: environment.revision,
    },
    secrets: rows.map(serializeSecretMetadata),
  };
}

function requestedEnvironmentSlugs(input: Record<string, unknown>, base: string) {
  if (input.environmentSlugs === undefined) return [base];
  if (
    !Array.isArray(input.environmentSlugs) ||
    input.environmentSlugs.length > 20 ||
    input.environmentSlugs.some((slug) => typeof slug !== "string")
  ) {
    throw new SecretsError(
      "environmentSlugs must be an array of at most 20 slugs",
      {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "environmentSlugs",
      },
    );
  }
  return Array.from(
    new Set([
      base,
      ...(input.environmentSlugs as string[]).map((slug) =>
        validateSlug(slug, "environmentSlugs"),
      ),
    ]),
  );
}

export async function createSecret(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  input: Record<string, unknown>,
) {
  const { project, environment: baseEnvironment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const key = validateSecretKey(input.key);
  const value = validateSecretValue(input.value);
  const description = readOptionalString(input, "description", 500) ?? null;
  const slugs = requestedEnvironmentSlugs(input, baseEnvironment.slug);
  const legacyExpectedRevision = optionalNonNegativeInteger(
    input.expectedRevision,
    "expectedRevision",
  );
  const expectedRevisions =
    input.expectedRevisions === undefined
      ? (() => {
          if (slugs.length > 1) {
            throw new SecretsError(
              "expectedRevisions is required when creating a secret in multiple environments",
              {
                code: "VALIDATION_ERROR",
                status: 400,
                field: "expectedRevisions",
                details: { requiredSlugs: [...slugs].sort() },
              },
            );
          }
          if (legacyExpectedRevision === undefined) {
            throw new SecretsError("expectedRevision is required", {
              code: "VALIDATION_ERROR",
              status: 400,
              field: "expectedRevision",
            });
          }
          return { [baseEnvironment.slug]: legacyExpectedRevision };
        })()
      : readExpectedEnvironmentRevisions(input.expectedRevisions, slugs);
  if (
    legacyExpectedRevision !== undefined &&
    legacyExpectedRevision !== expectedRevisions[baseEnvironment.slug]
  ) {
    throw new SecretsError(
      "expectedRevision must match expectedRevisions for the base environment",
      {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "expectedRevision",
      },
    );
  }
  const environments = await Promise.all(
    slugs.map((slug) => resolveEnvironment(access, project, slug)),
  );
  for (const environment of environments) {
    requireProductionConfirmation(environment, input.confirmProduction);
  }

  return db.transaction(async (tx) => {
    const organizationKey = await activeOrganizationKey(
      tx,
      access.organization.id,
    );
    try {
      for (const environment of [...environments].sort((left, right) =>
        left.id.localeCompare(right.id),
      )) {
        const lockedEnvironment = await lockEnvironment(
          tx,
          environment.id,
          expectedRevisions[environment.slug],
        );
        requireProductionConfirmation(
          lockedEnvironment,
          input.confirmProduction,
        );
      }

      const duplicates = await tx
        .select({ environmentId: secretEntries.environmentId })
        .from(secretEntries)
        .where(
          and(
            inArray(
              secretEntries.environmentId,
              environments.map((item) => item.id),
            ),
            eq(secretEntries.key, key),
            isNull(secretEntries.deletedAt),
          ),
        );
      if (duplicates.length) {
        throw new SecretsError("Secret key already exists", {
          code: "CONFLICT",
          status: 409,
          field: "key",
          details: {
            environmentSlugs: environments
              .filter((item) =>
                duplicates.some(
                  (duplicate) => duplicate.environmentId === item.id,
                ),
              )
              .map((item) => item.slug),
          },
        });
      }

      const created: EntryRow[] = [];
      const revisions: Record<string, number> = {};
      for (const environment of environments) {
        const id = crypto.randomUUID();
        const [entry] = await tx
          .insert(secretEntries)
          .values({
            id,
            organizationId: access.organization.id,
            projectId: project.id,
            environmentId: environment.id,
            key,
            description,
            currentVersion: 1,
            createdById: access.actor.userId,
            updatedById: access.actor.userId,
          })
          .returning();
        await tx
          .insert(secretVersions)
          .values(
            encryptedVersionValues(
              access,
              entry,
              1,
              organizationKey,
              value,
              "create",
            ),
          );
        const revision = await bumpEnvironmentRevision(tx, environment.id);
        revisions[environment.slug] = revision.revision;
        created.push({ ...entry, updatedAt: revision.updatedAt });
        await auditEvent(tx, access, {
          action: "secret.created",
          targetType: "secret",
          targetId: entry.id,
          targetName: entry.key,
          projectId: project.id,
          environmentId: environment.id,
          entryId: entry.id,
          metadata: { version: 1, environmentRevision: revision.revision },
        });
      }
      return {
        secrets: created.map(serializeSecretMetadata),
        revisions,
      };
    } finally {
      organizationKey.key.fill(0);
    }
  });
}

export async function updateSecret(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  secretId: string,
  input: Record<string, unknown>,
) {
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const entry = await resolveEntry(access, environment, secretId);
  requireProductionConfirmation(environment, input.confirmProduction);
  const nextKey = "key" in input ? validateSecretKey(input.key) : entry.key;
  const description = readOptionalString(input, "description", 500);
  const hasValue = "value" in input;
  const value = hasValue ? validateSecretValue(input.value) : undefined;
  if (nextKey === entry.key && description === undefined && !hasValue) {
    throw new SecretsError("No secret changes were supplied", {
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }
  const expectedVersion = positiveInteger(input.expectedVersion, "expectedVersion");
  const expectedRevision = optionalNonNegativeInteger(
    input.expectedRevision,
    "expectedRevision",
  );
  if (expectedRevision === undefined) {
    throw new SecretsError("expectedRevision is required", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "expectedRevision",
    });
  }

  return db.transaction(async (tx) => {
    const organizationKey = hasValue
      ? await activeOrganizationKey(tx, access.organization.id)
      : null;
    if (!organizationKey) await lockOrganization(tx, access.organization.id);
    let currentValueKey: Buffer | null = null;
    try {
      const lockedEnvironment = await lockEnvironment(
        tx,
        environment.id,
        expectedRevision,
      );
      requireProductionConfirmation(
        lockedEnvironment,
        input.confirmProduction,
      );
      const [lockedEntry] = await tx
        .select()
        .from(secretEntries)
        .where(
          and(
            eq(secretEntries.id, entry.id),
            isNull(secretEntries.deletedAt),
          ),
        )
        .for("update");
      if (!lockedEntry) {
        throw new SecretsError("Secret not found", {
          code: "NOT_FOUND",
          status: 404,
        });
      }
      if (lockedEntry.currentVersion !== expectedVersion) {
        throw new SecretsError("Secret version has changed", {
          code: "VERSION_CONFLICT",
          status: 409,
          details: { currentVersion: lockedEntry.currentVersion },
        });
      }
      if (nextKey !== lockedEntry.key) {
        const [duplicate] = await tx
          .select({ id: secretEntries.id })
          .from(secretEntries)
          .where(
            and(
              eq(secretEntries.environmentId, environment.id),
              eq(secretEntries.key, nextKey),
              isNull(secretEntries.deletedAt),
            ),
          )
          .limit(1);
        if (duplicate) {
          throw new SecretsError("Secret key already exists", {
            code: "CONFLICT",
            status: 409,
            field: "key",
          });
        }
      }
      let valueChanged = hasValue;
      if (hasValue && value !== undefined) {
        const [currentVersion] = await tx
          .select()
          .from(secretVersions)
          .where(
            and(
              eq(secretVersions.entryId, lockedEntry.id),
              eq(secretVersions.version, lockedEntry.currentVersion),
            ),
          )
          .limit(1);
        if (!currentVersion) {
          throw new SecretsError("Current secret version not found", {
            code: "SECRETS_INTEGRITY_ERROR",
            status: 500,
          });
        }
        if (currentVersion.organizationKeyVersion === organizationKey?.version) {
          currentValueKey = organizationKey.key;
        } else {
          currentValueKey = await transactionKeyForVersion(
            tx,
            access.organization.id,
            currentVersion.organizationKeyVersion,
          );
        }
        valueChanged = decryptVersion(currentValueKey, currentVersion) !== value;
      }
      const descriptionChanged =
        description !== undefined && description !== lockedEntry.description;
      const keyChanged = nextKey !== lockedEntry.key;
      if (!valueChanged && !descriptionChanged && !keyChanged) {
        return {
          secret: serializeSecretMetadata(lockedEntry),
          revision: lockedEnvironment.revision,
          unchanged: true,
        };
      }
      const effectiveVersion = valueChanged
        ? lockedEntry.currentVersion + 1
        : lockedEntry.currentVersion;
      if (valueChanged && organizationKey && value !== undefined) {
        await tx.insert(secretVersions).values(
          encryptedVersionValues(
            access,
            { ...lockedEntry, key: nextKey },
            effectiveVersion,
            organizationKey,
            value,
            "write",
          ),
        );
      }
      const [updated] = await tx
        .update(secretEntries)
        .set({
          key: nextKey,
          ...(description !== undefined ? { description } : {}),
          currentVersion: effectiveVersion,
          updatedById: access.actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(secretEntries.id, lockedEntry.id))
        .returning();
      const revision = await bumpEnvironmentRevision(tx, environment.id);
      await auditEvent(tx, access, {
        action: "secret.updated",
        targetType: "secret",
        targetId: updated.id,
        targetName: updated.key,
        projectId: project.id,
        environmentId: environment.id,
        entryId: updated.id,
        metadata: {
          version: updated.currentVersion,
          environmentRevision: revision.revision,
          renamed: lockedEntry.key !== updated.key,
          valueChanged,
          descriptionChanged,
        },
      });
      return {
        secret: serializeSecretMetadata(updated),
        revision: revision.revision,
      };
    } finally {
      if (currentValueKey && currentValueKey !== organizationKey?.key) {
        currentValueKey.fill(0);
      }
      organizationKey?.key.fill(0);
    }
  });
}

export async function deleteSecret(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  secretId: string,
  input: Record<string, unknown>,
) {
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const entry = await resolveEntry(access, environment, secretId);
  requireProductionConfirmation(environment, input.confirmProduction);
  const expectedRevision = optionalNonNegativeInteger(
    input.expectedRevision,
    "expectedRevision",
  );
  if (expectedRevision === undefined) {
    throw new SecretsError("expectedRevision is required", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "expectedRevision",
    });
  }
  if (input.confirmation !== entry.key) {
    throw new SecretsError("confirmation must exactly match the secret key", {
      code: "CONFIRMATION_REQUIRED",
      status: 400,
      field: "confirmation",
    });
  }
  const now = new Date();
  const batchId = crypto.randomUUID();
  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const lockedEnvironment = await lockEnvironment(
      tx,
      environment.id,
      expectedRevision,
    );
    requireProductionConfirmation(
      lockedEnvironment,
      input.confirmProduction,
    );
    const [lockedEntry] = await tx
      .select()
      .from(secretEntries)
      .where(
        and(
          eq(secretEntries.id, entry.id),
          isNull(secretEntries.deletedAt),
        ),
      )
      .for("update");
    if (!lockedEntry) {
      throw new SecretsError("Secret not found", {
        code: "NOT_FOUND",
        status: 404,
      });
    }
    await tx.insert(secretDeletionBatches).values({
      id: batchId,
      organizationId: access.organization.id,
      rootType: "secret",
      rootId: lockedEntry.id,
      rootName: lockedEntry.key,
      projectId: project.id,
      environmentId: environment.id,
      itemCount: 1,
      metadata: {
        projectSlug: project.slug,
        environmentSlug: environment.slug,
        version: lockedEntry.currentVersion,
      },
      deletedByType: access.actor.type,
      deletedById: access.actor.id,
      deletedAt: now,
      expiresAt: null,
    });
    await tx
      .update(secretEntries)
      .set({ deletedAt: now, deletionBatchId: batchId, updatedAt: now })
      .where(eq(secretEntries.id, lockedEntry.id));
    const revision = await bumpEnvironmentRevision(tx, environment.id);
    await auditEvent(tx, access, {
      action: "secret.deleted",
      targetType: "secret",
      targetId: lockedEntry.id,
      targetName: lockedEntry.key,
      projectId: project.id,
      environmentId: environment.id,
      entryId: lockedEntry.id,
      metadata: { batchId, environmentRevision: revision.revision },
    });
    return {
      deleted: true,
      revision: revision.revision,
      batch: { id: batchId, type: "secret", itemCount: 1 },
    };
  });
}

export async function revealSecret(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  secretId: string,
  input: Record<string, unknown>,
) {
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const entry = await resolveEntry(access, environment, secretId);
  const intent = input.intent;
  if (intent !== "reveal" && intent !== "copy") {
    throw new SecretsError("intent must be reveal or copy", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "intent",
    });
  }
  const requestedVersion =
    input.version === undefined
      ? undefined
      : positiveInteger(input.version, "version");
  return db.transaction(async (tx) => {
    await lockOrganizationForRead(tx, access.organization.id);
    const [lockedProject] = await tx
      .select({ id: secretProjects.id })
      .from(secretProjects)
      .where(
        and(
          eq(secretProjects.id, project.id),
          isNull(secretProjects.deletedAt),
        ),
      )
      .for("share");
    const [lockedEnvironment] = await tx
      .select({ id: secretEnvironments.id })
      .from(secretEnvironments)
      .where(
        and(
          eq(secretEnvironments.id, environment.id),
          isNull(secretEnvironments.deletedAt),
        ),
      )
      .for("share");
    const [lockedEntry] = await tx
      .select()
      .from(secretEntries)
      .where(
        and(
          eq(secretEntries.id, entry.id),
          isNull(secretEntries.deletedAt),
        ),
      )
      .for("share");
    if (!lockedProject || !lockedEnvironment || !lockedEntry) {
      throw new SecretsError("Secret is no longer available", {
        code: "NOT_FOUND",
        status: 404,
      });
    }
    const versionNumber = requestedVersion ?? lockedEntry.currentVersion;
    const [version] = await tx
      .select()
      .from(secretVersions)
      .where(
        and(
          eq(secretVersions.entryId, lockedEntry.id),
          eq(secretVersions.version, versionNumber),
        ),
      )
      .limit(1);
    if (!version) {
      throw new SecretsError("Secret version not found", {
        code: "NOT_FOUND",
        status: 404,
      });
    }
    const organizationKey = await transactionKeyForVersion(
      tx,
      access.organization.id,
      version.organizationKeyVersion,
    );
    let value: string;
    try {
      value = decryptVersion(organizationKey, version);
    } finally {
      organizationKey.fill(0);
    }
    await auditEvent(tx, access, {
      action: intent === "copy" ? "secret.copied" : "secret.revealed",
      targetType: "secret",
      targetId: entry.id,
      targetName: lockedEntry.key,
      projectId: project.id,
      environmentId: environment.id,
      entryId: lockedEntry.id,
      metadata: {
        version: version.version,
        current: version.version === lockedEntry.currentVersion,
      },
    });
    return {
      secret: {
        ...serializeSecretMetadata(lockedEntry),
        version: version.version,
        value,
      },
    };
  });
}

export async function listSecretVersions(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  secretId: string,
) {
  const { environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const entry = await resolveEntry(access, environment, secretId);
  const rows = await db
    .select({
      id: secretVersions.id,
      version: secretVersions.version,
      key: secretVersions.keySnapshot,
      source: secretVersions.source,
      sourceVersion: secretVersions.sourceVersion,
      createdByType: secretVersions.createdByType,
      createdById: secretVersions.createdById,
      createdAt: secretVersions.createdAt,
    })
    .from(secretVersions)
    .where(eq(secretVersions.entryId, entry.id))
    .orderBy(desc(secretVersions.version));
  return {
    secret: serializeSecretMetadata(entry),
    versions: rows.map((row) => ({
      ...row,
      isCurrent: row.version === entry.currentVersion,
    })),
  };
}

export async function rollbackSecret(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  secretId: string,
  input: Record<string, unknown>,
) {
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const entry = await resolveEntry(access, environment, secretId);
  requireProductionConfirmation(environment, input.confirmProduction);
  const sourceVersion = positiveInteger(input.version, "version");
  const expectedVersion = positiveInteger(input.expectedVersion, "expectedVersion");
  const expectedRevision = optionalNonNegativeInteger(
    input.expectedRevision,
    "expectedRevision",
  );
  if (expectedRevision === undefined) {
    throw new SecretsError("expectedRevision is required", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "expectedRevision",
    });
  }

  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const unwrapped = new Map<number, Buffer>();
    const keysToWipe = new Set<Buffer>();
    try {
      const lockedEnvironment = await lockEnvironment(
        tx,
        environment.id,
        expectedRevision,
      );
      requireProductionConfirmation(
        lockedEnvironment,
        input.confirmProduction,
      );
      const [lockedEntry] = await tx
        .select()
        .from(secretEntries)
        .where(
          and(
            eq(secretEntries.id, entry.id),
            isNull(secretEntries.deletedAt),
          ),
        )
        .for("update");
      if (!lockedEntry) {
        throw new SecretsError("Secret not found", {
          code: "NOT_FOUND",
          status: 404,
        });
      }
      if (lockedEntry.currentVersion !== expectedVersion) {
        throw new SecretsError("Secret version has changed", {
          code: "VERSION_CONFLICT",
          status: 409,
          details: { currentVersion: lockedEntry.currentVersion },
        });
      }
      const [source] = await tx
        .select()
        .from(secretVersions)
        .where(
          and(
            eq(secretVersions.entryId, lockedEntry.id),
            eq(secretVersions.version, sourceVersion),
          ),
        )
        .limit(1);
      if (!source) {
        throw new SecretsError("Secret version not found", {
          code: "NOT_FOUND",
          status: 404,
        });
      }
      if (source.version === lockedEntry.currentVersion) {
        return {
          secret: serializeSecretMetadata(lockedEntry),
          revision: lockedEnvironment.revision,
          unchanged: true,
        };
      }
      const [current] = await tx
        .select()
        .from(secretVersions)
        .where(
          and(
            eq(secretVersions.entryId, lockedEntry.id),
            eq(secretVersions.version, lockedEntry.currentVersion),
          ),
        )
        .limit(1);
      if (!current) {
        throw new SecretsError("Current secret version not found", {
          code: "SECRETS_INTEGRITY_ERROR",
          status: 500,
        });
      }
      const keyForVersion = async (organizationKeyVersion: number) => {
        let key = unwrapped.get(organizationKeyVersion);
        if (!key) {
          key = await transactionKeyForVersion(
            tx,
            access.organization.id,
            organizationKeyVersion,
          );
          unwrapped.set(organizationKeyVersion, key);
          keysToWipe.add(key);
        }
        return key;
      };
      const sourceKey = await keyForVersion(source.organizationKeyVersion);
      const currentKey = await keyForVersion(current.organizationKeyVersion);
      const value = decryptVersion(sourceKey, source);
      if (value === decryptVersion(currentKey, current)) {
        return {
          secret: serializeSecretMetadata(lockedEntry),
          revision: lockedEnvironment.revision,
          unchanged: true,
        };
      }
      const activeKey = await activeOrganizationKey(
        tx,
        access.organization.id,
      );
      keysToWipe.add(activeKey.key);
      const nextVersion = lockedEntry.currentVersion + 1;
      await tx.insert(secretVersions).values(
        encryptedVersionValues(
          access,
          lockedEntry,
          nextVersion,
          activeKey,
          value,
          "rollback",
          sourceVersion,
        ),
      );
      const [updated] = await tx
        .update(secretEntries)
        .set({
          currentVersion: nextVersion,
          updatedById: access.actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(secretEntries.id, lockedEntry.id))
        .returning();
      const revision = await bumpEnvironmentRevision(tx, environment.id);
      await auditEvent(tx, access, {
        action: "secret.rolled_back",
        targetType: "secret",
        targetId: entry.id,
        targetName: entry.key,
        projectId: project.id,
        environmentId: environment.id,
        entryId: entry.id,
        metadata: {
          sourceVersion,
          version: nextVersion,
          environmentRevision: revision.revision,
        },
      });
      return {
        secret: serializeSecretMetadata(updated),
        revision: revision.revision,
      };
    } finally {
      for (const key of keysToWipe) key.fill(0);
    }
  });
}

type CurrentVersionRow = { entry: EntryRow; version: VersionRow };

async function currentVersions(environmentId: string): Promise<CurrentVersionRow[]> {
  return db
    .select({ entry: secretEntries, version: secretVersions })
    .from(secretEntries)
    .innerJoin(
      secretVersions,
      and(
        eq(secretVersions.entryId, secretEntries.id),
        eq(secretVersions.version, secretEntries.currentVersion),
      ),
    )
    .where(
      and(
        eq(secretEntries.environmentId, environmentId),
        isNull(secretEntries.deletedAt),
      ),
    );
}

async function decryptCurrentRows(
  organizationId: string,
  rows: CurrentVersionRow[],
) {
  const keys = new Map<number, Buffer>();
  try {
    const values = new Map<string, string>();
    for (const row of rows) {
      let key = keys.get(row.version.organizationKeyVersion);
      if (!key) {
        key = await organizationKeyForVersion(
          organizationId,
          row.version.organizationKeyVersion,
        );
        keys.set(row.version.organizationKeyVersion, key);
      }
      values.set(row.entry.key, decryptVersion(key, row.version));
    }
    return values;
  } finally {
    for (const key of keys.values()) key.fill(0);
  }
}

async function plaintextEnvironmentValues(
  access: SecretsAccess,
  project: { id: string; name: string; slug: string },
  environment: EnvironmentRow,
  options: {
    action: "secrets.exported" | "secrets.runtime_read";
    key?: string;
    confirmProduction?: boolean;
    confirmation?: unknown;
  },
) {
  return db.transaction(async (tx) => {
    await lockOrganizationForRead(tx, access.organization.id);
    const [lockedProject] = await tx
      .select({ id: secretProjects.id })
      .from(secretProjects)
      .where(
        and(
          eq(secretProjects.id, project.id),
          isNull(secretProjects.deletedAt),
        ),
      )
      .for("share");
    const [lockedEnvironment] = await tx
      .select()
      .from(secretEnvironments)
      .where(
        and(
          eq(secretEnvironments.id, environment.id),
          eq(secretEnvironments.projectId, project.id),
          isNull(secretEnvironments.deletedAt),
        ),
      )
      .for("share");
    if (!lockedProject || !lockedEnvironment) {
      throw new SecretsError("Environment is no longer available", {
        code: "NOT_FOUND",
        status: 404,
      });
    }
    requireProductionConfirmation(
      lockedEnvironment,
      options.confirmProduction,
    );
    if (
      options.action === "secrets.exported" &&
      lockedEnvironment.isProduction &&
      options.confirmation !== lockedEnvironment.name
    ) {
      throw new SecretsError(
        "confirmation must exactly match the environment name",
        {
          code: "CONFIRMATION_REQUIRED",
          status: 400,
          field: "confirmation",
        },
      );
    }
    const rows = await tx
      .select({ entry: secretEntries, version: secretVersions })
      .from(secretEntries)
      .innerJoin(
        secretVersions,
        and(
          eq(secretVersions.entryId, secretEntries.id),
          eq(secretVersions.version, secretEntries.currentVersion),
        ),
      )
      .where(
        and(
          eq(secretEntries.environmentId, lockedEnvironment.id),
          isNull(secretEntries.deletedAt),
          ...(options.key ? [eq(secretEntries.key, options.key)] : []),
        ),
      )
      .orderBy(asc(secretEntries.key))
      .for("share");
    const unwrapped = new Map<number, Buffer>();
    const values = new Map<string, string>();
    try {
      for (const row of rows) {
        let key = unwrapped.get(row.version.organizationKeyVersion);
        if (!key) {
          key = await transactionKeyForVersion(
            tx,
            access.organization.id,
            row.version.organizationKeyVersion,
          );
          unwrapped.set(row.version.organizationKeyVersion, key);
        }
        values.set(row.entry.key, decryptVersion(key, row.version));
      }
    } finally {
      for (const key of unwrapped.values()) key.fill(0);
    }
    await auditEvent(tx, access, {
      action: options.action,
      targetType: "environment",
      targetId: lockedEnvironment.id,
      targetName: lockedEnvironment.name,
      projectId: project.id,
      environmentId: lockedEnvironment.id,
      metadata: {
        count: rows.length,
        filtered: Boolean(options.key),
        revision: lockedEnvironment.revision,
      },
    });
    return { rows, values, environment: lockedEnvironment };
  });
}

export async function importSecrets(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  input: Record<string, unknown>,
) {
  if (typeof input.envText !== "string") {
    throw new SecretsError("envText must be a string", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "envText",
    });
  }
  const envText = input.envText;
  const parsed = parseEnvText(envText);
  return importSecretValues(
    access,
    projectSlug,
    environmentSlug,
    parsed.values,
    {
      dryRun: input.dryRun === true,
      expectedRevision: optionalNonNegativeInteger(
        input.expectedRevision,
        "expectedRevision",
      ),
      confirmProduction: input.confirmProduction,
      source: "import",
    },
  );
}

export async function importSecretValues(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  values: Record<string, string>,
  options: {
    dryRun?: boolean;
    expectedRevision?: number;
    expectedVersions?: Record<string, number | null>;
    confirmProduction?: unknown;
    source?: "import" | "write";
  } = {},
) {
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  if (!options.dryRun) {
    requireProductionConfirmation(environment, options.confirmProduction);
    if (options.expectedRevision === undefined) {
      throw new SecretsError("expectedRevision is required", {
        code: "VALIDATION_ERROR",
        status: 400,
        field: "expectedRevision",
      });
    }
    if (environment.revision !== options.expectedRevision) {
      throw revisionConflict(environment.revision);
    }
  }
  const normalizedValues: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = validateSecretKey(rawKey);
    if (Object.hasOwn(normalizedValues, key)) {
      throw new SecretsError(`Duplicate environment key: ${key}`, {
        code: "DUPLICATE_ENV_KEYS",
        status: 400,
        details: { duplicates: [key] },
      });
    }
    normalizedValues[key] = validateSecretValue(rawValue);
  }
  validateSecretImportSize(normalizedValues);
  const existingRows = await currentVersions(environment.id);
  const currentValues = await decryptCurrentRows(
    access.organization.id,
    existingRows,
  );
  const existingByKey = new Map(
    existingRows.map((row) => [row.entry.key, row]),
  );
  const createdKeys: string[] = [];
  const updatedKeys: string[] = [];
  const unchangedKeys: string[] = [];
  for (const [key, value] of Object.entries(normalizedValues)) {
    if (!existingByKey.has(key)) createdKeys.push(key);
    else if (currentValues.get(key) === value) unchangedKeys.push(key);
    else updatedKeys.push(key);
  }
  const preview = {
    created: createdKeys.length,
    updated: updatedKeys.length,
    unchanged: unchangedKeys.length,
    keys: {
      created: createdKeys.sort(),
      updated: updatedKeys.sort(),
      unchanged: unchangedKeys.sort(),
    },
  };
  if (options.dryRun) {
    return { ...preview, dryRun: true, revision: environment.revision };
  }
  if (!createdKeys.length && !updatedKeys.length) {
    return db.transaction(async (tx) => {
      await lockOrganization(tx, access.organization.id);
      const lockedEnvironment = await lockEnvironment(
        tx,
        environment.id,
        options.expectedRevision,
      );
      requireProductionConfirmation(
        lockedEnvironment,
        options.confirmProduction,
      );
      const lockedVersions = Object.keys(normalizedValues).length
        ? await tx
            .select({
              key: secretEntries.key,
              version: secretEntries.currentVersion,
            })
            .from(secretEntries)
            .where(
              and(
                eq(secretEntries.environmentId, environment.id),
                inArray(secretEntries.key, Object.keys(normalizedValues)),
                isNull(secretEntries.deletedAt),
              ),
            )
            .for("share")
        : [];
      assertExpectedSecretVersions(
        options.expectedVersions,
        new Map(lockedVersions.map((row) => [row.key, row.version])),
      );
      return {
        ...preview,
        dryRun: false,
        revision: lockedEnvironment.revision,
      };
    });
  }

  return db.transaction(async (tx) => {
    const activeKey = await activeOrganizationKey(tx, access.organization.id);
    try {
      const lockedEnvironment = await lockEnvironment(
        tx,
        environment.id,
        options.expectedRevision,
      );
      requireProductionConfirmation(
        lockedEnvironment,
        options.confirmProduction,
      );
      const lockedRows = await tx
        .select({ entry: secretEntries, version: secretVersions })
        .from(secretEntries)
        .innerJoin(
          secretVersions,
          and(
            eq(secretVersions.entryId, secretEntries.id),
            eq(secretVersions.version, secretEntries.currentVersion),
          ),
        )
        .where(
          and(
            eq(secretEntries.environmentId, environment.id),
            isNull(secretEntries.deletedAt),
          ),
        )
        .for("update");
      const lockedByKey = new Map(
        lockedRows.map((row) => [row.entry.key, row]),
      );
      assertExpectedSecretVersions(
        options.expectedVersions,
        new Map(
          lockedRows.map((row) => [
            row.entry.key,
            row.entry.currentVersion,
          ]),
        ),
      );
      // A concurrent write may have changed the preview. The revision precondition is
      // the canonical guard; without one we intentionally apply last-writer-wins.
      for (const key of createdKeys) {
        if (lockedByKey.has(key)) {
          throw new SecretsError("Secret key already exists", {
            code: "CONFLICT",
            status: 409,
            field: "key",
            details: { key },
          });
        }
        const [entry] = await tx
          .insert(secretEntries)
          .values({
            id: crypto.randomUUID(),
            organizationId: access.organization.id,
            projectId: project.id,
            environmentId: environment.id,
            key,
            currentVersion: 1,
            createdById: access.actor.userId,
            updatedById: access.actor.userId,
          })
          .returning();
        await tx.insert(secretVersions).values(
          encryptedVersionValues(
            access,
            entry,
            1,
            activeKey,
            normalizedValues[key],
            options.source ?? "import",
          ),
        );
      }
      for (const key of updatedKeys) {
        const locked = lockedByKey.get(key);
        if (!locked) {
          throw new SecretsError("Secret changed during import", {
            code: "REVISION_CONFLICT",
            status: 409,
          });
        }
        const nextVersion = locked.entry.currentVersion + 1;
        await tx.insert(secretVersions).values(
          encryptedVersionValues(
            access,
            locked.entry,
            nextVersion,
            activeKey,
            normalizedValues[key],
            options.source ?? "import",
          ),
        );
        await tx
          .update(secretEntries)
          .set({
            currentVersion: nextVersion,
            updatedById: access.actor.userId,
            updatedAt: new Date(),
          })
          .where(eq(secretEntries.id, locked.entry.id));
      }
      const revision = await bumpEnvironmentRevision(tx, environment.id);
      await auditEvent(tx, access, {
        action: "secrets.imported",
        targetType: "environment",
        targetId: environment.id,
        targetName: environment.name,
        projectId: project.id,
        environmentId: environment.id,
        metadata: {
          created: createdKeys.length,
          updated: updatedKeys.length,
          unchanged: unchangedKeys.length,
          environmentRevision: revision.revision,
        },
      });
      return { ...preview, dryRun: false, revision: revision.revision };
    } finally {
      activeKey.key.fill(0);
    }
  });
}

export async function exportSecrets(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  input: Record<string, unknown>,
) {
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const plaintext = await plaintextEnvironmentValues(
    access,
    project,
    environment,
    {
      action: "secrets.exported",
      confirmProduction: input.confirmProduction === true,
      confirmation: input.confirmation,
    },
  );
  const record = Object.fromEntries(plaintext.values);
  return {
    envText: serializeEnvText(record),
    filename: `${project.slug}.${environment.slug}.env`,
    revision: plaintext.environment.revision,
    count: plaintext.rows.length,
  };
}

export async function environmentRevision(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
) {
  const { environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const rows = await db
    .select({ id: secretEntries.id, updatedAt: secretEntries.updatedAt })
    .from(secretEntries)
    .where(
      and(
        eq(secretEntries.environmentId, environment.id),
        isNull(secretEntries.deletedAt),
      ),
    )
    .orderBy(desc(secretEntries.updatedAt));
  return {
    revision: environment.revision,
    count: rows.length,
    updatedAt: rows[0]?.updatedAt ?? environment.updatedAt,
  };
}

export async function cliSecrets(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  includeValues: boolean,
  keyFilter?: string,
  confirmProduction?: boolean,
) {
  const listed = await listSecrets(access, projectSlug, environmentSlug);
  const normalizedFilter = keyFilter ? validateSecretKey(keyFilter) : undefined;
  const selected = normalizedFilter
    ? listed.secrets.filter((secret) => secret.key === normalizedFilter)
    : listed.secrets;
  if (!includeValues) {
    return {
      organization: access.organization.slug,
      project: listed.project.slug,
      environment: listed.environment.slug,
      secrets: selected,
    };
  }
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  const plaintext = await plaintextEnvironmentValues(
    access,
    project,
    environment,
    {
      action: "secrets.runtime_read",
      key: normalizedFilter,
      confirmProduction,
    },
  );
  return {
    organization: access.organization.slug,
    project: project.slug,
    environment: environment.slug,
    secrets: plaintext.rows.map((row) => ({
      ...serializeSecretMetadata(row.entry),
      value: plaintext.values.get(row.entry.key),
    })),
  };
}

export async function deleteCliSecrets(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  keyFilter: string,
  expectedRevision: number,
  expectedVersion: number,
  confirmProduction: boolean,
) {
  const { project, environment } = await resolveContext(
    access,
    projectSlug,
    environmentSlug,
  );
  requireProductionConfirmation(environment, confirmProduction);
  const normalizedFilter = validateSecretKey(keyFilter);
  const now = new Date();
  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const lockedEnvironment = await lockEnvironment(
      tx,
      environment.id,
      expectedRevision,
    );
    requireProductionConfirmation(lockedEnvironment, confirmProduction);
    const rows = await tx
      .select()
      .from(secretEntries)
      .where(
        and(
          eq(secretEntries.environmentId, environment.id),
          isNull(secretEntries.deletedAt),
          eq(secretEntries.key, normalizedFilter),
        ),
      )
      .orderBy(asc(secretEntries.key))
      .for("update");
    if (!rows.length) {
      throw new SecretsError("Secret not found", {
        code: "NOT_FOUND",
        status: 404,
      });
    }
    const [entry] = rows;
    if (entry.currentVersion !== expectedVersion) {
      throw new SecretsError("Secret version has changed", {
        code: "VERSION_CONFLICT",
        status: 409,
        details: { currentVersion: entry.currentVersion },
      });
    }
    const batchId = crypto.randomUUID();
    await tx.insert(secretDeletionBatches).values({
      id: batchId,
      organizationId: access.organization.id,
      rootType: "secret",
      rootId: entry.id,
      rootName: entry.key,
      projectId: project.id,
      environmentId: environment.id,
      itemCount: 1,
      metadata: {
        projectSlug: project.slug,
        environmentSlug: environment.slug,
        version: entry.currentVersion,
        cli: true,
      },
      deletedByType: access.actor.type,
      deletedById: access.actor.id,
      deletedAt: now,
      expiresAt: null,
    });
    await tx
      .update(secretEntries)
      .set({ deletedAt: now, deletionBatchId: batchId, updatedAt: now })
      .where(eq(secretEntries.id, entry.id));
    await auditEvent(tx, access, {
      action: "secret.deleted",
      targetType: "secret",
      targetId: entry.id,
      targetName: entry.key,
      projectId: project.id,
      environmentId: environment.id,
      entryId: entry.id,
      metadata: { batchId, cli: true },
    });
    const revision = await bumpEnvironmentRevision(tx, environment.id);
    return { deleted: 1, revision: revision.revision };
  });
}
