import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import instancePolicy from "../../../shared/instance-config";
import workspaceSlugPolicy from "../../../shared/workspace-slugs";
import { loadRouteHandlers } from "./helpers/load-route";

const { workspaceSlugRejection, workspaceSlugErrorMessage, WORKSPACE_ROUTE_SLUGS } = workspaceSlugPolicy;
const { instanceConfig, instanceSignupAllowed } = instancePolicy;
const hosted = { selfHosted: false };
const selfHosted = { selfHosted: true };

test("hosted reservations remain in place, while self-hosted branding and future names are available", () => {
  for (const slug of ["outray", "beam", "ray", "pulse", "github", "react", "production", "staging", "aws"]) {
    assert.equal(workspaceSlugRejection(slug, hosted), "reserved", `hosted ${slug}`);
    assert.equal(workspaceSlugRejection(slug, selfHosted), null, `self-hosted ${slug}`);
  }
  assert.equal(workspaceSlugRejection("acme-team", hosted), null);
  assert.equal(workspaceSlugRejection("acme-team", selfHosted), null);
});

test("self-hosted route collision policy matches every actual static route and public asset directory", async () => {
  const routes = await readdir(new URL("../src/routes", import.meta.url), { recursive: true });
  const rootRoutes = routes.filter((path) => /\.[cm]?[jt]sx?$/.test(path))
    .map((path) => path.split(/[/.]/)[0])
    .filter((slug) => slug !== "index" && !slug.startsWith("$") && !slug.startsWith("_"));
  const publicEntries = await readdir(new URL("../public", import.meta.url), { withFileTypes: true });
  const staticDirectories = publicEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const actualCollisions = [...new Set([...rootRoutes, ...staticDirectories, "assets"])].sort();
  assert.deepEqual([...WORKSPACE_ROUTE_SLUGS].sort(), actualCollisions);
  for (const slug of actualCollisions) {
    assert.equal(workspaceSlugRejection(slug, selfHosted), "route", slug);
  }
  assert.doesNotMatch(workspaceSlugErrorMessage("route"), /support|claim/i);
});

test("malformed workspace URLs are rejected consistently without throwing", () => {
  for (const slug of [undefined, null, 17, {}, [], "", "OutRay", " a", "a b", "a/b", "a_b", "-acme", "acme-", "acme--team", "%61pi", "../api"]) {
    assert.equal(workspaceSlugRejection(slug, selfHosted), "invalid");
    assert.equal(workspaceSlugRejection(slug, hosted), "invalid");
  }
});

type SlugHandler = (args: { request: Request }) => Promise<Response>;
async function availabilityHandlers({ selfHosted, session = true, existing = false }: { selfHosted: boolean; session?: boolean; existing?: boolean }) {
  const lookups: unknown[] = [];
  const handlers = await loadRouteHandlers<{ POST: SlugHandler }>({
    path: new URL("../src/routes/api/organizations/check-slug.ts", import.meta.url),
    modules: {
      "drizzle-orm": { eq: (column: string, value: unknown) => ({ column, value }) },
      "../../../lib/auth": { auth: { api: { getSession: async () => session ? { user: { id: "owner" } } : null } } },
      "../../../db": { db: { query: { organizations: { findFirst: async (query: unknown) => { lookups.push(query); return existing ? { id: "existing-org" } : undefined; } } } } },
      "../../../db/auth-schema": { organizations: { slug: "organization_slug" } },
      "../../../../../../shared/instance-config": { instanceConfig: () => ({ selfHosted }) },
      "../../../../../../shared/workspace-slugs": workspaceSlugPolicy,
    },
  });
  return { ...handlers, lookups };
}

const slugRequest = (body: string) => new Request("https://instance.test/api/organizations/check-slug", { method: "POST", headers: { "Content-Type": "application/json" }, body });

test("availability keeps authentication and existing-workspace checks, with mode-aware rejection reasons", async () => {
  for (const selfHosted of [true, false]) {
    const { POST, lookups } = await availabilityHandlers({ selfHosted });
    const response = await POST({ request: slugRequest(JSON.stringify({ slug: "outray" })) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), selfHosted ? { available: true } : { available: false, reason: "reserved" });
    assert.equal(lookups.length, selfHosted ? 1 : 0);
  }
  const collision = await availabilityHandlers({ selfHosted: true });
  assert.deepEqual(await (await collision.POST({ request: slugRequest('{"slug":"api"}') })).json(), { available: false, reason: "route" });
  assert.equal(collision.lookups.length, 0);
  const duplicate = await availabilityHandlers({ selfHosted: true, existing: true });
  assert.deepEqual(await (await duplicate.POST({ request: slugRequest('{"slug":"outray"}') })).json(), { available: false, reason: "taken" });
  assert.equal(duplicate.lookups.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(duplicate.lookups[0])), { where: { column: "organization_slug", value: "outray" } });
  const unauthenticated = await availabilityHandlers({ selfHosted: true, session: false });
  assert.equal((await unauthenticated.POST({ request: slugRequest('{"slug":"outray"}') })).status, 401);
  assert.equal(unauthenticated.lookups.length, 0);
});

test("availability rejects malformed JSON and slug values before accessing the database", async () => {
  const { POST, lookups } = await availabilityHandlers({ selfHosted: true });
  for (const body of ["{", "null", "[]", "{}", '{"slug":9}', '{"slug":"acme--team"}', '{"slug":"../api"}']) {
    const response = await POST({ request: slugRequest(body) });
    assert.equal(response.status, 400, body);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(lookups.length, 0);
});

test("the actual creation hook uses the same policy before persistence, without affecting unrelated auth calls", async () => {
  const source = await readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  let selfHosted = true;
  let persistence = 0;
  class APIError extends Error {
    constructor(public status: string, options: { message: string }) { super(options.message); }
  }
  type Context = { path: string; body?: { slug?: unknown } };
  const module = { exports: {} as { auth: { hooks: { before: (context: Context) => Promise<void> } } } };
  runInNewContext(compiled, {
    module, exports: module.exports, process: { env: {} }, Date, console,
    require: (specifier: string) => {
      if (specifier === "better-auth") return { betterAuth: (options: unknown) => options };
      if (specifier === "better-auth/adapters/drizzle") return { drizzleAdapter: () => ({}) };
      if (specifier === "better-auth/plugins") return { createAuthMiddleware: (handler: unknown) => handler, organization: (options: unknown) => options };
      if (specifier === "better-auth/api") return { APIError };
      if (specifier === "../db") return { db: new Proxy({}, { get() { persistence++; throw new Error("Policy must run before persistence"); } }) };
      if (specifier === "../../../../shared/instance-config") return { instanceConfig: () => ({ ...instanceConfig({}), selfHosted }), instanceSignupAllowed };
      if (specifier === "../../../../shared/workspace-slugs") return workspaceSlugPolicy;
      if (["./send-email", "./permissions", "./member-limits.server", "./member-limit-policy", "@/email/templates"].includes(specifier)) return {};
      throw new Error(`Unexpected authentication dependency: ${specifier}`);
    },
  });
  const before = module.exports.auth.hooks.before;
  await before({ path: "/organization/create", body: { slug: "outray" } });
  await assert.rejects(before({ path: "/organization/create", body: { slug: "login" } }), { status: "BAD_REQUEST", message: workspaceSlugErrorMessage("route") });
  await assert.rejects(before({ path: "/organization/create", body: { slug: "acme--team" } }), { status: "BAD_REQUEST", message: workspaceSlugErrorMessage("invalid") });
  selfHosted = false;
  await assert.rejects(before({ path: "/organization/create", body: { slug: "outray" } }), { status: "BAD_REQUEST", message: workspaceSlugErrorMessage("reserved") });
  await before({ path: "/organization/create", body: { slug: "acme-team" } });
  await before({ path: "/sign-in/social" });
  assert.equal(persistence, 0);
});
