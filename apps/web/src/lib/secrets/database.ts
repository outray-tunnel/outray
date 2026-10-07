import { and, desc, eq, isNull, max } from "drizzle-orm";
import { db } from "../../db";
import { organizations } from "../../db/auth-schema";
import {
  secretAuditEvents,
  secretEntries,
  secretEnvironments,
  secretOrganizationKeys,
  secretProjects,
  secretVersions,
} from "../../db/secrets-schema";
import {
  createOrganizationKey,
  readSecretsKeyring,
  unwrapOrganizationKey,
  wrapOrganizationKey,
} from "./crypto";
import { assertActorScope } from "./access-policy";
import type { SecretsAccess } from "./types";
import { SecretsError } from "./types";

export type SecretsTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type SecretProjectRow = typeof secretProjects.$inferSelect;
export type SecretEnvironmentRow = typeof secretEnvironments.$inferSelect;

export async function resolveProject(
  access: SecretsAccess,
  projectSlug: string,
): Promise<SecretProjectRow> {
  const [project] = await db
    .select()
    .from(secretProjects)
    .where(
      and(
        eq(secretProjects.organizationId, access.organization.id),
        eq(secretProjects.slug, projectSlug),
        isNull(secretProjects.deletedAt),
      ),
    )
    .limit(1);
  if (!project) {
    throw new SecretsError("Vault not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  assertActorScope(access.actor, { projectId: project.id });
  return project;
}

export async function resolveEnvironment(
  access: SecretsAccess,
  project: SecretProjectRow,
  environmentSlug: string,
): Promise<SecretEnvironmentRow> {
  const [environment] = await db
    .select()
    .from(secretEnvironments)
    .where(
      and(
        eq(secretEnvironments.organizationId, access.organization.id),
        eq(secretEnvironments.projectId, project.id),
        eq(secretEnvironments.slug, environmentSlug),
        isNull(secretEnvironments.deletedAt),
      ),
    )
    .limit(1);
  if (!environment) {
    throw new SecretsError("Environment not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  assertActorScope(access.actor, {
    projectId: project.id,
    environmentId: environment.id,
  });
  return environment;
}

/** Resolve reveal metadata in one trip, without changing scope/error order. */
export async function resolveSecretForReveal(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  secretId: string,
) {
  const [context] = await db
    .select({
      project: secretProjects,
      environment: secretEnvironments,
      entry: secretEntries,
    })
    .from(secretProjects)
    .leftJoin(
      secretEnvironments,
      and(
        eq(secretEnvironments.organizationId, access.organization.id),
        eq(secretEnvironments.projectId, secretProjects.id),
        eq(secretEnvironments.slug, environmentSlug),
        isNull(secretEnvironments.deletedAt),
      ),
    )
    .leftJoin(
      secretEntries,
      and(
        eq(secretEntries.id, secretId),
        eq(secretEntries.organizationId, access.organization.id),
        eq(secretEntries.projectId, secretProjects.id),
        eq(secretEntries.environmentId, secretEnvironments.id),
        isNull(secretEntries.deletedAt),
      ),
    )
    .where(
      and(
        eq(secretProjects.organizationId, access.organization.id),
        eq(secretProjects.slug, projectSlug),
        isNull(secretProjects.deletedAt),
      ),
    )
    .limit(1);
  if (!context) {
    throw new SecretsError("Vault not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  const { project, environment, entry } = context;
  assertActorScope(access.actor, { projectId: project.id });
  if (!environment) {
    throw new SecretsError("Environment not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  assertActorScope(access.actor, {
    projectId: project.id,
    environmentId: environment.id,
  });
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
  return { project, environment, entry };
}

export async function lockOrganization(
  tx: SecretsTransaction,
  organizationId: string,
) {
  const [organization] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for("update");
  if (!organization) {
    throw new SecretsError("Organization not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
}

export async function lockOrganizationForRead(
  tx: SecretsTransaction,
  organizationId: string,
) {
  const [organization] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for("share");
  if (!organization) {
    throw new SecretsError("Organization not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
}

function unwrapRow(row: typeof secretOrganizationKeys.$inferSelect) {
  return unwrapOrganizationKey(
    row.organizationId,
    {
      ciphertext: row.wrappedKey,
      iv: row.iv,
      authTag: row.authTag,
      algorithm: "AES-256-GCM",
      wrappingKeyId: row.wrappingKeyId,
      organizationKeyVersion: row.version,
    },
    readSecretsKeyring(),
  );
}

export async function activeOrganizationKey(
  tx: SecretsTransaction,
  organizationId: string,
): Promise<{ key: Buffer; version: number }> {
  await lockOrganization(tx, organizationId);
  const [existing] = await tx
    .select()
    .from(secretOrganizationKeys)
    .where(
      and(
        eq(secretOrganizationKeys.organizationId, organizationId),
        eq(secretOrganizationKeys.status, "active"),
      ),
    )
    .limit(1)
    .for("update");
  if (existing) return { key: unwrapRow(existing), version: existing.version };

  const [{ highestVersion }] = await tx
    .select({ highestVersion: max(secretOrganizationKeys.version) })
    .from(secretOrganizationKeys)
    .where(eq(secretOrganizationKeys.organizationId, organizationId));
  const version = (highestVersion ?? 0) + 1;
  const key = createOrganizationKey();
  try {
    const wrapped = wrapOrganizationKey(
      organizationId,
      version,
      key,
      readSecretsKeyring().active,
    );
    await tx.insert(secretOrganizationKeys).values({
      id: crypto.randomUUID(),
      organizationId,
      version,
      status: "active",
      wrappedKey: wrapped.ciphertext,
      iv: wrapped.iv,
      authTag: wrapped.authTag,
      wrappingKeyId: wrapped.wrappingKeyId,
      algorithm: wrapped.algorithm,
    });
    return { key, version };
  } catch (error) {
    key.fill(0);
    throw error;
  }
}

export async function organizationKeyForVersion(
  organizationId: string,
  version: number,
): Promise<Buffer> {
  const [row] = await db
    .select()
    .from(secretOrganizationKeys)
    .where(
      and(
        eq(secretOrganizationKeys.organizationId, organizationId),
        eq(secretOrganizationKeys.version, version),
      ),
    )
    .limit(1);
  if (!row) {
    throw new SecretsError("Secret organization key version not found", {
      code: "SECRETS_KEY_UNAVAILABLE",
      status: 503,
    });
  }
  return unwrapRow(row);
}

export async function transactionKeyForVersion(
  tx: SecretsTransaction,
  organizationId: string,
  version: number,
): Promise<Buffer> {
  const [row] = await tx
    .select()
    .from(secretOrganizationKeys)
    .where(
      and(
        eq(secretOrganizationKeys.organizationId, organizationId),
        eq(secretOrganizationKeys.version, version),
      ),
    )
    .limit(1);
  if (!row) {
    throw new SecretsError("Secret organization key version not found", {
      code: "SECRETS_KEY_UNAVAILABLE",
      status: 503,
    });
  }
  return unwrapRow(row);
}

/** Call only after the reveal's organization and resource locks are held. */
export async function transactionSecretVersionForReveal(
  tx: SecretsTransaction,
  organizationId: string,
  entryId: string,
  versionNumber: number,
) {
  const [result] = await tx
    .select({ version: secretVersions, organizationKey: secretOrganizationKeys })
    .from(secretVersions)
    .leftJoin(
      secretOrganizationKeys,
      and(
        eq(secretOrganizationKeys.organizationId, organizationId),
        eq(secretOrganizationKeys.version, secretVersions.organizationKeyVersion),
      ),
    )
    .where(
      and(
        eq(secretVersions.organizationId, organizationId),
        eq(secretVersions.entryId, entryId),
        eq(secretVersions.version, versionNumber),
      ),
    )
    .limit(1);
  if (!result) {
    throw new SecretsError("Secret version not found", {
      code: "NOT_FOUND",
      status: 404,
    });
  }
  if (!result.organizationKey) {
    throw new SecretsError("Secret organization key version not found", {
      code: "SECRETS_KEY_UNAVAILABLE",
      status: 503,
    });
  }
  return {
    version: result.version,
    organizationKey: unwrapRow(result.organizationKey),
  };
}

export async function auditEvent(
  tx: SecretsTransaction,
  access: SecretsAccess,
  input: {
    action: string;
    targetType: string;
    targetId?: string | null;
    targetName?: string | null;
    projectId?: string | null;
    environmentId?: string | null;
    entryId?: string | null;
    metadata?: Record<string, unknown>;
    result?: "success" | "failure" | "denied";
  },
) {
  await tx.insert(secretAuditEvents).values({
    id: crypto.randomUUID(),
    organizationId: access.organization.id,
    projectId: input.projectId ?? null,
    environmentId: input.environmentId ?? null,
    entryId: input.entryId ?? null,
    actorType: access.actor.type,
    actorCredential: access.actor.credential,
    actorId: access.actor.id,
    actorTokenId: access.actor.tokenId,
    action: input.action,
    result: input.result ?? "success",
    requestId: access.requestMetadata.requestId,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetName: input.targetName ?? null,
    metadata: input.metadata ?? {},
    ipAddress: access.requestMetadata.ipAddress,
    userAgent: access.requestMetadata.userAgent,
  });
}

export async function latestOrganizationKeyEvent(organizationId: string) {
  const [row] = await db
    .select({
      createdAt: secretOrganizationKeys.createdAt,
      rewrappedAt: secretOrganizationKeys.rewrappedAt,
    })
    .from(secretOrganizationKeys)
    .where(eq(secretOrganizationKeys.organizationId, organizationId))
    .orderBy(desc(secretOrganizationKeys.version))
    .limit(1);
  return row ?? null;
}
