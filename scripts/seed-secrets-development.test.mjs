import assert from "node:assert/strict";
import test from "node:test";
import { assertDevelopmentDatabase, buildDemoSecrets, developmentClientOptions, seedDemoSecrets } from "./seed-secrets-development.mjs";
import pg from "pg";
import { createOrganizationKey, decryptSecretValue, unwrapOrganizationKey, wrapOrganizationKey } from "../apps/web/src/lib/secrets/crypto.ts";

const organizationId = "seed-test-outray-tunnel";
const projectId = "seed-test-vault";
const keyring = { active: { id: "test-active", key: Buffer.alloc(32, 17) }, previous: [{ id: "test-previous", key: Buffer.alloc(32, 29) }] };
const environment = { id: "seed-test-development", organization_id: organizationId, project_id: projectId, slug: "development", revision: 41, updated_at: "preserve-existing-time", deleted_at: null };

test("connection routing and public schema do not inherit PGPORT or PGOPTIONS", () => {
  const previousPort = process.env.PGPORT;
  const previousOptions = process.env.PGOPTIONS;
  process.env.PGPORT = "65000";
  process.env.PGOPTIONS = "-c search_path=untrusted";
  try {
    const config = { DATABASE_URL: "postgresql://localhost/demo" };
    const client = new pg.Client(developmentClientOptions(config, assertDevelopmentDatabase(config)));
    assert.equal(client.connectionParameters.port, 5432);
    assert.equal(client.connectionParameters.host, "localhost");
    assert.equal(client.connectionParameters.database, "demo");
    assert.equal(client.connectionParameters.options, "-c search_path=public");
    const explicit = { DATABASE_URL: "postgresql://postgres-dev.example.test:5433/demo" };
    const remote = new pg.Client(developmentClientOptions(explicit, assertDevelopmentDatabase(explicit)));
    assert.equal(remote.connectionParameters.port, 5433);
  } finally {
    if (previousPort === undefined) delete process.env.PGPORT; else process.env.PGPORT = previousPort;
    if (previousOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = previousOptions;
  }
});

function wrappedKey(version = 3, master = keyring.previous[0], status = "active") {
  const key = createOrganizationKey();
  try {
    const wrapped = wrapOrganizationKey(organizationId, version, key, master);
    return { id: `test-key-${version}`, organization_id: organizationId, version, status,
      wrapped_key: wrapped.ciphertext, iv: wrapped.iv, auth_tag: wrapped.authTag, wrapping_key_id: wrapped.wrappingKeyId, algorithm: wrapped.algorithm };
  } finally { key.fill(0); }
}

/** Database-shaped in-memory client; imports and tests never open a connection. */
function mockClient({ missingOrganization = false, missingProject = false, environments = [environment], entries = [], versions = [], keys = [], failVersion = false, corruptStoredVersion = false } = {}) {
  let state = { environments: structuredClone(environments), entries: structuredClone(entries), versions: structuredClone(versions), keys: structuredClone(keys), audits: [] };
  let transaction;
  const calls = [];
  return {
    calls,
    get state() { return state; },
    async query(rawSql, values = []) {
      const sql = rawSql.replace(/\s+/g, " ").trim();
      calls.push({ sql, values: [...values] });
      if (sql === "BEGIN") { transaction = structuredClone(state); return { rows: [] }; }
      if (sql === "ROLLBACK") { state = transaction; return { rows: [] }; }
      if (sql === "COMMIT" || sql.startsWith("SET LOCAL ")) return { rows: [] };
      if (sql.startsWith("SELECT id FROM organizations")) {
        assert.deepEqual(values, ["outray-tunnel"]);
        assert.match(sql, /FOR UPDATE$/);
        return { rows: missingOrganization ? [] : [{ id: organizationId }] };
      }
      if (sql.startsWith("SELECT id FROM secret_projects")) {
        assert.deepEqual(values, [organizationId, "vault"]);
        assert.match(sql, /organization_id = \$1.*deleted_at IS NULL.*FOR UPDATE/);
        return { rows: missingProject ? [] : [{ id: projectId }] };
      }
      if (sql.startsWith("SELECT id, slug, revision FROM secret_environments")) {
        assert.deepEqual(values, [organizationId, projectId, ["development", "staging", "production"]]);
        assert.match(sql, /organization_id = \$1 AND project_id = \$2.*deleted_at IS NULL.*FOR UPDATE/);
        return { rows: state.environments.filter((row) => row.organization_id === values[0] && row.project_id === values[1] && values[2].includes(row.slug) && !row.deleted_at) };
      }
      if (sql.startsWith("SELECT key FROM secret_entries")) {
        assert.match(sql, /organization_id = \$1 AND project_id = \$2 AND environment_id = \$3/);
        assert.doesNotMatch(sql, /deleted_at IS NULL/, "Trash entries must also block resurrecting fixture keys");
        return { rows: state.entries.filter((row) => row.organization_id === values[0] && row.project_id === values[1] && row.environment_id === values[2]).map(({ key }) => ({ key })) };
      }
      if (sql.startsWith("SELECT * FROM secret_organization_keys")) {
        assert.deepEqual(values, [organizationId]);
        return { rows: state.keys.filter((row) => row.organization_id === values[0] && row.status === "active") };
      }
      if (sql.startsWith("SELECT COALESCE(MAX(version)")) {
        return { rows: [{ version: Math.max(0, ...state.keys.filter((row) => row.organization_id === values[0]).map((row) => row.version)) + 1 }] };
      }
      if (sql.startsWith("INSERT INTO secret_organization_keys")) {
        state.keys.push({ id: values[0], organization_id: values[1], version: values[2], status: "active", wrapped_key: values[3], iv: values[4], auth_tag: values[5], wrapping_key_id: values[6], algorithm: values[7] });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO secret_entries")) {
        state.entries.push({ id: values[0], organization_id: values[1], project_id: values[2], environment_id: values[3], key: values[4], description: values[5], current_version: 1, deleted_at: null });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO secret_versions")) {
        if (failVersion) throw new Error("Synthetic version insert failure");
        state.versions.push({ id: values[0], organization_id: values[1], entry_id: values[2], project_id: values[3], environment_id: values[4], key_snapshot: values[5], organization_key_version: values[6], version: 1,
          ciphertext: values[7], iv: values[8], auth_tag: values[9], algorithm: values[10], value_digest: values[11], created_by_type: "system", source: "import" });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT ciphertext, iv, auth_tag FROM secret_versions")) {
        const stored = state.versions.find((row) => row.entry_id === values[0] && row.version === 1);
        return { rows: stored ? [{ ...stored, ...(corruptStoredVersion ? { auth_tag: Buffer.alloc(16).toString("base64") } : {}) }] : [] };
      }
      if (sql.startsWith("UPDATE secret_environments")) {
        const row = state.environments.find((item) => item.id === values[0] && item.organization_id === values[1]);
        assert.ok(row);
        row.revision = Number(row.revision) + 1; row.updated_at = "seed-update-time";
        return { rows: [{ revision: String(row.revision) }], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO secret_audit_events")) {
        state.audits.push({ id: values[0], organization_id: values[1], project_id: values[2], environment_id: values[3], request_id: values[4], target_name: values[5], metadata: JSON.parse(values[6]), actor_type: "system", actor_credential: "system", action: "secrets.imported", result: "success" });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected mocked seed statement: ${sql}`);
    },
  };
}

function existingEntry(key, overrides = {}) {
  return { id: `existing-${key}`, organization_id: organizationId, project_id: projectId, environment_id: environment.id,
    key, current_version: 7, description: "User-maintained", deleted_at: null, updated_at: "preserve-user-time", ...overrides };
}

test("development guard allows explicit development targets but rejects production and misleading hosts", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "postgres-dev.example.test", "db.development.example.test"]) {
    assert.doesNotThrow(() => assertDevelopmentDatabase({ DATABASE_URL: `postgresql://${host}/demo`, NODE_ENV: "development" }));
  }
  for (const url of [undefined, "invalid", "https://localhost/demo", "postgresql://production.example.test/demo", "postgresql://devil.example.test/demo", "postgresql://mydevelopmentserver.example.test/demo", "postgresql://127x0x0x1/demo"]) {
    assert.throws(() => assertDevelopmentDatabase({ DATABASE_URL: url }), /development DATABASE_URL|non-development database/);
  }
  assert.throws(() => assertDevelopmentDatabase({ DATABASE_URL: "postgresql://localhost/demo", NODE_ENV: "production" }), /production mode/);
  assert.throws(() => assertDevelopmentDatabase({ DATABASE_URL: "postgresql://localhost" }), /explicit development database name/);
  assert.throws(() => assertDevelopmentDatabase({ DATABASE_URL: "postgresql://localhost/" }), /explicit development database name/);
});

test("development guard fails closed on connection-routing overrides and equivalent production targets", () => {
  for (const key of ["host", "hostaddr", "port", "dbname", "database", "service", "servicefile", "options", "HOST"]) {
    assert.throws(() => assertDevelopmentDatabase({ DATABASE_URL: `postgresql://localhost/demo?${key}=production-target` }), /routing overrides/);
  }
  const development = { DATABASE_URL: "postgresql://demo:fake@localhost/demo?sslmode=disable" };
  for (const url of ["postgresql://other:fake@LOCALHOST:5432/demo", "postgresql://localhost/%64emo", "postgresql://decoy.example.test/demo?host=localhost&port=5432"]) {
    assert.throws(() => assertDevelopmentDatabase(development, { DATABASE_URL: url }), /matches production/);
  }
  assert.doesNotThrow(() => assertDevelopmentDatabase(development, { DATABASE_URL: "postgresql://localhost/another_database" }));
  assert.throws(() => assertDevelopmentDatabase(development, { DATABASE_URL: "invalid-production-url" }), /valid database URLs/);
});

test("fixture values are obviously synthetic, environment-specific, and never runtime credentials", () => {
  for (const slug of ["development", "staging", "production"]) {
    const fixtures = buildDemoSecrets(slug);
    assert.equal(Object.keys(fixtures).length, 24);
    assert.ok(Object.keys(fixtures).every((key) => /^[A-Z_][A-Z0-9_]*$/.test(key)));
    assert.ok(Object.values(fixtures).every((value) => typeof value === "string"));
    assert.match(fixtures.DATABASE_URL, new RegExp(`postgres\\.${slug}\\.example\\.invalid`));
    assert.match(fixtures.DATABASE_URL, /demo-only-password/);
    assert.match(fixtures.INTERNAL_API_KEY, /not_a_real_key/);
    assert.match(fixtures.SERVICE_ACCOUNT_JSON, /not a real private key/);
    assert.equal(JSON.parse(fixtures.FEATURE_FLAGS).demo, true);
    assert.equal(fixtures.NODE_ENV, slug === "production" ? "production" : "development");
  }
  assert.throws(() => buildDemoSecrets("user-environment"), /Unsupported demo environment/);
});

test("seed writes only the selected organization/vault/environment, encrypts every inserted value, and audits one revision bump", async () => {
  const foreign = { ...environment, id: "foreign-environment", organization_id: "another-org", project_id: "another-project", slug: "production" };
  const client = mockClient({ environments: [environment, foreign] });
  const summary = await seedDemoSecrets(client, keyring);
  assert.deepEqual(summary, [{ environment: "development", created: 24, skipped: 0 }]);
  assert.equal(client.state.entries.length, 24);
  assert.equal(client.state.versions.length, 24);
  assert.equal(client.state.keys.length, 1);
  assert.equal(client.state.environments[0].revision, 42);
  assert.deepEqual(client.state.environments[1], foreign);
  assert.equal(client.state.audits.length, 1);
  assert.deepEqual(client.state.audits[0].metadata, { seeded: true, created: 24, updated: 0, environmentRevision: 42 });
  assert.equal(client.state.audits[0].actor_type, "system");
  assert.equal(client.state.audits[0].actor_credential, "system");
  assert.equal(client.state.audits[0].action, "secrets.imported");
  const row = client.state.keys[0];
  const dataKey = unwrapOrganizationKey(organizationId, { ciphertext: row.wrapped_key, iv: row.iv, authTag: row.auth_tag, wrappingKeyId: row.wrapping_key_id, organizationKeyVersion: row.version, algorithm: row.algorithm }, keyring);
  try {
    for (const version of client.state.versions) {
      const entry = client.state.entries.find((item) => item.id === version.entry_id);
      assert.equal(entry.current_version, 1);
      assert.equal(version.organization_id, organizationId);
      assert.equal(version.project_id, projectId);
      assert.equal(version.environment_id, environment.id);
      assert.equal(version.source, "import");
      assert.equal(version.created_by_type, "system");
      assert.equal(version.algorithm, "AES-256-GCM");
      assert.match(version.value_digest, /^[a-f0-9]{64}$/);
      assert.notEqual(version.ciphertext, buildDemoSecrets("development")[entry.key]);
      assert.equal(decryptSecretValue(dataKey, { organizationId, projectId, environmentId: environment.id, entryId: entry.id, version: 1, keySnapshot: entry.key, organizationKeyVersion: row.version,
        ciphertext: version.ciphertext, iv: version.iv, authTag: version.auth_tag }), buildDemoSecrets("development")[entry.key]);
    }
  } finally { dataKey.fill(0); }
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  assert.ok(!client.calls.some(({ sql }) => /\b(?:DELETE|TRUNCATE|DROP|ALTER)\b|UPDATE secret_entries|UPDATE secret_versions/.test(sql)));
  assert.doesNotMatch(JSON.stringify(client.state.audits), /demo-only-password|private_key|ciphertext/);
});

test("existing and deleted user keys/versions are preserved and a rerun is a complete no-op", async () => {
  const entries = [existingEntry("APP_NAME"), existingEntry("DATABASE_URL", { deleted_at: "2026-10-01T00:00:00Z" })];
  const versions = entries.map((entry) => ({ id: `user-version-${entry.id}`, entry_id: entry.id, version: 7, ciphertext: "preserve-user-ciphertext" }));
  const client = mockClient({ entries, versions, keys: [wrappedKey()] });
  const preservedKey = structuredClone(client.state.keys[0]);
  const first = await seedDemoSecrets(client, keyring);
  assert.deepEqual(first, [{ environment: "development", created: 22, skipped: 2 }]);
  assert.deepEqual(client.state.entries.slice(0, 2), entries);
  assert.deepEqual(client.state.versions.slice(0, 2), versions);
  assert.deepEqual(client.state.keys, [preservedKey], "active key wrapped with a previous master key is reused, never rotated");
  assert.ok(client.state.versions.slice(2).every((version) => version.organization_key_version === 3));
  assert.equal(client.state.environments[0].revision, 42);
  const before = structuredClone(client.state);
  const callCount = client.calls.length;
  const second = await seedDemoSecrets(client, keyring);
  assert.deepEqual(second, [{ environment: "development", created: 0, skipped: 24 }]);
  assert.deepEqual(client.state, before, "no-op rerun preserves ciphertext, versions, keys, audits, revisions, timestamps, and deletion state");
  assert.ok(!client.calls.slice(callCount).some(({ sql }) => /^(?:INSERT|UPDATE|DELETE)\b|FROM secret_organization_keys/.test(sql)));
});

test("fully populated or trashed fixture keys skip without allocating a key or changing revisions", async () => {
  const entries = Object.keys(buildDemoSecrets("development")).map((key, index) => existingEntry(key, { deleted_at: index % 2 ? "2026-10-01T00:00:00Z" : null }));
  const client = mockClient({ entries });
  const before = structuredClone(client.state);
  assert.deepEqual(await seedDemoSecrets(client, keyring), [{ environment: "development", created: 0, skipped: 24 }]);
  assert.deepEqual(client.state, before);
  assert.ok(!client.calls.some(({ sql }) => /^(?:INSERT|UPDATE|DELETE)\b|FROM secret_organization_keys/.test(sql)));
});

test("a missing active organization key allocates max historical version plus one without touching retired keys", async () => {
  const retired = wrappedKey(5, keyring.previous[0], "retired");
  const client = mockClient({ keys: [retired] });
  await seedDemoSecrets(client, keyring);
  assert.deepEqual(client.state.keys[0], retired);
  assert.equal(client.state.keys[1].version, 6);
  assert.equal(client.state.keys[1].status, "active");
  assert.equal(client.state.keys[1].wrapping_key_id, keyring.active.id);
  assert.ok(client.state.versions.every((version) => version.organization_key_version === 6));
});

test("organization/vault/active-environment isolation failures roll back before data writes", async () => {
  for (const options of [{ missingOrganization: true }, { missingProject: true }, { environments: [{ ...environment, organization_id: "another-org" }] }, { environments: [{ ...environment, deleted_at: "2026-10-01T00:00:00Z" }] }]) {
    const client = mockClient(options);
    const before = structuredClone(client.state);
    await assert.rejects(seedDemoSecrets(client, keyring), /not found|No demo-target environments/);
    assert.deepEqual(client.state, before);
    assert.equal(client.calls.at(-1).sql, "ROLLBACK");
    assert.ok(!client.calls.some(({ sql }) => /^(?:INSERT|UPDATE|DELETE)\b/.test(sql)));
  }
});

test("insert or encryption-verification failure rolls back metadata/key/version writes with no audit or revision drift", async () => {
  for (const options of [{ failVersion: true }, { corruptStoredVersion: true }]) {
    const client = mockClient(options);
    const before = structuredClone(client.state);
    await assert.rejects(seedDemoSecrets(client, keyring), /insert failure|authentication failed|encryption verification/);
    assert.deepEqual(client.state, before);
    assert.equal(client.calls.at(-1).sql, "ROLLBACK");
    assert.ok(client.calls.some(({ sql }) => sql.startsWith("INSERT INTO secret_entries")));
    assert.ok(!client.calls.some(({ sql }) => sql.startsWith("UPDATE secret_environments") || sql.startsWith("INSERT INTO secret_audit_events")));
  }
});
