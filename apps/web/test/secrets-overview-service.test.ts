import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";
import { SecretsClientError, secretsClient } from "../src/lib/secrets-client";

const createdAt = "2026-10-01T00:00:00.000Z";
const project = {
  id: "vault-1", name: "API", slug: "api", description: null,
  environmentCount: 0, secretCount: 0, createdAt, updatedAt: createdAt,
  environments: [] as Record<string, unknown>[],
};
const activity = {
  id: "event-1", action: "project.deleted", targetType: "project",
  targetName: "Old vault", createdAt,
};
const emptyRow = {
  projects: [] as Record<string, unknown>[],
  project_count: 0, environment_count: 0, secret_count: 0,
  deleted_item_count: 0, last_rotation_at: null,
  recent_activity: [] as typeof activity[],
};
type OverviewRow = typeof emptyRow;

/** Exercise the real query builder/response mapper without importing a pool or requiring a database. */
async function overviewFixture(row: OverviewRow) {
  const source = await readFile(new URL("../src/lib/secrets/projects.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("projects.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "getOverview",
  );
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration.getText(ast), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  let query: ReturnType<PgDialect["sqlToQuery"]> | undefined;
  const module = { exports: {} as { getOverview: (access: unknown) => Promise<unknown> } };
  runInNewContext(compiled, {
    module, exports: module.exports, sql,
    timedDb: (_label: string, result: Promise<unknown>) => result,
    db: { execute(statement: SQL) {
      query = new PgDialect().sqlToQuery(statement);
      return Promise.resolve({ rows: [row] });
    } },
  });
  const result = await module.exports.getOverview({
    organization: { id: "org-1" }, actor: { type: "user" },
  });
  assert.ok(query);
  return { result: JSON.parse(JSON.stringify(result)), query };
}

function assertFilteredProjectAggregate(statement: string) {
  assert.match(statement, /jsonb_agg\s*\(\s*jsonb_build_object\s*\(\s*'id',\s*pr\.id,[\s\S]*?\)\s*order by pr\.name\s*\)\s*filter\s*\(where pr\.id is not null\)\s*,\s*'\[\]'::jsonb\s*\) as projects/i,
    "exclude the LEFT JOIN's null project before aggregating, so an empty inventory is [] rather than a phantom vault");
  assert.match(statement, /from recent_activity\s+left join project_rows pr on true\s+group by recent_activity\.events/i,
    "keep the activity row even when no active project remains");
}

test("overview SQL excludes null joined projects inside its aggregate without discarding activity", async () => {
  const { query } = await overviewFixture(emptyRow);
  assertFilteredProjectAggregate(query.sql);
  const beforeFix = query.sql.replace(/\s+filter\s*\(where pr\.id is not null\)/i, "");
  assert.notEqual(beforeFix, query.sql);
  assert.throws(() => assertFilteredProjectAggregate(beforeFix), { code: "ERR_ASSERTION" }, "the regression guard rejects the pre-fix SQL");
});

const fixtures: Array<{ name: string; row: OverviewRow }> = [
  { name: "no vaults and no activity", row: emptyRow },
  { name: "no vaults but retained deletion activity", row: { ...emptyRow, deleted_item_count: 1, recent_activity: [activity] } },
  { name: "a vault with no environments", row: { ...emptyRow, projects: [project], project_count: 1 } },
  { name: "a populated vault", row: {
    ...emptyRow, project_count: 1, environment_count: 1, secret_count: 2,
    projects: [{ ...project, environmentCount: 1, secretCount: 2, environments: [{
      id: "env-1", name: "Production", slug: "production", description: null,
      isProduction: true, revision: 1, secretCount: 2, createdAt, updatedAt: createdAt,
    }] }], recent_activity: [activity],
  } },
];

for (const { name, row } of fixtures) {
  test(`overview service and client preserve ${name}`, async (t) => {
    const { result, query } = await overviewFixture(row);
    assertFilteredProjectAggregate(query.sql);
    assert.deepEqual(result.summary, {
      projects: row.project_count, environments: row.environment_count,
      secrets: row.secret_count, deletedItems: row.deleted_item_count, lastRotationAt: null,
    });
    assert.deepEqual(result.projects, row.projects);
    assert.deepEqual(result.recentActivity, row.recent_activity);
    t.mock.method(globalThis, "fetch", async () => Response.json(result));
    const normalized = await secretsClient.overview("acme");
    assert.deepEqual([normalized.projectCount, normalized.environmentCount, normalized.secretCount],
      [row.project_count, row.environment_count, row.secret_count]);
    assert.equal(normalized.projects.length, row.projects.length);
    assert.equal(normalized.projects[0]?.environments.length ?? 0, row.environment_count);
    for (const environment of normalized.projects[0]?.environments ?? []) {
      assert.equal(environment.secretCount, row.secret_count);
    }
    assert.deepEqual(normalized.recentActivity.map((event) => event.id), row.recent_activity.map((event) => event.id));
  });
}

test("the client rejects the null-filled phantom vault emitted by the pre-fix empty aggregate", async (t) => {
  const { result } = await overviewFixture(emptyRow);
  result.projects = [{
    id: null, name: null, slug: null, description: null,
    environmentCount: null, secretCount: null, createdAt: null, updatedAt: null, environments: null,
  }];
  t.mock.method(globalThis, "fetch", async () => Response.json(result));
  await assert.rejects(secretsClient.overview("acme"), (error: unknown) =>
    error instanceof SecretsClientError && error.code === "INVALID_RESPONSE",
  );
});
