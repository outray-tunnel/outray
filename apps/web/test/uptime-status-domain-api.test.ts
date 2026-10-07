import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const organizationId = "org-status";
const page = { id: "page-status", organizationId, slug: "acme", domainId: "domain-status" as string | null };
const domain = { id: page.domainId, organizationId, domain: "status.example.com", purpose: "status", status: "active" };

type Row = Record<string, unknown>;
type Predicate = { type: "and"; conditions: Predicate[] } | { type: "eq"; field: string; value: unknown };
const table = (name: string) => new Proxy({ table: name }, {
  get: (target, key) => key === "table" ? target.table : `${name}.${String(key)}`,
});

async function loadPageHarness(options: { page?: typeof page | null; domain?: Row | null } = {}) {
  const source = await readFile(new URL("../src/lib/uptime/api.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const queries: Array<{ table: string; conditions: Predicate; fields?: Row; limit?: number }> = [];
  const pageRow = options.page === undefined ? page : options.page;
  const domainRow = options.domain === undefined ? domain : options.domain;
  const rows: Record<string, Row[]> = {
    pages: pageRow ? [pageRow] : [], domains: domainRow ? [domainRow] : [], groups: [], components: [],
  };
  const matches = (row: Row, condition: Predicate): boolean => condition.type === "and"
    ? condition.conditions.every((child) => matches(row, child))
    : row[condition.field.split(".")[1]] === condition.value;
  const db = {
    select(fields?: Row) {
      let selectedTable: { table: string };
      let conditions: Predicate;
      let limit: number | undefined;
      const selection = {
        from(value: { table: string }) { selectedTable = value; return selection; },
        where(value: Predicate) { conditions = value; return selection; },
        limit(value: number) { limit = value; return selection; },
        then(resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) {
          queries.push({ table: selectedTable.table, conditions, fields, limit });
          assert.ok(selectedTable.table in rows, `Unexpected table: ${selectedTable.table}`);
          const matchingRows = rows[selectedTable.table].filter((row) => matches(row, conditions));
          return Promise.resolve(limit === undefined ? matchingRows : matchingRows.slice(0, limit)).then(resolve, reject);
        },
      };
      return selection;
    },
  };
  const module = { exports: {} as { loadPage: (organizationId: string) => Promise<{ page: Row } | null> } };
  runInNewContext(compiled, {
    module, exports: module.exports, Date, Map, Set, Promise,
    require: (specifier: string) => {
      if (specifier === "drizzle-orm") return {
        and: (...conditions: Predicate[]): Predicate => ({ type: "and", conditions }),
        eq: (field: string, value: unknown): Predicate => ({ type: "eq", field, value }),
      };
      if (specifier === "@/db") return { db };
      if (specifier === "@/db/app-schema") return { domains: table("domains") };
      if (specifier === "@/db/auth-schema") return {};
      if (specifier === "@/db/uptime-schema") return {
        uptimeStatusPages: table("pages"), uptimeStatusGroups: table("groups"), uptimeStatusComponents: table("components"),
      };
      if (specifier === "./state") return { rollupStatus: () => "unknown" };
      if (["@/lib/observability/alert-access", "@/lib/observability/alert-validation", "@/lib/org"].includes(specifier)) return {};
      throw new Error(`Unexpected status-domain API dependency: ${specifier}`);
    },
  });
  return { load: () => module.exports.loadPage(organizationId), queries };
}

test("status-page API exposes only its linked active status domain within the organization", async () => {
  const harness = await loadPageHarness();
  const result = await harness.load();
  assert.equal(result?.page.customDomain, domain.domain);
  const lookup = harness.queries.find((query) => query.table === "domains")!;
  assert.ok(lookup);
  assert.equal(lookup.fields?.domain, "domains.domain");
  assert.equal(Object.keys(lookup.fields ?? {}).length, 1);
  assert.equal(lookup.limit, 1);

  for (const invalidDomain of [
    { ...domain, id: "unlinked-domain" },
    { ...domain, organizationId: "other-org" },
    { ...domain, purpose: "tunnel" },
    { ...domain, status: "pending" },
    { ...domain, status: "failed" },
    null,
  ]) {
    const invalid = await loadPageHarness({ domain: invalidDomain });
    assert.equal((await invalid.load())?.page.customDomain, null);
  }
});

test("status-page API skips domain lookup when no domain is linked or the page is missing", async () => {
  const unlinked = await loadPageHarness({ page: { ...page, domainId: null } });
  assert.equal((await unlinked.load())?.page.customDomain, null);
  assert.equal(unlinked.queries.some((query) => query.table === "domains"), false);

  const missing = await loadPageHarness({ page: null });
  assert.equal(await missing.load(), null);
  assert.equal(missing.queries.length, 1);
  assert.equal(missing.queries[0].table, "pages");
});
