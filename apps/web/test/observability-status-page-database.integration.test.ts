import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as orm from "drizzle-orm";
import { and, eq, inArray } from "drizzle-orm";
import ts from "typescript";
import { saveAlertStatusPage } from "../src/lib/observability/alert-status-page";
import { createUptimeIncidentUpdate, PublishError } from "../src/lib/uptime/incident-api";
import { loadIncidentList, parseIncidentListQuery } from "../src/lib/uptime/incident-query";
import * as statusState from "../src/lib/uptime/state";

const enabled = process.env.OUTRAY_RUN_DB_INTEGRATION === "1";

/** Execute the real dashboard reader against the explicit disposable connection.
 * Only its connection and unused auth dependencies are substituted; all query
 * predicates, schema definitions, state derivation and assembly are real.
 */
async function dashboardPageReader(db: unknown, schema: Record<string, unknown>) {
  const source = await readFile(new URL("../src/lib/uptime/api.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText;
  type PageComponent = { id: string; state: string; manualState: string };
  const module = { exports: {} as { loadPage: (organizationId: string) => Promise<{
    standaloneComponents: PageComponent[]; groups: Array<{ components: PageComponent[] }>;
  } | null> } };
  runInNewContext(compiled, { module, exports: module.exports, Date, Map, Response, process: { env: {} },
    require: (name: string) => {
      if (name === "drizzle-orm") return orm;
      if (name === "@/db") return { db };
      if (["@/db/app-schema", "@/db/auth-schema", "@/db/alerts-schema", "@/db/uptime-schema"].includes(name)) return schema;
      if (name === "./state") return statusState;
      if (["@/lib/observability/alert-access", "@/lib/observability/alert-validation", "@/lib/org"].includes(name)) return {};
      throw new Error(`Unexpected dashboard reader import: ${name}`);
    },
  });
  return module.exports.loadPage;
}

test("observability status bridge preserves canonical incidents, tenant boundaries and manual public approval in PostgreSQL", { skip: !enabled }, async (t) => {
  const databaseUrl = process.env.OUTRAY_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Set OUTRAY_TEST_DATABASE_URL to a migrated disposable database");
  // This test never falls back to the app connection or delivers queued messages.
  const [{ drizzle }, { default: pg }, schema] = await Promise.all([
    import("drizzle-orm/node-postgres"), import("pg"), import("../src/db/schema"),
  ]);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname.toLowerCase());
  const pool = new pg.Pool({ connectionString: databaseUrl,
    ssl: local ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  const db = drizzle(pool, { schema });
  const loadDashboardPage = await dashboardPageReader(db, schema);
  const suffix = crypto.randomUUID();
  const id = (name: string) => `status-bridge-${name}-${suffix}`;
  const organizationId = id("org-a");
  const otherOrganizationId = id("org-b");
  const alertId = id("alert");
  const incidentId = id("canonical");
  const publicTitle = "Public API performance degradation";
  const data = { publicTitle, impact: "degraded" as const, componentIds: [id("component")] };
  const userId = id("manager");
  const assertDashboardComponent = async (expected: "operational" | "degraded") => {
    const page = await loadDashboardPage(organizationId);
    assert.ok(page);
    const component = page.standaloneComponents.find((value) => value.id === id("component"));
    assert.ok(component);
    assert.equal(component.state, expected);
    assert.equal(component.manualState, "operational", "Approved impact must not replace manual health evidence");
    const [stored] = await db.select().from(schema.uptimeStatusComponents)
      .where(eq(schema.uptimeStatusComponents.id, id("component")));
    assert.equal(stored.manualState, "operational");
  };

  t.after(async () => {
    try {
      await db.delete(schema.organizations).where(inArray(schema.organizations.id, [organizationId, otherOrganizationId]));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    } finally { await pool.end(); }
  });
  await db.insert(schema.organizations).values([
    { id: organizationId, slug: id("slug-a"), name: "Status bridge A", createdAt: new Date() },
    { id: otherOrganizationId, slug: id("slug-b"), name: "Status bridge B", createdAt: new Date() },
  ]);
  await db.insert(schema.users).values({ id: userId, name: "Manager", email: `${suffix}@bridge.invalid` });
  await db.insert(schema.uptimeStatusPages).values([
    { id: id("page"), organizationId, slug: `bridge-${suffix}`, name: "Services", published: true },
    { id: id("other-page"), organizationId: otherOrganizationId, slug: `other-${suffix}`, name: "Other services", published: true },
  ]);
  await db.insert(schema.uptimeStatusGroups).values({ id: id("hidden-group"), organizationId, pageId: id("page"), name: "Internal", visible: false });
  await db.insert(schema.uptimeStatusComponents).values([
    { id: id("component"), organizationId, pageId: id("page"), name: "Public API", manualState: "operational" },
    { id: id("replacement"), organizationId, pageId: id("page"), name: "Checkout", manualState: "operational" },
    { id: id("hidden"), organizationId, pageId: id("page"), name: "Hidden service", visible: false },
    { id: id("hidden-group-component"), organizationId, pageId: id("page"), groupId: id("hidden-group"), name: "Hidden group child" },
    { id: id("foreign"), organizationId: otherOrganizationId, pageId: id("other-page"), name: "Other tenant service" },
  ]);
  await db.insert(schema.observabilityAlerts).values({
    id: alertId, organizationId, createdBy: userId, name: "PRIVATE SQL token=secret", service: "private-orders-api",
    signal: "request_error_rate", operator: "gt", threshold: 5, windowMinutes: 5,
    underlyingState: "firing", failureStreak: 2,
  });
  await db.insert(schema.incidents).values({ id: incidentId, organizationId, sourceType: "observability_alert",
    sourceId: alertId, title: "PRIVATE SQL token=secret", status: "open", recoveryConfirmed: false,
    sourceSnapshot: { service: "private-orders-api", threshold: 5, logQuery: "secret" }, triggerValue: 99,
  });
  await db.insert(schema.uptimeSubscribers).values({ id: id("subscriber"), organizationId, pageId: id("page"),
    email: `${suffix}@subscriber.invalid`, status: "confirmed" });

  await t.test("mapping rejects cross-tenant and hidden targets without modifying the alert or episode", async () => {
    for (const componentId of [id("foreign"), id("hidden"), id("hidden-group-component")]) {
      await assert.rejects(db.transaction((tx) => saveAlertStatusPage(tx, { organizationId, alertId,
        data: { ...data, componentIds: [componentId] },
      })), (error: unknown) => error instanceof PublishError && error.status === 400 && error.field === "componentIds");
    }
    assert.equal(await db.transaction((tx) => saveAlertStatusPage(tx, { organizationId: otherOrganizationId, alertId, data })), null);
    assert.deepEqual(await db.select().from(schema.uptimeComponentAlerts).where(eq(schema.uptimeComponentAlerts.alertId, alertId)), []);
    const [row] = await db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId));
    assert.equal(row.uptimePublicationState, null);
    assert.equal(row.publicTitle, null);
  });

  await t.test("linking attaches the current canonical incident and shared list returns the same id", async () => {
    assert.deepEqual(await db.transaction((tx) => saveAlertStatusPage(tx, { organizationId, alertId, data })), { incidentId });
    const rows = await db.select().from(schema.incidents).where(and(eq(schema.incidents.organizationId, organizationId), eq(schema.incidents.sourceId, alertId)));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, incidentId);
    assert.equal(rows[0].uptimePublicationState, "detected");
    assert.equal(rows[0].publicTitle, publicTitle);
    assert.equal(rows[0].publicImpact, "degraded");
    const parsed = parseIncidentListQuery(new URLSearchParams({ source: "observability", view: "detected" }));
    assert.ok(parsed.success);
    assert.deepEqual((await loadIncidentList(db, organizationId, parsed.data)).incidents.map((row) => row.id), [incidentId]);
    assert.deepEqual(await db.select().from(schema.notifications).where(eq(schema.notifications.incidentId, incidentId)), []);
  });

  await t.test("private drafts do not change component state, publish the incident, or queue subscriber email", async () => {
    const draft = await db.transaction((tx) => createUptimeIncidentUpdate(tx, { organizationId, incidentId, userId,
      data: { note: "Internal draft investigation", bodyJson: null, status: "investigating", componentStates: {}, publish: false },
    }));
    assert.ok(draft);
    assert.equal(draft.publishedAt, null);
    const [row] = await db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId));
    assert.equal(row.uptimePublicationState, "detected");
    const [component] = await db.select().from(schema.uptimeStatusComponents).where(eq(schema.uptimeStatusComponents.id, id("component")));
    assert.equal(component.manualState, "operational");
    await assertDashboardComponent("operational");
    assert.deepEqual(await db.select().from(schema.notifications).where(eq(schema.notifications.incidentId, incidentId)), []);
  });

  await t.test("approval publishes atomically and subscriber payload includes only customer-safe content", async () => {
    const published = await db.transaction((tx) => createUptimeIncidentUpdate(tx, { organizationId, incidentId, userId,
      data: { note: "We are investigating intermittent API failures.", bodyJson: null, status: "investigating", componentStates: {}, publish: true },
    }));
    assert.ok(published?.publishedAt);
    const [row] = await db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId));
    assert.equal(row.uptimePublicationState, "published");
    const queued = await db.select().from(schema.notifications).where(eq(schema.notifications.incidentId, incidentId));
    assert.equal(queued.length, 1);
    assert.equal(queued[0].status, "pending");
    assert.equal(queued[0].sourceId, published.id);
    assert.equal(queued[0].payload.title, publicTitle);
    assert.equal(queued[0].payload.note, "We are investigating intermittent API failures.");
    assert.doesNotMatch(JSON.stringify(queued[0].payload), /PRIVATE|secret|private-orders|threshold|triggerValue|sourceSnapshot/);
    await assertDashboardComponent("degraded");
  });

  await t.test("configuration edits and unlinking do not alter approved title, impact, or episode components", async () => {
    await db.transaction((tx) => saveAlertStatusPage(tx, { organizationId, alertId,
      data: { publicTitle: "Future checkout incident", impact: "outage", componentIds: [id("replacement")] },
    }));
    await db.transaction((tx) => saveAlertStatusPage(tx, { organizationId, alertId, data: { publicTitle: null, impact: "degraded", componentIds: [] } }));
    const [row] = await db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId));
    assert.equal(row.publicTitle, publicTitle);
    assert.equal(row.publicImpact, "degraded");
    assert.equal(row.status, "open");
    assert.deepEqual((await db.select().from(schema.uptimeIncidentComponents).where(eq(schema.uptimeIncidentComponents.incidentId, incidentId))).map((link) => link.componentId), [id("component")]);
    assert.deepEqual(await db.select().from(schema.uptimeComponentAlerts).where(eq(schema.uptimeComponentAlerts.alertId, alertId)), []);
    await assertDashboardComponent("degraded");
  });

  await t.test("unconfirmed recovery cannot publish, drafts cannot resolve, and a manager's explicit recovery can", async () => {
    const countBefore = (await db.select().from(schema.uptimeIncidentUpdates).where(eq(schema.uptimeIncidentUpdates.incidentId, incidentId))).length;
    await assert.rejects(db.transaction((tx) => createUptimeIncidentUpdate(tx, { organizationId, incidentId, userId,
      data: { note: "Unverified recovery", bodyJson: null, status: "resolved", componentStates: {}, publish: true },
    })), (error: unknown) => error instanceof PublishError && error.field === "acknowledgeRecovery");
    assert.equal((await db.select().from(schema.uptimeIncidentUpdates).where(eq(schema.uptimeIncidentUpdates.incidentId, incidentId))).length, countBefore);
    await db.transaction((tx) => createUptimeIncidentUpdate(tx, { organizationId, incidentId, userId,
      data: { note: "Draft recovery", bodyJson: null, status: "resolved", componentStates: {}, acknowledgeRecovery: true, publish: false },
    }));
    const [drafted] = await db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId));
    assert.equal(drafted.status, "open");
    assert.equal(drafted.recoveryConfirmed, false);
    await assertDashboardComponent("degraded");
    const result = await db.transaction((tx) => createUptimeIncidentUpdate(tx, { organizationId, incidentId, userId,
      data: { note: "Service recovery was independently verified.", bodyJson: null, status: "resolved", componentStates: {}, acknowledgeRecovery: true, publish: true },
    }));
    assert.ok(result?.publishedAt);
    const [resolved] = await db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId));
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.recoveryConfirmed, true);
    assert.ok(resolved.resolvedAt);
    assert.equal((await db.select().from(schema.notifications).where(eq(schema.notifications.incidentId, incidentId))).length, 2);
    await assertDashboardComponent("operational");
  });
});
