import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";

const shareRole = "outray_share_app";
const writable = ["secret_share_links", "secret_share_rate_limits"];
const readable = [...writable, "secret_share_ownership"];
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;

export function roleConfiguration(env) {
  if (env.OUTRAY_DEPLOYMENT_MODE !== "self-hosted") throw new Error("Share role bootstrap is only for an explicitly self-hosted installation");
  let owner, share;
  try { owner = new URL(env.DATABASE_URL); share = new URL(env.SHARE_DATABASE_URL); }
  catch { throw new Error("Owner and restricted Share database URLs are required"); }
  if (!["postgres:", "postgresql:"].includes(owner.protocol) || !["postgres:", "postgresql:"].includes(share.protocol) ||
      owner.host !== share.host || owner.pathname !== share.pathname || owner.username === share.username ||
      decodeURIComponent(share.username) !== shareRole || owner.hash || share.hash) {
    throw new Error("Share must use the same instance database with the separate outray_share_app role");
  }
  const password = decodeURIComponent(share.password);
  if (!/^[a-f0-9]{64}$/.test(password)) throw new Error("Share requires its generated 32-byte hexadecimal password");
  const database = decodeURIComponent(owner.pathname.slice(1));
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error("Invalid self-hosted database name");
  return { ownerUrl: owner.href, shareUrl: share.href, database, password };
}

/** Only the isolated migration job gets these owner credentials. Never log SQL or parameters. */
export async function provisionShareRole(client, config) {
  await client.query("BEGIN");
  try {
    const current = await client.query("SELECT current_database() AS name");
    if (current.rows[0]?.name !== config.database) throw new Error("Connected database differs from the configured self-hosted database");
    for (const table of readable) {
      const result = await client.query("SELECT to_regclass($1) AS present", [`public.${table}`]);
      if (!result.rows[0]?.present) throw new Error("Apply committed migrations before creating the restricted Share role");
    }
    const existing = await client.query(
      "SELECT oid, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1", [shareRole],
    );
    if (existing.rows.length) {
      const role = existing.rows[0];
      if (["rolsuper", "rolcreaterole", "rolcreatedb", "rolreplication", "rolbypassrls"].some((flag) => role[flag])) throw new Error("Existing Share role is privileged; refusing to reuse it");
      const membership = await client.query("SELECT 1 FROM pg_auth_members WHERE member = $1 LIMIT 1", [role.oid]);
      const ownership = await client.query("SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass AND refobjid = $1 AND deptype = 'o' LIMIT 1", [role.oid]);
      if (membership.rows.length || ownership.rows.length) throw new Error("Existing Share role has inherited privileges or owns objects; review it before reuse");
    } else {
      await client.query(`CREATE ROLE ${identifier(shareRole)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    }
    // Password is constrained to hexadecimal, never untrusted SQL. CREATE/ALTER ROLE don't accept bind parameters here.
    await client.query(`ALTER ROLE ${identifier(shareRole)} LOGIN PASSWORD '${config.password}'`);
    await client.query(`ALTER ROLE ${identifier(shareRole)} RESET ALL`);
    await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${identifier(shareRole)}`);
    await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${identifier(shareRole)}`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM ${identifier(shareRole)}`);
    await client.query(`GRANT CONNECT ON DATABASE ${identifier(config.database)} TO ${identifier(shareRole)}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier(shareRole)}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${writable.map((table) => `public.${identifier(table)}`).join(", ")} TO ${identifier(shareRole)}`);
    await client.query(`GRANT SELECT ON TABLE public.secret_share_ownership TO ${identifier(shareRole)}`);
    // PUBLIC, column-level and another schema's grants can defeat per-role revocation.
    // Also audit denied operations on the three allowed tables (ownership is read-only).
    const unexpected = await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND (has_table_privilege($1, c.oid, 'TRUNCATE') OR has_table_privilege($1, c.oid, 'REFERENCES')
           OR has_table_privilege($1, c.oid, 'TRIGGER') OR has_any_column_privilege($1, c.oid, 'REFERENCES')
           OR (NOT (n.nspname = 'public' AND c.relname = ANY($2::text[]))
             AND (has_table_privilege($1, c.oid, 'SELECT') OR has_any_column_privilege($1, c.oid, 'SELECT')))
           OR (NOT (n.nspname = 'public' AND c.relname = ANY($3::text[]))
             AND (has_table_privilege($1, c.oid, 'INSERT') OR has_table_privilege($1, c.oid, 'UPDATE')
               OR has_table_privilege($1, c.oid, 'DELETE') OR has_any_column_privilege($1, c.oid, 'INSERT')
               OR has_any_column_privilege($1, c.oid, 'UPDATE')))) LIMIT 1`,
      [shareRole, readable, writable],
    );
    if (unexpected.rows.length) throw new Error("Share role has access outside Share tables; review PUBLIC or schema grants");
    const elevated = await client.query(
      `SELECT 1 FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
         AND n.nspname NOT LIKE 'pg_toast%' AND has_schema_privilege($1, n.oid, 'CREATE')
       UNION ALL SELECT 1 FROM pg_database d WHERE has_database_privilege($1, d.oid, 'CREATE')
       UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')
           AND has_function_privilege($1, p.oid, 'EXECUTE') LIMIT 1`, [shareRole],
    );
    if (elevated.rows.length) throw new Error("Share role has schema creation or elevated function access; review inherited grants");
    const sequences = await client.query(
      `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'S' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
         AND (has_sequence_privilege($1, c.oid, 'USAGE') OR has_sequence_privilege($1, c.oid, 'SELECT')
           OR has_sequence_privilege($1, c.oid, 'UPDATE')) LIMIT 1`, [shareRole],
    );
    if (sequences.rows.length) throw new Error("Share role has unexpected sequence access; review inherited grants");
    const future = await client.query(
      `SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       WHERE a.grantee = 0 OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $1) LIMIT 1`, [shareRole],
    );
    if (future.rows.length) throw new Error("Default privileges would expand Share access after later migrations; review default grants");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function main(env = process.env) {
  const config = roleConfiguration(env);
  const owner = new pg.Client({ connectionString: config.ownerUrl });
  try {
    await owner.connect();
    await provisionShareRole(owner, config);
  } finally { await owner.end(); }
  const restricted = new pg.Client({ connectionString: config.shareUrl });
  try {
    await restricted.connect();
    await restricted.query("SELECT id FROM public.secret_share_links LIMIT 0");
    await restricted.query("SELECT share_id FROM public.secret_share_ownership LIMIT 0");
    const access = await restricted.query("SELECT has_table_privilege(current_user, 'public.secret_entries', 'SELECT') AS vault_read, has_table_privilege(current_user, 'public.users', 'SELECT') AS users_read");
    if (access.rows[0]?.vault_read || access.rows[0]?.users_read) throw new Error("Restricted role unexpectedly has vault or account access");
    console.log("Restricted Share database role is ready; no credential values were printed.");
  } finally { await restricted.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Database exceptions can contain credentials or SQL. Print only a bounded error code.
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : "bootstrap_failed";
    console.error(`Self-hosted Share role bootstrap failed (${code}); inspect configuration and privileges without exposing credentials.`);
    process.exitCode = 1;
  });
}
