import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type PageFixture = { id: string; organization_id: string; domain_id: string; published: boolean };
type DomainFixture = { id: string; organization_id: string; domain: string; purpose: string; status: string };

function customDomainLookup(pages: PageFixture[], domains: DomainFixture[]) {
  let queryCount = 0;
  const module = { exports: {} as { findPageForRequest: (request: Request, slug: string | null) => Promise<PageFixture | null> } };
  const source = readFileSync(new URL("../src/lib/status-data.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, {
    module, exports: module.exports, URL, Date, process: { env: { NODE_ENV: "production", OUTRAY_DEPLOYMENT_MODE: "self-hosted" } },
    require(specifier: string) {
      if (specifier === "./config") return {
        getStatusConfig: () => ({ enabled: true, canonicalHost: "status.ops.example.net" }),
        STATUS_PAGE_SLUG: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
      };
      if (specifier === "./db") return {
        async query(statement: string, parameters: string[]) {
          queryCount++;
          // Exercise the real request lookup and guard the query's tenant,
          // publication and binding contract independently of TLS admission.
          assert.match(statement, /JOIN domains d ON d\.id = p\.domain_id AND d\.organization_id = p\.organization_id/);
          assert.match(statement, /d\.domain = \$1 AND d\.purpose = 'status' AND d\.status = 'active'/);
          assert.match(statement, /p\.published = true/);
          assert.deepEqual(Array.from(parameters), ["health.customer.test"]);
          return pages.filter((page) => page.published && domains.some((domain) =>
            domain.id === page.domain_id && domain.organization_id === page.organization_id &&
            domain.domain === parameters[0] && domain.purpose === "status" && domain.status === "active",
          ));
        },
      };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  return { findPage: module.exports.findPageForRequest, queryCount: () => queryCount };
}

const domain: DomainFixture = { id: "domain-1", organization_id: "organization-1", domain: "health.customer.test", purpose: "status", status: "active" };
const page: PageFixture = { id: "page-1", organization_id: "organization-1", domain_id: "domain-1", published: true };
const request = () => new Request("https://health.customer.test/");

test("public custom status lookup resolves only a same-tenant active published binding", async () => {
  const fixture = customDomainLookup([page], [domain]);
  assert.equal(await fixture.findPage(request(), null), page);
  assert.equal(fixture.queryCount(), 1);
});

test("public status lookup rejects cross-tenant bindings after certificate issuance", async () => {
  const fixture = customDomainLookup([{ ...page, organization_id: "another-organization" }], [domain]);
  assert.equal(await fixture.findPage(request(), null), null);
  assert.equal(fixture.queryCount(), 1);
});

test("public status lookup rejects unpublished pages, revoked domains and tunnel bindings", async () => {
  for (const [pages, domains] of [
    [[{ ...page, published: false }], [domain]],
    [[page], [{ ...domain, status: "pending" }]],
    [[page], [{ ...domain, purpose: "tunnel" }]],
  ] as const) {
    const fixture = customDomainLookup([...pages], [...domains]);
    assert.equal(await fixture.findPage(request(), null), null);
    assert.equal(fixture.queryCount(), 1);
  }
});
