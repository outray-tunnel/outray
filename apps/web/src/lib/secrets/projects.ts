import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  secretDeletionBatches,
  secretAuditEvents,
  secretEntries,
  secretEnvironments,
  secretProjects,
} from "../../db/secrets-schema";
import type { SecretsAccess } from "./types";
import { SecretsError } from "./types";
import {
  readOptionalString,
  readRequiredString,
  optionalNonNegativeInteger,
  slugifySecretsName,
  isProductionEnvironment,
  requireProductionConfirmation,
  validateSlug,
} from "./validation";
import {
  auditEvent,
  latestOrganizationKeyEvent,
  lockOrganization,
  resolveProject,
} from "./database";

function serializeProject(
  row: typeof secretProjects.$inferSelect,
  environmentCount = 0,
  secretCount = 0,
) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    environmentCount,
    secretCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requireContainerManager(access: SecretsAccess) {
  if (
    access.actor.type !== "user" ||
    access.actor.credential !== "session" ||
    (access.actor.role !== "owner" && access.actor.role !== "admin")
  ) {
    throw new SecretsError(
      "Only organization owners and admins can manage projects and environments",
      { code: "FORBIDDEN", status: 403 },
    );
  }
}

function serializeEnvironment(
  row: typeof secretEnvironments.$inferSelect,
  secretCount = 0,
) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isProduction: row.isProduction,
    revision: row.revision,
    secretCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function projectCounts(access: SecretsAccess, projectIds: string[]) {
  if (!projectIds.length) {
    return {
      environments: new Map<string, number>(),
      secrets: new Map<string, number>(),
      environmentRows: [] as Array<
        ReturnType<typeof serializeEnvironment> & { projectId: string }
      >,
    };
  }
  const environments = await db
    .select()
    .from(secretEnvironments)
    .where(
      and(
        eq(secretEnvironments.organizationId, access.organization.id),
        inArray(secretEnvironments.projectId, projectIds),
        isNull(secretEnvironments.deletedAt),
        ...(access.actor.type === "machine" && access.actor.environmentId
          ? [eq(secretEnvironments.id, access.actor.environmentId)]
          : []),
      ),
    )
    .orderBy(asc(secretEnvironments.name));
  const secretRows = environments.length
    ? await db
        .select({
          projectId: secretEntries.projectId,
          environmentId: secretEntries.environmentId,
          total: count(),
        })
        .from(secretEntries)
        .where(
          and(
            eq(secretEntries.organizationId, access.organization.id),
            inArray(secretEntries.projectId, projectIds),
            inArray(
              secretEntries.environmentId,
              environments.map((environment) => environment.id),
            ),
            isNull(secretEntries.deletedAt),
          ),
        )
        .groupBy(secretEntries.projectId, secretEntries.environmentId)
    : [];
  const environmentCounts = new Map(
    secretRows.map((row) => [row.environmentId, row.total]),
  );
  const projectSecretCounts = new Map<string, number>();
  for (const row of secretRows) {
    projectSecretCounts.set(
      row.projectId,
      (projectSecretCounts.get(row.projectId) ?? 0) + row.total,
    );
  }
  const projectEnvironmentCounts = new Map<string, number>();
  for (const environment of environments) {
    projectEnvironmentCounts.set(
      environment.projectId,
      (projectEnvironmentCounts.get(environment.projectId) ?? 0) + 1,
    );
  }
  return {
    environments: projectEnvironmentCounts,
    secrets: projectSecretCounts,
    environmentRows: environments.map((row) => ({
      projectId: row.projectId,
      ...serializeEnvironment(row, environmentCounts.get(row.id) ?? 0),
    })),
  };
}

export async function listProjects(access: SecretsAccess) {
  const conditions = [
    eq(secretProjects.organizationId, access.organization.id),
    isNull(secretProjects.deletedAt),
  ];
  if (access.actor.type === "machine" && access.actor.projectId) {
    conditions.push(eq(secretProjects.id, access.actor.projectId));
  }
  const rows = await db
    .select()
    .from(secretProjects)
    .where(and(...conditions))
    .orderBy(asc(secretProjects.name));
  const counts = await projectCounts(access, rows.map((row) => row.id));
  return rows.map((row) =>
    ({
      ...serializeProject(
        row,
        counts.environments.get(row.id) ?? 0,
        counts.secrets.get(row.id) ?? 0,
      ),
      environments: counts.environmentRows
        .filter((environment) => environment.projectId === row.id)
        .map(({ projectId: _projectId, ...environment }) => environment),
    }),
  );
}

export async function createProject(
  access: SecretsAccess,
  input: Record<string, unknown>,
) {
  requireContainerManager(access);
  const name = readRequiredString(input, "name", { maxLength: 100 });
  const requestedSlug =
    typeof input.slug === "string" ? input.slug : slugifySecretsName(name);
  const slug = validateSlug(requestedSlug || "", "slug");
  const description = readOptionalString(input, "description", 500) ?? null;

  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const [duplicate] = await tx
      .select({ id: secretProjects.id })
      .from(secretProjects)
      .where(
        and(
          eq(secretProjects.organizationId, access.organization.id),
          eq(secretProjects.slug, slug),
          isNull(secretProjects.deletedAt),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new SecretsError("A project with this slug already exists", {
        code: "CONFLICT",
        status: 409,
        field: "slug",
      });
    }
    const [created] = await tx
      .insert(secretProjects)
      .values({
        id: crypto.randomUUID(),
        organizationId: access.organization.id,
        name,
        slug,
        description,
        createdById: access.actor.userId,
      })
      .returning();
    const defaultEnvironments = await tx
      .insert(secretEnvironments)
      .values([
        {
          id: crypto.randomUUID(),
          organizationId: access.organization.id,
          projectId: created.id,
          name: "Development",
          slug: "development",
          isProduction: false,
          createdById: access.actor.userId,
        },
        {
          id: crypto.randomUUID(),
          organizationId: access.organization.id,
          projectId: created.id,
          name: "Staging",
          slug: "staging",
          isProduction: false,
          createdById: access.actor.userId,
        },
        {
          id: crypto.randomUUID(),
          organizationId: access.organization.id,
          projectId: created.id,
          name: "Production",
          slug: "production",
          isProduction: true,
          createdById: access.actor.userId,
        },
      ])
      .returning();
    await auditEvent(tx, access, {
      action: "project.created",
      targetType: "project",
      targetId: created.id,
      targetName: created.name,
      projectId: created.id,
      metadata: {
        slug: created.slug,
        defaultEnvironments: defaultEnvironments.map((row) => row.slug),
      },
    });
    return {
      project: serializeProject(created, defaultEnvironments.length, 0),
      environments: defaultEnvironments.map((row) => serializeEnvironment(row)),
    };
  });
}

export async function projectDetails(
  access: SecretsAccess,
  projectSlug: string,
) {
  const project = await resolveProject(access, projectSlug);
  const environments = await db
    .select()
    .from(secretEnvironments)
    .where(
      and(
        eq(secretEnvironments.organizationId, access.organization.id),
        eq(secretEnvironments.projectId, project.id),
        isNull(secretEnvironments.deletedAt),
        ...(access.actor.type === "machine" && access.actor.environmentId
          ? [eq(secretEnvironments.id, access.actor.environmentId)]
          : []),
      ),
    )
    .orderBy(asc(secretEnvironments.name));
  const counts = environments.length
    ? await db
        .select({ environmentId: secretEntries.environmentId, total: count() })
        .from(secretEntries)
        .where(
          and(
            inArray(
              secretEntries.environmentId,
              environments.map((environment) => environment.id),
            ),
            isNull(secretEntries.deletedAt),
          ),
        )
        .groupBy(secretEntries.environmentId)
    : [];
  const countMap = new Map(
    counts.map((row) => [row.environmentId, row.total]),
  );
  const secretCount = counts.reduce((sum, row) => sum + row.total, 0);
  return {
    project: serializeProject(project, environments.length, secretCount),
    environments: environments.map((row) =>
      serializeEnvironment(row, countMap.get(row.id) ?? 0),
    ),
  };
}

export async function updateProject(
  access: SecretsAccess,
  projectSlug: string,
  input: Record<string, unknown>,
) {
  requireContainerManager(access);
  const project = await resolveProject(access, projectSlug);
  const requestedName =
    "name" in input
      ? readRequiredString(input, "name", { maxLength: 100 })
      : undefined;
  const requestedSlug =
    "slug" in input
      ? validateSlug(readRequiredString(input, "slug", { maxLength: 63 }))
      : undefined;
  const description = readOptionalString(input, "description", 500);

  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const [lockedProject] = await tx
      .select()
      .from(secretProjects)
      .where(
        and(
          eq(secretProjects.id, project.id),
          eq(secretProjects.organizationId, access.organization.id),
          isNull(secretProjects.deletedAt),
        ),
      )
      .for("update");
    if (!lockedProject) {
      throw new SecretsError("Project is no longer available", {
        code: "CONFLICT",
        status: 409,
      });
    }
    const name = requestedName ?? lockedProject.name;
    const slug = requestedSlug ?? lockedProject.slug;
    const nextDescription =
      description === undefined ? lockedProject.description : description;
    if (
      name === lockedProject.name &&
      slug === lockedProject.slug &&
      nextDescription === lockedProject.description
    ) {
      return serializeProject(lockedProject);
    }
    if (slug !== lockedProject.slug) {
      const [duplicate] = await tx
        .select({ id: secretProjects.id })
        .from(secretProjects)
        .where(
          and(
            eq(secretProjects.organizationId, access.organization.id),
            eq(secretProjects.slug, slug),
            isNull(secretProjects.deletedAt),
          ),
        )
        .limit(1);
      if (duplicate) {
        throw new SecretsError("A project with this slug already exists", {
          code: "CONFLICT",
          status: 409,
          field: "slug",
        });
      }
    }
    const [updated] = await tx
      .update(secretProjects)
      .set({
        name,
        slug,
        description: nextDescription,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(secretProjects.id, project.id),
          isNull(secretProjects.deletedAt),
        ),
      )
      .returning();
    if (!updated) {
      throw new SecretsError("Project not found", {
        code: "NOT_FOUND",
        status: 404,
      });
    }
    await auditEvent(tx, access, {
      action: "project.updated",
      targetType: "project",
      targetId: updated.id,
      targetName: updated.name,
      projectId: updated.id,
      metadata: {
        previousSlug: lockedProject.slug,
        slug: updated.slug,
        renamed: lockedProject.name !== updated.name,
      },
    });
    return serializeProject(updated);
  });
}

export async function deleteProject(
  access: SecretsAccess,
  projectSlug: string,
  input: Record<string, unknown>,
) {
  requireContainerManager(access);
  const project = await resolveProject(access, projectSlug);
  if (input.confirmation !== project.name) {
    throw new SecretsError("confirmation must exactly match the project name", {
      code: "CONFIRMATION_REQUIRED",
      status: 400,
      field: "confirmation",
    });
  }
  const now = new Date();
  const batchId = crypto.randomUUID();
  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const [lockedProject] = await tx
      .select()
      .from(secretProjects)
      .where(
        and(
          eq(secretProjects.id, project.id),
          eq(secretProjects.organizationId, access.organization.id),
          isNull(secretProjects.deletedAt),
        ),
      )
      .for("update");
    if (!lockedProject || input.confirmation !== lockedProject.name) {
      throw new SecretsError("Project is no longer deletable", {
        code: "CONFLICT",
        status: 409,
      });
    }
    const environmentRows = await tx
      .select({
        id: secretEnvironments.id,
        isProduction: secretEnvironments.isProduction,
      })
      .from(secretEnvironments)
      .where(
        and(
          eq(secretEnvironments.projectId, project.id),
          isNull(secretEnvironments.deletedAt),
        ),
      )
      .for("update");
    requireProductionConfirmation(
      { isProduction: environmentRows.some((row) => row.isProduction) },
      input.confirmProduction,
    );
    const secretRows = await tx
      .select({ id: secretEntries.id })
      .from(secretEntries)
      .where(
        and(
          eq(secretEntries.projectId, project.id),
          isNull(secretEntries.deletedAt),
        ),
      )
      .for("update");
    await tx.insert(secretDeletionBatches).values({
      id: batchId,
      organizationId: access.organization.id,
      rootType: "project",
      rootId: lockedProject.id,
      rootName: lockedProject.name,
      projectId: lockedProject.id,
      itemCount: 1 + environmentRows.length + secretRows.length,
      status: "active",
      metadata: {
        projectSlug: lockedProject.slug,
        slug: lockedProject.slug,
        environments: environmentRows.length,
        secrets: secretRows.length,
      },
      deletedByType: access.actor.type,
      deletedById: access.actor.id,
      deletedAt: now,
      expiresAt: null,
    });
    await tx
      .update(secretProjects)
      .set({ deletedAt: now, deletionBatchId: batchId, updatedAt: now })
      .where(eq(secretProjects.id, project.id));
    await tx
      .update(secretEnvironments)
      .set({
        deletedAt: now,
        deletionBatchId: batchId,
        revision: sql`${secretEnvironments.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(secretEnvironments.projectId, project.id),
          isNull(secretEnvironments.deletedAt),
        ),
      );
    await tx
      .update(secretEntries)
      .set({ deletedAt: now, deletionBatchId: batchId, updatedAt: now })
      .where(
        and(
          eq(secretEntries.projectId, project.id),
          isNull(secretEntries.deletedAt),
        ),
      );
    await auditEvent(tx, access, {
      action: "project.deleted",
      targetType: "project",
      targetId: lockedProject.id,
      targetName: lockedProject.name,
      projectId: lockedProject.id,
      metadata: { batchId, itemCount: 1 + environmentRows.length + secretRows.length },
    });
    return {
      deleted: true,
      batch: { id: batchId, type: "project", itemCount: 1 + environmentRows.length + secretRows.length },
    };
  });
}

export async function createEnvironment(
  access: SecretsAccess,
  projectSlug: string,
  input: Record<string, unknown>,
) {
  requireContainerManager(access);
  const project = await resolveProject(access, projectSlug);
  const name = readRequiredString(input, "name", { maxLength: 100 });
  const requestedSlug =
    typeof input.slug === "string" ? input.slug : slugifySecretsName(name);
  const slug = validateSlug(requestedSlug || "", "slug");
  const description = readOptionalString(input, "description", 500) ?? null;
  if ("isProduction" in input && typeof input.isProduction !== "boolean") {
    throw new SecretsError("isProduction must be a boolean", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "isProduction",
    });
  }
  const isProduction =
    typeof input.isProduction === "boolean"
      ? input.isProduction
      : isProductionEnvironment({ name, slug });
  requireProductionConfirmation(
    { isProduction },
    input.confirmProduction,
  );

  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const [lockedProject] = await tx
      .select({ id: secretProjects.id })
      .from(secretProjects)
      .where(
        and(
          eq(secretProjects.id, project.id),
          isNull(secretProjects.deletedAt),
        ),
      )
      .for("update");
    if (!lockedProject) {
      throw new SecretsError("Project is no longer available", {
        code: "CONFLICT",
        status: 409,
      });
    }
    const [duplicate] = await tx
      .select({ id: secretEnvironments.id })
      .from(secretEnvironments)
      .where(
        and(
          eq(secretEnvironments.projectId, project.id),
          eq(secretEnvironments.slug, slug),
          isNull(secretEnvironments.deletedAt),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new SecretsError("An environment with this slug already exists", {
        code: "CONFLICT",
        status: 409,
        field: "slug",
      });
    }
    const [created] = await tx
      .insert(secretEnvironments)
      .values({
        id: crypto.randomUUID(),
        organizationId: access.organization.id,
        projectId: project.id,
        name,
        slug,
        description,
        isProduction,
        createdById: access.actor.userId,
      })
      .returning();
    await auditEvent(tx, access, {
      action: "environment.created",
      targetType: "environment",
      targetId: created.id,
      targetName: created.name,
      projectId: project.id,
      environmentId: created.id,
      metadata: { slug: created.slug },
    });
    return serializeEnvironment(created);
  });
}

export async function updateEnvironment(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  input: Record<string, unknown>,
) {
  requireContainerManager(access);
  const project = await resolveProject(access, projectSlug);
  const [environment] = await db
    .select()
    .from(secretEnvironments)
    .where(
      and(
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
  const requestedName =
    "name" in input
      ? readRequiredString(input, "name", { maxLength: 100 })
      : undefined;
  const requestedSlug =
    "slug" in input
      ? validateSlug(readRequiredString(input, "slug", { maxLength: 63 }))
      : undefined;
  const description = readOptionalString(input, "description", 500);
  if ("isProduction" in input && typeof input.isProduction !== "boolean") {
    throw new SecretsError("isProduction must be a boolean", {
      code: "VALIDATION_ERROR",
      status: 400,
      field: "isProduction",
    });
  }

  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
    const [lockedProject] = await tx
      .select({ id: secretProjects.id })
      .from(secretProjects)
      .where(
        and(
          eq(secretProjects.id, project.id),
          isNull(secretProjects.deletedAt),
        ),
      )
      .for("update");
    if (!lockedProject) {
      throw new SecretsError("Project is no longer available", {
        code: "CONFLICT",
        status: 409,
      });
    }
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
      .for("update");
    if (!lockedEnvironment) {
      throw new SecretsError("Environment is no longer available", {
        code: "CONFLICT",
        status: 409,
      });
    }
    if (lockedEnvironment.revision !== expectedRevision) {
      throw new SecretsError("Environment revision has changed", {
        code: "REVISION_CONFLICT",
        status: 409,
        details: { currentRevision: lockedEnvironment.revision },
      });
    }
    const name = requestedName ?? lockedEnvironment.name;
    const slug = requestedSlug ?? lockedEnvironment.slug;
    const nextDescription =
      description === undefined ? lockedEnvironment.description : description;
    const isProduction =
      typeof input.isProduction === "boolean"
        ? input.isProduction
        : lockedEnvironment.isProduction;
    if (
      name === lockedEnvironment.name &&
      slug === lockedEnvironment.slug &&
      nextDescription === lockedEnvironment.description &&
      isProduction === lockedEnvironment.isProduction
    ) {
      return serializeEnvironment(lockedEnvironment);
    }
    requireProductionConfirmation(
      { isProduction: lockedEnvironment.isProduction || isProduction },
      input.confirmProduction,
    );
    if (slug !== lockedEnvironment.slug) {
      const [duplicate] = await tx
        .select({ id: secretEnvironments.id })
        .from(secretEnvironments)
        .where(
          and(
            eq(secretEnvironments.projectId, project.id),
            eq(secretEnvironments.slug, slug),
            isNull(secretEnvironments.deletedAt),
          ),
        )
        .limit(1);
      if (duplicate) {
        throw new SecretsError("An environment with this slug already exists", {
          code: "CONFLICT",
          status: 409,
          field: "slug",
        });
      }
    }
    const [updated] = await tx
      .update(secretEnvironments)
      .set({
        name,
        slug,
        isProduction,
        description: nextDescription,
        revision: sql`${secretEnvironments.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(secretEnvironments.id, environment.id),
          isNull(secretEnvironments.deletedAt),
        ),
      )
      .returning();
    if (!updated) {
      throw new SecretsError("Environment not found", {
        code: "NOT_FOUND",
        status: 404,
      });
    }
    await auditEvent(tx, access, {
      action: "environment.updated",
      targetType: "environment",
      targetId: environment.id,
      targetName: updated.name,
      projectId: project.id,
      environmentId: environment.id,
      metadata: {
        previousSlug: lockedEnvironment.slug,
        slug: updated.slug,
        isProduction: updated.isProduction,
        previousRevision: lockedEnvironment.revision,
        environmentRevision: updated.revision,
      },
    });
    return serializeEnvironment(updated);
  });
}

export async function deleteEnvironment(
  access: SecretsAccess,
  projectSlug: string,
  environmentSlug: string,
  input: Record<string, unknown>,
) {
  requireContainerManager(access);
  const project = await resolveProject(access, projectSlug);
  const [environment] = await db
    .select()
    .from(secretEnvironments)
    .where(
      and(
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
  requireProductionConfirmation(environment, input.confirmProduction);
  if (input.confirmation !== environment.name) {
    throw new SecretsError(
      "confirmation must exactly match the environment name",
      {
        code: "CONFIRMATION_REQUIRED",
        status: 400,
        field: "confirmation",
      },
    );
  }
  const now = new Date();
  const batchId = crypto.randomUUID();
  return db.transaction(async (tx) => {
    await lockOrganization(tx, access.organization.id);
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
      .for("update");
    if (!lockedEnvironment) {
      throw new SecretsError("Environment is no longer deletable", {
        code: "CONFLICT",
        status: 409,
      });
    }
    requireProductionConfirmation(
      lockedEnvironment,
      input.confirmProduction,
    );
    if (input.confirmation !== lockedEnvironment.name) {
      throw new SecretsError("Environment name changed; confirm again", {
        code: "CONFIRMATION_REQUIRED",
        status: 409,
        field: "confirmation",
      });
    }
    const entries = await tx
      .select({ id: secretEntries.id })
      .from(secretEntries)
      .where(
        and(
          eq(secretEntries.environmentId, environment.id),
          isNull(secretEntries.deletedAt),
        ),
      )
      .for("update");
    await tx.insert(secretDeletionBatches).values({
      id: batchId,
      organizationId: access.organization.id,
      rootType: "environment",
      rootId: lockedEnvironment.id,
      rootName: lockedEnvironment.name,
      projectId: project.id,
      environmentId: lockedEnvironment.id,
      itemCount: 1 + entries.length,
      metadata: {
        projectSlug: project.slug,
        environmentSlug: lockedEnvironment.slug,
        slug: lockedEnvironment.slug,
        secrets: entries.length,
        isProduction: lockedEnvironment.isProduction,
      },
      deletedByType: access.actor.type,
      deletedById: access.actor.id,
      deletedAt: now,
      expiresAt: null,
    });
    await tx
      .update(secretEnvironments)
      .set({
        deletedAt: now,
        deletionBatchId: batchId,
        revision: sql`${secretEnvironments.revision} + 1`,
        updatedAt: now,
      })
      .where(eq(secretEnvironments.id, lockedEnvironment.id));
    await tx
      .update(secretEntries)
      .set({ deletedAt: now, deletionBatchId: batchId, updatedAt: now })
      .where(
        and(
          eq(secretEntries.environmentId, environment.id),
          isNull(secretEntries.deletedAt),
        ),
      );
    await auditEvent(tx, access, {
      action: "environment.deleted",
      targetType: "environment",
      targetId: lockedEnvironment.id,
      targetName: lockedEnvironment.name,
      projectId: project.id,
      environmentId: lockedEnvironment.id,
      metadata: { batchId, itemCount: 1 + entries.length },
    });
    return {
      deleted: true,
      batch: {
        id: batchId,
        type: "environment",
        itemCount: 1 + entries.length,
      },
    };
  });
}

export async function getOverview(access: SecretsAccess) {
  const projects = await listProjects(access);
  const projectIds = projects.map((project) => project.id);
  const trashConditions = [
    eq(secretDeletionBatches.organizationId, access.organization.id),
    eq(secretDeletionBatches.status, "active"),
  ];
  const activityConditions = [
    eq(secretAuditEvents.organizationId, access.organization.id),
  ];
  if (access.actor.type === "machine" && access.actor.projectId) {
    trashConditions.push(
      eq(secretDeletionBatches.projectId, access.actor.projectId),
    );
    activityConditions.push(
      eq(secretAuditEvents.projectId, access.actor.projectId),
    );
  }
  if (access.actor.type === "machine" && access.actor.environmentId) {
    trashConditions.push(
      eq(secretDeletionBatches.environmentId, access.actor.environmentId),
    );
    activityConditions.push(
      eq(secretAuditEvents.environmentId, access.actor.environmentId),
    );
  }
  const [[environmentTotal], [secretTotal], [trashTotal], activity, keyEvent] =
    await Promise.all([
      projectIds.length
        ? db
            .select({ total: count() })
            .from(secretEnvironments)
            .where(
              and(
                eq(secretEnvironments.organizationId, access.organization.id),
                inArray(secretEnvironments.projectId, projectIds),
                ...(access.actor.type === "machine" &&
                access.actor.environmentId
                  ? [eq(secretEnvironments.id, access.actor.environmentId)]
                  : []),
                isNull(secretEnvironments.deletedAt),
              ),
            )
        : Promise.resolve([{ total: 0 }]),
      projectIds.length
        ? db
            .select({ total: count() })
            .from(secretEntries)
            .where(
              and(
                eq(secretEntries.organizationId, access.organization.id),
                inArray(secretEntries.projectId, projectIds),
                ...(access.actor.type === "machine" &&
                access.actor.environmentId
                  ? [eq(secretEntries.environmentId, access.actor.environmentId)]
                  : []),
                isNull(secretEntries.deletedAt),
              ),
            )
        : Promise.resolve([{ total: 0 }]),
      db
        .select({ total: count() })
        .from(secretDeletionBatches)
        .where(and(...trashConditions)),
      db
        .select({
          id: secretAuditEvents.id,
          action: secretAuditEvents.action,
          targetType: secretAuditEvents.targetType,
          targetName: secretAuditEvents.targetName,
          createdAt: secretAuditEvents.createdAt,
        })
        .from(secretAuditEvents)
        .where(and(...activityConditions))
        .orderBy(desc(secretAuditEvents.createdAt), desc(secretAuditEvents.id))
        .limit(10),
      latestOrganizationKeyEvent(access.organization.id),
    ]);

  return {
    summary: {
      projects: projects.length,
      environments: environmentTotal?.total ?? 0,
      secrets: secretTotal?.total ?? 0,
      deletedItems: trashTotal?.total ?? 0,
      lastRotationAt: keyEvent?.rewrappedAt ?? keyEvent?.createdAt ?? null,
    },
    projects,
    recentActivity: activity,
  };
}
