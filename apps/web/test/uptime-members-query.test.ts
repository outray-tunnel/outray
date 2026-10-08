import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as drizzle from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";
import { members, users } from "../src/db/auth-schema";
import * as memberQuery from "../src/lib/uptime/members-query";

const { decodeUptimeMemberCursor, encodeUptimeMemberCursor, parseUptimeMembersQuery, uptimeMembersPage, uptimeMembersWhere } = memberQuery;
const dialect = new PgDialect();
const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));

function query(value = "limit=20") {
  const parsed = parseUptimeMembersQuery(new URLSearchParams(value));
  assert.equal(parsed.success, true);
  if (!parsed.success || !parsed.data) throw new Error("Expected a paginated query");
  return parsed.data;
}

test("member pagination is opt-in and defaults to 20 results", () => {
  assert.deepEqual(parseUptimeMembersQuery(new URLSearchParams()), { success: true, data: null });
  assert.deepEqual(parseUptimeMembersQuery(new URLSearchParams("unrelated=true")), { success: true, data: null });
  assert.deepEqual(query("q="), { q: "", limit: 20, cursor: null });
  assert.equal(query("limit=50").limit, 50);
  assert.equal(query("q=%20API%20").q, "API");
});

test("member list rejects malformed limits, oversized search, and invalid cursors", () => {
  for (const value of ["limit=", "limit=0", "limit=-1", "limit=51", "limit=2.5", "limit=Infinity", "limit=1e1", "cursor=", "cursor=not-a-cursor"]) {
    assert.equal(parseUptimeMembersQuery(new URLSearchParams(value)).success, false, value);
  }
  const oversized = parseUptimeMembersQuery(new URLSearchParams({ q: "a".repeat(161) }));
  assert.equal(oversized.success, false);
  if (!oversized.success) assert.equal(oversized.field, "q");
});

test("member search is a parameterized literal substring of names or email, scoped to the URL organization", () => {
  const q = "50%_\\' OR 1=1";
  const compiled = dialect.sqlToQuery(uptimeMembersWhere("tenant-a", query(new URLSearchParams({ q }).toString()))!);
  assert.match(compiled.sql, /"members"\."organization_id" = \$1/);
  assert.match(compiled.sql, /strpos\(lower\("users"\."name"\), lower\(\$2\)\) > 0 or strpos\(lower\("users"\."email"\), lower\(\$3\)\) > 0/);
  assert.deepEqual(compiled.params, ["tenant-a", q, q]);
  assert.equal(compiled.sql.includes(q), false);
});

test("member keyset cursor preserves every ordering key and is bound to its search", () => {
  const row = { name: "Same name", email: "same@example.test", id: "user-b" };
  const cursor = encodeUptimeMemberCursor(row, "same");
  assert.deepEqual(decodeUptimeMemberCursor(cursor), { ...row, q: "same" });
  const parsed = query(new URLSearchParams({ q: "same", cursor }).toString());
  const compiled = dialect.sqlToQuery(uptimeMembersWhere("tenant-a", parsed)!);
  assert.match(compiled.sql, /"users"\."name" > \$4/);
  assert.match(compiled.sql, /"users"\."email" > \$6/);
  assert.match(compiled.sql, /"users"\."id" > \$9/);
  assert.deepEqual(compiled.params.slice(-6), [row.name, row.name, row.email, row.name, row.email, row.id]);
  const mismatch = parseUptimeMembersQuery(new URLSearchParams({ q: "different", cursor }));
  assert.equal(mismatch.success, false);
  if (!mismatch.success) assert.equal(mismatch.field, "cursor");
  for (const invalid of [
    {}, [], { v: 2, ...row, q: "same" }, { v: 1, ...row, id: "", q: "same" },
    { v: 1, ...row, name: 12, q: "same" }, { v: 1, ...row, email: null, q: "same" },
    { v: 1, ...row, q: "a".repeat(161) },
  ]) assert.equal(decodeUptimeMemberCursor(Buffer.from(JSON.stringify(invalid)).toString("base64url")), null);
});

test("pagination uses one lookahead row and never returns more than the requested page", () => {
  const rows = ["user-a", "user-b", "user-c"].map((id) => ({ name: "Same name", email: "same@example.test", id, role: "member" }));
  const first = uptimeMembersPage(rows, query("limit=2"));
  assert.deepEqual(first.members, rows.slice(0, 2));
  assert.deepEqual(decodeUptimeMemberCursor(first.nextCursor!), { name: rows[1].name, email: rows[1].email, id: rows[1].id, q: "" });
  assert.deepEqual(uptimeMembersPage(rows.slice(2), query("limit=2")), { members: rows.slice(2), nextCursor: null });
  assert.deepEqual(uptimeMembersPage([], query()), { members: [], nextCursor: null });
});

type QueryCall = { fields: Record<string, unknown>; conditions?: drizzle.SQL; order: drizzle.SQL[]; limit?: number };
async function routeHarness(options: { denied?: boolean; rows?: Array<{ id: string; name: string; email: string; role: string }> } = {}) {
  const source = await readFile(new URL("../src/routes/api/$orgSlug/uptime/members.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const reads: string[] = [];
  const calls: QueryCall[] = [];
  const rows = options.rows ?? Array.from({ length: 10_001 }, (_, index) => ({
    id: `user-${index}`, name: `Name ${String(index).padStart(5, "0")}`, email: `${index}@example.test`, role: "member",
  }));
  const denied = Response.json({ error: "Unauthorized" }, { status: 403 });
  const module = { exports: {} as { Route: { server: { handlers: { GET: (input: { request: Request; params: { orgSlug: string } }) => Promise<Response> } } } } };
  runInNewContext(compiled, { module, exports: module.exports, Response, URL, require: (specifier: string) => {
    if (specifier === "@tanstack/react-router") return { createFileRoute: () => (definition: unknown) => definition };
    if (specifier === "drizzle-orm") return drizzle;
    if (specifier === "@/db/auth-schema") return { members, users };
    if (specifier === "@/lib/uptime/members-query") return memberQuery;
    if (specifier === "@/lib/uptime/api") return {
      badInput: (error: string, field: string) => Response.json({ error, field }, { status: 400 }),
      requireUptimeRead: async (_request: Request, slug: string) => {
        reads.push(slug);
        return options.denied ? { error: denied } : { organization: { id: "tenant-from-url" }, session: { user: { id: "current-user" } } };
      },
    };
    if (specifier === "@/db") return { db: { select: (fields: Record<string, unknown>) => {
      const call: QueryCall = { fields, order: [] };
      const builder = {
        from: (table: unknown) => { assert.equal(table, members); return builder; },
        innerJoin: (table: unknown, condition: drizzle.SQL) => {
          assert.equal(table, users);
          assert.equal(dialect.sqlToQuery(condition).sql, '"members"."user_id" = "users"."id"');
          return builder;
        },
        where: (condition: drizzle.SQL) => { call.conditions = condition; return builder; },
        orderBy: (...order: drizzle.SQL[]) => { call.order = order; return builder; },
        limit: (limit: number) => { call.limit = limit; return builder; },
        then: (resolve: (value: typeof rows) => unknown, reject?: (reason: unknown) => unknown) => {
          calls.push(call);
          return Promise.resolve(call.limit === undefined ? rows : rows.slice(0, call.limit)).then(resolve, reject);
        },
      };
      return builder;
    } } };
    throw new Error(`Unexpected members route dependency: ${specifier}`);
  } });
  return {
    calls, reads, denied,
    get: (search = "") => module.exports.Route.server.handlers.GET({ request: new Request(`https://example.test/api/url-workspace/uptime/members${search}`), params: { orgSlug: "url-workspace" } }),
  };
}

test("paged members API caps database results and returns only public fields with deterministic ordering", async () => {
  const harness = await routeHarness();
  const response = await harness.get("?limit=20");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.members.length, 20);
  assert.equal(body.currentUserId, "current-user");
  assert.ok(decodeUptimeMemberCursor(body.nextCursor));
  assert.deepEqual(harness.reads, ["url-workspace"]);
  assert.equal(harness.calls.length, 1);
  const call = harness.calls[0];
  assert.equal(call.limit, 21);
  assert.deepEqual(Object.keys(call.fields), ["id", "name", "email", "role"]);
  assert.deepEqual(dialect.sqlToQuery(call.conditions!).params, ["tenant-from-url"]);
  assert.deepEqual(normalize(call.order.map((order) => dialect.sqlToQuery(order).sql)), ['"users"."name" asc', '"users"."email" asc', '"users"."id" asc']);
});

test("legacy members API keeps its complete response and authenticated access remains unchanged", async () => {
  const harness = await routeHarness();
  const body = await (await harness.get()).json();
  assert.equal(body.members.length, 10_001);
  assert.equal(body.currentUserId, "current-user");
  assert.equal("nextCursor" in body, false);
  assert.equal(harness.calls[0].limit, undefined);
  const forbidden = await routeHarness({ denied: true });
  assert.equal(await forbidden.get("?limit=20"), forbidden.denied);
  assert.equal(forbidden.calls.length, 0);
});

test("invalid members options fail before database selection and completed pages return null cursors", async () => {
  const invalid = await routeHarness();
  const response = await invalid.get("?limit=500");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).field, "limit");
  assert.equal(invalid.calls.length, 0);
  const empty = await routeHarness({ rows: [] });
  assert.deepEqual(await (await empty.get("?q=missing")).json(), { members: [], nextCursor: null, currentUserId: "current-user" });
});
