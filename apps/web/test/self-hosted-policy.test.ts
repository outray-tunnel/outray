import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import instancePolicy from "../../../shared/instance-config";
import workspaceSlugPolicy from "../../../shared/workspace-slugs";
import { capacityDescription, getPlanLimits, getSubscriptionLimits, getUptimeMonitorLimit, getObservabilityAlertLimit, isUnlimitedPlanLimit, installationPlan } from "../src/lib/subscription-plans";
import { getMemberLimitMessage, hasAvailableMemberSeat } from "../src/lib/member-limit-policy";
import { loadRouteHandlers } from "./helpers/load-route";

const { instanceConfig, instancePathAvailable, instanceSignupAllowed } = instancePolicy;

const selfHosted = { OUTRAY_DEPLOYMENT_MODE: "self-hosted" };
async function withEnvironment<T>(values: Record<string, string>, run: () => T | Promise<T>): Promise<T> {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return await run(); }
  finally { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test("hosted remains the default; self-hosting enables all products without paid billing or marketing", () => {
  assert.equal(instanceConfig({}).selfHosted, false);
  const config = instanceConfig(selfHosted);
  assert.deepEqual(config.products, ["tunnels", "observability", "secrets", "uptime"]);
  assert.equal(config.billingEnabled, false);
  assert.equal(config.marketingEnabled, false);
  assert.equal(config.limits.maxUptimeMonitors, 1_000);
  assert.equal(config.limits.maxObservabilityAlerts, 1_000);
});

test("restricted OAuth signup requires a verified exact address; optional domains do not allow subdomains", () => {
  const config = { ...selfHosted, OUTRAY_SIGNUP_ALLOWED_EMAILS: " Ada@Example.COM , grace@other.dev ", OUTRAY_SIGNUP_ALLOWED_DOMAINS: "company.dev" };
  assert.equal(instanceSignupAllowed({ email: "ada@example.com", emailVerified: true }, config), true);
  assert.equal(instanceSignupAllowed({ email: "user@company.dev", emailVerified: true }, config), true);
  for (const user of [
    { email: "ada@example.com", emailVerified: false },
    { email: "ada@example.com" },
    { email: "user@child.company.dev", emailVerified: true },
    { email: "user@evilcompany.dev", emailVerified: true },
    { email: "stranger@example.com", emailVerified: true },
  ]) assert.equal(instanceSignupAllowed(user, config), false);
  assert.equal(instanceSignupAllowed({ email: "ada@example.com", emailVerified: true }, selfHosted), false, "an empty allowlist fails closed");
  assert.equal(instanceSignupAllowed({ email: "any@example.com" }, {}), true, "hosted signup is unchanged");
});

test("installation quotas reject malformed, noninteger and unsafe values before serving requests", () => {
  for (const key of ["OUTRAY_MAX_TUNNELS", "OUTRAY_MAX_MEMBERS", "OUTRAY_MAX_UPTIME_MONITORS", "OUTRAY_MAX_OBSERVABILITY_ALERTS"]) {
    for (const value of ["-1", "0", "2.5", "Infinity", "9007199254740992", "unknown"]) {
      assert.throws(() => instanceConfig({ ...selfHosted, [key]: value }), new RegExp(key));
    }
    assert.equal(Object.values(instanceConfig({ ...selfHosted, [key]: "25" }).limits).includes(25), true);
  }
  assert.throws(() => instanceConfig({ OUTRAY_RETENTION_DAYS: "91" }), /RETENTION/);
  assert.throws(() => instanceConfig({ OUTRAY_PRODUCTS: "invalid" }), /unknown product/);
});

test("disabled products and every payment write path are blocked while instance quota reads remain available", () => {
  const config = { ...selfHosted, OUTRAY_PRODUCTS: "uptime,secrets" };
  for (const path of ["/acme/tunnel", "/acme/tunnels", "/api/tunnel/auth", "/api/acme/requests", "/api/acme/observability/alerts"]) assert.equal(instancePathAvailable(path, config), false, path);
  for (const path of ["/acme/uptime", "/api/acme/secrets/vaults", "/api/acme/subscriptions"]) assert.equal(instancePathAvailable(path, config), true, path);
  for (const path of ["/acme/billing", "/api/checkout/polar", "/api/checkout/paystack-verify", "/api/webhooks/polar", "/api/webhooks/paystack", "/api/subscriptions/acme/cancel", "/api/admin/subscriptions", "/api/admin/revenue-history"]) {
    assert.equal(instancePathAvailable(path, selfHosted), false, path);
    assert.equal(instancePathAvailable(path, {}), true, `hosted ${path}`);
  }
});

test("instance limits override a saved paid plan without implying unlimited finite capacity", async () => {
  await withEnvironment({ ...selfHosted, OUTRAY_MAX_MEMBERS: "2", OUTRAY_MAX_TUNNELS: "4", OUTRAY_MAX_UPTIME_MONITORS: "37", OUTRAY_MAX_OBSERVABILITY_ALERTS: "45", OUTRAY_RETENTION_DAYS: "14" }, () => {
    assert.equal(installationPlan("free"), "unlimited");
    assert.equal(getPlanLimits("free").maxTunnels, 4);
    assert.equal(getPlanLimits("free").retentionDays, 14);
    assert.equal(getPlanLimits("free").customDomains, true);
    assert.equal(isUnlimitedPlanLimit("unlimited", 2), false);
    assert.equal(hasAvailableMemberSeat("free", 1), true);
    assert.equal(hasAvailableMemberSeat("pulse", 2), false);
    assert.match(getMemberLimitMessage("free"), /installation allows 2 members/);
    assert.doesNotMatch(getMemberLimitMessage("free"), /plan/);
    assert.equal(getUptimeMonitorLimit(), 37);
    assert.equal(getObservabilityAlertLimit(), 45);
    assert.equal(capacityDescription("free", 4, "active tunnels"), "This installation allows 4 active tunnels. Contact your administrator to increase capacity.");
  });
});

test("server-provided limits win in a browser-style hosted environment; hosted subscriptions remain unchanged", async () => {
  await withEnvironment({ OUTRAY_DEPLOYMENT_MODE: "hosted" }, () => {
    const limits = getSubscriptionLimits({ subscription: { plan: "unlimited" }, instanceLimits: { maxTunnels: 4, maxDomains: 2, maxSubdomains: 7, maxMembers: 3 } });
    assert.equal(limits.maxTunnels, 4);
    assert.equal(limits.maxDomains, 2);
    assert.equal(isUnlimitedPlanLimit("unlimited", limits.maxMembers, true), false);
    assert.equal(isUnlimitedPlanLimit("unlimited", 999_999_999), true);
    assert.equal(getSubscriptionLimits({ subscription: { plan: "ray" } }).maxTunnels, 3);
    assert.equal(getSubscriptionLimits(null).maxMembers, 1);
    assert.equal(getUptimeMonitorLimit(), 10);
    assert.equal(getObservabilityAlertLimit(), 200);
    assert.equal(capacityDescription("ray", 3, "active tunnels"), "The ray plan allows 3 active tunnels.");
  });
});

test("the actual authentication creation hook rejects before persisting user/account data or sending marketing", async () => {
  const source = await readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  let sideEffects = 0;
  class APIError extends Error {}
  const module = { exports: {} as { auth: { databaseHooks: { user: { create: { before: (user: { email: string; emailVerified: boolean }) => Promise<{ data: unknown }> } } }; hooks: { after: (context: unknown) => Promise<void> } } } };
  runInNewContext(compiled, {
    module, exports: module.exports, process, Date, console,
    fetch: () => { sideEffects++; throw new Error("No marketing requests in self-hosting"); },
    require: (specifier: string) => {
      if (specifier === "better-auth") return { betterAuth: (options: unknown) => options };
      if (specifier === "better-auth/adapters/drizzle") return { drizzleAdapter: () => ({}) };
      if (specifier === "better-auth/plugins") return { createAuthMiddleware: (handler: unknown) => handler, organization: (options: unknown) => options };
      if (specifier === "better-auth/api") return { APIError };
      if (specifier === "../db") return { db: new Proxy({}, { get() { sideEffects++; throw new Error("User hook must run before persistence"); } }) };
      if (specifier === "./send-email") return { sendViaZepto: () => { sideEffects++; } };
      if (specifier === "../../../../shared/instance-config") return { instanceConfig, instanceSignupAllowed };
      if (specifier === "../../../../shared/workspace-slugs") return workspaceSlugPolicy;
      if (specifier === "./permissions" || specifier === "./member-limits.server" || specifier === "./member-limit-policy" || specifier === "@/email/templates") return {};
      throw new Error(`Unexpected authentication dependency: ${specifier}`);
    },
  });
  await withEnvironment({ ...selfHosted, OUTRAY_SIGNUP_ALLOWED_EMAILS: "ada@example.com", OUTRAY_SIGNUP_ALLOWED_DOMAINS: "" }, async () => {
    const before = module.exports.auth.databaseHooks.user.create.before;
    await assert.rejects(before({ email: "stranger@example.com", emailVerified: true }), APIError);
    await assert.rejects(before({ email: "ada@example.com", emailVerified: false }), APIError);
    const allowed = { email: "ada@example.com", emailVerified: true };
    assert.equal((await before(allowed)).data, allowed);
    await module.exports.auth.hooks.after({ path: "/callback/github", context: { newSession: { user: { ...allowed, createdAt: new Date() } } } });
    assert.equal(sideEffects, 0);
  });
});

type Handler = (args: { request: Request; params: { orgSlug: string } }) => Promise<Response>;
test("monitor and alert creation enforce the effective installation limit inside their organization lock", async () => {
  await withEnvironment({ ...selfHosted, OUTRAY_MAX_UPTIME_MONITORS: "2", OUTRAY_MAX_OBSERVABILITY_ALERTS: "2" }, async () => {
    for (const kind of ["monitors", "alerts"] as const) {
      const organization = { id: "allowed-org" };
      const table = (name: string) => ({ name, id: "id", organizationId: "organizationId", deletedAt: "deletedAt" });
      const orgs = table("organizations"), records = table(kind);
      const queries: Array<{ table: string; locked: boolean; limit?: number }> = [];
      const tx = {
        select() {
          let current = { table: "", locked: false, limit: undefined as number | undefined };
          const builder = {
            from(value: { name: string }) { current.table = value.name; return builder; },
            where() { return builder; },
            for(value: string) { current.locked = value === "update"; return builder; },
            limit(value: number) { current.limit = value; return builder; },
            then(resolve: (rows: unknown[]) => unknown, reject: (cause: unknown) => unknown) { queries.push(current); return Promise.resolve(current.table === "organizations" ? [organization] : [{ id: "a" }, { id: "b" }]).then(resolve, reject); },
          };
          return builder;
        },
        insert() { throw new Error("Quota exceeded; insertion must not run"); },
      };
      const access = async () => ({ organization, session: { user: { id: "owner" } } });
      const input = { success: true, data: { notificationEmails: [], signal: "error_rate" } };
      const { POST } = await loadRouteHandlers<{ POST: Handler }>({
        path: new URL(`../src/routes/api/$orgSlug/${kind === "monitors" ? "uptime/monitors" : "observability/alerts"}/index.ts`, import.meta.url),
        modules: {
          "drizzle-orm": { and: (...values: unknown[]) => values, eq: (...values: unknown[]) => values, isNull: () => null },
          "@/db": { db: { transaction: (run: (tx: unknown) => unknown) => run(tx) } },
          "@/db/auth-schema": { organizations: orgs },
          "@/db/uptime-schema": { uptimeMonitors: records },
          "@/db/alerts-schema": { observabilityAlerts: records },
          "@/lib/subscription-plans": { getUptimeMonitorLimit, getObservabilityAlertLimit },
          "@/lib/uptime/api": { requireUptimeManager: access, jsonBody: () => ({}), serializeMonitor: (row: unknown) => row },
          "@/lib/uptime/validation": { validateMonitorInput: () => input },
          "@/lib/observability/alert-access": { requireAlertManager: access, notificationEmailsBelongToOrganization: () => true },
          "@/lib/observability/alert-validation": { validateAlertCreateInput: () => input },
          "@/lib/observability/alert-api": {}, "@/lib/observability/alert-metric": {}, "@/lib/observability/alert-oauth": {}, "@/lib/org": {},
          "@/lib/secrets/database": {}, "@/lib/secrets/crypto": {},
        },
      });
      const response = await POST({ request: new Request(`https://instance.test/api/acme/${kind}`, { method: "POST", body: "{}" }), params: { orgSlug: "acme" } });
      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /(?:2 monitors|\(2\))/);
      assert.deepEqual(queries, [{ table: "organizations", locked: true, limit: undefined }, { table: kind, locked: false, limit: 2 }]);
    }
  });
});

test("self-hosted browser quota consumers use the server limits instead of silently assuming an unlimited paid plan", async () => {
  for (const name of ["tunnel/domains.tsx", "tunnel/subdomains.tsx", "tunnel/tunnels/index.tsx", "tunnel/index.tsx", "members.tsx"]) {
    const source = await readFile(new URL(`../src/routes/$orgSlug/${name}`, import.meta.url), "utf8");
    assert.match(source, /getSubscriptionLimits\(subscription/);
    assert.doesNotMatch(source, /getPlanLimits\(currentPlan/);
  }
  const limitModal = await readFile(new URL("../src/components/limit-modal.tsx", import.meta.url), "utf8");
  assert.match(limitModal, /!selfHosted && selectedOrganization\?\.slug && <Link/);
});
