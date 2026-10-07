import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as orm from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import * as authSchema from "../src/db/auth-schema";
import * as schema from "../src/db/secrets-schema";
import * as policy from "../src/lib/secrets/access-policy";
import * as cryptoHelpers from "../src/lib/secrets/crypto";
import * as types from "../src/lib/secrets/types";
import type { SecretsAccess } from "../src/lib/secrets/types";

const access: SecretsAccess = {
  organization: { id: "org-a", name: "Demo", slug: "demo" },
  actor: {
    type: "user", credential: "session", id: "user-a", userId: "user-a",
    role: "owner", tokenId: null, projectId: null, environmentId: null,
    scopes: ["secrets:*"],
  },
  requestMetadata: { ipAddress: null, userAgent: null, requestId: "test" },
};
const project = { id: "vault-a", organizationId: "org-a", slug: "vault" };
const environment = { id: "env-a", organizationId: "org-a", projectId: "vault-a", slug: "development" };
const entry = { id: "secret-a", organizationId: "org-a", projectId: "vault-a", environmentId: "env-a", currentVersion: 3 };
const master = { id: "test-master", key: Buffer.alloc(32, 0x53) };
const keyring = { active: master, previous: [] };

type Row = Record<string, unknown> | null;
type CapturedQuery = { sql: string; params: unknown[] };

/** Exercise real Drizzle SQL and LEFT JOIN mapping without any network client. */
async function loadDatabase() {
  const queries: CapturedQuery[] = [];
  const responses: unknown[][][] = [];
  const client = {
    async query(config: { text: string; rowMode?: string }, params: unknown[]) {
      assert.equal(config.rowMode, "array");
      queries.push({ sql: config.text, params });
      assert.ok(responses.length, "every query must have an explicit fake response");
      return { rows: responses.shift()! };
    },
  };
  const db = drizzle(client as any);
  const source = await readFile(new URL("../src/lib/secrets/database.ts", import.meta.url), "utf8");
  const module = { exports: {} as any };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "drizzle-orm") return orm;
      if (specifier === "../../db") return { db };
      if (specifier === "../../db/auth-schema") return authSchema;
      if (specifier === "../../db/secrets-schema") return schema;
      if (specifier === "./access-policy") return policy;
      if (specifier === "./types") return types;
      if (specifier === "./crypto") return { ...cryptoHelpers, readSecretsKeyring: () => keyring };
      throw new Error(`Unexpected database helper dependency: ${specifier}`);
    },
  });
  function respond(selections?: Array<[PgTable, Row]>) {
    responses.push(selections ? [selections.flatMap(([table, row]) =>
      Object.keys(orm.getTableColumns(table)).map((key) => row?.[key] ?? null),
    )] : []);
  }
  return { helpers: module.exports, db, queries, respond };
}

function contextRows(projectRow: Row = project, environmentRow: Row = environment, entryRow: Row = entry): Array<[PgTable, Row]> {
  return [[schema.secretProjects, projectRow], [schema.secretEnvironments, environmentRow], [schema.secretEntries, entryRow]];
}

function hasError(message: string, status: number, code = "NOT_FOUND") {
  return (error: unknown) => error instanceof types.SecretsError &&
    error.message === message && error.status === status && error.code === code;
}

function machine(projectId: string, environmentId: string): SecretsAccess {
  return { ...access, actor: { ...access.actor, type: "machine", credential: "machine", role: null, projectId, environmentId } };
}

test("reveal context takes one query with tenant, hierarchy, and soft-delete guards", async () => {
  const { helpers, queries, respond } = await loadDatabase();
  respond(contextRows());
  const result = await helpers.resolveSecretForReveal(access, "vault", "development", "secret-a");
  assert.equal(result.project.id, project.id);
  assert.equal(result.environment.id, environment.id);
  assert.equal(result.entry.id, entry.id);
  assert.equal(queries.length, 1);
  const { sql, params } = queries[0];
  assert.equal((sql.match(/left join/g) ?? []).length, 2);
  assert.match(sql, /"secret_environments"\."organization_id" = \$\d+/);
  assert.match(sql, /"secret_environments"\."project_id" = "secret_projects"\."id"/);
  assert.match(sql, /"secret_environments"\."slug" = \$\d+/);
  assert.match(sql, /"secret_environments"\."deleted_at" is null/);
  assert.match(sql, /"secret_entries"\."id" = \$\d+/);
  assert.match(sql, /"secret_entries"\."organization_id" = \$\d+/);
  assert.match(sql, /"secret_entries"\."project_id" = "secret_projects"\."id"/);
  assert.match(sql, /"secret_entries"\."environment_id" = "secret_environments"\."id"/);
  assert.match(sql, /"secret_entries"\."deleted_at" is null/);
  assert.match(sql, /where \("secret_projects"\."organization_id" = \$\d+ and "secret_projects"\."slug" = \$\d+ and "secret_projects"\."deleted_at" is null\)/);
  assert.equal(params.filter((value) => value === access.organization.id).length, 3);
  assert.ok(params.includes("vault") && params.includes("development") && params.includes("secret-a"));
  assert.doesNotMatch(sql, /ciphertext|wrapped_key|secret_versions|secret_organization_keys/);
});

test("joined metadata keeps distinct vault, environment, and secret missing errors", async () => {
  const { helpers, queries, respond } = await loadDatabase();
  respond();
  await assert.rejects(helpers.resolveSecretForReveal(access, "missing", "development", "secret-a"), hasError("Vault not found", 404));
  respond(contextRows(project, null, null));
  await assert.rejects(helpers.resolveSecretForReveal(access, "vault", "missing", "secret-a"), hasError("Environment not found", 404));
  respond(contextRows(project, environment, null));
  await assert.rejects(helpers.resolveSecretForReveal(access, "vault", "development", "missing"), hasError("Secret not found", 404));
  assert.equal(queries.length, 3);
});

test("machine vault scope is checked before an environment or entry is reported missing", async () => {
  const { helpers, respond } = await loadDatabase();
  respond(contextRows(project, null, null));
  await assert.rejects(helpers.resolveSecretForReveal(machine("different-vault", "env-a"), "vault", "development", "secret-a"),
    hasError("Machine token is not scoped to this vault", 403, "FORBIDDEN"));
});

test("machine environment scope is checked before missing entry and allowed scopes succeed", async () => {
  const { helpers, respond } = await loadDatabase();
  respond(contextRows(project, environment, null));
  await assert.rejects(helpers.resolveSecretForReveal(machine("vault-a", "different-env"), "vault", "development", "secret-a"),
    hasError("Machine token is not scoped to this environment", 403, "FORBIDDEN"));
  respond(contextRows());
  const result = await helpers.resolveSecretForReveal(machine("vault-a", "env-a"), "vault", "development", "secret-a");
  assert.equal(result.entry.id, "secret-a");
});

function versionRows(versionRow: Row, organizationKeyRow: Row): Array<[PgTable, Row]> {
  return [[schema.secretVersions, versionRow], [schema.secretOrganizationKeys, organizationKeyRow]];
}

test("encrypted version and retired wrapped key are read in one tenant-scoped query", async () => {
  const { helpers, db, respond, queries } = await loadDatabase();
  const organizationKey = Buffer.alloc(32, 0x28);
  const wrapped = cryptoHelpers.wrapOrganizationKey("org-a", 2, organizationKey, master);
  const version = { id: "version-a", organizationId: "org-a", entryId: "secret-a", version: 1, organizationKeyVersion: 2 };
  const keyRow = {
    id: "key-a", organizationId: "org-a", version: 2, status: "retired",
    wrappedKey: wrapped.ciphertext, iv: wrapped.iv, authTag: wrapped.authTag,
    wrappingKeyId: wrapped.wrappingKeyId, algorithm: wrapped.algorithm,
  };
  respond(versionRows(version, keyRow));
  const result = await helpers.transactionSecretVersionForReveal(db, "org-a", "secret-a", 1);
  try {
    assert.equal(result.version.id, "version-a");
    assert.equal(result.version.version, 1);
    assert.deepEqual(result.organizationKey, organizationKey);
    assert.equal(queries.length, 1);
    const { sql, params } = queries[0];
    assert.match(sql, /left join "secret_organization_keys"/);
    assert.match(sql, /"secret_organization_keys"\."organization_id" = \$\d+/);
    assert.match(sql, /"secret_organization_keys"\."version" = "secret_versions"\."organization_key_version"/);
    assert.match(sql, /where \("secret_versions"\."organization_id" = \$\d+ and "secret_versions"\."entry_id" = \$\d+ and "secret_versions"\."version" = \$\d+\)/);
    assert.doesNotMatch(sql.slice(sql.indexOf(" from ")), /"status"/);
    assert.equal(params.filter((value) => value === "org-a").length, 2);
    assert.ok(params.includes("secret-a") && params.includes(1));
  } finally { result.organizationKey.fill(0); organizationKey.fill(0); }
});

test("missing encrypted version remains 404 and missing wrapped key remains 503", async () => {
  const { helpers, db, respond, queries } = await loadDatabase();
  respond();
  await assert.rejects(helpers.transactionSecretVersionForReveal(db, "org-a", "secret-a", 5), hasError("Secret version not found", 404));
  respond(versionRows({ id: "version-a", organizationId: "org-a", entryId: "secret-a", version: 1, organizationKeyVersion: 2 }, null));
  await assert.rejects(helpers.transactionSecretVersionForReveal(db, "org-a", "secret-a", 1), hasError("Secret organization key version not found", 503, "SECRETS_KEY_UNAVAILABLE"));
  assert.equal(queries.length, 2);
});

test("corrupt wrapped key rejects instead of returning a value", async () => {
  const { helpers, db, respond } = await loadDatabase();
  const organizationKey = Buffer.alloc(32, 0x28);
  const wrapped = cryptoHelpers.wrapOrganizationKey("org-a", 2, organizationKey, master);
  const tag = Buffer.from(wrapped.authTag, "base64");
  tag[0] ^= 1;
  respond(versionRows({ id: "version-a", organizationId: "org-a", entryId: "secret-a", version: 1, organizationKeyVersion: 2 }, {
    id: "key-a", organizationId: "org-a", version: 2,
    wrappedKey: wrapped.ciphertext, iv: wrapped.iv, authTag: tag.toString("base64"), wrappingKeyId: wrapped.wrappingKeyId,
  }));
  await assert.rejects(helpers.transactionSecretVersionForReveal(db, "org-a", "secret-a", 1),
    (error: unknown) => error instanceof types.SecretsError && error.code === "SECRETS_DECRYPTION_FAILED");
  organizationKey.fill(0);
});
