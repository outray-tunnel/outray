import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import type { SecretsAccess } from "../src/lib/secrets/types";

const enabled = process.env.OUTRAY_RUN_DB_INTEGRATION === "1";

function accessFor(input: {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  userId: string;
  role: "owner" | "admin" | "member";
}): SecretsAccess {
  return {
    organization: {
      id: input.organizationId,
      slug: input.organizationSlug,
      name: input.organizationName,
    },
    actor: {
      type: "user",
      credential: "session",
      id: input.userId,
      userId: input.userId,
      role: input.role,
      tokenId: null,
      projectId: null,
      environmentId: null,
      scopes: ["secrets:*"],
    },
    requestMetadata: {
      requestId: `integration:${crypto.randomUUID()}`,
      ipAddress: "127.0.0.1",
      userAgent: "outray-secrets-integration-test",
    },
  };
}

function hasCode(expected: string) {
  return (error: unknown) =>
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code: unknown }).code === expected;
}

function bearerRequest(token: string) {
  return new Request("http://secrets.integration.invalid/api/secrets", {
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": "outray-secrets-bearer-integration-test",
      "x-forwarded-for": "127.0.0.1",
      "x-request-id": `integration:${crypto.randomUUID()}`,
    },
  });
}

test(
  "database vault lifecycle preserves revisions, history, Trash, audit, and hashed tokens",
  { skip: !enabled },
  async (t) => {
    const [{ db }, authSchema, secretsSchema, entries, projects, governance] =
      await Promise.all([
        import("../src/db"),
        import("../src/db/auth-schema"),
        import("../src/db/secrets-schema"),
        import("../src/lib/secrets/entries"),
        import("../src/lib/secrets/projects"),
        import("../src/lib/secrets/governance"),
      ]);
    const suffix = crypto.randomUUID();
    const userId = `secrets-test-user-${suffix}`;
    const organizationId = `secrets-test-org-${suffix}`;
    const organizationSlug = `secrets-test-${suffix}`;
    const organizationName = `Secrets integration ${suffix}`;
    const now = new Date();

    t.after(async () => {
      await db
        .delete(authSchema.organizations)
        .where(eq(authSchema.organizations.id, organizationId));
      await db.delete(authSchema.users).where(eq(authSchema.users.id, userId));
    });

    await db.insert(authSchema.users).values({
      id: userId,
      name: "Secrets integration user",
      email: `${suffix}@secrets.integration.invalid`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(authSchema.organizations).values({
      id: organizationId,
      name: organizationName,
      slug: organizationSlug,
      createdAt: now,
    });
    await db.insert(authSchema.members).values({
      id: `secrets-test-member-${suffix}`,
      organizationId,
      userId,
      role: "owner",
      createdAt: now,
    });

    const owner = accessFor({
      organizationId,
      organizationSlug,
      organizationName,
      userId,
      role: "owner",
    });
    const member = accessFor({
      organizationId,
      organizationSlug,
      organizationName,
      userId,
      role: "member",
    });

    const createdProject = await projects.createProject(owner, {
      name: "Integration service",
      slug: "integration-service",
    });
    assert.deepEqual(
      createdProject.environments.map((environment) => environment.slug).sort(),
      ["development", "production", "staging"],
    );

    await assert.rejects(
      () =>
        entries.createSecret(member, "integration-service", "production", {
          key: "blocked",
          value: "value",
          expectedRevision: 0,
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "PRODUCTION_CONFIRMATION_REQUIRED",
    );

    const productionSecret = await entries.createSecret(
      member,
      "integration-service",
      "production",
      {
        key: "PRODUCTION_ONLY",
        value: "protected",
        expectedRevision: 0,
        confirmProduction: true,
      },
    );
    const productionDeleted = await entries.deleteSecret(
      member,
      "integration-service",
      "production",
      productionSecret.secrets[0].id,
      {
        confirmation: "PRODUCTION_ONLY",
        expectedRevision: 1,
        confirmProduction: true,
      },
    );
    await assert.rejects(
      () =>
        governance.restoreTrash(owner, {
          type: "secret",
          id: productionDeleted.batch.id,
          confirmation: "PRODUCTION_ONLY",
          confirmProduction: false,
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "PRODUCTION_CONFIRMATION_REQUIRED",
    );
    await governance.restoreTrash(owner, {
      type: "secret",
      id: productionDeleted.batch.id,
      confirmation: "PRODUCTION_ONLY",
      confirmProduction: true,
    });

    const customProductionEnvironment = await projects.createEnvironment(
      owner,
      "integration-service",
      {
        name: "Primary",
        slug: "primary",
        isProduction: true,
        confirmProduction: true,
      },
    );
    const customProductionSecret = await entries.createSecret(
      member,
      "integration-service",
      customProductionEnvironment.slug,
      {
        key: "CUSTOM_PRODUCTION",
        value: "protected",
        expectedRevision: 0,
        confirmProduction: true,
      },
    );
    const customProductionDeleted = await entries.deleteSecret(
      member,
      "integration-service",
      customProductionEnvironment.slug,
      customProductionSecret.secrets[0].id,
      {
        confirmation: "CUSTOM_PRODUCTION",
        expectedRevision: 1,
        confirmProduction: true,
      },
    );
    const productionTrash = await governance.listTrash(owner);
    assert.equal(
      productionTrash.find(
        (item) => item.batchId === customProductionDeleted.batch.id,
      )?.isProduction,
      true,
    );
    await assert.rejects(
      () =>
        governance.purgeTrash(owner, {
          type: "secret",
          id: customProductionDeleted.batch.id,
          confirmation: "PURGE CUSTOM_PRODUCTION",
          confirmProduction: false,
        }),
      hasCode("PRODUCTION_CONFIRMATION_REQUIRED"),
    );
    const [retainedProductionEntry] = await db
      .select({ id: secretsSchema.secretEntries.id })
      .from(secretsSchema.secretEntries)
      .where(
        eq(
          secretsSchema.secretEntries.id,
          customProductionSecret.secrets[0].id,
        ),
      );
    assert.ok(retainedProductionEntry);
    await governance.purgeTrash(owner, {
      type: "secret",
      id: customProductionDeleted.batch.id,
      confirmation: "PURGE CUSTOM_PRODUCTION",
      confirmProduction: true,
    });

    await projects.createEnvironment(owner, "integration-service", {
      name: "Multi base",
      slug: "multi-base",
    });
    await projects.createEnvironment(owner, "integration-service", {
      name: "Multi target",
      slug: "multi-target",
    });
    await entries.createSecret(member, "integration-service", "multi-target", {
      key: "TARGET_REVISION",
      value: "one",
      expectedRevision: 0,
    });
    await assert.rejects(
      () =>
        entries.createSecret(member, "integration-service", "multi-base", {
          key: "ATOMIC_MULTI",
          value: "must not persist",
          environmentSlugs: ["multi-base", "multi-target"],
          expectedRevision: 0,
          expectedRevisions: { "multi-base": 0, "multi-target": 0 },
        }),
      hasCode("REVISION_CONFLICT"),
    );
    const [multiBaseAfterConflict, multiTargetAfterConflict] =
      await Promise.all([
        entries.listSecrets(member, "integration-service", "multi-base"),
        entries.listSecrets(member, "integration-service", "multi-target"),
      ]);
    assert.equal(multiBaseAfterConflict.environment.revision, 0);
    assert.equal(multiBaseAfterConflict.secrets.length, 0);
    assert.equal(multiTargetAfterConflict.environment.revision, 1);
    assert.equal(
      multiTargetAfterConflict.secrets.some(
        (secret) => secret.key === "ATOMIC_MULTI",
      ),
      false,
    );

    const created = await entries.createSecret(
      member,
      "integration-service",
      "development",
      { key: "api key", value: "", expectedRevision: 0 },
    );
    const original = created.secrets[0];
    assert.equal(original.key, "API_KEY");
    assert.equal(created.revisions.development, 1);

    const metadata = await entries.listSecrets(
      member,
      "integration-service",
      "development",
    );
    assert.equal(metadata.environment.revision, 1);
    assert.equal(Object.hasOwn(metadata.secrets[0], "value"), false);

    const revealedEmpty = await entries.revealSecret(
      member,
      "integration-service",
      "development",
      original.id,
      { intent: "reveal" },
    );
    assert.equal(revealedEmpty.secret.value, "");

    const updated = await entries.updateSecret(
      member,
      "integration-service",
      "development",
      original.id,
      {
        value: "line one\nline two",
        expectedVersion: 1,
        expectedRevision: 1,
      },
    );
    assert.equal(updated.secret.version, 2);
    assert.equal(updated.revision, 2);

    const unchanged = await entries.updateSecret(
      member,
      "integration-service",
      "development",
      original.id,
      {
        value: "line one\nline two",
        expectedVersion: 2,
        expectedRevision: 2,
      },
    );
    assert.equal(unchanged.unchanged, true);
    assert.equal(unchanged.revision, 2);

    await assert.rejects(
      () =>
        entries.importSecretValues(
          member,
          "integration-service",
          "development",
          { API_KEY: "line one\nline two", ALPHA: "first" },
          {
            expectedRevision: 2,
            expectedVersions: { API_KEY: 1, ALPHA: null },
            source: "import",
          },
        ),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "VERSION_CONFLICT",
    );

    const imported = await entries.importSecretValues(
      member,
      "integration-service",
      "development",
      { API_KEY: "line one\nline two", ALPHA: "first" },
      {
        expectedRevision: 2,
        expectedVersions: { API_KEY: 2, ALPHA: null },
        source: "import",
      },
    );
    assert.equal(imported.created, 1);
    assert.equal(imported.unchanged, 1);
    assert.equal(imported.revision, 3);

    const importedNoop = await entries.importSecretValues(
      member,
      "integration-service",
      "development",
      { API_KEY: "line one\nline two", ALPHA: "first" },
      {
        expectedRevision: 3,
        expectedVersions: { API_KEY: 2, ALPHA: 1 },
        source: "import",
      },
    );
    assert.equal(importedNoop.revision, 3);

    const exported = await entries.exportSecrets(
      member,
      "integration-service",
      "development",
      {},
    );
    assert.equal(
      exported.envText,
      'ALPHA=first\nAPI_KEY="line one\\nline two"\n',
    );

    const deleted = await entries.deleteSecret(
      member,
      "integration-service",
      "development",
      original.id,
      { confirmation: "API_KEY", expectedRevision: 3 },
    );
    assert.equal(deleted.revision, 4);

    const replacement = await entries.createSecret(
      member,
      "integration-service",
      "development",
      { key: "API_KEY", value: "replacement", expectedRevision: 4 },
    );
    assert.equal(replacement.revisions.development, 5);
    await assert.rejects(
      () =>
        governance.restoreTrash(owner, {
          type: "secret",
          id: deleted.batch.id,
          confirmation: "API_KEY",
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "RESTORE_CONFLICT",
    );

    const replacementDeleted = await entries.deleteSecret(
      member,
      "integration-service",
      "development",
      replacement.secrets[0].id,
      { confirmation: "API_KEY", expectedRevision: 5 },
    );
    assert.equal(replacementDeleted.revision, 6);
    await governance.restoreTrash(owner, {
      type: "secret",
      id: deleted.batch.id,
      confirmation: "API_KEY",
    });
    const restoredRevision = await entries.environmentRevision(
      member,
      "integration-service",
      "development",
    );
    assert.equal(restoredRevision.revision, 7);

    await governance.purgeTrash(owner, {
      type: "secret",
      id: replacementDeleted.batch.id,
      confirmation: "PURGE API_KEY",
    });
    const purgedEntries = await db
      .select({ id: secretsSchema.secretEntries.id })
      .from(secretsSchema.secretEntries)
      .where(eq(secretsSchema.secretEntries.id, replacement.secrets[0].id));
    const purgedVersions = await db
      .select({ id: secretsSchema.secretVersions.id })
      .from(secretsSchema.secretVersions)
      .where(
        eq(secretsSchema.secretVersions.entryId, replacement.secrets[0].id),
      );
    assert.equal(purgedEntries.length, 0);
    assert.equal(purgedVersions.length, 0);
    const rolledBack = await entries.rollbackSecret(
      member,
      "integration-service",
      "development",
      original.id,
      {
        version: 1,
        expectedVersion: 2,
        expectedRevision: 7,
      },
    );
    assert.equal(rolledBack.secret.version, 3);
    assert.equal(rolledBack.revision, 8);
    const revealedRollback = await entries.revealSecret(
      member,
      "integration-service",
      "development",
      original.id,
      { intent: "copy" },
    );
    assert.equal(revealedRollback.secret.value, "");

    const audit = await governance.listAuditEvents(
      member,
      new URLSearchParams({ limit: "100" }),
    );
    assert.ok(audit.events.some((event) => event.action === "secret.revealed"));
    assert.ok(audit.events.some((event) => event.action === "secret.copied"));
    const purgeTombstone = audit.events.find(
      (event) =>
        event.action === "secret.purged" &&
        event.targetId === replacement.secrets[0].id,
    );
    assert.ok(purgeTombstone);
    assert.equal(JSON.stringify(purgeTombstone).includes("replacement"), false);
    assert.ok(audit.events.every((event) => !("value" in event.metadata)));

    const token = await governance.createSecretsMachineToken(owner, {
      name: "Integration token",
      scopes: ["secrets:read"],
      projectSlug: "integration-service",
      environmentSlug: "development",
      expiresIn: "30d",
    });
    const [storedToken] = await db
      .select()
      .from(secretsSchema.machineTokens)
      .where(eq(secretsSchema.machineTokens.id, token.machineToken.id));
    assert.notEqual(storedToken.tokenHash, token.token);
    assert.equal(JSON.stringify(storedToken).includes(token.token), false);
    await governance.revokeMachineToken(owner, token.machineToken.id);

    await projects.createProject(owner, {
      name: "Environment purge target",
      slug: "environment-purge-target",
    });
    const environmentPurgeToken = await governance.createSecretsMachineToken(
      owner,
      {
        name: "Environment purge token",
        scopes: ["secrets:read"],
        projectSlug: "environment-purge-target",
        environmentSlug: "production",
        expiresIn: "30d",
      },
    );
    const productionEnvironmentDeleted = await projects.deleteEnvironment(
      owner,
      "environment-purge-target",
      "production",
      {
        confirmation: "Production",
        confirmProduction: true,
      },
    );
    await assert.rejects(
      () =>
        governance.purgeTrash(owner, {
          type: "environment",
          id: productionEnvironmentDeleted.batch.id,
          confirmation: "PURGE Production",
        }),
      hasCode("PRODUCTION_CONFIRMATION_REQUIRED"),
    );
    await governance.purgeTrash(owner, {
      type: "environment",
      id: productionEnvironmentDeleted.batch.id,
      confirmation: "PURGE Production",
      confirmProduction: true,
    });
    const [detachedEnvironmentToken] = await db
      .select({
        revokedAt: secretsSchema.machineTokens.revokedAt,
        projectId: secretsSchema.machineTokens.projectId,
        environmentId: secretsSchema.machineTokens.environmentId,
      })
      .from(secretsSchema.machineTokens)
      .where(
        eq(
          secretsSchema.machineTokens.id,
          environmentPurgeToken.machineToken.id,
        ),
      );
    assert.ok(detachedEnvironmentToken.revokedAt);
    assert.equal(detachedEnvironmentToken.projectId, null);
    assert.equal(detachedEnvironmentToken.environmentId, null);

    await projects.createProject(owner, {
      name: "Token race target",
      slug: "token-race-target",
    });
    const guaranteedProjectToken = await governance.createSecretsMachineToken(
      owner,
      {
        name: "Project purge token",
        scopes: ["secrets:read"],
        projectSlug: "token-race-target",
        expiresIn: "30d",
      },
    );
    const [tokenAttempt, deletionAttempt] = await Promise.allSettled([
      governance.createSecretsMachineToken(owner, {
        name: "Concurrent target token",
        scopes: ["secrets:read"],
        projectSlug: "token-race-target",
        environmentSlug: "development",
        expiresIn: "30d",
      }),
      projects.deleteProject(owner, "token-race-target", {
        confirmation: "Token race target",
        confirmProduction: true,
      }),
    ]);
    assert.equal(deletionAttempt.status, "fulfilled");
    if (tokenAttempt.status === "rejected") {
      assert.equal(
        tokenAttempt.reason instanceof Error && "code" in tokenAttempt.reason
          ? tokenAttempt.reason.code
          : null,
        "NOT_FOUND",
      );
    }
    if (deletionAttempt.status === "fulfilled") {
      await assert.rejects(
        () =>
          governance.purgeTrash(owner, {
            type: "project",
            id: deletionAttempt.value.batch.id,
            confirmation: "PURGE Token race target",
          }),
        hasCode("PRODUCTION_CONFIRMATION_REQUIRED"),
      );
      await governance.purgeTrash(owner, {
        type: "project",
        id: deletionAttempt.value.batch.id,
        confirmation: "PURGE Token race target",
        confirmProduction: true,
      });
    }
    if (tokenAttempt.status === "fulfilled") {
      const [revokedConcurrentToken] = await db
        .select({
          revokedAt: secretsSchema.machineTokens.revokedAt,
          projectId: secretsSchema.machineTokens.projectId,
          environmentId: secretsSchema.machineTokens.environmentId,
        })
        .from(secretsSchema.machineTokens)
        .where(
          eq(
            secretsSchema.machineTokens.id,
            tokenAttempt.value.machineToken.id,
          ),
        );
      assert.ok(revokedConcurrentToken.revokedAt);
      assert.equal(revokedConcurrentToken.projectId, null);
      assert.equal(revokedConcurrentToken.environmentId, null);
    }
    const [detachedProjectToken] = await db
      .select({
        revokedAt: secretsSchema.machineTokens.revokedAt,
        projectId: secretsSchema.machineTokens.projectId,
        environmentId: secretsSchema.machineTokens.environmentId,
      })
      .from(secretsSchema.machineTokens)
      .where(
        eq(
          secretsSchema.machineTokens.id,
          guaranteedProjectToken.machineToken.id,
        ),
      );
    assert.ok(detachedProjectToken.revokedAt);
    assert.equal(detachedProjectToken.projectId, null);
    assert.equal(detachedProjectToken.environmentId, null);
    await assert.rejects(
      () =>
        governance.createSecretsMachineToken(owner, {
          name: "Purged target token",
          scopes: ["secrets:read"],
          projectSlug: "token-race-target",
          environmentSlug: "development",
          expiresIn: "30d",
        }),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "NOT_FOUND",
    );

    const foreignAccess = accessFor({
      organizationId: `foreign-${suffix}`,
      organizationSlug: "foreign",
      organizationName: "Foreign",
      userId,
      role: "member",
    });
    await assert.rejects(
      () =>
        entries.listSecrets(
          foreignAccess,
          "integration-service",
          "development",
        ),
      /Vault not found/,
    );
  },
);

test(
  "database security boundaries enforce roles, token scopes, isolation, production guards, and optimistic concurrency",
  { skip: !enabled },
  async (t) => {
    const [
      { db },
      authSchema,
      appSchema,
      secretsSchema,
      entries,
      projects,
      governance,
      accessPolicy,
      tunnelAuthRoute,
      redisModule,
      viteModule,
    ] = await Promise.all([
      import("../src/db"),
      import("../src/db/auth-schema"),
      import("../src/db/app-schema"),
      import("../src/db/secrets-schema"),
      import("../src/lib/secrets/entries"),
      import("../src/lib/secrets/projects"),
      import("../src/lib/secrets/governance"),
      import("../src/lib/secrets/access-policy"),
      import("../src/routes/api/tunnel/auth"),
      import("../src/lib/redis"),
      import("vite"),
    ]);
    const webRoot = fileURLToPath(new URL("../", import.meta.url));
    const viteServer = await viteModule.createServer({
      root: webRoot,
      configFile: false,
      appType: "custom",
      logLevel: "silent",
      resolve: {
        alias: {
          "@": fileURLToPath(new URL("../src", import.meta.url)),
        },
      },
      server: { middlewareMode: true },
    });
    const suffix = crypto.randomUUID();
    const organizationId = `secrets-security-org-${suffix}`;
    const foreignOrganizationId = `secrets-security-foreign-org-${suffix}`;
    const organizationSlug = `secrets-security-${suffix}`;
    const foreignOrganizationSlug = `secrets-security-foreign-${suffix}`;
    const organizationName = `Secrets security ${suffix}`;
    const foreignOrganizationName = `Secrets security foreign ${suffix}`;
    const ownerId = `secrets-security-owner-${suffix}`;
    const adminId = `secrets-security-admin-${suffix}`;
    const memberId = `secrets-security-member-${suffix}`;
    const userIds = [ownerId, adminId, memberId];
    const now = new Date();

    t.after(async () => {
      try {
        await db
          .delete(authSchema.organizations)
          .where(
            inArray(authSchema.organizations.id, [
              organizationId,
              foreignOrganizationId,
            ]),
          );
        await db
          .delete(authSchema.users)
          .where(inArray(authSchema.users.id, userIds));
      } finally {
        redisModule.redis.disconnect();
        await viteServer.close();
      }
    });
    const secretsAccess = (await viteServer.ssrLoadModule(
      "/src/lib/secrets/access.ts",
    )) as typeof import("../src/lib/secrets/access");

    await db.insert(authSchema.users).values([
      {
        id: ownerId,
        name: "Secrets security owner",
        email: `owner-${suffix}@secrets.integration.invalid`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: adminId,
        name: "Secrets security admin",
        email: `admin-${suffix}@secrets.integration.invalid`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: memberId,
        name: "Secrets security member",
        email: `member-${suffix}@secrets.integration.invalid`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(authSchema.organizations).values([
      {
        id: organizationId,
        name: organizationName,
        slug: organizationSlug,
        createdAt: now,
      },
      {
        id: foreignOrganizationId,
        name: foreignOrganizationName,
        slug: foreignOrganizationSlug,
        createdAt: now,
      },
    ]);
    await db.insert(authSchema.members).values([
      {
        id: `secrets-security-owner-member-${suffix}`,
        organizationId,
        userId: ownerId,
        role: "owner",
        createdAt: now,
      },
      {
        id: `secrets-security-admin-member-${suffix}`,
        organizationId,
        userId: adminId,
        role: "admin",
        createdAt: now,
      },
      {
        id: `secrets-security-member-member-${suffix}`,
        organizationId,
        userId: memberId,
        role: "member",
        createdAt: now,
      },
      {
        id: `secrets-security-foreign-owner-${suffix}`,
        organizationId: foreignOrganizationId,
        userId: ownerId,
        role: "owner",
        createdAt: now,
      },
    ]);

    const owner = accessFor({
      organizationId,
      organizationSlug,
      organizationName,
      userId: ownerId,
      role: "owner",
    });
    const admin = accessFor({
      organizationId,
      organizationSlug,
      organizationName,
      userId: adminId,
      role: "admin",
    });
    const member = accessFor({
      organizationId,
      organizationSlug,
      organizationName,
      userId: memberId,
      role: "member",
    });
    const foreignOwner = accessFor({
      organizationId: foreignOrganizationId,
      organizationSlug: foreignOrganizationSlug,
      organizationName: foreignOrganizationName,
      userId: ownerId,
      role: "owner",
    });

    const primaryProject = await projects.createProject(owner, {
      name: "Security service",
      slug: "security-service",
    });
    await projects.createProject(owner, {
      name: "Secondary security service",
      slug: "secondary-security-service",
    });
    await projects.createProject(foreignOwner, {
      name: "Security service",
      slug: "security-service",
    });

    await assert.rejects(
      () =>
        projects.createEnvironment(member, "security-service", {
          name: "Forbidden member environment",
        }),
      hasCode("FORBIDDEN"),
    );
    await projects.updateProject(admin, "security-service", {
      description: "Admin-managed project metadata",
    });
    const concurrencyEnvironment = await projects.createEnvironment(
      admin,
      "security-service",
      { name: "Concurrency", slug: "concurrency" },
    );
    const importsEnvironment = await projects.createEnvironment(
      owner,
      "security-service",
      { name: "Imports", slug: "imports" },
    );
    assert.equal(concurrencyEnvironment.revision, 0);
    assert.equal(importsEnvironment.revision, 0);

    const firstOrganizationSecret = await entries.createSecret(
      member,
      "security-service",
      "development",
      { key: "FIRST_ORG_ONLY", value: "first", expectedRevision: 0 },
    );
    const foreignSecret = await entries.createSecret(
      foreignOwner,
      "security-service",
      "development",
      { key: "FOREIGN_ORG_ONLY", value: "foreign", expectedRevision: 0 },
    );
    const firstMetadata = await entries.listSecrets(
      member,
      "security-service",
      "development",
    );
    const foreignMetadata = await entries.listSecrets(
      foreignOwner,
      "security-service",
      "development",
    );
    assert.deepEqual(
      firstMetadata.secrets.map((secret) => secret.key),
      ["FIRST_ORG_ONLY"],
    );
    assert.deepEqual(
      foreignMetadata.secrets.map((secret) => secret.key),
      ["FOREIGN_ORG_ONLY"],
    );
    await assert.rejects(
      () =>
        entries.revealSecret(
          foreignOwner,
          "security-service",
          "development",
          firstOrganizationSecret.secrets[0].id,
          { intent: "reveal" },
        ),
      hasCode("NOT_FOUND"),
    );

    await assert.rejects(
      () =>
        entries.createSecret(member, "security-service", "production", {
          key: "PRODUCTION_VALUE",
          value: "v1",
          expectedRevision: 0,
        }),
      hasCode("PRODUCTION_CONFIRMATION_REQUIRED"),
    );
    const productionSecret = await entries.createSecret(
      member,
      "security-service",
      "production",
      {
        key: "PRODUCTION_VALUE",
        value: "v1",
        expectedRevision: 0,
        confirmProduction: true,
      },
    );
    await assert.rejects(
      () =>
        entries.updateSecret(
          member,
          "security-service",
          "production",
          productionSecret.secrets[0].id,
          {
            value: "v2",
            expectedVersion: 1,
            expectedRevision: 1,
          },
        ),
      hasCode("PRODUCTION_CONFIRMATION_REQUIRED"),
    );
    const productionUpdated = await entries.updateSecret(
      member,
      "security-service",
      "production",
      productionSecret.secrets[0].id,
      {
        value: "v2",
        expectedVersion: 1,
        expectedRevision: 1,
        confirmProduction: true,
      },
    );
    assert.equal(productionUpdated.revision, 2);

    const roleSecret = await entries.createSecret(
      owner,
      "security-service",
      "staging",
      { key: "ROLE_MATRIX", value: "owner", expectedRevision: 0 },
    );
    const roleUpdated = await entries.updateSecret(
      admin,
      "security-service",
      "staging",
      roleSecret.secrets[0].id,
      {
        value: "admin",
        expectedVersion: 1,
        expectedRevision: 1,
      },
    );
    assert.equal(roleUpdated.secret.version, 2);
    const roleRevealed = await entries.revealSecret(
      member,
      "security-service",
      "staging",
      roleSecret.secrets[0].id,
      { intent: "copy" },
    );
    assert.equal(roleRevealed.secret.value, "admin");
    await entries.deleteSecret(
      member,
      "security-service",
      "staging",
      roleSecret.secrets[0].id,
      { confirmation: "ROLE_MATRIX", expectedRevision: 2 },
    );

    const raceSecret = await entries.createSecret(
      member,
      "security-service",
      "concurrency",
      { key: "RACE_KEY", value: "initial", expectedRevision: 0 },
    );
    const raceResults = await Promise.allSettled([
      entries.updateSecret(
        member,
        "security-service",
        "concurrency",
        raceSecret.secrets[0].id,
        {
          value: "first contender",
          expectedVersion: 1,
          expectedRevision: 1,
        },
      ),
      entries.updateSecret(
        admin,
        "security-service",
        "concurrency",
        raceSecret.secrets[0].id,
        {
          value: "second contender",
          expectedVersion: 1,
          expectedRevision: 1,
        },
      ),
    ]);
    assert.equal(
      raceResults.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const rejectedRace = raceResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    assert.ok(rejectedRace);
    assert.ok(
      hasCode("REVISION_CONFLICT")(rejectedRace.reason) ||
        hasCode("VERSION_CONFLICT")(rejectedRace.reason),
    );
    const raceRevision = await entries.environmentRevision(
      member,
      "security-service",
      "concurrency",
    );
    const raceVersions = await entries.listSecretVersions(
      member,
      "security-service",
      "concurrency",
      raceSecret.secrets[0].id,
    );
    assert.equal(raceRevision.revision, 2);
    assert.equal(raceVersions.versions.length, 2);

    await assert.rejects(
      () =>
        entries.importSecrets(member, "security-service", "imports", {
          envText: "duplicate key=one\nDUPLICATE_KEY=two\n",
          expectedRevision: 0,
        }),
      hasCode("DUPLICATE_ENV_KEYS"),
    );
    const importsAfterDuplicate = await entries.listSecrets(
      member,
      "security-service",
      "imports",
    );
    assert.equal(importsAfterDuplicate.environment.revision, 0);
    assert.equal(importsAfterDuplicate.secrets.length, 0);

    const readToken = await governance.createSecretsMachineToken(owner, {
      name: "Environment read token",
      scopes: ["secrets:read"],
      projectSlug: "security-service",
      environmentSlug: "development",
      expiresIn: "30d",
    });
    const [storedReadToken] = await db
      .select()
      .from(secretsSchema.machineTokens)
      .where(eq(secretsSchema.machineTokens.id, readToken.machineToken.id));
    assert.ok(storedReadToken);
    assert.equal(
      accessPolicy.hasSecretsScope(storedReadToken.scopes, "secrets:read"),
      true,
    );
    assert.equal(
      accessPolicy.hasSecretsScope(storedReadToken.scopes, "secrets:reveal"),
      true,
    );
    assert.equal(
      accessPolicy.hasSecretsScope(storedReadToken.scopes, "secrets:write"),
      false,
    );
    assert.ok(storedReadToken.expiresAt);
    assert.ok(storedReadToken.expiresAt > now);
    const readAccess = await secretsAccess.requireSecretsAccess(
      bearerRequest(readToken.token),
      organizationSlug,
      "secrets:read",
    );
    assert.equal(readAccess.actor.type, "machine");
    assert.equal(readAccess.actor.credential, "machine");
    assert.equal(readAccess.actor.tokenId, readToken.machineToken.id);
    assert.equal(readAccess.actor.projectId, primaryProject.project.id);
    assert.equal(readAccess.actor.environmentId, firstMetadata.environment.id);
    assert.equal(readAccess.requestMetadata.ipAddress, "127.0.0.1");
    assert.equal(
      readAccess.requestMetadata.userAgent,
      "outray-secrets-bearer-integration-test",
    );
    const machineMetadata = await entries.listSecrets(
      readAccess,
      "security-service",
      "development",
    );
    assert.deepEqual(
      machineMetadata.secrets.map((secret) => secret.key),
      ["FIRST_ORG_ONLY"],
    );
    await assert.rejects(
      () =>
        secretsAccess.requireSecretsAccess(
          bearerRequest(readToken.token),
          foreignOrganizationSlug,
          "secrets:read",
        ),
      hasCode("UNAUTHORIZED"),
    );
    await assert.rejects(
      () =>
        secretsAccess.requireSecretsAccess(
          bearerRequest(readToken.token),
          organizationSlug,
          "secrets:write",
        ),
      hasCode("FORBIDDEN"),
    );
    await assert.rejects(
      () =>
        entries.listSecrets(
          readAccess,
          "secondary-security-service",
          "development",
        ),
      hasCode("FORBIDDEN"),
    );
    await assert.rejects(
      () => entries.listSecrets(readAccess, "security-service", "production"),
      hasCode("FORBIDDEN"),
    );

    await db
      .update(secretsSchema.machineTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(secretsSchema.machineTokens.id, readToken.machineToken.id));
    const [expiredToken] = await db
      .select()
      .from(secretsSchema.machineTokens)
      .where(eq(secretsSchema.machineTokens.id, readToken.machineToken.id));
    assert.ok(expiredToken.expiresAt);
    assert.ok(expiredToken.expiresAt <= new Date());
    await assert.rejects(
      () =>
        secretsAccess.requireSecretsAccess(
          bearerRequest(readToken.token),
          organizationSlug,
          "secrets:read",
        ),
      hasCode("UNAUTHORIZED"),
    );

    const revokedToken = await governance.createSecretsMachineToken(owner, {
      name: "Revoked read token",
      scopes: ["secrets:read"],
      projectSlug: "security-service",
      environmentSlug: "development",
      expiresIn: "30d",
    });
    await governance.revokeMachineToken(owner, revokedToken.machineToken.id);
    const [storedRevokedToken] = await db
      .select()
      .from(secretsSchema.machineTokens)
      .where(eq(secretsSchema.machineTokens.id, revokedToken.machineToken.id));
    assert.ok(storedRevokedToken.revokedAt);
    await assert.rejects(
      () =>
        secretsAccess.requireSecretsAccess(
          bearerRequest(revokedToken.token),
          organizationSlug,
          "secrets:read",
        ),
      hasCode("UNAUTHORIZED"),
    );

    const cliCredential = {
      id: `secrets-security-cli-org-${suffix}`,
      token: `outray_cli_${crypto.randomUUID()}`,
      userId: memberId,
      organizationId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      createdAt: now,
    };
    await db.insert(authSchema.cliOrgTokens).values(cliCredential);
    const cliAccess = await secretsAccess.requireSecretsAccess(
      bearerRequest(cliCredential.token),
      organizationSlug,
      "secrets:write",
    );
    assert.equal(cliAccess.actor.type, "user");
    assert.equal(cliAccess.actor.credential, "cli");
    assert.equal(cliAccess.actor.userId, memberId);
    assert.equal(cliAccess.actor.role, "member");
    assert.deepEqual(cliAccess.actor.scopes, ["secrets:*"]);
    const cliMetadata = await entries.listSecrets(
      cliAccess,
      "security-service",
      "development",
    );
    assert.deepEqual(
      cliMetadata.secrets.map((secret) => secret.key),
      ["FIRST_ORG_ONLY"],
    );
    const [usedCliCredential] = await db
      .select({ lastUsedAt: authSchema.cliOrgTokens.lastUsedAt })
      .from(authSchema.cliOrgTokens)
      .where(eq(authSchema.cliOrgTokens.id, cliCredential.id));
    assert.ok(usedCliCredential.lastUsedAt);

    const tunnelAuthPost = (
      tunnelAuthRoute.Route.options.server as unknown as {
        handlers: {
          POST(input: { request: Request }): Promise<Response>;
        };
      }
    ).handlers.POST;
    const legacyCredential = {
      id: `secrets-security-legacy-${suffix}`,
      token: `outray_legacy_${crypto.randomUUID()}`,
      name: "Legacy tunnel integration token",
      organizationId,
      userId: ownerId,
      createdAt: now,
    };
    await db.insert(appSchema.authTokens).values(legacyCredential);
    const legacyResponse = await tunnelAuthPost({
      request: new Request(
        "http://tunnel.integration.invalid/api/tunnel/auth",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "203.0.113.10",
          },
          body: JSON.stringify({ token: legacyCredential.token }),
        },
      ),
    });
    const legacyPayload = (await legacyResponse.json()) as {
      valid?: unknown;
      organizationId?: unknown;
      tokenType?: unknown;
    };
    assert.equal(legacyResponse.status, 200);
    assert.equal(legacyPayload.valid, true);
    assert.equal(legacyPayload.organizationId, organizationId);
    assert.equal(legacyPayload.tokenType, "legacy");
    assert.equal(
      JSON.stringify(legacyPayload).includes(legacyCredential.token),
      false,
    );
    const [usedLegacyCredential] = await db
      .select({ lastUsedAt: appSchema.authTokens.lastUsedAt })
      .from(appSchema.authTokens)
      .where(eq(appSchema.authTokens.id, legacyCredential.id));
    assert.ok(usedLegacyCredential.lastUsedAt);
    const [backfilledLegacyCredential] = await db
      .select({
        tokenHash: secretsSchema.machineTokens.tokenHash,
        scopes: secretsSchema.machineTokens.scopes,
      })
      .from(secretsSchema.machineTokens)
      .where(
        and(
          eq(secretsSchema.machineTokens.organizationId, organizationId),
          eq(secretsSchema.machineTokens.name, legacyCredential.name),
        ),
      );
    assert.ok(backfilledLegacyCredential);
    assert.equal(
      backfilledLegacyCredential.tokenHash === legacyCredential.token,
      false,
    );
    assert.deepEqual(backfilledLegacyCredential.scopes, ["tunnel:connect"]);

    const tunnelMachineCredential = await governance.createSecretsMachineToken(
      owner,
      {
        name: "Machine tunnel integration token",
        scopes: ["tunnel:connect"],
        expiresIn: "30d",
      },
    );
    const tunnelMachineResponse = await tunnelAuthPost({
      request: new Request(
        "http://tunnel.integration.invalid/api/tunnel/auth",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": "203.0.113.10",
          },
          body: JSON.stringify({ token: tunnelMachineCredential.token }),
        },
      ),
    });
    const tunnelMachinePayload = (await tunnelMachineResponse.json()) as {
      valid?: unknown;
      organizationId?: unknown;
      tokenType?: unknown;
    };
    assert.equal(tunnelMachineResponse.status, 200);
    assert.equal(tunnelMachinePayload.valid, true);
    assert.equal(tunnelMachinePayload.organizationId, organizationId);
    assert.equal(tunnelMachinePayload.tokenType, "machine");
    await assert.rejects(
      () =>
        secretsAccess.requireSecretsAccess(
          bearerRequest(tunnelMachineCredential.token),
          organizationSlug,
          "secrets:read",
        ),
      hasCode("FORBIDDEN"),
    );

    const deleteToken = await governance.createSecretsMachineToken(owner, {
      name: "Delete-only token",
      scopes: ["secrets:delete"],
      projectSlug: "security-service",
      environmentSlug: "development",
      expiresIn: "30d",
    });
    const [storedDeleteToken] = await db
      .select()
      .from(secretsSchema.machineTokens)
      .where(eq(secretsSchema.machineTokens.id, deleteToken.machineToken.id));
    assert.ok(storedDeleteToken);
    assert.equal(
      accessPolicy.hasSecretsScope(storedDeleteToken.scopes, "secrets:delete"),
      true,
    );
    assert.equal(
      accessPolicy.hasSecretsScope(storedDeleteToken.scopes, "secrets:read"),
      false,
    );
    const deleteAccess: SecretsAccess = {
      organization: owner.organization,
      actor: {
        type: "machine",
        credential: "machine",
        id: storedDeleteToken.id,
        tokenId: storedDeleteToken.id,
        userId: null,
        role: null,
        projectId: storedDeleteToken.projectId,
        environmentId: storedDeleteToken.environmentId,
        scopes: storedDeleteToken.scopes,
      },
      requestMetadata: {
        requestId: `machine:${crypto.randomUUID()}`,
        ipAddress: "127.0.0.1",
        userAgent: "outray-machine-token-integration-test",
      },
    };
    await assert.rejects(
      () =>
        projects.createEnvironment(deleteAccess, "security-service", {
          name: "Machine tokens cannot manage containers",
        }),
      hasCode("FORBIDDEN"),
    );
    await entries.deleteSecret(
      deleteAccess,
      "security-service",
      "development",
      firstOrganizationSecret.secrets[0].id,
      { confirmation: "FIRST_ORG_ONLY", expectedRevision: 1 },
    );

    assert.notEqual(
      foreignSecret.secrets[0].id,
      firstOrganizationSecret.secrets[0].id,
    );
  },
);
