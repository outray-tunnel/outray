import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { loadRouteHandlers } from "./helpers/load-route";

type AdminAccess = typeof import("../src/lib/admin-access.server");

async function harness() {
  let session: null | { user: { id: string; isAdmin?: boolean; role?: string } } = null;
  let profile: undefined | { isAdmin: boolean };
  let sessionReads = 0;
  let profileReads = 0;
  const userColumns = { id: Symbol("id"), name: Symbol("name"), email: Symbol("email"), isAdmin: Symbol("isAdmin") };
  const source = await readFile(new URL("../src/lib/admin-access.server.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } });
  const module = { exports: {} as AdminAccess };
  const modules = {
    "drizzle-orm": { eq(column: symbol, id: string) {
      assert.equal(column, userColumns.id);
      assert.equal(id, session?.user.id);
      return { id };
    } },
    "../db/auth-schema": { users: userColumns },
    "../db": { db: { select(fields: Record<keyof typeof userColumns, symbol>) {
      profileReads += 1;
      for (const key of ["id", "name", "email", "isAdmin"] as const) assert.equal(fields[key], userColumns[key]);
      return { from(table: unknown) {
        assert.equal(table, userColumns);
        return { where() { return { async limit(count: number) {
          assert.equal(count, 1);
          return profile ? [{ id: session?.user.id, name: "Admin Name", email: "admin@example.com", ...profile }] : [];
        } }; } };
      } };
    } } },
    "./auth": { auth: { api: { async getSession(input: { headers: Headers; query: { disableCookieCache: boolean } }) {
      sessionReads += 1;
      assert.equal(input.headers.get("authorization"), null, "Legacy admin tokens must never reach authentication");
      assert.equal(input.query.disableCookieCache, true, "A cached admin session cannot override a revocation");
      return session;
    } } } },
  };
  runInNewContext(outputText, {
    module, exports: module.exports, Request, Response, Headers, URL,
    require(specifier: keyof typeof modules) {
      assert.ok(Object.hasOwn(modules, specifier), `Unexpected dependency: ${specifier}`);
      return modules[specifier];
    },
  });
  return {
    ...module.exports,
    setSession(value: typeof session) { session = value; },
    setProfile(value: typeof profile) { profile = value; },
    reads: () => ({ sessionReads, profileReads }),
  };
}

function request(method = "GET", headers: HeadersInit = {}) {
  return new Request("https://outray.co/api/admin/users", { method, headers });
}

test("admin API requires an authenticated cookie session, not a legacy Bearer token", async () => {
  const h = await harness();
  const response = await h.requireAdminAccess(request("GET", { authorization: "Bearer legacy-admin-token" }));
  assert.equal(response?.status, 401);
  assert.equal(response?.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(h.reads(), { sessionReads: 1, profileReads: 0 });
});

test("organization admins and cached admin flags do not grant platform admin access", async () => {
  const h = await harness();
  h.setSession({ user: { id: "ordinary-user", role: "admin", isAdmin: true } });
  h.setProfile({ isAdmin: false });
  const response = await h.requireAdminAccess(request());
  assert.equal(response?.status, 403);
  assert.deepEqual(h.reads(), { sessionReads: 1, profileReads: 1 });
});

test("admin access uses a fresh user profile on every request, including revocation", async () => {
  const h = await harness();
  h.setSession({ user: { id: "admin-user", isAdmin: false } });
  h.setProfile({ isAdmin: true });
  assert.equal(await h.requireAdminAccess(request()), null);
  h.setProfile({ isAdmin: false });
  assert.equal((await h.requireAdminAccess(request()))?.status, 403);
  h.setProfile(undefined);
  assert.equal((await h.requireAdminAccess(request()))?.status, 403);
  assert.deepEqual(h.reads(), { sessionReads: 3, profileReads: 3 });
});

test("admin access resolver exposes only the freshly authorized profile", async () => {
  const h = await harness();
  h.setSession({ user: { id: "admin-user", isAdmin: false } });
  h.setProfile({ isAdmin: true });
  const result = await h.resolveAdminAccess(request());
  assert.ok(!(result instanceof Response));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    user: { id: "admin-user", name: "Admin Name", email: "admin@example.com", isAdmin: true },
  });
  assert.deepEqual(h.reads(), { sessionReads: 1, profileReads: 1 });
});

test("admin mutations reject foreign, missing, opaque, malformed and contradictory origins", async () => {
  const h = await harness();
  h.setSession({ user: { id: "admin-user" } });
  h.setProfile({ isAdmin: true });
  const rejected: HeadersInit[] = [
    { origin: "https://attacker.example" },
    { referer: "https://attacker.example/form" },
    {},
    { origin: "null" },
    { origin: "not-a-url" },
    { origin: "https://outray.co/pretend-origin" },
    { origin: "https://attacker.example", referer: "https://outray.co/admin" },
    { origin: "https://outray.co", "sec-fetch-site": "cross-site" },
  ];
  for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
    for (const headers of rejected) {
      assert.equal((await h.requireAdminAccess(request(method, headers)))?.status, 403);
    }
  }
  assert.deepEqual(h.reads(), { sessionReads: 0, profileReads: 0 });
});

test("admin mutations allow exact-origin requests or same-origin referrer fallback", async () => {
  const h = await harness();
  h.setSession({ user: { id: "admin-user" } });
  h.setProfile({ isAdmin: true });
  assert.equal(await h.requireAdminAccess(request("POST", { origin: "https://outray.co", "sec-fetch-site": "same-origin" })), null);
  assert.equal(await h.requireAdminAccess(request("PATCH", { referer: "https://outray.co/admin/users" })), null);
  assert.equal((await h.requireAdminAccess(request("DELETE", { origin: "http://outray.co" })))?.status, 403);
  assert.equal((await h.requireAdminAccess(request("POST", { origin: "https://outray.co:8443" })))?.status, 403);
});

test("admin JSON responses preserve status and non-cache headers, but disable caching", async () => {
  const h = await harness();
  const response = h.adminJson({ success: true }, { status: 202, headers: { "X-Test": "kept", "Cache-Control": "public" } });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("x-test"), "kept");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { success: true });
});

type LoginHandlers = {
  GET: (context: { request: Request }) => Promise<Response>;
  POST: (context: { request: Request }) => Promise<Response>;
};

test("admin login GET returns only the authorized user with no reusable cache", async () => {
  const h = await harness();
  h.setSession({ user: { id: "admin-user" } });
  h.setProfile({ isAdmin: true });
  const { GET } = await loadRouteHandlers<LoginHandlers>({
    path: new URL("../src/routes/api/admin/login.ts", import.meta.url),
    modules: { "../../../lib/admin-access.server": h },
  });
  const response = await GET({ request: request() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    user: { id: "admin-user", name: "Admin Name", email: "admin@example.com", isAdmin: true },
  });
  assert.deepEqual(h.reads(), { sessionReads: 1, profileReads: 1 });
});

test("admin login GET preserves the resolver denial unchanged", async () => {
  const h = await harness();
  for (const status of [401, 403]) {
    const denied = h.adminJson({ error: status === 401 ? "Unauthorized" : "Forbidden" }, { status });
    const { GET } = await loadRouteHandlers<LoginHandlers>({
      path: new URL("../src/routes/api/admin/login.ts", import.meta.url),
      modules: { "../../../lib/admin-access.server": {
        adminJson: h.adminJson,
        resolveAdminAccess: async () => denied,
      } },
    });
    assert.equal(await GET({ request: request() }), denied);
  }
});

test("retired admin password POST cannot read the phrase or mint an admin token", async () => {
  const h = await harness();
  const { POST } = await loadRouteHandlers<LoginHandlers>({
    path: new URL("../src/routes/api/admin/login.ts", import.meta.url),
    modules: { "../../../lib/admin-access.server": {
      adminJson: h.adminJson,
      resolveAdminAccess: () => { throw new Error("Retired login cannot create or check a session"); },
    } },
  });
  const loginRequest = new Request("https://outray.co/api/admin/login", {
    method: "POST", body: JSON.stringify({ phrase: "retired-password" }),
  });
  const response = await POST({ request: loginRequest });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(loginRequest.bodyUsed, false);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.match(body.error, /GitHub or Google/);
  assert.deepEqual(h.reads(), { sessionReads: 0, profileReads: 0 });
});

test("every admin handler authorizes before processing data and cannot use retired tokens", async () => {
  const directory = new URL("../src/routes/api/admin/", import.meta.url);
  for (const file of await readdir(directory)) {
    if (!file.endsWith(".ts") || file === "login.ts") continue;
    const source = await readFile(new URL(file, directory), "utf8");
    const handlers = [...source.matchAll(/(?:GET|POST|PATCH|PUT|DELETE): async \([^)]*\) => \{\s*const denied = await requireAdminAccess\(request\);\s*if \(denied\) return denied;/g)];
    const handlerCount = [...source.matchAll(/(?:GET|POST|PATCH|PUT|DELETE): async/g)].length;
    assert.ok(handlerCount > 0, `${file} must define at least one handler`);
    assert.equal(handlers.length, handlerCount, `${file} must authorize every handler at entry`);
    assert.doesNotMatch(source, /admin:token:|hashToken|Response\.json\(/, `${file} must use session authorization and uncached JSON`);
    assert.doesNotMatch(source, /Cache-Control["']?:\s*["']public/, `${file} must not expose cached admin data`);
  }
});
