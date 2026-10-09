import assert from "node:assert/strict";
import test from "node:test";
import { roleConfiguration, provisionShareRole } from "./self-hosted-share-role.mjs";

const env = {
  OUTRAY_DEPLOYMENT_MODE: "self-hosted",
  DATABASE_URL: "postgresql://outray:owner@postgres:5432/outray?sslmode=disable",
  SHARE_DATABASE_URL: `postgresql://outray_share_app:${"a".repeat(64)}@postgres:5432/outray?sslmode=disable`,
};
function owner(overrides = {}) {
  const calls = [];
  return { calls, async query(sql, args) {
    calls.push([sql, args]);
    if (sql.includes("current_database")) return { rows: [{ name: "outray" }] };
    if (sql.includes("to_regclass")) return { rows: [{ present: args[0] }] };
    if (sql.startsWith("SELECT oid,") && sql.includes("FROM pg_roles")) return { rows: overrides.role ? [overrides.role] : [] };
    if (sql.includes("FROM pg_auth_members")) return { rows: overrides.membership ? [{}] : [] };
    if (sql.includes("FROM pg_shdepend")) return { rows: overrides.ownership ? [{}] : [] };
    if (sql.includes("SELECT c.relname")) return { rows: overrides.extraPrivileges ? [{}] : [] };
    if (sql.includes("FROM pg_namespace n WHERE")) return { rows: overrides.elevated ? [{}] : [] };
    if (sql.includes("has_sequence_privilege")) return { rows: overrides.sequences ? [{}] : [] };
    if (sql.includes("FROM pg_default_acl")) return { rows: overrides.futureGrants ? [{}] : [] };
    return { rows: [] };
  } };
}

test("Share role setup rejects hosted mode, different databases, owner reuse and unsafe passwords before connection", () => {
  assert.equal(roleConfiguration(env).database, "outray");
  assert.throws(() => roleConfiguration({ ...env, OUTRAY_DEPLOYMENT_MODE: "hosted" }), /explicitly self-hosted/);
  assert.throws(() => roleConfiguration({ ...env, SHARE_DATABASE_URL: env.SHARE_DATABASE_URL.replace("postgres:5432", "other:5432") }), /same instance/);
  assert.throws(() => roleConfiguration({ ...env, SHARE_DATABASE_URL: env.DATABASE_URL }), /separate/);
  assert.throws(() => roleConfiguration({ ...env, SHARE_DATABASE_URL: env.SHARE_DATABASE_URL.replace("a".repeat(64), "short") }), /generated/);
});

test("Share role setup grants only the three expected tables and verifies no inherited table access", async () => {
  const client = owner();
  await provisionShareRole(client, roleConfiguration(env));
  const sql = client.calls.map(([sql]) => sql).join("\n");
  assert.match(sql, /CREATE ROLE .*NOSUPERUSER.*NOCREATEDB.*NOCREATEROLE.*NOINHERIT.*NOREPLICATION.*NOBYPASSRLS/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\."secret_share_links", public\."secret_share_rate_limits"/);
  assert.match(sql, /GRANT SELECT ON TABLE public.secret_share_ownership/);
  assert.match(sql, /has_table_privilege/);
  assert.match(sql, /has_any_column_privilege/);
  assert.match(sql, /has_function_privilege/);
  assert.match(sql, /has_sequence_privilege/);
  assert.match(sql, /aclexplode/);
  const audit = client.calls.find(([sql]) => sql.includes("SELECT c.relname"));
  assert.deepEqual(audit[1][2], ["secret_share_links", "secret_share_rate_limits"]);
  assert.equal(client.calls.at(-1)[0], "COMMIT");
});

test("Share role setup is idempotent for an unprivileged existing role", async () => {
  const client = owner({ role: { oid: 100 } });
  await provisionShareRole(client, roleConfiguration(env));
  assert.ok(!client.calls.some(([sql]) => sql.startsWith("CREATE ROLE")));
  assert.ok(client.calls.some(([sql]) => sql.startsWith("ALTER ROLE")));
  assert.equal(client.calls.at(-1)[0], "COMMIT");
});

for (const [description, overrides] of [
  ["superuser", { role: { oid: 100, rolsuper: true } }],
  ["role membership", { role: { oid: 100 }, membership: true }],
  ["table ownership", { role: { oid: 100 }, ownership: true }],
  ["PUBLIC grants", { extraPrivileges: true }],
  ["elevated functions or schema privileges", { elevated: true }],
  ["sequence grants", { sequences: true }],
  ["future default grants", { futureGrants: true }],
]) test(`Share role setup rolls back instead of granting runtime access with ${description}`, async () => {
  const client = owner(overrides);
  await assert.rejects(provisionShareRole(client, roleConfiguration(env)));
  assert.equal(client.calls.at(-1)[0], "ROLLBACK");
  assert.ok(!client.calls.some(([sql]) => sql === "COMMIT"));
});
