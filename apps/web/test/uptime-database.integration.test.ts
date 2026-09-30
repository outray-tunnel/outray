import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";

const enabled = process.env.OUTRAY_RUN_DB_INTEGRATION === "1";

test(
  "public Uptime pages isolate tenants and publish only committed manual updates",
  { skip: !enabled },
  async (t) => {
    const databaseUrl = process.env.OUTRAY_TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("Set OUTRAY_TEST_DATABASE_URL to a migrated disposable database");
    }
    // Do not use the application's normal DATABASE_URL for a mutating test.
    process.env.DATABASE_URL = databaseUrl;
    process.env.OUTRAY_STATUS_URL = "https://status.outray.app";
    process.env.UPTIME_ENABLED = "true";

    const [{ drizzle }, { default: pg }, schema, statusData, statusDb, incidentApi] =
      await Promise.all([
        import("drizzle-orm/node-postgres"),
        import("pg"),
        import("../src/db/schema"),
        import("../../status/src/lib/status-data"),
        import("../../status/src/lib/db"),
        import("../src/lib/uptime/incident-api"),
      ]);
    const databaseHost = new URL(databaseUrl).hostname.toLowerCase();
    const localDatabase = ["localhost", "127.0.0.1", "[::1]"].includes(databaseHost);
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: localDatabase ? false : {
        rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      },
    });
    const db = drizzle(pool, { schema });
    const suffix = crypto.randomUUID();
    const ids = {
      organizationA: `uptime-test-org-a-${suffix}`,
      organizationB: `uptime-test-org-b-${suffix}`,
      pageA: `uptime-test-page-a-${suffix}`,
      pageB: `uptime-test-page-b-${suffix}`,
      groupA: `uptime-test-group-a-${suffix}`,
      groupB: `uptime-test-group-b-${suffix}`,
      visibleA: `uptime-test-visible-a-${suffix}`,
      manualA: `uptime-test-manual-a-${suffix}`,
      standaloneA: `uptime-test-standalone-a-${suffix}`,
      hiddenA: `uptime-test-hidden-a-${suffix}`,
      componentB: `uptime-test-component-b-${suffix}`,
      monitorA: `uptime-test-monitor-a-${suffix}`,
      hiddenMonitorA: `uptime-test-hidden-monitor-a-${suffix}`,
      monitorB: `uptime-test-monitor-b-${suffix}`,
      incidentA: `uptime-test-incident-a-${suffix}`,
      incidentB: `uptime-test-incident-b-${suffix}`,
      updateA: `uptime-test-update-a-${suffix}`,
      subscriberA: `uptime-test-subscriber-a-${suffix}`,
      subscriberB: `uptime-test-subscriber-b-${suffix}`,
    };
    const slugA = `uptime-a-${suffix}`;
    const slugB = `uptime-b-${suffix}`;
    const now = new Date();
    const recentCheck = new Date(now.getTime() - 1_000);

    t.after(async () => {
      try {
        await db.delete(schema.organizations).where(inArray(schema.organizations.id, [
          ids.organizationA, ids.organizationB,
        ]));
      } finally {
        await Promise.all([pool.end(), statusDb.getPool().end()]);
      }
    });

    await db.insert(schema.organizations).values([
      { id: ids.organizationA, name: "Uptime integration A", slug: slugA, createdAt: now },
      { id: ids.organizationB, name: "Uptime integration B", slug: slugB, createdAt: now },
    ]);
    await db.insert(schema.uptimeStatusPages).values([
      { id: ids.pageA, organizationId: ids.organizationA, slug: slugA, name: "Public A", published: true },
      { id: ids.pageB, organizationId: ids.organizationB, slug: slugB, name: "Private B", published: true },
    ]);
    await db.insert(schema.uptimeStatusGroups).values([
      { id: ids.groupA, organizationId: ids.organizationA, pageId: ids.pageA, name: "Services" },
      { id: ids.groupB, organizationId: ids.organizationB, pageId: ids.pageB, name: "Internal B" },
    ]);
    await db.insert(schema.uptimeStatusComponents).values([
      { id: ids.visibleA, organizationId: ids.organizationA, pageId: ids.pageA,
        groupId: ids.groupA, name: "Public API", sortOrder: 0 },
      { id: ids.manualA, organizationId: ids.organizationA, pageId: ids.pageA,
        groupId: ids.groupA, name: "Manual service", sortOrder: 1 },
      { id: ids.standaloneA, organizationId: ids.organizationA, pageId: ids.pageA,
        groupId: null, name: "Standalone website", manualState: "operational", manualUpdatedAt: now },
      { id: ids.hiddenA, organizationId: ids.organizationA, pageId: ids.pageA,
        groupId: ids.groupA, name: "Hidden internal", visible: false, sortOrder: 2 },
      { id: ids.componentB, organizationId: ids.organizationB, pageId: ids.pageB,
        groupId: ids.groupB, name: "Other tenant service" },
    ]);
    await db.insert(schema.uptimeMonitors).values([
      { id: ids.monitorA, organizationId: ids.organizationA, name: "Public A",
        url: "https://example.com/health", state: "up", lastCheckedAt: recentCheck },
      { id: ids.hiddenMonitorA, organizationId: ids.organizationA, name: "Hidden A",
        url: "https://example.com/hidden", state: "down", lastCheckedAt: recentCheck },
      { id: ids.monitorB, organizationId: ids.organizationB, name: "Private B",
        url: "https://example.com/private", state: "down", lastCheckedAt: recentCheck },
    ]);
    await db.insert(schema.uptimeComponentMonitors).values([
      { organizationId: ids.organizationA, componentId: ids.visibleA, monitorId: ids.monitorA },
      { organizationId: ids.organizationA, componentId: ids.hiddenA, monitorId: ids.hiddenMonitorA },
      { organizationId: ids.organizationB, componentId: ids.componentB, monitorId: ids.monitorB },
      // A malformed cross-tenant association must never expose B's monitor to A.
      { organizationId: ids.organizationA, componentId: ids.visibleA, monitorId: ids.monitorB },
    ]);
    await db.insert(schema.uptimeChecks).values([
      { id: `uptime-test-check-a-${suffix}`, organizationId: ids.organizationA,
        monitorId: ids.monitorA, checkedAt: recentCheck, success: true, latencyMs: 42 },
      { id: `uptime-test-check-hidden-${suffix}`, organizationId: ids.organizationA,
        monitorId: ids.hiddenMonitorA, checkedAt: recentCheck, success: false, latencyMs: 80 },
      { id: `uptime-test-check-b-${suffix}`, organizationId: ids.organizationB,
        monitorId: ids.monitorB, checkedAt: recentCheck, success: false, latencyMs: 90 },
    ]);
    await db.insert(schema.incidents).values([
      { id: ids.incidentA, organizationId: ids.organizationA, sourceType: "uptime_manual",
        sourceId: ids.incidentA, title: "Draft incident A" },
      { id: ids.incidentB, organizationId: ids.organizationB, sourceType: "uptime_monitor",
        sourceId: ids.monitorB, title: "Other tenant incident" },
    ]);
    await db.insert(schema.uptimeIncidentComponents).values([
      { organizationId: ids.organizationA, incidentId: ids.incidentA, componentId: ids.manualA },
      { organizationId: ids.organizationB, incidentId: ids.incidentB, componentId: ids.componentB },
    ]);
    await db.insert(schema.uptimeIncidentUpdates).values({
      id: ids.updateA, organizationId: ids.organizationA, incidentId: ids.incidentA,
      note: "Investigating the manual service", status: "investigating",
      componentStates: { [ids.manualA]: "outage" },
    });
    await db.insert(schema.uptimeSubscribers).values([
      { id: ids.subscriberA, organizationId: ids.organizationA, pageId: ids.pageA,
        email: `${suffix}@a.integration.invalid`, status: "confirmed" },
      { id: ids.subscriberB, organizationId: ids.organizationB, pageId: ids.pageB,
        email: `${suffix}@b.integration.invalid`, status: "confirmed" },
    ]);

    const pageA = await statusData.findPageForRequest(
      new Request(`https://status.outray.app/${slugA}`), slugA,
    );
    assert.ok(pageA);
    assert.equal(pageA.organization_id, ids.organizationA);
    const before = await statusData.loadPublicPage(pageA);
    assert.equal(before.state, "unknown");
    assert.deepEqual(before.groups.map((group) => group.name), ["Services"]);
    assert.deepEqual(before.groups[0].components.map((component) => component.name),
      ["Public API", "Manual service"]);
    assert.equal(before.groups[0].components[0].state, "operational");
    assert.equal(before.groups[0].components[1].state, "unknown");
    assert.deepEqual(before.standaloneComponents.map((component) => component.name), ["Standalone website"]);
    assert.equal(before.standaloneComponents[0].state, "operational");
    assert.deepEqual(before.incidents, []);
    const beforeNotifications = await db.select().from(schema.notifications).where(
      eq(schema.notifications.sourceId, ids.updateA),
    );
    assert.equal(beforeNotifications.length, 0);

    const result = await db.transaction(async (tx) => {
      await tx.update(schema.uptimeIncidentUpdates).set({ publishedAt: now }).where(
        eq(schema.uptimeIncidentUpdates.id, ids.updateA),
      );
      return incidentApi.publishUptimeUpdate(tx, {
        organizationId: ids.organizationA, incidentId: ids.incidentA,
        updateId: ids.updateA, title: "Draft incident A",
        affectedComponentIds: [ids.manualA],
        note: "Investigating the manual service", status: "investigating",
        componentStates: { [ids.manualA]: "outage" }, now,
      });
    });
    assert.deepEqual(result, { success: true, recipients: 1 });

    const after = await statusData.loadPublicPage(pageA);
    assert.equal(after.groups[0].components[1].state, "outage");
    assert.equal(after.state, "degraded");
    assert.deepEqual(after.incidents.map((incident) => incident.title), ["Draft incident A"]);
    assert.deepEqual(after.incidents[0].updates.map((update) => update.note),
      ["Investigating the manual service"]);
    const notifications = await db.select().from(schema.notifications).where(
      eq(schema.notifications.sourceId, ids.updateA),
    );
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].recipient, `${suffix}@a.integration.invalid`);
    assert.equal(notifications[0].organizationId, ids.organizationA);
  },
);
