import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import publicHosts from "../../../shared/public-hosts";
import { isReservedStatusCustomDomain, statusDnsTarget } from "../src/lib/uptime/domain-config";
import { observabilitySetupCode, setupCliCommand } from "../src/components/onboarding/setup-endpoints";
import { loadRouteHandlers } from "./helpers/load-route";

const env = {
  OUTRAY_DEPLOYMENT_MODE: "self-hosted", BASE_DOMAIN: "tunnels.example.net",
  STATUS_PUBLIC_URL: "https://health.example.net", CONSOLE_PUBLIC_URL: "https://console.example.net",
  TUNNEL_PUBLIC_URL: "https://edge.example.net", INGEST_PUBLIC_URL: "https://ingest.example.net",
  SHARE_PUBLIC_URL: "https://share.example.net",
};

test("custom status domains cannot claim configured infrastructure or reserved namespaces", () => {
  for (const domain of ["health.example.net", "acme.health.example.net", "console.example.net", "nested.console.example.net", "tunnels.example.net", "api.tunnels.example.net", "edge.example.net", "ingest.example.net", "share.example.net"]) {
    assert.equal(isReservedStatusCustomDomain(domain, env), true, domain);
  }
  assert.equal(isReservedStatusCustomDomain("health.customer.test", env), false);
  assert.equal(isReservedStatusCustomDomain("health.example.net.attacker.test", env), false);
  assert.equal(isReservedStatusCustomDomain("status.outray.dev", env), false);
  for (const domain of ["status.outray.app", "api.outray.app", "status.outray.dev"]) assert.equal(isReservedStatusCustomDomain(domain, {}), true);
  assert.equal(statusDnsTarget(env), "health.example.net");
  assert.equal(statusDnsTarget({}), "status.outray.app");
});

test("DNS targets use public status and edge origins, not fixed hosted destinations", () => {
  assert.equal(publicHosts.canonicalStatusHostname({ OUTRAY_STATUS_URL: "https://health.example.net:8443" }), "health.example.net");
  assert.equal(publicHosts.tunnelDnsHostname("wss://edge.example.net/"), "edge.example.net");
  assert.equal(publicHosts.tunnelDnsHostname("https://EDGE.EXAMPLE.NET"), "edge.example.net");
  assert.equal(publicHosts.tunnelDnsHostname(), "edge.outray.app");
  assert.throws(() => publicHosts.tunnelDnsHostname("wss://user:secret@edge.example.net"));
});

test("all framework examples include the installation OTLP endpoint when configured", async () => {
  const source = await readFile(new URL("../src/components/onboarding/observability-setup.tsx", import.meta.url), "utf8");
  const templates = source.slice(source.indexOf("const observabilityFrameworks:"), source.indexOf("export function ObservabilitySetup"));
  const compiled = ts.transpileModule(templates, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const frameworks = runInNewContext(`${compiled}\nobservabilityFrameworks;`) as Record<string, { code: string }>;
  for (const [framework, details] of Object.entries(frameworks)) {
    const configured = observabilitySetupCode(details.code, { ingestUrl: "https://ingest.example.net/" });
    assert.match(configured, /endpoint: "https:\/\/ingest.example.net",/, framework);
    assert.equal((configured.match(/endpoint:/g) ?? []).length, 1);
    assert.equal(observabilitySetupCode(details.code, {}), details.code);
  }
});

test("self-hosted CLI setup always sets console and edge together; hosted commands remain compact", () => {
  assert.equal(setupCliCommand("outray login", {}), "outray login");
  const endpoints = { mode: "self-hosted", consoleUrl: "https://console.example.net", tunnelUrl: "https://edge.example.net/" };
  assert.equal(setupCliCommand("outray login", endpoints), "OUTRAY_WEB_URL='https://console.example.net' OUTRAY_SERVER_URL='wss://edge.example.net' outray login");
  assert.match(setupCliCommand("outray 3000 --org acme", endpoints), /OUTRAY_WEB_URL=.*OUTRAY_SERVER_URL=.*outray 3000 --org acme/);
  assert.throws(() => setupCliCommand("outray login", { mode: "self-hosted", consoleUrl: "https://console.example.net" }), /VITE_TUNNEL_URL/);
  assert.throws(() => setupCliCommand("outray login", { ...endpoints, consoleUrl: "https://name:secret@console.example.net" }), /without credentials/);
});

const table = (name: string) => new Proxy({ name }, { get: (value, field) => field === "name" ? value.name : `${name}.${String(field)}` });
const domain = { id: "domain-new", organizationId: "org-acme", domain: "health.customer.test", purpose: "status", status: "pending" };
const page = { id: "page-acme", organizationId: "org-acme", domainId: null };

function selection(rows: unknown[]) {
  const chain = {
    from() { return chain; }, where() { return chain; }, for() { return chain; }, limit() { return chain; }, returning() { return chain; },
    then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve(rows).then(resolve, reject); },
  };
  return chain;
}

test("status-domain creation returns the configured CNAME and blocks reserved hosts before writes", async () => {
  let transactions = 0;
  const tx = {
    rows: [[{ id: "org-acme" }], [page], []] as unknown[][],
    select() { return selection(tx.rows.shift() ?? []); },
    insert() { return { values: (values: unknown) => selection([values]) }; },
    update() { return { set: () => selection([]) }; },
  };
  const db = { transaction: async (callback: (value: typeof tx) => Promise<unknown>) => { transactions++; return callback(tx); } };
  const source = await readFile(new URL("../src/routes/api/$orgSlug/uptime/domains/index.ts", import.meta.url), "utf8");
  const handlers = await loadRouteHandlers<{ POST: (input: { request: Request; params: { orgSlug: string } }) => Promise<Response> }>({
    path: "status-domain-create", source: `const crypto = { randomUUID: () => 'domain-new' };\n${source}`,
    modules: {
      "drizzle-orm": { and: (...conditions: unknown[]) => conditions, eq: (field: unknown, value: unknown) => ({ field, value }) },
      "@/db": { db }, "@/db/app-schema": { domains: table("domains") }, "@/db/auth-schema": { organizations: table("organizations") },
      "@/db/uptime-schema": { uptimeStatusPages: table("pages") },
      "@/lib/uptime/domain-config": { statusDnsTarget: () => statusDnsTarget(env), isReservedStatusCustomDomain: (host: string) => isReservedStatusCustomDomain(host, env) },
      "@/lib/uptime/api": {
        requireUptimeManager: async () => ({ organization: { id: "org-acme" }, session: { user: { id: "user-acme" } } }),
        jsonBody: (request: Request) => request.json(), badInput: (error: string) => Response.json({ error }, { status: 400 }),
      },
    },
  });
  for (const host of ["acme.health.example.net", "api.tunnels.example.net", "console.example.net", "edge.example.net"]) {
    const response = await handlers.POST({ request: new Request("https://console.example.net/api", { method: "POST", body: JSON.stringify({ domain: host }) }), params: { orgSlug: "acme" } });
    assert.equal(response.status, 400);
  }
  assert.equal(transactions, 0);
  const response = await handlers.POST({ request: new Request("https://console.example.net/api", { method: "POST", body: JSON.stringify({ domain: domain.domain }) }), params: { orgSlug: "acme" } });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.dns.cnameTarget, "health.example.net");
  assert.equal(result.dns.txtValue, "domain-new");
  assert.equal(result.domain.organizationId, "org-acme");
});

test("status-domain verification requires ownership plus the configured CNAME, never the hosted default", async () => {
  let target = "status.outray.app";
  let writes = 0;
  const db = {
    rows: [[domain], [{ ...page, domainId: domain.id }]] as unknown[][],
    select() { return selection(db.rows.shift() ?? []); },
    update() { writes++; return { set: () => selection([{ ...domain, status: "active" }]) }; },
  };
  const handlers = await loadRouteHandlers<{ POST: (input: { request: Request; params: { orgSlug: string; domainId: string } }) => Promise<Response> }>({
    path: new URL("../src/routes/api/$orgSlug/uptime/domains/$domainId.verify.ts", import.meta.url),
    modules: {
      "node:dns/promises": { resolveTxt: async () => [[domain.id]], resolveCname: async () => [target] },
      "drizzle-orm": { and: (...conditions: unknown[]) => conditions, eq: (field: unknown, value: unknown) => ({ field, value }) },
      "@/db": { db }, "@/db/app-schema": { domains: table("domains") }, "@/db/uptime-schema": { uptimeStatusPages: table("pages") },
      "@/lib/uptime/domain-config": { statusDnsTarget: () => statusDnsTarget(env) },
      "@/lib/uptime/api": {
        requireUptimeManager: async () => ({ organization: { id: "org-acme" } }),
        notFound: (error: string) => Response.json({ error }, { status: 404 }), badInput: (error: string) => Response.json({ error }, { status: 400 }),
      },
    },
  });
  const call = () => handlers.POST({ request: new Request("https://console.example.net/api", { method: "POST" }), params: { orgSlug: "acme", domainId: domain.id } });
  assert.equal((await call()).status, 400);
  assert.equal(writes, 0);
  target = "HEALTH.EXAMPLE.NET.";
  db.rows = [[domain], [{ ...page, domainId: domain.id }]];
  assert.equal((await call()).status, 200);
  assert.equal(writes, 1);
});
