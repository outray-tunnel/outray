import assert from "node:assert/strict";
import { test } from "node:test";
import { certificateDomainAllowed, normalizeCertificateDomain } from "../src/domain-authorization";

const env = { OUTRAY_DEPLOYMENT_MODE: "self-hosted", BASE_DOMAIN: "tunnels.example.net", STATUS_PUBLIC_URL: "https://status.example.net", CONSOLE_PUBLIC_URL: "https://console.example.net" };

test("certificate domains reject IPs, authorities and malformed DNS labels", () => {
  assert.equal(normalizeCertificateDomain("API.EXAMPLE.NET."), "api.example.net");
  for (const domain of [undefined, ["example.net"], "", "127.0.0.1", "foo..example.net", "-api.example.net", "api-.example.net", "a".repeat(64) + ".example.net", "example.net:443", "example.net@evil.test"]) {
    assert.equal(normalizeCertificateDomain(domain), null);
  }
});

test("infrastructure certificates use configured public hosts without database access", async () => {
  const unexpected = async () => { throw new Error("Unexpected database access"); };
  assert.equal(await certificateDomainAllowed("console.example.net", unexpected, env), true);
  assert.equal(await certificateDomainAllowed("status.example.net", unexpected, env), true);
  assert.equal(await certificateDomainAllowed("tunnels.example.net", unexpected, env), true);
});

test("hosted tunnel connection host and legacy API aliases receive certificates without a database lookup", async () => {
  const unexpected = async () => { throw new Error("Unexpected database access"); };
  for (const domain of ["connect.outray.co", "api.outray.co", "api.outray.dev"]) {
    assert.equal(await certificateDomainAllowed(domain, unexpected, {}), true);
    assert.equal(await certificateDomainAllowed(domain, async () => ({ rowCount: 0 }), env), false);
  }
});

test("status namespace authorization requires exact published page and never falls through", async () => {
  const queries: Array<[string, string[]]> = [];
  const lookup = async (sql: string, values: string[]) => {
    queries.push([sql, values]);
    return { rowCount: values[0] === "acme" ? 1 : 0 };
  };
  assert.equal(await certificateDomainAllowed("acme.status.example.net", lookup, env), true);
  assert.match(queries[0]![0], /published = true/);
  assert.deepEqual(queries[0]![1], ["acme"]);
  assert.equal(await certificateDomainAllowed("draft.status.example.net", lookup, env), false);
  const count = queries.length;
  assert.equal(await certificateDomainAllowed("nested.acme.status.example.net", lookup, env), false);
  assert.equal(await certificateDomainAllowed("acme.status.example.net", lookup, { ...env, OUTRAY_PRODUCTS: "tunnels" }), false);
  assert.equal(queries.length, count);
});

test("tunnel certificates use BASE_DOMAIN, exact registered URL and product policy", async () => {
  const queries: Array<[string, string[]]> = [];
  const lookup = async (sql: string, values: string[]) => { queries.push([sql, values]); return { rowCount: 1 }; };
  assert.equal(await certificateDomainAllowed("app.tunnels.example.net", lookup, env), true);
  assert.deepEqual(queries[0]![1], ["https://app.tunnels.example.net"]);
  assert.match(queries[0]![0], /FROM tunnels/);
  assert.equal(await certificateDomainAllowed("app.tunnels.example.net", lookup, { ...env, OUTRAY_PRODUCTS: "uptime" }), false);
  assert.equal(queries.length, 1);
});

test("custom certificates require active bindings and tenant-matched published status pages", async () => {
  let statement = "";
  let parameters: string[] = [];
  const lookup = async (sql: string, values: string[]) => { statement = sql; parameters = values; return { rowCount: 0 }; };
  assert.equal(await certificateDomainAllowed("health.customer.test", lookup, env), false);
  assert.match(statement, /d.status = 'active'/);
  assert.match(statement, /p.organization_id = d.organization_id/);
  assert.match(statement, /p.published = true/);
  assert.deepEqual(parameters, ["health.customer.test", "true", "true"]);
  await certificateDomainAllowed("health.customer.test", lookup, { ...env, OUTRAY_PRODUCTS: "tunnels" });
  assert.deepEqual(parameters, ["health.customer.test", "true", "false"]);
});
