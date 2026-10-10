import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { statusCertificateDomainAllowed } from "../src/domain-authorization";
import { statusDomainCheckHandler } from "../src/status-domain-check";

const env = {
  OUTRAY_DEPLOYMENT_MODE: "self-hosted",
  BASE_DOMAIN: "tunnels.example.net",
  STATUS_PUBLIC_URL: "https://status.example.net",
  CONSOLE_PUBLIC_URL: "https://console.example.net",
  INGEST_PUBLIC_URL: "https://ingest.example.net",
  TUNNEL_PUBLIC_URL: "https://edge.example.net",
  SHARE_PUBLIC_URL: "https://share.example.net",
};
const unexpectedLookup = async () => { throw new Error("Unexpected database access"); };

test("status-only certificates allow the canonical host only when uptime is enabled", async () => {
  assert.equal(await statusCertificateDomainAllowed("STATUS.EXAMPLE.NET.", unexpectedLookup, env), true);
  assert.equal(await statusCertificateDomainAllowed("status.example.net", unexpectedLookup, { ...env, UPTIME_ENABLED: "false" }), false);
  assert.equal(await statusCertificateDomainAllowed("status.example.net", unexpectedLookup, { ...env, OUTRAY_PRODUCTS: "tunnels" }), false);
  assert.equal(await statusCertificateDomainAllowed("status.example.net", unexpectedLookup, { ...env, OUTRAY_DEPLOYMENT_MODE: "hosted" }), false);
  assert.equal(await statusCertificateDomainAllowed("status.example.net", unexpectedLookup, { ...env, OUTRAY_DEPLOYMENT_MODE: "hosted", UPTIME_ENABLED: "true" }), true);
});

test("status-only slug certificates require a published one-label page", async () => {
  const queries: Array<[string, string[]]> = [];
  const lookup = async (sql: string, parameters: string[]) => {
    queries.push([sql, parameters]);
    return { rowCount: parameters[0] === "acme" ? 1 : 0 };
  };
  assert.equal(await statusCertificateDomainAllowed("acme.status.example.net", lookup, env), true);
  assert.match(queries[0]![0], /FROM uptime_status_pages WHERE slug = \$1 AND published = true/);
  assert.deepEqual(queries[0]![1], ["acme"]);
  assert.equal(await statusCertificateDomainAllowed("draft.status.example.net", lookup, env), false);
  assert.equal(await statusCertificateDomainAllowed("missing.status.example.net", lookup, env), false);
  assert.equal(await statusCertificateDomainAllowed("nested.acme.status.example.net", unexpectedLookup, env), false);
});

test("status-only certificates never approve infrastructure or tunnel namespaces", async () => {
  for (const domain of [
    "console.example.net", "nested.console.example.net", "ingest.example.net", "edge.example.net", "share.example.net",
    "tunnels.example.net", "www.tunnels.example.net", "api.tunnels.example.net", "app.tunnels.example.net", "nested.app.tunnels.example.net",
  ]) {
    assert.equal(await statusCertificateDomainAllowed(domain, unexpectedLookup, env), false, domain);
  }
});

test("status-only custom certificates require active status bindings and a tenant-matched published page", async () => {
  let statement = "";
  let parameters: string[] = [];
  const lookup = async (sql: string, values: string[]) => { statement = sql; parameters = values; return { rowCount: 1 }; };
  assert.equal(await statusCertificateDomainAllowed("health.customer.test", lookup, env), true);
  assert.match(statement, /d\.domain = \$1 AND d\.purpose = 'status' AND d\.status = 'active'/);
  assert.match(statement, /p\.domain_id = d\.id AND p\.organization_id = d\.organization_id AND p\.published = true/);
  assert.ok(!statement.includes("FROM tunnels"));
  assert.deepEqual(parameters, ["health.customer.test"]);
  assert.equal(await statusCertificateDomainAllowed("health.customer.test", async () => ({ rowCount: 0 }), env), false);
  assert.equal(await statusCertificateDomainAllowed("health.customer.test", async () => ({ rowCount: null }), env), false);
  assert.equal(await statusCertificateDomainAllowed("health.customer.test", unexpectedLookup, { ...env, UPTIME_ENABLED: "false" }), false);
});

test("malformed domains cannot reach status certificate database lookups", async () => {
  for (const domain of ["", "127.0.0.1", "foo..example.net", "-api.example.net", "api-.example.net", "example.net:443", "example.net@evil.test", "a".repeat(64) + ".example.net"]) {
    assert.equal(await statusCertificateDomainAllowed(domain, unexpectedLookup, env), false, domain);
  }
});

async function handleDomain(domain: unknown, lookup: Parameters<typeof statusDomainCheckHandler>[0]): Promise<number> {
  let status = 0;
  let sent = false;
  const response = {
    status(value: number) { status = value; return this; },
    send() { sent = true; return this; },
  };
  await statusDomainCheckHandler(lookup, env)({ query: { domain } } as unknown as Request, response as unknown as Response, () => assert.fail("Must not fall through"));
  assert.equal(sent, true);
  return status;
}

test("private status ask handler returns 200 only for authorized hosts", async () => {
  assert.equal(await handleDomain("STATUS.EXAMPLE.NET.", unexpectedLookup), 200);
  assert.equal(await handleDomain("acme.status.example.net", async () => ({ rowCount: 1 })), 200);
  assert.equal(await handleDomain("draft.status.example.net", async () => ({ rowCount: 0 })), 403);
  assert.equal(await handleDomain("app.tunnels.example.net", unexpectedLookup), 403);
  for (const domain of [undefined, ["health.customer.test"], { nested: "health.customer.test" }, "example.net:443"]) {
    assert.equal(await handleDomain(domain, unexpectedLookup), 400);
  }
});

test("private status ask handler fails closed without exposing lookup diagnostics", async () => {
  const originalError = console.error;
  const messages: unknown[][] = [];
  console.error = (...items: unknown[]) => { messages.push(items); };
  try {
    assert.equal(await handleDomain("health.customer.test", async () => { throw new Error("private connection detail"); }), 500);
    assert.deepEqual(messages, [["Status certificate authorization failed"]]);
  } finally {
    console.error = originalError;
  }
});
