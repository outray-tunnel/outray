import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { secretsClient } from "../src/lib/secrets-client";
import { SecretsError } from "../src/lib/secrets/types";
import * as validation from "../src/lib/secrets/validation";

/** Exercise the HTTP import input adapter without opening a database connection. */
async function importFixture() {
  const source = await readFile(new URL("../src/lib/secrets/entries.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("entries.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "importSecrets",
  );
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration.getText(ast), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const calls: unknown[][] = [];
  const result = { created: 1, updated: 1, revision: 8 };
  const module = { exports: {} as {
    importSecrets: (access: unknown, project: string, environment: string, input: Record<string, unknown>) => Promise<unknown>;
  } };
  runInNewContext(compiled, {
    module, exports: module.exports, SecretsError, ...validation,
    async importSecretValues(...args: unknown[]) { calls.push(args); return result; },
  });
  return { run: module.exports.importSecrets, calls, result };
}

test("HTTP imports forward normalized per-key versions for one mixed update/create batch", async () => {
  const fixture = await importFixture();
  const access = { organization: { id: "org-1" } };
  const result = await fixture.run(access, "vault", "production", {
    envText: "api key=changed\nNEW_KEY=created\n",
    expectedRevision: 7,
    expectedVersions: { "api key": 3, NEW_KEY: null },
    confirmProduction: true,
  });
  assert.equal(result, fixture.result);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0][0], access);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls[0].slice(1))), [
    "vault", "production", { API_KEY: "changed", NEW_KEY: "created" },
    { dryRun: false, expectedRevision: 7, expectedVersions: { API_KEY: 3, NEW_KEY: null }, confirmProduction: true, source: "import" },
  ]);
});

test("HTTP imports reject invalid or incomplete version guards before persistence", async () => {
  const fixture = await importFixture();
  for (const expectedVersions of [
    null, [], "3", {}, { API_KEY: 0 }, { API_KEY: -1 }, { API_KEY: 1.5 },
    { API_KEY: "3" }, { API_KEY: true }, { API_KEY: 3, OTHER_KEY: null },
    { API_KEY: 3, "api key": 3 },
  ]) {
    await assert.rejects(fixture.run({}, "vault", "development", {
      envText: "API_KEY=value\n", expectedRevision: 7, expectedVersions,
    }), (error: unknown) => error instanceof SecretsError &&
      error.code === "VALIDATION_ERROR" && error.field?.startsWith("expectedVersions") === true);
  }
  assert.equal(fixture.calls.length, 0);
});

test("legacy HTTP imports may omit per-key versions and dry runs preserve supplied guards", async () => {
  const fixture = await importFixture();
  await fixture.run({}, "vault", "development", { envText: "NEW_KEY=value\n", expectedRevision: 0 });
  const legacyOptions = fixture.calls[0][4] as Record<string, unknown>;
  assert.equal(legacyOptions.expectedVersions, undefined);
  assert.equal(legacyOptions.expectedRevision, 0);
  await fixture.run({}, "vault", "development", {
    envText: "NEW_KEY=value\n", dryRun: true, expectedRevision: 0,
    expectedVersions: { NEW_KEY: null },
  });
  const dryOptions = fixture.calls[1][4] as Record<string, unknown>;
  assert.equal(dryOptions.dryRun, true);
  assert.deepEqual(dryOptions.expectedVersions, { NEW_KEY: null });
});

test("import client sends nullable per-key versions and production/revision guards together", async (t) => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requestUrl = url; requestInit = init;
    return Response.json({ created: 1, updated: 1, unchanged: 0, revision: 8,
      keys: { created: ["NEW_KEY"], updated: ["API_KEY"], unchanged: [] } });
  });
  const input = {
    envText: "API_KEY=changed\nNEW_KEY=created\n", dryRun: false,
    expectedRevision: 7, expectedVersions: { API_KEY: 3, NEW_KEY: null }, confirmProduction: true,
  };
  const result = await secretsClient.importDotenv("acme/team", "api/vault", "prod/env", input);
  assert.equal(requestUrl, "/api/acme%2Fteam/secrets/projects/api%2Fvault/environments/prod%2Fenv/import");
  assert.equal(requestInit?.method, "POST");
  assert.equal(requestInit?.cache, "no-store");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), input);
  assert.equal(result.revision, 8);
  assert.deepEqual(result.keys, [{ key: "NEW_KEY", action: "create", reason: null }, { key: "API_KEY", action: "update", reason: null }]);
});
