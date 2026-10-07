import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as orm from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import ts from "typescript";
import * as authSchema from "../src/db/auth-schema";
import * as secretsSchema from "../src/db/secrets-schema";
import { createOrganizationAccessResolver } from "../src/lib/org-access";
import * as policy from "../src/lib/secrets/access-policy";
import * as secretsTypes from "../src/lib/secrets/types";

type OrgFunctions = typeof import("../src/lib/org");
type AccessFunctions = typeof import("../src/lib/secrets/access");
const organization = {
  id: "org-a", name: "Team A", slug: "team-a", logo: null,
  createdAt: new Date("2026-10-01T00:00:00Z"), metadata: null,
};

/** Load actual authorization code without constructing a real auth client or pool. */
async function loadModule<T>(path: URL, modules: Record<string, unknown>): Promise<T> {
  const source = await readFile(path, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  } });
  const module = { exports: {} as T };
  runInNewContext(outputText, {
    module, exports: module.exports, Request, Response, Promise, Date, crypto,
    require(specifier: string) {
      assert.ok(Object.hasOwn(modules, specifier), `Unexpected dependency: ${specifier}`);
      return modules[specifier];
    },
  });
  return module.exports;
}

async function harness() {
  const memberships = new Map([
    ["user-a:team-a", { organization, membership: { role: "owner" } }],
    ["user-b:team-a", { organization, membership: { role: "member" } }],
    ["user-a:team-b", { organization: { ...organization, id: "org-b", slug: "team-b" }, membership: { role: "member" } }],
  ]);
  let sessionReads = 0;
  const queries: Array<{ table: string; sql: string; params: unknown[] }> = [];
  const writes: string[] = [];
  let machineRows: unknown[] = [];
  let cliRows: unknown[] = [];
  const db = {
    select(fields: any) {
      let table: any;
      let query: any;
      const builder: any = {
        from(value: any) { table = value; query = new QueryBuilder().select(fields).from(value); return builder; },
        innerJoin(value: any, condition: any) { query.innerJoin(value, condition); return builder; },
        where(value: any) { query.where(value); return builder; },
        limit(value: number) {
          query.limit(value);
          const generated = query.toSQL();
          const tableName = orm.getTableName(table);
          queries.push({ table: tableName, ...generated });
          if (tableName === "members") {
            const row = memberships.get(`${generated.params[0]}:${generated.params[1]}`);
            return Promise.resolve(row ? [row] : []);
          }
          if (tableName === "secrets_machine_tokens") return Promise.resolve(machineRows);
          if (tableName === "cli_org_tokens") return Promise.resolve(cliRows);
          throw new Error(`Unexpected authorization table: ${tableName}`);
        },
      };
      return builder;
    },
    query: { members: { findFirst() { throw new Error("Duplicate membership query"); } } },
    update(table: any) {
      return { set() { return { where() { writes.push(orm.getTableName(table)); return Promise.resolve(); } }; } };
    },
  };
  const org = await loadModule<OrgFunctions>(new URL("../src/lib/org.ts", import.meta.url), {
    "@tanstack/react-start": { json: Response.json }, "drizzle-orm": orm,
    "./auth": { auth: { api: { async getSession({ headers }: { headers: Headers }) {
      sessionReads += 1;
      const id = headers.get("x-test-user");
      return id ? { user: { id }, session: { id: "session-a" } } : null;
    } } } },
    "../db": { db }, "../db/auth-schema": authSchema,
    "./org-access": { createOrganizationAccessResolver },
  });
  const access = await loadModule<AccessFunctions>(new URL("../src/lib/secrets/access.ts", import.meta.url), {
    "drizzle-orm": orm, "../../db": { db }, "../../db/auth-schema": authSchema,
    "../../db/secrets-schema": secretsSchema, "../org": org,
    "../machine-tokens": { hashMachineToken: (value: string) => `hash:${value}` },
    "./access-policy": policy, "./types": secretsTypes,
  });
  return { org, access, memberships, queries, writes,
    sessionReads: () => sessionReads,
    machineWith(rows: unknown[]) { machineRows = rows; },
    cliWith(rows: unknown[]) { cliRows = rows; },
  };
}

function request(userId: string | null = "user-a", authorization?: string) {
  return new Request("https://outray.test/api/team-a/secrets/reveal", {
    headers: {
      ...(userId ? { "x-test-user": userId } : {}), ...(authorization ? { authorization } : {}),
      "x-request-id": "request-a", "user-agent": "test-client", "x-forwarded-for": "192.0.2.4, 192.0.2.5",
    },
  });
}
function error(status: number, code: string) {
  return (value: unknown) => value instanceof secretsTypes.SecretsError && value.status === status && value.code === code;
}

test("session Secrets access reuses the membership role from one tenant-scoped joined query", async () => {
  const f = await harness();
  const result = await f.access.requireSecretsAccess(request(), "team-a", "secrets:reveal");
  assert.equal(f.sessionReads(), 1);
  assert.equal(f.queries.length, 1);
  assert.match(f.queries[0].sql, /"members"\."role"/);
  assert.match(f.queries[0].sql, /inner join "organizations"/);
  assert.deepEqual(f.queries[0].params, ["user-a", "team-a", 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    organization: { id: "org-a", slug: "team-a", name: "Team A" },
    actor: { type: "user", credential: "session", id: "user-a", userId: "user-a", role: "owner", tokenId: null,
      projectId: null, environmentId: null, scopes: ["secrets:*"] },
    requestMetadata: { ipAddress: "192.0.2.4", userAgent: "test-client", requestId: "request-a" },
  });
});

test("organization-only contract excludes membership while both helpers deduplicate within the Request", async () => {
  const f = await harness();
  const req = request();
  const [ordinary, richer, secrets] = await Promise.all([
    f.org.requireOrgFromSlug(req, "team-a"), f.org.requireOrgMembershipFromSlug(req, "team-a"),
    f.access.requireSecretsAccess(req, "team-a", "secrets:reveal"),
  ]);
  assert.ok("organization" in ordinary);
  assert.deepEqual(Object.keys(ordinary).sort(), ["organization", "session"]);
  assert.strictEqual(ordinary.organization, organization);
  assert.ok("membership" in richer);
  assert.equal(richer.membership.role, "owner");
  assert.equal(secrets.actor.role, "owner");
  assert.equal(f.sessionReads(), 1);
  assert.equal(f.queries.length, 1);
});

test("anonymous and missing membership keep 401/403 behavior without duplicate or unrelated queries", async () => {
  const f = await harness();
  await assert.rejects(f.access.requireSecretsAccess(request(null), "team-a", "secrets:reveal"), error(401, "UNAUTHORIZED"));
  assert.equal(f.queries.length, 0);
  await assert.rejects(f.access.requireSecretsAccess(request("outsider"), "team-a", "secrets:reveal"), error(403, "FORBIDDEN"));
  assert.equal(f.queries.length, 1);
  const orgError = await f.org.requireOrgFromSlug(request("outsider"), "team-a");
  assert.ok("error" in orgError);
  assert.equal(orgError.error.status, 403);
  assert.deepEqual(await orgError.error.json(), { error: "Unauthorized" });
});

test("roles and revocation are refreshed on every new request, never cached across users or organizations", async () => {
  const f = await harness();
  assert.equal((await f.access.requireSecretsAdmin(request(), "team-a")).actor.role, "owner");
  f.memberships.set("user-a:team-a", { organization, membership: { role: "member" } });
  await assert.rejects(f.access.requireSecretsAdmin(request(), "team-a"), error(403, "FORBIDDEN"));
  assert.equal((await f.access.requireSecretsAccess(request("user-b"), "team-a", "secrets:reveal")).actor.role, "member");
  assert.equal((await f.access.requireSecretsAccess(request(), "team-b", "secrets:reveal")).organization.id, "org-b");
  f.memberships.delete("user-a:team-a");
  await assert.rejects(f.access.requireSecretsAccess(request(), "team-a", "secrets:reveal"), error(403, "FORBIDDEN"));
  assert.equal(f.queries.length, 5);
  assert.equal(f.sessionReads(), 5);
});

test("machine bearer access retains scope enforcement and never invokes session membership resolution", async () => {
  const f = await harness();
  const token = { id: "machine-a", expiresAt: null, scopes: ["secrets:reveal"], projectId: "vault-a", environmentId: "env-a" };
  f.machineWith([{ organization, token }]);
  const result = await f.access.requireSecretsAccess(request(null, "Bearer machine-value"), "team-a", "secrets:reveal");
  assert.equal(result.actor.type, "machine");
  assert.equal(result.actor.projectId, "vault-a");
  assert.equal(f.sessionReads(), 0);
  assert.equal(f.queries.length, 1);
  assert.deepEqual(f.writes, ["secrets_machine_tokens"]);
  f.machineWith([{ organization, token: { ...token, scopes: ["secrets:write"] } }]);
  await assert.rejects(f.access.requireSecretsAccess(request(null, "Bearer machine-value"), "team-a", "secrets:reveal"), error(403, "FORBIDDEN"));
  assert.equal(f.writes.length, 1);
});

test("CLI bearer access preserves membership role and cannot become Secrets administrative session access", async () => {
  const f = await harness();
  f.cliWith([{ organization, role: "owner", token: { id: "cli-a", userId: "user-a", expiresAt: new Date(Date.now() + 60_000) } }]);
  const result = await f.access.requireSecretsAccess(request(null, "Bearer cli-value"), "team-a", "secrets:reveal");
  assert.equal(result.actor.credential, "cli");
  assert.equal(result.actor.role, "owner");
  assert.equal(f.sessionReads(), 0);
  assert.deepEqual(f.queries.map((query) => query.table), ["secrets_machine_tokens", "cli_org_tokens"]);
  await assert.rejects(f.access.requireSecretsAdmin(request(null, "Bearer cli-value"), "team-a"), error(403, "FORBIDDEN"));
});

test("invalid and malformed bearer credentials never fall back to a valid browser session", async () => {
  const f = await harness();
  await assert.rejects(f.access.requireSecretsAccess(request("user-a", "Bearer missing-value"), "team-a", "secrets:reveal"), error(401, "UNAUTHORIZED"));
  assert.equal(f.sessionReads(), 0);
  assert.equal(f.queries.length, 2);
  await assert.rejects(f.access.requireSecretsAccess(request("user-a", "Basic value"), "team-a", "secrets:reveal"), error(401, "UNAUTHORIZED"));
  assert.equal(f.sessionReads(), 0);
  assert.equal(f.queries.length, 2);
});
