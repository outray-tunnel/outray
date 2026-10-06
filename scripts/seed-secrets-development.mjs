import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import {
  createOrganizationKey,
  decryptSecretValue,
  encryptSecretValue,
  readSecretsKeyring,
  unwrapOrganizationKey,
  wrapOrganizationKey,
} from "../apps/web/src/lib/secrets/crypto.ts";

const ORGANIZATION_SLUG = "outray-tunnel";
const ENVIRONMENTS = ["development", "staging", "production"];

class SeedError extends Error {}

function databaseIdentity(url) {
  const host = (url.searchParams.get("host") || decodeURIComponent(url.hostname)).toLowerCase().replace(/^\[|\]$/g, "");
  const port = Number(url.searchParams.get("port") || url.port || "5432");
  return `${host}:${port}/${decodeURI(url.pathname.slice(1))}`;
}

export function assertDevelopmentDatabase(environment, production = {}) {
  if (environment.NODE_ENV === "production") throw new SeedError("Refusing to seed in production mode.");
  let database;
  try {
    database = new URL(environment.DATABASE_URL);
  } catch {
    throw new SeedError("A valid development DATABASE_URL is required.");
  }
  if (!/^postgres(ql)?:$/.test(database.protocol) ||
    !/(^localhost$|^127\.0\.0\.1$|^\[::1\]$|(^|[.-])(dev|development)([.-]|$))/.test(database.hostname.toLowerCase())) {
    throw new SeedError("Refusing to seed a non-development database.");
  }
  const routingParameters = new Set(["host", "hostaddr", "port", "dbname", "database", "service", "servicefile", "options"]);
  if ([...database.searchParams.keys()].some((key) => routingParameters.has(key.toLowerCase()))) {
    throw new SeedError("Refusing database connection-routing overrides in the development URL.");
  }
  if (!database.pathname || database.pathname === "/") {
    throw new SeedError("An explicit development database name is required.");
  }
  let identity;
  let productionIdentity;
  try {
    identity = databaseIdentity(database);
    if (production.DATABASE_URL) productionIdentity = databaseIdentity(new URL(production.DATABASE_URL));
  } catch {
    throw new SeedError("Database target comparison requires valid database URLs.");
  }
  if (productionIdentity && identity === productionIdentity) {
    throw new SeedError("Development database matches production; refusing to seed.");
  }
  return database;
}

export function developmentClientOptions(environment, database) {
  const target = new URL(database);
  target.port ||= "5432";
  return {
    connectionString: target.toString(),
    // A non-empty option prevents inheriting PGOPTIONS (including search_path).
    options: "-c search_path=public",
    ssl: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(target.hostname) ? false : {
      rejectUnauthorized: environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    },
    connectionTimeoutMillis: 10_000,
  };
}

/** Deliberately fake values, never copied from runtime credentials. */
export function buildDemoSecrets(environmentSlug) {
  if (!ENVIRONMENTS.includes(environmentSlug)) throw new SeedError("Unsupported demo environment.");
  const host = `${environmentSlug}.example.invalid`;
  return {
    APP_NAME: "OutRay Demo",
    APP_URL: `https://app.${host}`,
    API_BASE_URL: `https://api.${host}/v1`,
    NODE_ENV: environmentSlug === "production" ? "production" : "development",
    PORT: "3000",
    DATABASE_URL: `postgresql://demo:demo-only-password@postgres.${host}:5432/demo`,
    REDIS_URL: `redis://:demo-only-password@redis.${host}:6379/0`,
    SESSION_SECRET: `demo-only-session-secret-${environmentSlug}`,
    JWT_SECRET: `demo-only-jwt-secret-${environmentSlug}`,
    INTERNAL_API_KEY: `demo_only_internal_${environmentSlug}_not_a_real_key`,
    WEBHOOK_SIGNING_SECRET: `demo_only_webhook_${environmentSlug}`,
    STORAGE_ENDPOINT: `https://storage.${host}`,
    STORAGE_BUCKET: `demo-${environmentSlug}-uploads`,
    STORAGE_ACCESS_KEY_ID: `DEMO_ONLY_${environmentSlug.toUpperCase()}`,
    STORAGE_SECRET_ACCESS_KEY: `demo-only-storage-secret-${environmentSlug}`,
    SMTP_HOST: `smtp.${host}`,
    SMTP_PORT: "587",
    SMTP_USERNAME: `demo@${host}`,
    SMTP_PASSWORD: `demo-only-smtp-password-${environmentSlug}`,
    EMAIL_FROM: `OutRay Demo <no-reply@${host}>`,
    LOG_LEVEL: environmentSlug === "development" ? "debug" : "info",
    FEATURE_FLAGS: JSON.stringify({ demo: true, preview: environmentSlug !== "production" }),
    ALLOWED_ORIGINS: `https://app.${host},https://admin.${host}`,
    SERVICE_ACCOUNT_JSON: JSON.stringify({ type: "demo", project_id: `demo-${environmentSlug}`, private_key: "DEMO ONLY — not a real private key" }, null, 2),
  };
}

async function activeKey(client, organizationId, keyring) {
  const { rows: [row] } = await client.query(
    "SELECT * FROM secret_organization_keys WHERE organization_id = $1 AND status = 'active' FOR UPDATE",
    [organizationId],
  );
  if (row) return {
    version: row.version,
    key: unwrapOrganizationKey(organizationId, {
      ciphertext: row.wrapped_key, iv: row.iv, authTag: row.auth_tag,
      wrappingKeyId: row.wrapping_key_id, organizationKeyVersion: row.version,
      algorithm: row.algorithm,
    }, keyring),
  };
  const { rows: [{ version }] } = await client.query(
    "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM secret_organization_keys WHERE organization_id = $1",
    [organizationId],
  );
  const key = createOrganizationKey();
  try {
    const wrapped = wrapOrganizationKey(organizationId, version, key, keyring.active);
    await client.query(
      `INSERT INTO secret_organization_keys
       (id, organization_id, version, status, wrapped_key, iv, auth_tag, wrapping_key_id, algorithm)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)`,
      [randomUUID(), organizationId, version, wrapped.ciphertext, wrapped.iv, wrapped.authTag, wrapped.wrappingKeyId, wrapped.algorithm],
    );
    return { version, key };
  } catch (error) {
    key.fill(0);
    throw error;
  }
}

export async function seedDemoSecrets(client, keyring, vaultSlug = "vault") {
  let organizationKey;
  const summary = [];
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const { rows: [organization] } = await client.query(
      "SELECT id FROM organizations WHERE slug = $1 FOR UPDATE", [ORGANIZATION_SLUG],
    );
    if (!organization) throw new SeedError("The outray-tunnel organization was not found.");
    const { rows: [project] } = await client.query(
      "SELECT id FROM secret_projects WHERE organization_id = $1 AND slug = $2 AND deleted_at IS NULL FOR UPDATE",
      [organization.id, vaultSlug],
    );
    if (!project) throw new SeedError("The requested vault was not found; no data was written.");
    const { rows: environments } = await client.query(
      `SELECT id, slug, revision FROM secret_environments
       WHERE organization_id = $1 AND project_id = $2 AND slug = ANY($3::text[]) AND deleted_at IS NULL
       ORDER BY slug FOR UPDATE`, [organization.id, project.id, ENVIRONMENTS],
    );
    if (!environments.length) throw new SeedError("No demo-target environments were found; no data was written.");
    for (const environment of environments) {
      // Include Trash so a rerun never resurrects a deliberately deleted key.
      const { rows: entries } = await client.query(
        "SELECT key FROM secret_entries WHERE organization_id = $1 AND project_id = $2 AND environment_id = $3",
        [organization.id, project.id, environment.id],
      );
      const existing = new Set(entries.map((entry) => entry.key));
      const missing = Object.entries(buildDemoSecrets(environment.slug)).filter(([key]) => !existing.has(key));
      if (!missing.length) {
        summary.push({ environment: environment.slug, created: 0, skipped: existing.size });
        continue;
      }
      organizationKey ??= await activeKey(client, organization.id, keyring);
      for (const [key, value] of missing) {
        const entryId = randomUUID();
        const scope = {
          organizationId: organization.id, projectId: project.id, environmentId: environment.id,
          entryId, version: 1, keySnapshot: key, organizationKeyVersion: organizationKey.version,
        };
        const encrypted = encryptSecretValue(organizationKey.key, { ...scope, value });
        await client.query(
          `INSERT INTO secret_entries (id, organization_id, project_id, environment_id, key, description, current_version)
           VALUES ($1, $2, $3, $4, $5, $6, 1)`,
          [entryId, organization.id, project.id, environment.id, key, "Demo fixture only — not a live credential."],
        );
        await client.query(
          `INSERT INTO secret_versions
           (id, organization_id, entry_id, project_id, environment_id, key_snapshot, organization_key_version,
            version, ciphertext, iv, auth_tag, algorithm, value_digest, created_by_type, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, $11, $12, 'system', 'import')`,
          [randomUUID(), organization.id, entryId, project.id, environment.id, key, organizationKey.version,
            encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.algorithm, encrypted.valueDigest],
        );
        // Verify the stored envelope, without logging or caching the revealed value.
        const { rows: [stored] } = await client.query(
          "SELECT ciphertext, iv, auth_tag FROM secret_versions WHERE entry_id = $1 AND version = 1", [entryId],
        );
        if (!stored || decryptSecretValue(organizationKey.key, {
          ...scope, ciphertext: stored.ciphertext, iv: stored.iv, authTag: stored.auth_tag,
        }) !== value) throw new SeedError("Stored demo secret failed encryption verification.");
      }
      const { rows: [updated] } = await client.query(
        "UPDATE secret_environments SET revision = revision + 1, updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING revision",
        [environment.id, organization.id],
      );
      await client.query(
        `INSERT INTO secret_audit_events
         (id, organization_id, project_id, environment_id, actor_type, actor_credential, action, result,
          request_id, target_type, target_id, target_name, metadata)
         VALUES ($1, $2, $3, $4, 'system', 'system', 'secrets.imported', 'success', $5, 'environment', $4, $6, $7::jsonb)`,
        [randomUUID(), organization.id, project.id, environment.id, randomUUID(), environment.slug,
          JSON.stringify({ seeded: true, created: missing.length, updated: 0, environmentRevision: Number(updated.revision) })],
      );
      summary.push({ environment: environment.slug, created: missing.length, skipped: existing.size });
    }
    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    organizationKey?.key.fill(0);
  }
}

async function main() {
  // Explicit .env, never .env.prod or inherited connection credentials.
  const root = fileURLToPath(new URL("../", import.meta.url));
  const environment = dotenv.parse(readFileSync(resolve(root, ".env")));
  const productionPath = resolve(root, ".env.prod");
  const production = existsSync(productionPath) ? dotenv.parse(readFileSync(productionPath)) : {};
  const database = assertDevelopmentDatabase(environment, production);
  const keyring = readSecretsKeyring(environment);
  const client = new pg.Client(developmentClientOptions(environment, database));
  try {
    await client.connect();
    console.log(JSON.stringify({ organization: ORGANIZATION_SLUG, vault: "vault", environments: await seedDemoSecrets(client, keyring) }));
  } finally {
    await client.end();
    keyring.active.key.fill(0);
    for (const key of keyring.previous) key.key.fill(0);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof SeedError ? error.message : "Development secrets seed failed; no credentials are printed.");
    process.exitCode = 1;
  });
}
