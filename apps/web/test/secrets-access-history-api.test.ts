import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";
import { users } from "../src/db/auth-schema";
import { machineTokens, secretAuditEvents, secretEntries, secretEnvironments, secretProjects, secretVersions } from "../src/db/secrets-schema";
import { secretsClient } from "../src/lib/secrets-client";
import { withSecretsErrors } from "../src/lib/secrets/http";
import { SecretsError } from "../src/lib/secrets/types";
import { readRequiredString, requireProductionConfirmation, validateSlug } from "../src/lib/secrets/validation";

const scope = { projectSlug: "vault", environmentSlug: "development", secretId: "secret-1", category: "access" };
const access = { organization: { id: "org-1" }, actor: { type: "user" } };
const timestamp = new Date("2026-10-20T09:00:00.000Z");
const auditRow = {
  id: "event-2", projectId: "vault-1", environmentId: "env-1", entryId: "secret-1",
  actorType: "user", actorCredential: "session", actorId: "user-1", actorTokenId: null,
  userName: "Ada", userEmail: "ada@example.invalid", machineTokenName: null, machineTokenPrefix: null,
  action: "secret.revealed", result: "denied", requestId: "request-1",
  targetType: "secret", targetId: "secret-1", targetName: "API_KEY", metadata: { version: 3 },
  ipAddress: "192.0.2.1", userAgent: "History test", createdAt: timestamp,
};
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;

async function realFunction(path: string, name: string) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration);
  return compile(`${declaration.getText(ast)}\nmodule.exports.run = ${name};`);
}

/** Exercise the real audit predicate builder without importing a live database pool. */
async function fixture(options: { rows?: typeof auditRow[]; resolutionError?: Error } = {}) {
  const compiled = await realFunction("../src/lib/secrets/governance.ts", "listAuditEvents");
  const resolutions: unknown[][] = [];
  const predicates: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const limits: number[] = [];
  const db = { select() {
    const query = {
      from() { return query; }, leftJoin() { return query; },
      where(predicate: SQL) { predicates.push(new PgDialect().sqlToQuery(predicate)); return query; },
      orderBy() { return query; },
      async limit(limit: number) { limits.push(limit); return options.rows ?? [auditRow]; },
    };
    return query;
  } };
  const module = { exports: {} as { run: (access: unknown, search: URLSearchParams) => Promise<{ events: typeof auditRow[]; nextCursor: string | null }> } };
  runInNewContext(compiled, {
    module, exports: module.exports, Buffer, Date, and, desc, eq, inArray, lt, or, sql,
    users, machineTokens, secretAuditEvents, db, SecretsError, readRequiredString, validateSlug,
    async resolveSecretForReveal(...args: unknown[]) {
      resolutions.push(args);
      if (options.resolutionError) throw options.resolutionError;
      return { project: { id: "vault-1" }, environment: { id: "env-1" }, entry: { id: "secret-1" } };
    },
  });
  return { run: module.exports.run, resolutions, predicates, limits };
}

test("access history filters exact IDs, tenant, environment and access actions in SQL before pagination", async () => {
  const history = await fixture();
  const page = await history.run(access, new URLSearchParams(scope));
  assert.deepEqual(history.resolutions, [[access, "vault", "development", "secret-1"]]);
  const query = history.predicates[0];
  for (const column of ["organization_id", "project_id", "environment_id", "entry_id"]) assert.match(query.sql, new RegExp(`"${column}" = \\$`));
  assert.match(query.sql, /"action" in \(/);
  assert.match(query.sql, /"target_type" = \$[\s\S]*"target_id" = \$/);
  assert.match(query.sql, /"metadata"->'entryIds' @> \$\d+::jsonb/);
  assert.doesNotMatch(query.sql, /\blike\b|\bilike\b|position\(|::text/i,
    "attribution must use exact IDs and JSON containment, never substring matching");
  for (const expected of ["org-1", "vault-1", "env-1", "secret-1", '["secret-1"]',
    "secret.revealed", "secret.copied", "secrets.exported", "secrets.runtime_read", "share.snapshot_revealed"]) {
    assert.ok(query.params.includes(expected), `missing scoped access condition: ${expected}`);
  }
  assert.doesNotMatch(query.sql, /"result"|secret\.updated|secrets\.imported/);
  assert.deepEqual(history.limits, [51]);
  assert.equal(page.events[0].result, "denied", "recorded denials remain visible");
});

test("access history rejects partial scopes and unsupported categories without querying audit rows", async () => {
  const history = await fixture();
  for (const search of [{ category: "access" }, { ...scope, secretId: "" }, { ...scope, projectSlug: "" },
    { ...scope, environmentSlug: "" }, { ...scope, category: "change" },
    { projectSlug: "vault", environmentSlug: "development", secretId: "secret-1" }]) {
    await assert.rejects(history.run(access, new URLSearchParams(search)), (error: unknown) =>
      error instanceof SecretsError && error.code === "VALIDATION_ERROR" && error.status === 400);
  }
  assert.equal(history.resolutions.length, 0);
  assert.equal(history.predicates.length, 0);
});

test("secret resolution and machine scope failures never fall back to organization audit rows", async () => {
  for (const code of ["NOT_FOUND", "FORBIDDEN"]) {
    const history = await fixture({ resolutionError: new SecretsError("Secret unavailable", { code, status: code === "NOT_FOUND" ? 404 : 403 }) });
    await assert.rejects(history.run(access, new URLSearchParams(scope)), (error: unknown) => error instanceof SecretsError && error.code === code);
    assert.equal(history.predicates.length, 0);
  }
});

test("scoped audit endpoint preserves secrets-read authorization before querying", async () => {
  const source = await readFile(new URL("../src/routes/api/$orgSlug/secrets/audit.ts", import.meta.url), "utf8");
  let authorization: unknown[] = [];
  let queries = 0;
  const module = { exports: {} as { Route: { server: { handlers: { GET: (input: { request: Request; params: { orgSlug: string } }) => Promise<Response> } } } } };
  runInNewContext(compile(source), {
    module, exports: module.exports, URL, Response,
    require(specifier: string) {
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (config: unknown) => config };
      if (specifier === "@/lib/secrets/access") return { async requireSecretsAccess(...args: unknown[]) {
        authorization = args;
        throw new SecretsError("Access denied", { code: "FORBIDDEN", status: 403 });
      } };
      if (specifier === "@/lib/secrets/governance") return { async listAuditEvents() { queries++; return { events: [] }; } };
      if (specifier === "@/lib/secrets/http") return { withSecretsErrors };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  const request = new Request(`https://test.invalid/api/acme/secrets/audit?${new URLSearchParams(scope)}`);
  const response = await module.exports.Route.server.handlers.GET({ request, params: { orgSlug: "acme" } });
  assert.deepEqual(authorization, [request, "acme", "secrets:read"]);
  assert.equal(response.status, 403);
  assert.equal(queries, 0);
});

test("access pagination retains timestamp/id cursors and every secret and machine scope predicate", async () => {
  const history = await fixture({ rows: [auditRow, { ...auditRow, id: "event-1" }] });
  const machine = { ...access, actor: { type: "machine", projectId: "vault-1", environmentId: "env-1" } };
  const page = await history.run(machine, new URLSearchParams({ ...scope, limit: "1" }));
  assert.equal(page.events.length, 1);
  assert.ok(page.nextCursor);
  assert.deepEqual(JSON.parse(Buffer.from(page.nextCursor, "base64url").toString("utf8")), { createdAt: timestamp.toISOString(), id: "event-2" });
  assert.deepEqual(history.limits, [2]);
  const next = await fixture({ rows: [] });
  await next.run(machine, new URLSearchParams({ ...scope, cursor: page.nextCursor }));
  const query = next.predicates[0];
  assert.match(query.sql, /"created_at" < \$[\s\S]*"created_at" = \$[\s\S]*"id" < \$/);
  assert.ok(query.params.includes("event-2"));
  assert.equal(query.params.filter((value) => value === "vault-1").length, 2);
  assert.equal(query.params.filter((value) => value === "env-1").length, 2);
  assert.ok(query.params.includes("secret-1"));
});

test("access client forwards every scoped filter, cursor, and cancellation signal", async (t) => {
  let url = ""; let init: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (nextUrl: string, nextInit: RequestInit) => {
    url = nextUrl; init = nextInit;
    return Response.json({ events: [{ ...auditRow, createdAt: timestamp.toISOString() }], nextCursor: "next" });
  });
  const signal = new AbortController().signal;
  const page = await secretsClient.secretAccessHistory("team /?β", "vault /?β", "env /?β", "secret /?β", "cursor +/=β", signal);
  const parsed = new URL(url, "https://test.invalid");
  assert.equal(parsed.pathname, "/api/team%20%2F%3F%CE%B2/secrets/audit");
  for (const [key, value] of Object.entries({ category: "access", projectSlug: "vault /?β", environmentSlug: "env /?β", secretId: "secret /?β", cursor: "cursor +/=β", limit: "50" })) assert.equal(parsed.searchParams.get(key), value);
  assert.equal(init?.signal, signal);
  assert.equal(init?.cache, "no-store");
  assert.equal(init?.credentials, "same-origin");
  assert.equal(page.events[0].entryId, "secret-1");
  assert.equal(page.events[0].result, "denied");
  assert.equal(page.nextCursor, "next");
});

test("access client rejects late cancellation and server errors", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    const response = Response.json({ events: [], nextCursor: null });
    t.mock.method(response, "json", async () => { controller.abort(); return { events: [], nextCursor: null }; });
    return response;
  });
  await assert.rejects(secretsClient.secretAccessHistory("acme", "vault", "development", "secret-1", null, controller.signal), { name: "AbortError" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Not permitted", code: "FORBIDDEN" }, { status: 403 }));
  await assert.rejects(secretsClient.secretAccessHistory("acme", "vault", "development", "secret-1"), /Not permitted/);
});

test("grouped reads attribute returned IDs exactly and omit oversized attribution instead of truncating", async () => {
  const compiled = await realFunction("../src/lib/secrets/entries.ts", "plaintextEnvironmentValues");
  for (const count of [2, 1_001]) {
    const rows = Array.from({ length: count }, (_, index) => ({ entry: { id: `entry-${index}`, key: `KEY_${index}` }, version: { organizationKeyVersion: 1 } }));
    const environment = { id: "env-1", revision: 4, isProduction: false };
    const events: Array<{ metadata: Record<string, unknown> }> = [];
    const tx = { select() {
      let table: unknown;
      const query = {
        from(value: unknown) { table = value; return query; }, innerJoin() { return query; }, where() { return query; }, orderBy() { return query; },
        async for() {
          if (table === secretProjects) return [{ id: "vault-1" }];
          if (table === secretEnvironments) return [environment];
          if (table === secretEntries) return rows;
          throw new Error("Unexpected grouped access query");
        },
      };
      return query;
    } };
    const module = { exports: {} as { run: (...args: unknown[]) => Promise<unknown> } };
    runInNewContext(compiled, {
      module, exports: module.exports, Buffer, and, asc, eq, isNull, secretEntries, secretEnvironments, secretProjects, secretVersions, SecretsError, requireProductionConfirmation,
      db: { async transaction(callback: (value: typeof tx) => Promise<unknown>) { return callback(tx); } },
      async lockOrganizationForRead() {}, async transactionKeyForVersion() { return Buffer.alloc(32); },
      decryptVersion: () => "dummy-plaintext",
      async auditEvent(_tx: unknown, _access: unknown, event: { metadata: Record<string, unknown> }) { events.push(event); },
    });
    await module.exports.run(access, { id: "vault-1" }, environment, { action: "secrets.runtime_read" });
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata.count, count);
    if (count <= 1_000) assert.deepEqual(Array.from(events[0].metadata.entryIds as string[]), rows.map((row) => row.entry.id));
    else assert.equal("entryIds" in events[0].metadata, false);
    assert.doesNotMatch(JSON.stringify(events), /dummy-plaintext|KEY_\d/);
  }
});
