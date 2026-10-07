import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { assertActorScope } from "../src/lib/secrets/access-policy";
import { SecretsError, serializeSecretMetadata, type SecretsAccess } from "../src/lib/secrets/types";
import * as validation from "../src/lib/secrets/validation";

const access: SecretsAccess = {
  organization: { id: "org-1", slug: "acme", name: "Acme" },
  actor: { type: "user", credential: "session", id: "user-1", userId: "user-1", role: "owner", tokenId: null,
    projectId: null, environmentId: null, scopes: ["secrets:*"] },
  requestMetadata: { requestId: "reveal-test", ipAddress: null, userAgent: "Offline reveal test" },
};
const timestamp = new Date("2026-10-07T00:00:00Z");
const project = { id: "vault-1", slug: "api", name: "API" };
const environment = { id: "env-1", projectId: project.id, slug: "development", name: "Development", revision: 4 };
const entry = {
  id: "secret-1", organizationId: access.organization.id, projectId: project.id, environmentId: environment.id,
  key: "DEMO_KEY", description: "Offline dummy only", currentVersion: 1, createdAt: timestamp, updatedAt: timestamp,
};
const lockedEntry = { ...entry, key: "CURRENT_DEMO_KEY", currentVersion: 3 };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
type Call = { kind: string; input?: unknown };
type Predicate = { operation: string; arguments: unknown[] };
type Table = { table: string; id: string; deletedAt: string };
type RevealResult = { secret: ReturnType<typeof serializeSecretMetadata> & { value: string } };
type HarnessOptions = {
  missingLock?: "organization" | "project" | "environment" | "entry";
  resolutionError?: Error;
  versionError?: Error;
  decryptError?: Error;
  auditError?: Error;
  beforeAudit?: () => Promise<void>;
};

/** Run the real reveal function while making unexpected extra database calls fail. */
async function harness(options: HarnessOptions = {}) {
  const source = await readFile(new URL("../src/lib/secrets/entries.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const calls: Call[] = [];
  const unwrappedKeys: Buffer[] = [];
  const tables = {
    secretProjects: { table: "project", id: "project.id", deletedAt: "project.deletedAt" },
    secretEnvironments: { table: "environment", id: "environment.id", deletedAt: "environment.deletedAt" },
    secretEntries: { table: "entry", id: "entry.id", deletedAt: "entry.deletedAt" },
    secretVersions: { table: "version", id: "version.id", deletedAt: "version.deletedAt" },
    secretDeletionBatches: { table: "batch", id: "batch.id", deletedAt: "batch.deletedAt" },
  };
  const tx = {
    select(selection?: unknown) {
      let table: Table;
      let predicate: Predicate;
      const query = {
        from(value: Table) { table = value; return query; },
        where(value: Predicate) { predicate = value; return query; },
        async for(mode: string) {
          assert.equal(mode, "share", "reveals must never take exclusive mutation locks");
          const expected = table.table === "project" ? project.id : table.table === "environment" ? environment.id : entry.id;
          assert.deepEqual(predicate, {
            operation: "and", arguments: [
              { operation: "eq", arguments: [table.id, expected] },
              { operation: "isNull", arguments: [table.deletedAt] },
            ],
          });
          calls.push({ kind: `lock:${table.table}`, input: { mode, selection: clone(selection ?? null) } });
          if (options.missingLock === table.table) return [];
          if (table.table === "project") return [{ id: project.id }];
          if (table.table === "environment") return [{ id: environment.id }];
          if (table.table === "entry") return [{ ...lockedEntry }];
          throw new Error(`Unexpected reveal lock: ${table.table}`);
        },
      };
      return query;
    },
  };
  const database = {
    async resolveSecretForReveal(receivedAccess: SecretsAccess, projectSlug: string, environmentSlug: string, secretId: string) {
      assert.equal(receivedAccess, access);
      calls.push({ kind: "resolve", input: [projectSlug, environmentSlug, secretId] });
      if (options.resolutionError) throw options.resolutionError;
      return { project: { ...project }, environment: { ...environment }, entry: { ...entry } };
    },
    async lockOrganizationForRead(receivedTx: typeof tx, organizationId: string) {
      assert.equal(receivedTx, tx); assert.equal(organizationId, access.organization.id);
      calls.push({ kind: "lock:organization" });
      if (options.missingLock === "organization") throw new SecretsError("Organization not found", { code: "NOT_FOUND", status: 404 });
    },
    async transactionSecretVersionForReveal(receivedTx: typeof tx, organizationId: string, entryId: string, versionNumber: number) {
      assert.equal(receivedTx, tx);
      calls.push({ kind: "version-and-key", input: [organizationId, entryId, versionNumber] });
      if (options.versionError) throw options.versionError;
      const organizationKey = Buffer.alloc(32, 0x7a);
      unwrappedKeys.push(organizationKey);
      return {
        organizationKey,
        version: { id: `version-${versionNumber}`, organizationId, projectId: project.id, environmentId: environment.id,
          entryId, version: versionNumber, keySnapshot: `VERSION_${versionNumber}_KEY`, organizationKeyVersion: 2,
          ciphertext: "dummy-ciphertext", iv: "dummy-iv", authTag: "dummy-auth-tag" },
      };
    },
    async auditEvent(receivedTx: typeof tx, receivedAccess: SecretsAccess, event: unknown) {
      assert.equal(receivedTx, tx); assert.equal(receivedAccess, access);
      assert.equal(unwrappedKeys.length, 1);
      assert.ok(unwrappedKeys[0].every((byte) => byte === 0), "key must already be zeroed before auditing");
      calls.push({ kind: "audit", input: clone(event) });
      await options.beforeAudit?.();
      if (options.auditError) throw options.auditError;
    },
  };
  const module = { exports: {} as {
    revealSecret: (access: SecretsAccess, projectSlug: string, environmentSlug: string, secretId: string, input: Record<string, unknown>) => Promise<RevealResult>;
  } };
  runInNewContext(compiled, { Buffer, Error, Date, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "drizzle-orm") return {
        and: (...arguments_: unknown[]) => ({ operation: "and", arguments: arguments_ }),
        eq: (...arguments_: unknown[]) => ({ operation: "eq", arguments: arguments_ }),
        isNull: (...arguments_: unknown[]) => ({ operation: "isNull", arguments: arguments_ }),
      };
      if (specifier === "../../db") return { db: {
        async transaction(callback: (transaction: typeof tx) => Promise<RevealResult>) {
          calls.push({ kind: "begin" });
          try { const result = await callback(tx); calls.push({ kind: "commit" }); return result; }
          catch (error) { calls.push({ kind: "rollback" }); throw error; }
        },
      } };
      if (specifier === "../../db/secrets-schema") return tables;
      if (specifier === "./database") return database;
      if (specifier === "./access-policy") return { assertActorScope };
      if (specifier === "./types") return { SecretsError, serializeSecretMetadata };
      if (specifier === "./validation") return validation;
      if (specifier === "./crypto") return {
        decryptSecretValue(key: Buffer, input: unknown) {
          assert.equal(key, unwrappedKeys[0]); assert.ok(key.every((byte) => byte === 0x7a));
          calls.push({ kind: "decrypt", input: clone(input) });
          if (options.decryptError) throw options.decryptError;
          return "offline dummy plaintext";
        },
      };
      throw new Error(`Unexpected reveal dependency: ${specifier}`);
    },
  });
  return { calls, unwrappedKeys, reveal: (input: Record<string, unknown> = { intent: "reveal" }) =>
    module.exports.revealSecret(access, project.slug, environment.slug, entry.id, input) };
}

test("reveal preserves shared lock order and uses the locked current version rather than the stale initial read", async () => {
  const fixture = await harness();
  const result = await fixture.reveal();
  assert.deepEqual(fixture.calls.map((call) => call.kind), [
    "resolve", "begin", "lock:organization", "lock:project", "lock:environment", "lock:entry", "version-and-key", "decrypt", "audit", "commit",
  ]);
  assert.deepEqual(fixture.calls[0].input, ["api", "development", "secret-1"]);
  assert.deepEqual(fixture.calls.find((call) => call.kind === "version-and-key")?.input, ["org-1", "secret-1", 3]);
  assert.deepEqual(clone(result.secret), {
    id: lockedEntry.id, key: lockedEntry.key, description: lockedEntry.description, version: 3,
    createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString(), value: "offline dummy plaintext",
  });
  assert.ok(fixture.unwrappedKeys[0].every((byte) => byte === 0));
});

test("historical reveal selects the requested version and passes its complete encryption context to decryption", async () => {
  const fixture = await harness();
  const result = await fixture.reveal({ intent: "reveal", version: 1 });
  assert.equal(result.secret.version, 1);
  assert.deepEqual(fixture.calls.find((call) => call.kind === "version-and-key")?.input, ["org-1", "secret-1", 1]);
  assert.deepEqual(fixture.calls.find((call) => call.kind === "decrypt")?.input, {
    organizationId: "org-1", projectId: "vault-1", environmentId: "env-1", entryId: "secret-1", version: 1,
    keySnapshot: "VERSION_1_KEY", organizationKeyVersion: 2,
    ciphertext: "dummy-ciphertext", iv: "dummy-iv", authTag: "dummy-auth-tag",
  });
  const audit = fixture.calls.find((call) => call.kind === "audit")?.input as { metadata: { version: number; current: boolean } };
  assert.deepEqual(audit.metadata, { version: 1, current: false });
});

test("reveal and copy record the exact access audit action, locked key name, and version metadata", async () => {
  for (const intent of ["reveal", "copy"]) {
    const fixture = await harness();
    await fixture.reveal({ intent });
    assert.deepEqual(fixture.calls.find((call) => call.kind === "audit")?.input, {
      action: intent === "copy" ? "secret.copied" : "secret.revealed", targetType: "secret", targetId: entry.id,
      targetName: lockedEntry.key, projectId: project.id, environmentId: environment.id, entryId: entry.id,
      metadata: { version: 3, current: true },
    });
  }
});

for (const missingLock of ["organization", "project", "environment", "entry"] as const) {
  test(`deletion of the ${missingLock} aborts before fetching keys, decrypting or recording successful access`, async () => {
    const fixture = await harness({ missingLock });
    await assert.rejects(fixture.reveal(), (error: unknown) => error instanceof SecretsError && error.status === 404);
    assert.equal(fixture.calls.at(-1)?.kind, "rollback");
    assert.ok(!fixture.calls.some((call) => ["version-and-key", "decrypt", "audit", "commit"].includes(call.kind)));
    assert.equal(fixture.unwrappedKeys.length, 0);
  });
}

test("lookup and version failures cannot release plaintext or create successful audit records", async () => {
  for (const failure of ["resolutionError", "versionError"] as const) {
    const error = new SecretsError("Resource not found", { code: "NOT_FOUND", status: 404 });
    const fixture = await harness({ [failure]: error });
    await assert.rejects(fixture.reveal(), (received: unknown) => received === error);
    assert.ok(!fixture.calls.some((call) => ["decrypt", "audit", "commit"].includes(call.kind)));
    assert.equal(fixture.unwrappedKeys.length, 0);
    assert.equal(fixture.calls.at(-1)?.kind, failure === "resolutionError" ? "resolve" : "rollback");
  }
});

test("decryption failure still zeroes the unwrapped key and rolls back without an audit or success", async () => {
  const error = new Error("Dummy authentication-tag failure");
  const fixture = await harness({ decryptError: error });
  await assert.rejects(fixture.reveal(), (received: unknown) => received === error);
  assert.ok(fixture.unwrappedKeys[0].every((byte) => byte === 0));
  assert.ok(!fixture.calls.some((call) => ["audit", "commit"].includes(call.kind)));
  assert.equal(fixture.calls.at(-1)?.kind, "rollback");
});

test("audit insertion failure prevents a successful reveal even after decryption and key zeroing", async () => {
  const error = new Error("Dummy audit storage unavailable");
  const fixture = await harness({ auditError: error });
  await assert.rejects(fixture.reveal(), (received: unknown) => received === error);
  assert.ok(fixture.unwrappedKeys[0].every((byte) => byte === 0));
  assert.equal(fixture.calls.at(-1)?.kind, "rollback");
  assert.ok(!fixture.calls.some((call) => call.kind === "commit"));
});

test("transaction commit and plaintext response wait for audit insertion to complete", async () => {
  let finishAudit!: () => void;
  const auditPending = new Promise<void>((resolve) => { finishAudit = resolve; });
  const fixture = await harness({ beforeAudit: () => auditPending });
  let settled = false;
  const result = fixture.reveal().then((value) => { settled = true; return value; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(fixture.calls.at(-1)?.kind, "audit"); assert.equal(settled, false);
  assert.ok(!fixture.calls.some((call) => call.kind === "commit"));
  finishAudit();
  assert.equal((await result).secret.value, "offline dummy plaintext");
  assert.equal(fixture.calls.at(-1)?.kind, "commit");
});

test("invalid intent and version inputs never begin a plaintext transaction", async () => {
  const inputs = [
    {}, { intent: "export" }, { intent: "reveal", version: 0 }, { intent: "copy", version: -1 },
    { intent: "reveal", version: 1.5 }, { intent: "copy", version: "1" }, { intent: "reveal", version: null },
  ];
  for (const input of inputs) {
    const fixture = await harness();
    await assert.rejects(fixture.reveal(input), (error: unknown) => error instanceof SecretsError && error.status === 400);
    assert.ok(!fixture.calls.some((call) => call.kind === "begin"));
    assert.equal(fixture.unwrappedKeys.length, 0);
  }
});
