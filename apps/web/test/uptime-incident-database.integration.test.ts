import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { loadIncidentList, parseIncidentListQuery } from "../src/lib/uptime/incident-query";
import { createManualIncidentUpdate, editManualIncidentDraft } from "../src/lib/uptime/incident-api";

const enabled = process.env.OUTRAY_RUN_DB_INTEGRATION === "1";

test("incident history queries and concurrent manual mutations preserve tenant and lifecycle invariants", { skip: !enabled }, async (t) => {
  const databaseUrl = process.env.OUTRAY_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Set OUTRAY_TEST_DATABASE_URL to a migrated disposable database");
  // Never fall back to the application's normal DATABASE_URL for this mutating test.
  const [{ drizzle }, { default: pg }, schema] = await Promise.all([
    import("drizzle-orm/node-postgres"), import("pg"), import("../src/db/schema"),
  ]);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname.toLowerCase());
  const pool = new pg.Pool({ connectionString: databaseUrl,
    ssl: local ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  const db = drizzle(pool, { schema });
  const suffix = crypto.randomUUID();
  const id = (name: string) => `incident-refresh-${name}-${suffix}`;
  const organizationId = id("org-a");
  const otherOrganizationId = id("org-b");
  const userId = id("user");
  const startedAt = new Date("2026-09-30T10:00:00.123Z");

  t.after(async () => {
    try {
      await db.delete(schema.organizations).where(inArray(schema.organizations.id, [organizationId, otherOrganizationId]));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    } finally { await pool.end(); }
  });
  await db.insert(schema.organizations).values([
    { id: organizationId, slug: id("slug-a"), name: "Incident refresh A", createdAt: startedAt },
    { id: otherOrganizationId, slug: id("slug-b"), name: "Incident refresh B", createdAt: startedAt },
  ]);
  await db.insert(schema.users).values({ id: userId, name: "Incident refresh manager", email: `${suffix}@integration.invalid` });
  await db.insert(schema.uptimeStatusPages).values({ id: id("page"), organizationId, slug: id("public"), name: "Services", published: true });
  await db.insert(schema.uptimeStatusComponents).values({ id: id("component"), organizationId, pageId: id("page"), name: "Standalone API", groupId: null });
  await db.insert(schema.uptimeSubscribers).values({ id: id("subscriber"), organizationId, pageId: id("page"), email: `${suffix}@subscriber.invalid`, status: "confirmed" });

  const fixture = [
    { id: id("draft"), sourceType: "uptime_manual", title: "Unpublished manual incident", status: "open" },
    { id: id("manual"), sourceType: "uptime_manual", title: "Published manual incident", status: "open" },
    { id: id("automatic"), sourceType: "uptime_monitor", title: "Detected incident", status: "open" },
    { id: id("resolved"), sourceType: "uptime_manual", title: "Recovered incident", status: "resolved" },
    { id: id("literal"), sourceType: "uptime_manual", title: "API 50%_\\ failure", status: "open" },
    ...Array.from({ length: 103 }, (_, index) => ({
      id: id(`history-${String(index).padStart(3, "0")}`), sourceType: "uptime_monitor",
      title: index === 102 ? "Historical needle" : `Old incident ${index}`, status: "resolved",
      startedAt: new Date(startedAt.getTime() - 86_400_000 - index * 1_000),
    })),
  ].map((row) => ({ organizationId, startedAt, ...row, sourceId: row.id }));
  await db.insert(schema.incidents).values([...fixture, {
    id: id("other"), organizationId: otherOrganizationId, sourceType: "uptime_manual",
    sourceId: id("other"), title: "Other tenant secret", status: "open", startedAt,
  }]);
  await db.insert(schema.uptimeIncidentUpdates).values(["manual", "resolved"].map((name) => ({
    id: id(`${name}-published`), organizationId, incidentId: id(name), note: "Published note",
    status: name === "resolved" ? "resolved" : "investigating", publishedAt: startedAt,
  })));
  // Even a malformed cross-tenant update must not promote A's draft into Active.
  await db.insert(schema.uptimeIncidentUpdates).values({ id: id("cross-tenant"), organizationId: otherOrganizationId,
    incidentId: id("draft"), note: "Must not leak", status: "investigating", publishedAt: startedAt,
  });
  const list = (params: Record<string, string> = {}) => {
    const parsed = parseIncidentListQuery(new URLSearchParams(params));
    assert.ok(parsed.success);
    return loadIncidentList(db, organizationId, parsed.data);
  };

  await t.test("defaults, full-history search, lifecycle/source filters, and tenant isolation", async () => {
    const first = await list();
    assert.equal(first.incidents.length, 100);
    assert.ok(first.nextCursor);
    const historical = await list({ q: "historical NEEDLE", limit: "25" });
    assert.deepEqual(historical.incidents.map((row) => row.title), ["Historical needle"]);
    const literal = await list({ q: "%_\\" });
    assert.deepEqual(literal.incidents.map((row) => row.id), [id("literal")]);
    assert.deepEqual((await list({ q: "Other tenant" })).incidents, []);
    assert.deepEqual((await list({ view: "active", source: "manual" })).incidents.map((row) => row.id), [id("manual")]);
    assert.deepEqual((await list({ view: "active", source: "automatic" })).incidents.map((row) => row.id), [id("automatic")]);
    assert.deepEqual((await list({ view: "resolved", source: "manual" })).incidents.map((row) => row.id), [id("resolved")]);
    const drafts = await list({ view: "drafts" });
    assert.deepEqual(new Set(drafts.incidents.map((row) => row.id)), new Set([id("draft"), id("literal")]));
    assert.ok(drafts.incidents.every((row) => row.updates.length === 0));
  });

  await t.test("25-row pagination covers all history exactly once, including tied start times", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await list({ limit: "25", ...(cursor ? { cursor } : {}) });
      seen.push(...page.incidents.map((row) => row.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(seen.length, fixture.length);
    assert.equal(new Set(seen).size, fixture.length);
    const expected = [...fixture].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || (a.id < b.id ? 1 : -1));
    assert.deepEqual(seen, expected.map((row) => row.id));
  });

  await t.test("drafts remain private and resolved incidents reject concurrent POST and PATCH", async () => {
    const incidentId = id("race");
    await db.insert(schema.incidents).values({ id: incidentId, organizationId, sourceType: "uptime_manual", sourceId: incidentId, title: "Concurrent resolution" });
    await db.insert(schema.uptimeIncidentComponents).values({ organizationId, incidentId, componentId: id("component") });
    const draft = await db.transaction((tx) => createManualIncidentUpdate(tx, {
      organizationId, incidentId, userId, data: { note: "Private draft", status: "investigating", componentStates: { [id("component")]: "outage" }, publish: false },
    }));
    assert.ok(draft);
    assert.equal(draft.publishedAt, null);
    const [component] = await db.select().from(schema.uptimeStatusComponents).where(eq(schema.uptimeStatusComponents.id, id("component")));
    assert.equal(component.manualState, "unknown");
    assert.deepEqual(await db.select().from(schema.notifications).where(eq(schema.notifications.incidentId, incidentId)), []);

    let releaseCommit!: () => void;
    let reportLocked!: () => void;
    const commitAllowed = new Promise<void>((resolve) => { releaseCommit = resolve; });
    const resolutionLocked = new Promise<void>((resolve) => { reportLocked = resolve; });
    const resolving = db.transaction(async (tx) => {
      const update = await createManualIncidentUpdate(tx, { organizationId, incidentId, userId,
        data: { note: "Recovered", status: "resolved", componentStates: { [id("component")]: "operational" }, publish: true },
      });
      reportLocked();
      await commitAllowed;
      return update;
    });
    await Promise.race([resolutionLocked, resolving]);
    const concurrent = [
      db.transaction((tx) => createManualIncidentUpdate(tx, { organizationId, incidentId, userId,
        data: { note: "Too late", status: "investigating", componentStates: {}, publish: false },
      })),
      db.transaction((tx) => editManualIncidentDraft(tx, { organizationId, incidentId, updateId: draft.id, body: { note: "Too late", publish: true } })),
    ];
    const rejected = Promise.all(concurrent.map((operation) => assert.rejects(operation, /Resolved incidents are read-only/)));
    releaseCommit();
    const published = await resolving;
    await rejected;
    assert.ok(published?.publishedAt);
    const updates = await db.select().from(schema.uptimeIncidentUpdates).where(eq(schema.uptimeIncidentUpdates.incidentId, incidentId));
    assert.equal(updates.length, 2);
    assert.equal(updates.find((row) => row.id === draft.id)?.note, "Private draft");
    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.incidentId, incidentId));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].status, "pending");
    assert.equal(await db.transaction((tx) => editManualIncidentDraft(tx, {
      organizationId: otherOrganizationId, incidentId, updateId: draft.id, body: { note: "Wrong tenant" },
    })), null);
  });

  await t.test("concurrent publication of one draft sends only one queued update", async () => {
    const incidentId = id("manual");
    const draft = await db.transaction((tx) => createManualIncidentUpdate(tx, { organizationId, incidentId, userId,
      data: { note: "Publish once", status: "monitoring", componentStates: {}, publish: false },
    }));
    assert.ok(draft);
    const results = await Promise.allSettled([1, 2].map(() => db.transaction((tx) => editManualIncidentDraft(tx, {
      organizationId, incidentId, updateId: draft.id, body: { publish: true },
    }))));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const failure = results.find((result) => result.status === "rejected");
    assert.ok(failure?.status === "rejected");
    assert.match(String(failure.reason), /Published updates are immutable/);
    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.sourceId, draft.id));
    assert.equal(notifications.length, 1);
  });
});
