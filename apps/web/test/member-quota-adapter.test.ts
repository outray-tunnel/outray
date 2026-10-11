import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import pg from "pg";
import ts from "typescript";
import * as orm from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import * as authSchema from "../src/db/auth-schema";
import { subscriptions } from "../src/db/subscription-schema";
import * as memberPolicy from "../src/lib/member-limit-policy";
import { getPlanLimits, installationPlan } from "../src/lib/subscription-plans";

async function load(path: string, dependencies: Record<string, unknown>) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as any };
  runInNewContext(compiled, { module, exports: module.exports, Date, Object, Promise,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected seat quota dependency: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}

test("seat adapter preserves unrelated operations and decorated writes inside adapter callbacks", async () => {
  const calls: string[] = [];
  const base = {
    id: "drizzle", create: async (args: unknown) => { calls.push("create"); return args; },
    update: async (args: unknown) => { calls.push("update"); return args; },
    findOne: async () => null, findMany: async () => [], count: async () => 0,
    delete: async () => { calls.push("delete"); }, deleteMany: async () => 0,
    updateMany: async () => 0, options: { marker: true },
    transaction: async (callback: (adapter: typeof base) => Promise<unknown>): Promise<unknown> => callback(base),
  };
  const module = await load("../src/lib/member-quota-adapter.server.ts", {
    "../db": { db: { transaction() { throw new Error("Unrelated auth must not allocate seats"); } } },
    "drizzle-orm": orm, "../db/auth-schema": authSchema,
    "better-auth/adapters/drizzle": { drizzleAdapter: () => () => base }, "better-auth/api": { APIError },
    "./member-limits.server": { assertOrganizationMemberCapacity() { throw new Error("Unexpected seat allocation"); } },
    "./organization-entitlements.server": { withOrganizationQuotaLock() { throw new Error("Unexpected lock"); } },
  });
  const adapter = module.memberQuotaAdapter()({});
  assert.equal(adapter.id, base.id);
  assert.equal(adapter.options, base.options);
  assert.equal(adapter.findOne, base.findOne);
  assert.equal(adapter.delete, base.delete);
  await adapter.create({ model: "user", data: { email: "owner@example.com" } });
  await adapter.update({ model: "member", where: [{ field: "id", value: "member" }], update: { role: "admin" } });
  await adapter.delete({ model: "organization", where: [{ field: "id", value: "organization" }] });
  await adapter.transaction(async (transactionAdapter: typeof adapter) => {
    assert.equal(transactionAdapter.create, adapter.create);
    assert.equal(transactionAdapter.update, adapter.update);
    await transactionAdapter.create({ model: "account", data: {} });
  });
  assert.deepEqual(calls, ["create", "update", "delete", "create"]);
});

// Opt-in integration test: never reads DATABASE_URL or any configured app DB.
// Use only an explicitly provided disposable local *_test_quotas database.
const testDatabaseUrl = process.env.MEMBER_QUOTA_TEST_DATABASE_URL;
test("real PostgreSQL serializes invitations, members, acceptance, renewals and instance quotas", {
  skip: !testDatabaseUrl,
}, async () => {
  const endpoint = new URL(testDatabaseUrl!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname));
  assert.match(endpoint.pathname, /_test_quotas$/);
  const schema = `member_quota_${randomUUID().replaceAll("-", "")}`;
  const setup = new pg.Pool({ connectionString: testDatabaseUrl });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schema} -c timezone=UTC`, max: 12 });
  const database = drizzle(pool, { schema: { ...authSchema, subscriptions } });
  const originalEnvironment = new Map(["OUTRAY_DEPLOYMENT_MODE", "OUTRAY_MAX_MEMBERS", "TZ"].map((key) => [key, process.env[key]]));
  process.env.OUTRAY_DEPLOYMENT_MODE = "hosted";
  // Match the production runtime for the application's timezone-less columns.
  process.env.TZ = "UTC";
  try {
    await pool.query(`
      CREATE TABLE organizations (id text PRIMARY KEY, name text NOT NULL, slug text UNIQUE NOT NULL, logo text, created_at timestamp NOT NULL, metadata text);
      CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, email_verified boolean NOT NULL DEFAULT true, image text, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE members (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, role text NOT NULL DEFAULT 'member', created_at timestamp NOT NULL);
      CREATE TABLE invitations (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, email text NOT NULL, role text, status text NOT NULL DEFAULT 'pending', expires_at timestamp NOT NULL, inviter_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE);
      CREATE TABLE subscriptions (id text PRIMARY KEY, organization_id text UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, plan text NOT NULL DEFAULT 'free');
    `);
    const entitlements = await load("../src/lib/organization-entitlements.server.ts", {
      "drizzle-orm": orm, "../db": { db: database }, "../db/auth-schema": authSchema,
      "../db/subscription-schema": { subscriptions }, "./subscription-plans": { getPlanLimits, installationPlan },
    });
    const capacity = await load("../src/lib/member-limits.server.ts", {
      "drizzle-orm": orm, "../db": { db: database }, "../db/subscription-schema": { subscriptions },
      "better-auth/api": { APIError }, "./member-limit-policy": memberPolicy,
      "./organization-entitlements.server": entitlements,
    });
    const module = await load("../src/lib/member-quota-adapter.server.ts", {
      "../db": { db: database }, "better-auth/adapters/drizzle": { drizzleAdapter }, "better-auth/api": { APIError },
      "drizzle-orm": orm, "../db/auth-schema": authSchema,
      "./member-limits.server": capacity, "./organization-entitlements.server": entitlements,
    });
    const adapter = module.memberQuotaAdapter(database)({ plugins: [organization({})] });
    const createUser = async () => {
      const user = { id: randomUUID(), name: "Test user", email: `${randomUUID()}@example.com` };
      await pool.query("INSERT INTO users(id,name,email) VALUES($1,$2,$3)", [user.id, user.name, user.email]);
      return user;
    };
    const createOrganization = async (plan = "ray") => {
      const owner = await createUser(), id = randomUUID();
      await pool.query("INSERT INTO organizations(id,name,slug,created_at) VALUES($1,'Quota test',$1,now())", [id]);
      await pool.query("INSERT INTO subscriptions(id,organization_id,plan) VALUES($1,$2,$3)", [randomUUID(), id, plan]);
      const ownerMember = await adapter.create({ model: "member", data: { organizationId: id, userId: owner.id, role: "owner", createdAt: new Date() } });
      return { id, owner, ownerMember };
    };
    const invite = (org: Awaited<ReturnType<typeof createOrganization>>, email = `${randomUUID()}@example.com`, expiresAt = new Date(Date.now() + 3_600_000)) => adapter.create({
      model: "invitation", data: { organizationId: org.id, email, status: "pending", role: "member", inviterId: org.owner.id, expiresAt },
    });
    const addMember = (organizationId: string, userId: string) => adapter.create({ model: "member", data: { organizationId, userId, role: "member", createdAt: new Date() } });
    const updateInvitation = (id: string, update: Record<string, unknown>) => adapter.update({ model: "invitation", where: [{ field: "id", value: id }], update });

    const invitesOrg = await createOrganization();
    const invites = await Promise.allSettled(Array.from({ length: 20 }, () => invite(invitesOrg)));
    assert.equal(await entitlements.getOrganizationPlan(invitesOrg.id, database), "ray");
    assert.equal(memberPolicy.getMemberLimitForPlan("ray"), 3);
    const observed = await pool.query("SELECT (SELECT count(*) FROM members WHERE organization_id=$1) AS members,(SELECT count(*) FROM invitations WHERE organization_id=$1 AND expires_at>now()) AS invitations", [invitesOrg.id]);
    assert.equal(observed.rows[0].members, "1");
    assert.equal(observed.rows[0].invitations, "2");
    await assert.rejects(capacity.assertOrganizationMemberCapacity(invitesOrg.id, { includePendingInvitations: true }, database), /Member limit reached/);
    assert.equal(invites.filter((result) => result.status === "fulfilled").length, 2, "only the last two Ray seats can be reserved");
    assert.equal((await pool.query("SELECT count(*) FROM invitations WHERE organization_id=$1", [invitesOrg.id])).rows[0].count, "2");

    const membersOrg = await createOrganization();
    const users = await Promise.all(Array.from({ length: 20 }, createUser));
    const additions = await Promise.allSettled(users.map((user) => addMember(membersOrg.id, user.id)));
    assert.equal(additions.filter((result) => result.status === "fulfilled").length, 2);
    const freeOrg = await createOrganization("free");
    await assert.rejects(invite(freeOrg), /free plan allows 1 member/);

    const acceptOrg = await createOrganization(), recipient = await createUser();
    const pending = await invite(acceptOrg, recipient.email);
    const acceptance = await Promise.allSettled([updateInvitation(pending.id, { status: "accepted" }), updateInvitation(pending.id, { status: "accepted" })]);
    assert.equal(acceptance.filter((result) => result.status === "fulfilled").length, 1, "the same pending invitation cannot be accepted twice");
    const race = await Promise.allSettled(Array.from({ length: 10 }, () => invite(acceptOrg)));
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1, "accepted-but-uninserted member still reserves its seat");
    const [firstMember, secondMember] = await Promise.all([addMember(acceptOrg.id, recipient.id), addMember(acceptOrg.id, recipient.id)]);
    assert.equal(firstMember.id, secondMember.id, "member creation is idempotent for the same organization/user");
    assert.equal((await pool.query("SELECT count(*) FROM members WHERE organization_id=$1", [acceptOrg.id])).rows[0].count, "2");
    await assert.rejects(invite(acceptOrg), /Member limit reached/);
    await assert.rejects(invite(acceptOrg, recipient.email), /already a member/);
    await adapter.delete({ model: "member", where: [{ field: "id", value: firstMember.id }] });
    await invite(acceptOrg);
    await assert.rejects(updateInvitation(pending.id, { expiresAt: new Date(Date.now() + 3_600_000) }), /Only pending invitations can be renewed/);

    const renewOrg = await createOrganization();
    const expired = await invite(renewOrg, undefined, new Date(Date.now() - 1000));
    const cancelled = await invite(renewOrg);
    await updateInvitation(cancelled.id, { status: "canceled" });
    await assert.rejects(updateInvitation(cancelled.id, { status: "pending", expiresAt: new Date(Date.now() + 3_600_000) }), /Only pending invitations can be renewed/);
    const active = await invite(renewOrg);
    await invite(renewOrg);
    await assert.rejects(updateInvitation(expired.id, { expiresAt: new Date(Date.now() + 3_600_000) }), /Member limit reached/);
    await updateInvitation(active.id, { status: "canceled" });
    await updateInvitation(expired.id, { expiresAt: new Date(Date.now() + 3_600_000) });
    await assert.rejects(updateInvitation(expired.id, { status: "accepted", expiresAt: new Date(Date.now() + 7_200_000) }), /Acceptance cannot extend/);
    const duplicateOrg = await createOrganization(), duplicateEmail = `${randomUUID()}@example.com`;
    const duplicates = await Promise.allSettled([invite(duplicateOrg, duplicateEmail), invite(duplicateOrg, duplicateEmail)]);
    assert.equal(duplicates.filter((result) => result.status === "fulfilled").length, 1);

    const failedAcceptanceOrg = await createOrganization(), orphan = await invite(failedAcceptanceOrg);
    await updateInvitation(orphan.id, { status: "accepted" });
    await invite(failedAcceptanceOrg);
    await assert.rejects(invite(failedAcceptanceOrg), /Member limit reached/);
    await pool.query("UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=$1", [orphan.id]);
    await invite(failedAcceptanceOrg);

    await pool.query("UPDATE subscriptions SET plan='free' WHERE organization_id=$1", [membersOrg.id]);
    await assert.rejects(invite(membersOrg), /Member limit reached/);
    await adapter.update({ model: "member", where: [{ field: "id", value: membersOrg.ownerMember.id }], update: { role: "admin" } });
    const removable = await adapter.findOne({ model: "member", where: [{ field: "organizationId", value: membersOrg.id }, { field: "role", value: "member" }] });
    await adapter.delete({ model: "member", where: [{ field: "id", value: removable.id }] });
    const internal = await createOrganization("unlimited");
    await Promise.all(Array.from({ length: 12 }, () => invite(internal)));

    process.env.OUTRAY_DEPLOYMENT_MODE = "self-hosted";
    process.env.OUTRAY_MAX_MEMBERS = "2";
    const selfHostedOrg = await createOrganization("pulse");
    await invite(selfHostedOrg);
    await assert.rejects(invite(selfHostedOrg), /installation allows 2 members/);
    await adapter.delete({ model: "organization", where: [{ field: "id", value: selfHostedOrg.id }] });
    assert.equal((await pool.query("SELECT count(*) FROM invitations WHERE organization_id=$1", [selfHostedOrg.id])).rows[0].count, "0", "organization cascade remains unchanged");
  } finally {
    for (const [key, value] of originalEnvironment) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await pool.end();
    // schema is a validated random identifier owned solely by this test.
    await setup.query(`DROP SCHEMA "${schema}" CASCADE`);
    await setup.end();
  }
});
