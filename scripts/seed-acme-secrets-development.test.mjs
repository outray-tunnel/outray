import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACME_SECRET_VAULTS, buildAcmeSecretValues, seedAcmeSecrets } from "./seed-acme-secrets-development.mjs";
import { createOrganizationKey, decryptSecretValue, unwrapOrganizationKey, wrapOrganizationKey } from "../apps/web/src/lib/secrets/crypto.ts";

const organizationId = "unit-test-acme";
const now = Date.parse("2026-10-08T14:00:00.000Z");
const keyring = { active: { id: "fixture-master", key: Buffer.alloc(32, 17) }, previous: [{ id: "older-fixture-master", key: Buffer.alloc(32, 29) }] };
const tableNames = ["secret_projects", "secret_environments", "secret_entries", "secret_versions", "secret_deletion_batches", "secret_share_links", "secret_share_ownership", "secret_audit_events", "secret_organization_keys"];

/** Test-only database shape. No pg client, environment read, connection, or network request. */
function memoryClient({ acmeExists = true, failTable, tables = {} } = {}) {
  let state = Object.fromEntries(tableNames.map((table) => [table, structuredClone(tables[table] ?? [])]));
  let before;
  const calls = [];
  return { calls, get state() { return state; }, async query(raw, values = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    calls.push({ sql, values: structuredClone(values) });
    if (sql === "BEGIN") { before = structuredClone(state); return { rows: [] }; }
    if (sql === "ROLLBACK") { state = before; return { rows: [] }; }
    if (sql === "COMMIT" || sql.startsWith("SET LOCAL ")) return { rows: [] };
    if (sql.startsWith("SELECT id FROM organizations")) {
      assert.equal(sql, "SELECT id FROM organizations WHERE id = $1 AND slug = 'acme' FOR UPDATE");
      assert.deepEqual(values, [organizationId]);
      return { rows: acmeExists ? [{ id: organizationId }] : [] };
    }
    if (sql.startsWith("SELECT id, slug FROM secret_projects")) {
      assert.match(sql, /organization_id = \$1 AND slug = ANY\(\$2::text\[\]\) FOR UPDATE$/);
      assert.doesNotMatch(sql, /deleted_at IS NULL/, "deleted fixture vaults must not be resurrected on a rerun");
      assert.equal(values[0], organizationId);
      return { rows: state.secret_projects.filter((row) => row.organization_id === values[0] && values[1].includes(row.slug)).map(({ id, slug }) => ({ id, slug })) };
    }
    if (sql.startsWith("SELECT * FROM secret_organization_keys")) {
      assert.deepEqual(values, [organizationId]);
      return { rows: state.secret_organization_keys.filter((row) => row.organization_id === values[0] && row.status === "active") };
    }
    if (sql.startsWith("SELECT COALESCE(MAX(version)")) return { rows: [{ version: Math.max(0, ...state.secret_organization_keys.filter((row) => row.organization_id === values[0]).map((row) => row.version)) + 1 }] };
    if (sql.startsWith("INSERT INTO secret_organization_keys")) {
      state.secret_organization_keys.push({ id: values[0], organization_id: values[1], version: values[2], status: "active",
        wrapped_key: values[3], iv: values[4], auth_tag: values[5], wrapping_key_id: values[6], algorithm: values[7] });
      return { rows: [], rowCount: 1 };
    }
    const table = sql.match(/^INSERT INTO (\w+) /)?.[1];
    if (table && tableNames.includes(table)) {
      assert.match(sql, /FROM jsonb_to_recordset\(\$1::jsonb\) AS fixture /);
      assert.equal(values.length, 1);
      if (table === failTable) throw new Error("Synthetic batch insert failure");
      const rows = JSON.parse(values[0]);
      assert.ok(rows.length <= 500, "large histories use bounded batches");
      state[table].push(...rows);
      return { rows: [], rowCount: rows.length };
    }
    throw new Error(`Unexpected unit-test query: ${sql}`);
  } };
}

function dataKey(state) {
  const key = state.secret_organization_keys.find((row) => row.status === "active" && row.organization_id === organizationId);
  return unwrapOrganizationKey(organizationId, { ciphertext: key.wrapped_key, iv: key.iv, authTag: key.auth_tag,
    wrappingKeyId: key.wrapping_key_id, organizationKeyVersion: key.version, algorithm: key.algorithm }, keyring);
}

test("every vault/environment has 96 diverse fake secrets and reserved integration targets", () => {
  assert.equal(ACME_SECRET_VAULTS.length, 6);
  for (const vault of ACME_SECRET_VAULTS) for (const environment of ["development", "staging", "production"]) {
    const values = buildAcmeSecretValues(vault.slug, environment);
    assert.equal(Object.keys(values).length, 96, `${vault.slug}/${environment}`);
    assert.ok(Object.keys(values).every((name) => /^[A-Z_][A-Z0-9_]*$/.test(name)));
    assert.ok(Object.values(values).every((value) => typeof value === "string"));
    for (const [name, value] of Object.entries(values)) {
      if (/https?:\/\/|postgresql:\/\/|redis:\/\//.test(value)) {
        for (const url of value.match(/(?:https?|postgresql|redis):\/\/[^,\s]+/g) ?? []) assert.ok(new URL(url).hostname.endsWith(".example.invalid"), name);
      }
      if (/SECRET|PASSWORD|TOKEN|API_KEY/.test(name)) assert.match(value, /demo-only|DEMO ONLY/);
    }
    assert.match(values.SERVICE_ACCOUNT_JSON, /not a real private key/);
    assert.equal(JSON.parse(values.FEATURE_FLAGS).demo, true);
  }
  assert.throws(() => buildAcmeSecretValues("not-a-vault", "production"), /Unsupported/);
  assert.throws(() => buildAcmeSecretValues("platform", "not-an-environment"), /Unsupported/);
});

test("full Acme seed encrypts all versions, links recoverable Trash, and stays within a few batched round trips", async () => {
  const foreign = { id: "foreign-project", organization_id: "another-org", slug: "platform", name: "User owned" };
  const client = memoryClient({ tables: { secret_projects: [foreign] } });
  const summary = await seedAcmeSecrets(client, keyring, organizationId, { now });
  assert.deepEqual(summary, { vaults: 6, environments: 18, activeSecrets: 1728, deletedSecrets: 144, versions: 2664, trashBatches: 18, shares: 36, auditEvents: 3075, skippedVaults: 0 });
  assert.deepEqual(client.state.secret_projects[0], foreign);
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  assert.ok(client.calls.length < 50, `${client.calls.length} calls, not thousands of per-record calls`);
  assert.ok(!client.calls.some(({ sql }) => /^(DELETE|TRUNCATE|DROP|ALTER|UPDATE)\b/.test(sql)));
  const projects = new Map(client.state.secret_projects.map((row) => [row.id, row]));
  const environments = new Map(client.state.secret_environments.map((row) => [row.id, row]));
  const entries = new Map(client.state.secret_entries.map((row) => [row.id, row]));
  const key = dataKey(client.state);
  try {
    for (const version of client.state.secret_versions) {
      const entry = entries.get(version.entry_id);
      const environment = environments.get(entry.environment_id);
      assert.equal(version.organization_id, organizationId);
      assert.equal(version.project_id, entry.project_id);
      assert.equal(version.environment_id, entry.environment_id);
      assert.equal(version.key_snapshot, entry.key);
      assert.ok(version.version <= entry.current_version);
      assert.match(version.value_digest, /^[a-f0-9]{64}$/);
      assert.equal(version.algorithm, "AES-256-GCM");
      const plaintext = decryptSecretValue(key, { organizationId, projectId: version.project_id, environmentId: version.environment_id,
        entryId: version.entry_id, version: version.version, keySnapshot: version.key_snapshot,
        organizationKeyVersion: version.organization_key_version, ciphertext: version.ciphertext, iv: version.iv, authTag: version.auth_tag });
      if (version.version === entry.current_version && !entry.deleted_at) assert.equal(plaintext, buildAcmeSecretValues(projects.get(entry.project_id).slug, environment.slug)[entry.key]);
      else assert.match(plaintext, /demo-only|DEMO ONLY|https:\/\/|Acme /);
      assert.notEqual(version.ciphertext, plaintext);
    }
  } finally { key.fill(0); }
  for (const batch of client.state.secret_deletion_batches) {
    const children = client.state.secret_entries.filter((row) => row.deletion_batch_id === batch.id);
    assert.equal(children.length, batch.item_count);
    assert.equal(children.length, 8);
    assert.ok(children.every((entry) => entry.deleted_at === batch.deleted_at && entry.environment_id === batch.environment_id));
    assert.equal(batch.root_type, "bulk"); assert.equal(batch.root_id, batch.id); assert.equal(batch.status, "active");
    assert.ok(Date.parse(batch.expires_at) > now);
    assert.ok(children.every((entry) => client.state.secret_versions.filter((row) => row.entry_id === entry.id).length === 2));
  }
  assert.ok(client.state.secret_environments.every((row) => row.is_production === (row.slug === "production")));
  assert.ok(new Set(client.state.secret_audit_events.map((row) => row.created_at.slice(0, 10))).size > 25);
  assert.ok(client.state.secret_audit_events.every((row) => Date.parse(row.created_at) <= now));
  assert.doesNotMatch(JSON.stringify(client.state), /demo-only-password|not-a-real-credential|not a real private key|"value":|"password":/);
});

test("shares are ciphertext-only snapshots with active/revoked/expired/exhausted metadata and no stored fragment key", async () => {
  const client = memoryClient();
  await seedAcmeSecrets(client, keyring, organizationId, { now });
  const counts = { active: 0, revoked: 0, expired: 0, exhausted: 0 };
  for (const share of client.state.secret_share_links) {
    const status = share.revoked_at ? "revoked" : Date.parse(share.expires_at) <= now ? "expired" : share.views === share.max_views ? "exhausted" : "active";
    counts[status]++;
    assert.match(share.id, /^[A-Za-z0-9_-]{22}$/);
    assert.match(share.key_verifier, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(share.content_format, "bundle"); assert.equal(share.max_views, 10);
    assert.ok(Date.parse(share.expires_at) > Date.parse(share.created_at));
    assert.equal(Object.hasOwn(share, "key"), false);
    if (status === "revoked") { assert.equal(share.ciphertext, ""); assert.equal(share.iv, ""); }
    else { assert.ok(Buffer.from(share.ciphertext, "base64url").length > 16); assert.equal(Buffer.from(share.iv, "base64url").length, 12); }
    const owner = client.state.secret_share_ownership.find((row) => row.share_id === share.id);
    assert.equal(owner.organization_id, organizationId); assert.equal(owner.key_names.length, 5);
    assert.equal(owner.source_secret_ids.length, 5);
    assert.deepEqual(owner.key_names, owner.source_secret_ids.map((id) => client.state.secret_entries.find((row) => row.id === id).key));
  }
  assert.deepEqual(counts, { active: 9, revoked: 9, expired: 9, exhausted: 9 });
  assert.doesNotMatch(JSON.stringify(client.state.secret_share_ownership), /ciphertext|fragment|demo-only|"value"/);
  assert.doesNotMatch(JSON.stringify(client.state.secret_audit_events), /ciphertext|fragment|demo-only-password|not-a-real-credential/);
});

test("reruns preserve existing fixtures including edits, deleted vaults, ciphertext, and consumed shares", async () => {
  const client = memoryClient();
  await seedAcmeSecrets(client, keyring, organizationId, { now });
  client.state.secret_projects[0].deleted_at = "2026-10-08T13:00:00Z";
  client.state.secret_entries[0].description = "Edited locally";
  client.state.secret_share_links[0].views = 9;
  const before = structuredClone(client.state), callCount = client.calls.length;
  assert.deepEqual(await seedAcmeSecrets(client, keyring, organizationId, { now: now + 86_400_000 }),
    { vaults: 0, environments: 0, activeSecrets: 0, deletedSecrets: 0, versions: 0, trashBatches: 0, shares: 0, auditEvents: 0, skippedVaults: 6 });
  assert.deepEqual(client.state, before);
  assert.ok(!client.calls.slice(callCount).some(({ sql }) => /^(INSERT|UPDATE|DELETE)\b|secret_organization_keys/.test(sql)));
});

test("existing active data key wrapped by a previous master key is reused, never rotated", async () => {
  const organizationKey = createOrganizationKey();
  const wrapped = wrapOrganizationKey(organizationId, 7, organizationKey, keyring.previous[0]);
  organizationKey.fill(0);
  const stored = { id: "existing-active", organization_id: organizationId, version: 7, status: "active", wrapped_key: wrapped.ciphertext,
    iv: wrapped.iv, auth_tag: wrapped.authTag, wrapping_key_id: wrapped.wrappingKeyId, algorithm: wrapped.algorithm };
  const client = memoryClient({ tables: { secret_organization_keys: [stored] } });
  const master = Buffer.from(keyring.active.key), previous = Buffer.from(keyring.previous[0].key);
  await seedAcmeSecrets(client, keyring, organizationId, { now });
  assert.deepEqual(client.state.secret_organization_keys, [stored]);
  assert.ok(client.state.secret_versions.every((row) => row.organization_key_version === 7));
  assert.deepEqual(keyring.active.key, master); assert.deepEqual(keyring.previous[0].key, previous);
});

test("wrong organization or a user vault slug collision fails closed before fixture/key writes", async () => {
  for (const client of [memoryClient({ acmeExists: false }), memoryClient({ tables: { secret_projects: [{ id: "user-owned-platform", organization_id: organizationId, slug: "platform" }] } })]) {
    const before = structuredClone(client.state);
    await assert.rejects(seedAcmeSecrets(client, keyring, organizationId, { now }), /must be Acme|refusing to overwrite/);
    assert.deepEqual(client.state, before);
    assert.equal(client.calls.at(-1).sql, "ROLLBACK");
    assert.ok(!client.calls.some(({ sql }) => /^INSERT\b/.test(sql)));
  }
});

test("a batch insert failure rolls back the entire seed, including the organization key", async () => {
  const client = memoryClient({ failTable: "secret_versions" });
  const before = structuredClone(client.state);
  await assert.rejects(seedAcmeSecrets(client, keyring, organizationId, { now }), /Synthetic batch insert failure/);
  assert.deepEqual(client.state, before);
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
});

test("caller-owned transactions do not nest BEGIN/COMMIT or roll back the caller implicitly", async () => {
  const client = memoryClient();
  const summary = await seedAcmeSecrets(client, keyring, organizationId, { now, transaction: false });
  assert.equal(summary.activeSecrets, 1728);
  assert.ok(!client.calls.some(({ sql }) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)));
  const failure = memoryClient({ acmeExists: false });
  await assert.rejects(seedAcmeSecrets(failure, keyring, organizationId, { now, transaction: false }), /must be Acme/);
  assert.ok(!failure.calls.some(({ sql }) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)));
});

test("module has no CLI execution/environment/connection side effects and invalid input never queries", async () => {
  const source = await readFile(new URL("./seed-acme-secrets-development.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|dotenv|from ["'](?:pg|node:fs)["']|\.connect\(|console\.|\bmain\(/);
  for (const [id, time] of [["", now], [null, now], [organizationId, NaN], [organizationId, Infinity], [organizationId, 1e99]]) {
    const client = memoryClient();
    await assert.rejects(seedAcmeSecrets(client, keyring, id, { now: time }), /Valid Acme organization/);
    assert.equal(client.calls.length, 0);
  }
});
