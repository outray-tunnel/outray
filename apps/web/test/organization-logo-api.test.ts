import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { and, eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";
import { members, organizations } from "../src/db/auth-schema";
import { admin, owner } from "../src/lib/permissions";
import { InvalidOrganizationLogo } from "../src/lib/organization-logo-storage.server";

const uploaded = { url: "https://delivery.outray.test/org-logos/743dd89d-5d80-4671-b637-940a68ddf4b1.png", fileName: "743dd89d-5d80-4671-b637-940a68ddf4b1.png" };
type Options = {
  signedOut?: boolean; role?: string | null; lockedRole?: string | null; missingOrganization?: boolean;
  validationError?: InvalidOrganizationLogo; storageError?: boolean; writeError?: boolean; commitError?: boolean;
  references?: Array<{ id: string }>; cleanupReadError?: boolean;
};

async function fixture(options: Options = {}) {
  const source = await readFile(new URL("../src/routes/api/$orgSlug/organization/logo.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: string[] = [];
  const predicates: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const writes: Record<string, unknown>[] = [];
  let sessionInput: { headers: Headers; query: { disableCookieCache: boolean } } | undefined;
  const tx = {
    select() {
      let table: unknown;
      const query = {
        from(value: unknown) { table = value; return query; },
        where(predicate: SQL) { predicates.push(new PgDialect().sqlToQuery(predicate)); return query; },
        async for(mode: string) {
          if (table === organizations) { calls.push(`lock:organization:${mode}`); return options.missingOrganization ? [] : [{ id: "org-a" }]; }
          calls.push(`lock:membership:${mode}`);
          const role = options.lockedRole === undefined ? options.role ?? "admin" : options.lockedRole;
          return role === null ? [] : [{ role }];
        },
      };
      return query;
    },
    update(table: unknown) {
      assert.equal(table, organizations);
      return { set(value: Record<string, unknown>) {
        writes.push(value);
        return { where(predicate: SQL) {
          predicates.push(new PgDialect().sqlToQuery(predicate));
          return { async returning() { calls.push("update:logo"); if (options.writeError) throw new Error("private database failure"); return [{ logo: uploaded.url }]; } };
        } };
      } };
    },
  };
  const db = {
    select() {
      let table: unknown;
      const query = {
        from(value: unknown) { table = value; return query; }, innerJoin() { return query; },
        where(predicate: SQL) { predicates.push(new PgDialect().sqlToQuery(predicate)); return query; },
        async limit() {
          if (table === members) { calls.push("resolve:membership"); return options.role === null ? [] : [{ id: "org-a", role: options.role ?? "admin" }]; }
          calls.push("cleanup:references");
          if (options.cleanupReadError) throw new Error("uncertain reference lookup");
          return options.references ?? [];
        },
      };
      return query;
    },
    async transaction(callback: (value: typeof tx) => Promise<unknown>) {
      calls.push("transaction:begin");
      const result = await callback(tx);
      if (options.commitError) throw new Error("uncertain commit");
      calls.push("transaction:commit");
      return result;
    },
  };
  const module = { exports: {} as { Route: { server: { handlers: { POST: (input: { request: Request; params: { orgSlug: string } }) => Promise<Response> } } } } };
  runInNewContext(compiled, {
    module, exports: module.exports, URL, Headers, Response, Date, console: { error() {} },
    require(specifier: string) {
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (config: unknown) => config };
      if (specifier === "drizzle-orm") return { and, eq };
      if (specifier === "@/db") return { db };
      if (specifier === "@/db/auth-schema") return { members, organizations };
      if (specifier === "@/lib/permissions") return { admin, owner };
      if (specifier === "@/lib/auth") return { auth: { api: { async getSession(input: typeof sessionInput) {
        sessionInput = input; calls.push("session"); return options.signedOut ? null : { user: { id: "user-a" } };
      } } } };
      if (specifier === "@/lib/organization-logo-storage.server") return {
        InvalidOrganizationLogo,
        async readOrganizationLogoUpload() { calls.push("validate:upload"); if (options.validationError) throw options.validationError; return { bytes: new Uint8Array([1]), contentType: "image/png" }; },
        async storeOrganizationLogo() { calls.push("store:logo"); if (options.storageError) throw new Error("private storage failure"); return uploaded; },
        async deleteNewOrganizationLogo(logo: unknown) { assert.equal(logo, uploaded); calls.push("cleanup:delete"); },
      };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  return {
    calls, predicates, writes, get sessionInput() { return sessionInput; },
    run(request = new Request("https://console.outray.test/api/team/organization/logo", { method: "POST", headers: { origin: "https://console.outray.test", authorization: "Bearer ignored" } }), orgSlug = "team") {
      return module.exports.Route.server.handlers.POST({ request, params: { orgSlug } });
    },
  };
}

test("logo uploads authenticate the session and authorize the URL organization before reading the image", async () => {
  for (const options of [{ signedOut: true }, { role: null }, { role: "member" }]) {
    const api = await fixture(options);
    const response = await api.run();
    assert.equal(response.status, options.signedOut ? 401 : 403);
    assert.equal(api.calls.includes("validate:upload"), false);
    assert.equal(api.calls.includes("store:logo"), false);
    assert.equal(api.writes.length, 0);
  }
  const api = await fixture();
  const response = await api.run(undefined, "team-slug");
  assert.equal(response.status, 200);
  assert.equal(api.sessionInput?.headers.has("authorization"), false);
  assert.equal(api.sessionInput?.query.disableCookieCache, true);
  assert.ok(api.predicates[0].params.includes("user-a"));
  assert.ok(api.predicates[0].params.includes("team-slug"));
});

test("cookie-authenticated logo writes reject missing, malformed and cross-site origins", async () => {
  const api = await fixture();
  for (const headers of [{}, { origin: "https://attacker.invalid" }, { origin: "null" },
    { origin: "https://console.outray.test/path" }, { origin: "https://console.outray.test", "sec-fetch-site": "cross-site" }]) {
    const response = await api.run(new Request("https://console.outray.test/api/team/organization/logo", { method: "POST", headers }));
    assert.equal(response.status, 403);
  }
  assert.deepEqual(api.calls, []);
  const response = await api.run(new Request("https://console.outray.test/api/team/organization/logo", { method: "POST", headers: { referer: "https://console.outray.test/team/settings/organization" } }));
  assert.equal(response.status, 200);
});

test("successful uploads update only the authorized organization's logo and retain earlier immutable objects", async () => {
  const api = await fixture({ role: "owner" });
  const response = await api.run();
  assert.deepEqual(await response.json(), { logoUrl: uploaded.url });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(JSON.parse(JSON.stringify(api.writes)), [{ logo: uploaded.url }]);
  assert.ok(api.predicates.at(-1)?.params.includes("org-a"));
  assert.deepEqual(api.calls, ["session", "resolve:membership", "validate:upload", "store:logo", "transaction:begin", "lock:organization:update", "lock:membership:share", "update:logo", "transaction:commit"]);
});

test("permission changes and organization deletion during upload cannot update logo metadata", async () => {
  for (const options of [{ lockedRole: "member" }, { lockedRole: null }, { missingOrganization: true }]) {
    const api = await fixture(options);
    const response = await api.run();
    assert.equal(response.status, options.missingOrganization ? 404 : 403);
    assert.equal(api.writes.length, 0);
    assert.ok(api.calls.includes("cleanup:references"));
    assert.ok(api.calls.includes("cleanup:delete"));
  }
});

test("invalid/oversized uploads and storage failures never update organization metadata", async () => {
  for (const options of [{ validationError: new InvalidOrganizationLogo("Bad image") },
    { validationError: new InvalidOrganizationLogo("Too large", 413) }, { storageError: true }]) {
    const api = await fixture(options);
    const response = await api.run();
    assert.equal(response.status, options.storageError ? 503 : options.validationError?.status);
    assert.equal(api.writes.length, 0);
    assert.equal(api.calls.includes("transaction:begin"), false);
    assert.doesNotMatch(await response.text(), /private storage failure/);
  }
});

test("failed metadata writes remove only a confirmed unreferenced new object", async () => {
  const api = await fixture({ writeError: true });
  const response = await api.run();
  assert.equal(response.status, 503);
  assert.ok(api.calls.includes("cleanup:references"));
  assert.ok(api.calls.includes("cleanup:delete"));
  assert.ok(api.predicates.at(-1)?.params.includes(uploaded.url));
  assert.doesNotMatch(await response.text(), /private database failure/);
  for (const options of [{ commitError: true, references: [{ id: "org-a" }] }, { writeError: true, cleanupReadError: true }]) {
    const uncertain = await fixture(options);
    assert.equal((await uncertain.run()).status, 503);
    assert.ok(uncertain.calls.includes("cleanup:references"));
    assert.equal(uncertain.calls.includes("cleanup:delete"), false);
  }
});
