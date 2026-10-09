import { createHash, randomUUID } from "node:crypto";
import { createOrganizationKey, decryptSecretValue, encryptSecretValue, unwrapOrganizationKey, wrapOrganizationKey } from "../apps/web/src/lib/secrets/crypto.ts";
import { decryptShare, encryptShare } from "../packages/share-crypto/src/index.ts";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const BATCH_SIZE = 500;
const FIXTURE_VERSION = 1;
export const ACME_SECRET_VAULTS = Object.freeze([
  { slug: "platform", name: "Platform", description: "Core APIs, authentication, and infrastructure.", groups: ["API", "AUTH", "CACHE", "QUEUE", "STORAGE", "SEARCH", "WEBHOOK", "INTERNAL"] },
  { slug: "commerce", name: "Commerce", description: "Storefront, inventory, checkout, and fulfillment.", groups: ["STOREFRONT", "INVENTORY", "CART", "CHECKOUT", "ORDERS", "SHIPPING", "CATALOG", "PROMOTIONS"] },
  { slug: "payments", name: "Payments", description: "Billing workers and synthetic payment integrations.", groups: ["BILLING", "INVOICES", "CHECKOUT", "REFUNDS", "LEDGER", "TAX", "SUBSCRIPTIONS", "RECONCILIATION"] },
  { slug: "analytics", name: "Analytics", description: "Event ingestion, reporting, and warehouse jobs.", groups: ["INGEST", "WAREHOUSE", "EVENTS", "REPORTS", "PIPELINE", "EXPORT", "AGGREGATION", "RETENTION"] },
  { slug: "notifications", name: "Notifications", description: "Email, push, and webhook delivery workers.", groups: ["EMAIL", "PUSH", "SMS", "WEBHOOK", "TEMPLATES", "DIGEST", "DELIVERY", "PREFERENCES"] },
  { slug: "internal-tools", name: "Internal tools", description: "Operations dashboards, automation, and support tools.", groups: ["ADMIN", "SUPPORT", "AUTOMATION", "AUDIT", "DIRECTORY", "SCHEDULER", "SEARCH", "REPORTING"] },
]);
const ENVIRONMENTS = ["development", "staging", "production"];

function fixtureId(organizationId, name) {
  const hex = createHash("sha256").update(`outray:acme-secrets-demo:v${FIXTURE_VERSION}:${organizationId}:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** All values are synthetic. These reserved domains cannot contact a real integration. */
export function buildAcmeSecretValues(vaultSlug, environmentSlug) {
  const vault = ACME_SECRET_VAULTS.find((item) => item.slug === vaultSlug);
  if (!vault || !ENVIRONMENTS.includes(environmentSlug)) throw new Error("Unsupported Acme fixture vault or environment.");
  const host = `${vaultSlug}.${environmentSlug}.example.invalid`;
  const fake = (name) => `demo-only-${vaultSlug}-${environmentSlug}-${name}-not-a-real-credential`;
  const values = {
    APP_NAME: `Acme ${vault.name} demo`, APP_URL: `https://app.${host}`, API_BASE_URL: `https://api.${host}/v1`,
    NODE_ENV: environmentSlug === "production" ? "production" : "development", PORT: "3000",
    DATABASE_URL: `postgresql://demo:demo-only-password@postgres.${host}:5432/acme_demo`,
    REDIS_URL: `redis://:demo-only-password@redis.${host}:6379/0`,
    SESSION_SECRET: fake("session"), JWT_SECRET: fake("jwt"), INTERNAL_API_KEY: fake("internal-api"),
    WEBHOOK_SIGNING_SECRET: fake("webhook"), STORAGE_ENDPOINT: `https://storage.${host}`,
    STORAGE_BUCKET: `acme-demo-${vaultSlug}-${environmentSlug}`, STORAGE_ACCESS_KEY_ID: `DEMO_ONLY_${environmentSlug.toUpperCase()}`,
    STORAGE_SECRET_ACCESS_KEY: fake("storage"), SMTP_HOST: `smtp.${host}`, SMTP_PORT: "587",
    SMTP_USERNAME: `demo@${host}`, SMTP_PASSWORD: fake("smtp"), EMAIL_FROM: `Acme Demo <no-reply@${host}>`,
    LOG_LEVEL: environmentSlug === "development" ? "debug" : "info",
    FEATURE_FLAGS: JSON.stringify({ demo: true, preview: environmentSlug !== "production", dashboard: true }),
    ALLOWED_ORIGINS: `https://app.${host},https://admin.${host}`,
    SERVICE_ACCOUNT_JSON: JSON.stringify({ type: "demo", project_id: `acme-${vaultSlug}-${environmentSlug}`, private_key: "DEMO ONLY — not a real private key" }, null, 2),
  };
  for (const [index, group] of vault.groups.entries()) Object.assign(values, {
    [`${group}_SERVICE_ENDPOINT`]: `https://${group.toLowerCase()}.${host}/v1`,
    [`${group}_SERVICE_ACCESS_TOKEN`]: fake(`${group.toLowerCase()}-access`),
    [`${group}_SERVICE_CLIENT_ID`]: `demo-only-${group.toLowerCase()}-${environmentSlug}`,
    [`${group}_SERVICE_ENABLED`]: String(index % 3 !== 0 || environmentSlug === "production"),
    [`${group}_SERVICE_TIMEOUT_MS`]: String(1500 + index * 500), [`${group}_SERVICE_RETRY_LIMIT`]: String(2 + index % 4),
    [`${group}_SERVICE_CONFIG_JSON`]: JSON.stringify({ demo: true, batchSize: 25 + index * 10, dryRun: environmentSlug !== "production" }, null, 2),
    [`${group}_SERVICE_SIGNING_SECRET`]: fake(`${group.toLowerCase()}-signing`), [`${group}_SERVICE_REGION`]: ["demo-east", "demo-west", "demo-europe"][index % 3],
  });
  return values;
}

const TABLE_COLUMNS = {
  secret_projects: "id text, organization_id text, name text, slug text, description text, created_at timestamptz, updated_at timestamptz",
  secret_environments: "id text, organization_id text, project_id text, name text, slug text, description text, is_production boolean, revision bigint, created_at timestamptz, updated_at timestamptz",
  secret_entries: "id text, organization_id text, project_id text, environment_id text, key text, description text, current_version integer, deletion_batch_id text, deleted_at timestamptz, created_at timestamptz, updated_at timestamptz",
  secret_versions: "id text, organization_id text, entry_id text, project_id text, environment_id text, key_snapshot text, organization_key_version integer, version integer, ciphertext text, iv text, auth_tag text, algorithm text, value_digest text, created_by_type text, source text, created_at timestamptz",
  secret_deletion_batches: "id text, organization_id text, root_type text, root_id text, root_name text, project_id text, environment_id text, item_count integer, status text, metadata jsonb, deleted_by_type text, deleted_at timestamptz, expires_at timestamptz, created_at timestamptz",
  secret_share_links: "id text, ciphertext text, iv text, key_verifier text, content_format text, expires_at timestamptz, max_views integer, views integer, revoked_at timestamptz, last_revealed_at timestamptz, created_at timestamptz",
  secret_share_ownership: "share_id text, organization_id text, project_id text, environment_id text, key_names jsonb, source_secret_ids jsonb, created_at timestamptz",
  secret_audit_events: "id text, organization_id text, project_id text, environment_id text, entry_id text, actor_type text, actor_credential text, action text, result text, request_id text, target_type text, target_id text, target_name text, metadata jsonb, created_at timestamptz",
};

async function insertRows(client, table, rows) {
  const definition = TABLE_COLUMNS[table];
  if (!definition) throw new Error("Unsupported seed table.");
  const columns = definition.split(", ").map((field) => field.split(" ")[0]).join(", ");
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) await client.query(
    `INSERT INTO ${table} (${columns}) SELECT ${columns} FROM jsonb_to_recordset($1::jsonb) AS fixture (${definition})`,
    [JSON.stringify(rows.slice(offset, offset + BATCH_SIZE))],
  );
}

async function organizationKey(client, keyring, organizationId) {
  const { rows: [active] } = await client.query("SELECT * FROM secret_organization_keys WHERE organization_id = $1 AND status = 'active' FOR UPDATE", [organizationId]);
  if (active) return { version: active.version, key: unwrapOrganizationKey(organizationId, {
    ciphertext: active.wrapped_key, iv: active.iv, authTag: active.auth_tag, wrappingKeyId: active.wrapping_key_id,
    organizationKeyVersion: active.version, algorithm: active.algorithm,
  }, keyring) };
  const { rows: [{ version }] } = await client.query("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM secret_organization_keys WHERE organization_id = $1", [organizationId]);
  const key = createOrganizationKey();
  try {
    const wrapped = wrapOrganizationKey(organizationId, version, key, keyring.active);
    await client.query(`INSERT INTO secret_organization_keys (id, organization_id, version, status, wrapped_key, iv, auth_tag, wrapping_key_id, algorithm)
      VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)`,
    [randomUUID(), organizationId, version, wrapped.ciphertext, wrapped.iv, wrapped.authTag, wrapped.wrappingKeyId, wrapped.algorithm]);
    return { version, key };
  } catch (error) { key.fill(0); throw error; }
}

/** Importable only: the caller validates the development target and supplies its connected client/keyring.
 * Optional transaction:false lets the caller include this in an already-open cleanup/seed transaction.
 * Existing fixture vaults are skipped whole so reruns preserve edits, deletions, and share revocations.
 */
export async function seedAcmeSecrets(client, keyring, organizationId, { now = Date.now(), transaction = true } = {}) {
  if (typeof organizationId !== "string" || !organizationId.trim() || !Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error("Valid Acme organization and fixture time are required.");
  const summary = { vaults: 0, environments: 0, activeSecrets: 0, deletedSecrets: 0, versions: 0, trashBatches: 0, shares: 0, auditEvents: 0, skippedVaults: 0 };
  let key;
  if (transaction) await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const { rows: [organization] } = await client.query("SELECT id FROM organizations WHERE id = $1 AND slug = 'acme' FOR UPDATE", [organizationId]);
    if (!organization) throw new Error("The selected organization must be Acme; no secrets were written.");
    const { rows: existing } = await client.query("SELECT id, slug FROM secret_projects WHERE organization_id = $1 AND slug = ANY($2::text[]) FOR UPDATE", [organizationId, ACME_SECRET_VAULTS.map((vault) => vault.slug)]);
    for (const project of existing) {
      if (project.id !== fixtureId(organizationId, `project:${project.slug}`)) throw new Error("An existing user vault has a fixture slug; refusing to overwrite it.");
    }
    const existingSlugs = new Set(existing.map((project) => project.slug));
    const selected = ACME_SECRET_VAULTS.filter((vault) => !existingSlugs.has(vault.slug));
    summary.skippedVaults = existingSlugs.size;
    if (!selected.length) { if (transaction) await client.query("COMMIT"); return summary; }
    key = await organizationKey(client, keyring, organizationId);
    const rows = Object.fromEntries(Object.keys(TABLE_COLUMNS).map((table) => [table, []]));
    const iso = (time) => new Date(time).toISOString();
    const addAudit = (name, action, scope, targetType, targetId, targetName, at, metadata = {}) => rows.secret_audit_events.push({
      id: fixtureId(organizationId, `audit:${name}`), organization_id: organizationId, project_id: scope.projectId ?? null,
      environment_id: scope.environmentId ?? null, entry_id: scope.entryId ?? null, actor_type: "system", actor_credential: "system",
      action, result: "success", request_id: fixtureId(organizationId, `request:${name}`), target_type: targetType,
      target_id: targetId, target_name: targetName, metadata: { demoFixture: true, ...metadata }, created_at: iso(at),
    });
    for (const vault of selected) {
      const vaultIndex = ACME_SECRET_VAULTS.indexOf(vault);
      const projectId = fixtureId(organizationId, `project:${vault.slug}`);
      const projectAt = now - (60 + vaultIndex) * DAY;
      rows.secret_projects.push({ id: projectId, organization_id: organizationId, name: vault.name, slug: vault.slug,
        description: `${vault.description} Demo fixtures only; no live credentials.`, created_at: iso(projectAt), updated_at: iso(now - vaultIndex * HOUR) });
      addAudit(vault.slug, "project.created", { projectId }, "project", projectId, vault.name, projectAt);
      for (const [environmentIndex, slug] of ENVIRONMENTS.entries()) {
        const name = slug[0].toUpperCase() + slug.slice(1);
        const environmentId = fixtureId(organizationId, `environment:${vault.slug}:${slug}`);
        const batchId = fixtureId(organizationId, `trash:${vault.slug}:${slug}`);
        const scope = { projectId, environmentId };
        const deletedAt = now - (2 + vaultIndex) * DAY - environmentIndex * HOUR;
        rows.secret_environments.push({ id: environmentId, organization_id: organizationId, project_id: projectId, name, slug,
          description: `${name} demo configuration for ${vault.name.toLowerCase()}.`, is_production: slug === "production", revision: 38 + vaultIndex * 7 + environmentIndex,
          created_at: iso(projectAt + DAY), updated_at: iso(now - environmentIndex * HOUR) });
        addAudit(`${vault.slug}:${slug}:environment`, "environment.created", scope, "environment", environmentId, name, projectAt + DAY);
        const values = buildAcmeSecretValues(vault.slug, slug);
        const fixtures = [...Object.entries(values), ...Array.from({ length: 8 }, (_, index) => [`LEGACY_DEMO_${String(index + 1).padStart(2, "0")}_TOKEN`, `demo-only-retired-${vault.slug}-${slug}-${index + 1}`])];
        const activeEntries = [];
        for (const [index, [secretName, value]] of fixtures.entries()) {
          const deleted = index >= 96;
          const currentVersion = deleted ? 2 : index < 12 ? 4 : 1;
          const entryId = fixtureId(organizationId, `entry:${vault.slug}:${slug}:${secretName}`);
          const createdAt = now - (10 + index % 24) * DAY - (vaultIndex * 3 + environmentIndex) * HOUR;
          rows.secret_entries.push({ id: entryId, organization_id: organizationId, project_id: projectId, environment_id: environmentId,
            key: secretName, description: deleted ? "Retired demo integration; safe to restore from Trash." : "Demo fixture only — not a live credential.",
            current_version: currentVersion, deletion_batch_id: deleted ? batchId : null, deleted_at: deleted ? iso(deletedAt) : null,
            created_at: iso(createdAt), updated_at: iso(deleted ? deletedAt : createdAt + (currentVersion - 1) * DAY) });
          if (!deleted) activeEntries.push({ key: secretName, value, id: entryId });
          for (let version = 1; version <= currentVersion; version++) {
            const versionScope = { organizationId, projectId, environmentId, entryId, version, keySnapshot: secretName, organizationKeyVersion: key.version };
            const versionValue = version === currentVersion ? value : `demo-only-historical-revision-${version}\n${value}`;
            const encrypted = encryptSecretValue(key.key, { ...versionScope, value: versionValue });
            if (decryptSecretValue(key.key, { ...versionScope, ...encrypted }) !== versionValue) throw new Error("Demo encryption round trip failed.");
            const versionAt = createdAt + (version - 1) * DAY;
            rows.secret_versions.push({ id: fixtureId(organizationId, `version:${entryId}:${version}`), organization_id: organizationId,
              entry_id: entryId, project_id: projectId, environment_id: environmentId, key_snapshot: secretName, organization_key_version: key.version,
              version, ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, algorithm: encrypted.algorithm,
              value_digest: encrypted.valueDigest, created_by_type: "system", source: version === 1 ? "import" : "write", created_at: iso(versionAt) });
            addAudit(`${entryId}:v${version}`, version === 1 ? "secret.created" : "secret.updated", { ...scope, entryId }, "secret", entryId, secretName, versionAt, { version });
          }
        }
        rows.secret_deletion_batches.push({ id: batchId, organization_id: organizationId, root_type: "bulk", root_id: batchId,
          root_name: `8 retired demo secrets from ${vault.name} / ${name}`, project_id: projectId, environment_id: environmentId,
          item_count: 8, status: "active", metadata: { reason: "delete", demoFixture: true }, deleted_by_type: "system",
          deleted_at: iso(deletedAt), expires_at: iso(now + 25 * DAY), created_at: iso(deletedAt) });
        addAudit(`${batchId}:deleted`, "secrets.bulk_deleted", scope, "bulk", batchId, `8 secrets from ${name}`, deletedAt, { count: 8 });
        addAudit(`${environmentId}:import`, "secrets.imported", scope, "environment", environmentId, name, now - 9 * DAY, { created: 104, updated: 0 });
        for (let index = 0; index < 16; index++) {
          const entry = activeEntries[(index * 7) % activeEntries.length];
          addAudit(`${environmentId}:read:${index}`, index % 2 ? "secret.copied" : "secret.revealed", { ...scope, entryId: entry.id }, "secret", entry.id, entry.key,
            now - index * 3 * HOUR - vaultIndex * 20 * 60_000, { plaintextStored: false });
        }
        addAudit(`${environmentId}:export`, "secrets.exported", scope, "environment", environmentId, name, now - (vaultIndex + 1) * HOUR, { count: 96, format: "env" });
        for (let index = 0; index < 2; index++) {
          const shareIndex = vaultIndex * 6 + environmentIndex * 2 + index;
          const status = ["active", "revoked", "expired", "exhausted"][shareIndex % 4];
          const selectedEntries = activeEntries.slice(index * 5, index * 5 + 5);
          const content = { type: "bundle", entries: selectedEntries.map(({ key: name, value }) => ({ key: name, value })) };
          const encrypted = await encryptShare(content);
          if (JSON.stringify(await decryptShare(encrypted, encrypted.key)) !== JSON.stringify(content)) throw new Error("Demo share encryption round trip failed.");
          const shareId = createHash("sha256").update(`acme-demo-share:v${FIXTURE_VERSION}:${organizationId}:${shareIndex}`).digest().subarray(0, 16).toString("base64url");
          const shareAt = now - (4 + shareIndex % 3) * DAY;
          const revokedAt = status === "revoked" ? iso(now - DAY) : null;
          rows.secret_share_links.push({ id: shareId, ciphertext: status === "revoked" ? "" : encrypted.ciphertext,
            iv: status === "revoked" ? "" : encrypted.iv, key_verifier: encrypted.verifier, content_format: "bundle",
            expires_at: iso(status === "expired" ? now - DAY : now + (3 + shareIndex % 12) * DAY), max_views: 10,
            views: status === "exhausted" ? 10 : shareIndex % 5, revoked_at: revokedAt,
            last_revealed_at: shareIndex % 5 || status === "exhausted" ? iso(now - 2 * DAY) : null, created_at: iso(shareAt) });
          rows.secret_share_ownership.push({ share_id: shareId, organization_id: organizationId, project_id: projectId, environment_id: environmentId,
            key_names: selectedEntries.map((entry) => entry.key), source_secret_ids: selectedEntries.map((entry) => entry.id), created_at: iso(shareAt) });
          addAudit(`${shareId}:created`, "share.created", scope, "share", shareId, `${selectedEntries.length} demo secrets`, shareAt, { count: 5, maxViews: 10 });
          if (revokedAt) addAudit(`${shareId}:revoked`, "share.revoked", scope, "share", shareId, "Demo share", now - DAY);
          // Never persist or return the fragment key. These are list/revocation fixtures, not recoverable viewing links.
        }
      }
    }
    // FK-safe order, a few JSON batches rather than a round trip for every secret/version/audit.
    for (const table of Object.keys(TABLE_COLUMNS)) await insertRows(client, table, rows[table]);
    summary.vaults = rows.secret_projects.length; summary.environments = rows.secret_environments.length;
    summary.activeSecrets = rows.secret_entries.filter((entry) => !entry.deleted_at).length;
    summary.deletedSecrets = rows.secret_entries.length - summary.activeSecrets; summary.versions = rows.secret_versions.length;
    summary.trashBatches = rows.secret_deletion_batches.length; summary.shares = rows.secret_share_links.length; summary.auditEvents = rows.secret_audit_events.length;
    if (transaction) await client.query("COMMIT");
    return summary;
  } catch (error) { if (transaction) await client.query("ROLLBACK"); throw error; }
  finally { key?.key.fill(0); }
}
