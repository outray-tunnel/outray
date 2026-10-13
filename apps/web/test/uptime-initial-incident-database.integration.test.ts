import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as drizzleOperators from "drizzle-orm";
import * as incidentApi from "../src/lib/uptime/incident-api";

const enabled = process.env.OUTRAY_RUN_DB_INTEGRATION === "1";
type Handler = (input: { request: Request; params: { orgSlug: string; incidentId?: string; updateId?: string } }) => Promise<Response>;

test("actual manual incident routes persist optional initial text and components without weakening follow-up updates", { skip: !enabled }, async (t) => {
  const databaseUrl = process.env.OUTRAY_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Set OUTRAY_TEST_DATABASE_URL to a migrated disposable database");
  // Never use DATABASE_URL: fixture mutations require a separately selected test DB.
  const [{ drizzle }, { default: pg }, schema] = await Promise.all([
    import("drizzle-orm/node-postgres"), import("pg"), import("../src/db/schema"),
  ]);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname.toLowerCase());
  const pool = new pg.Pool({ connectionString: databaseUrl,
    ssl: local ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  const db = drizzle(pool, { schema });
  const suffix = crypto.randomUUID();
  const id = (name: string) => `optional-declaration-${name}-${suffix}`;
  const organizationId = id("org");
  const otherOrganizationId = id("other-org");
  const userId = id("manager");
  const pageId = id("page");
  const slug = id("workspace");
  const { eq, and, inArray } = drizzleOperators;

  t.after(async () => {
    try {
      await db.delete(schema.organizations).where(inArray(schema.organizations.id, [organizationId, otherOrganizationId]));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    } finally { await pool.end(); }
  });
  await db.insert(schema.organizations).values([
    { id: organizationId, slug, name: "Optional declaration test", createdAt: new Date() },
    { id: otherOrganizationId, slug: id("other-workspace"), name: "Other tenant", createdAt: new Date() },
  ]);
  await db.insert(schema.users).values({ id: userId, name: "Declaration manager", email: `${suffix}@manager.integration.invalid` });
  await db.insert(schema.uptimeStatusPages).values([
    { id: pageId, organizationId, slug: `declaration-${suffix}`, name: "Services", published: true },
    { id: id("other-page"), organizationId: otherOrganizationId, slug: `other-${suffix}`, name: "Other services", published: true },
  ]);
  await db.insert(schema.uptimeStatusComponents).values({
    id: id("foreign-component"), organizationId: otherOrganizationId, pageId: id("other-page"), name: "Other API",
  });
  await db.insert(schema.uptimeSubscribers).values([
    { id: id("subscriber"), organizationId, pageId, email: `${suffix}@customer.integration.invalid`, status: "confirmed" },
    { id: id("pending-subscriber"), organizationId, pageId, email: `${suffix}@pending.integration.invalid`, status: "pending" },
  ]);

  async function route(path: string, method: "POST" | "PATCH") {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} as { Route: { server: { handlers: Record<string, Handler> } } } };
    runInNewContext(compiled, {
      Response, Date, crypto, module, exports: module.exports,
      require: (specifier: string) => {
        if (specifier === "@tanstack/react-router") return { createFileRoute: () => (definition: unknown) => definition };
        if (specifier === "drizzle-orm") return drizzleOperators;
        if (specifier === "@/db") return { db };
        if (specifier === "@/db/alerts-schema" || specifier === "@/db/uptime-schema") return schema;
        if (specifier === "@/lib/uptime/incident-api") return incidentApi;
        if (specifier === "@/lib/uptime/incident-query") return {};
        if (specifier === "@/lib/uptime/api") return {
          requireUptimeManager: async (_request: Request, orgSlug: string) => {
            assert.equal(orgSlug, slug);
            return { organization: { id: organizationId }, session: { user: { id: userId } } };
          },
          jsonBody: (request: Request) => request.json(),
          badInput: (error: string, field?: string) => Response.json({ error, field }, { status: 400 }),
          notFound: (label: string) => Response.json({ error: `${label} not found` }, { status: 404 }),
        };
        throw new Error(`Unexpected declaration route dependency: ${specifier}`);
      },
    });
    return (body: Record<string, unknown>, params: { incidentId?: string; updateId?: string } = {}) => module.exports.Route.server.handlers[method]({
      request: new Request(`https://integration.invalid/api/${slug}/uptime/incidents`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      params: { orgSlug: slug, ...params },
    });
  }
  const create = await route("../src/routes/api/$orgSlug/uptime/incidents/index.ts", "POST");
  const edit = await route("../src/routes/api/$orgSlug/uptime/incidents/$incidentId/updates/$updateId.ts", "PATCH");
  const followup = await route("../src/routes/api/$orgSlug/uptime/incidents/$incidentId/updates/index.ts", "POST");

  async function stored(incidentId: string) {
    const [incident] = await db.select().from(schema.incidents).where(and(eq(schema.incidents.id, incidentId), eq(schema.incidents.organizationId, organizationId)));
    const updates = await db.select().from(schema.uptimeIncidentUpdates).where(and(eq(schema.uptimeIncidentUpdates.incidentId, incidentId), eq(schema.uptimeIncidentUpdates.organizationId, organizationId)));
    const links = await db.select().from(schema.uptimeIncidentComponents).where(eq(schema.uptimeIncidentComponents.incidentId, incidentId));
    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.incidentId, incidentId));
    return { incident, updates, links, notifications };
  }

  await t.test("minimal declaration draft persists a blank status timeline and publishes later without components", async () => {
    const response = await create({ title: " API is unavailable ", status: "investigating" });
    assert.equal(response.status, 201);
    const created = await response.json();
    let record = await stored(created.incident.id);
    assert.equal(record.incident.title, "API is unavailable");
    assert.equal(record.incident.sourceType, "uptime_manual");
    assert.deepEqual(record.incident.sourceSnapshot?.affectedComponents, []);
    assert.equal(record.updates.length, 1);
    assert.equal(record.updates[0].id, created.update.id);
    assert.equal(record.updates[0].status, "investigating");
    assert.equal(record.updates[0].note, "");
    assert.equal(record.updates[0].bodyJson, null);
    assert.equal(record.updates[0].publishedAt, null);
    assert.deepEqual(record.links, []);
    assert.deepEqual(record.notifications, []);

    const published = await edit({ publish: true }, { incidentId: created.incident.id, updateId: created.update.id });
    assert.equal(published.status, 200);
    record = await stored(created.incident.id);
    assert.equal(record.updates.length, 1, "publish the existing status timeline, not an invented update");
    assert.ok(record.updates[0].publishedAt);
    assert.equal(record.updates[0].note, "");
    assert.equal(record.updates[0].bodyJson, null);
    assert.deepEqual(record.links, []);
    assert.equal(record.notifications.length, 1, "only confirmed subscribers are queued");
    assert.equal(record.notifications[0].payload?.note, "");
    assert.equal(record.notifications[0].sourceId, created.update.id);
    assert.equal(record.notifications[0].status, "pending");
    assert.equal((await edit({ publish: true }, { incidentId: created.incident.id, updateId: created.update.id })).status, 409);
    assert.equal((await stored(created.incident.id)).notifications.length, 1);
  });

  await t.test("minimal public declaration persists and queues real status with no affected associations", async () => {
    const response = await create({ title: "API failure identified", status: "identified", publish: true, componentIds: [] });
    assert.equal(response.status, 201);
    const created = await response.json();
    const record = await stored(created.incident.id);
    assert.equal(record.updates.length, 1);
    assert.equal(record.updates[0].status, "identified");
    assert.equal(record.updates[0].note, "");
    assert.equal(record.updates[0].bodyJson, null);
    assert.ok(record.updates[0].publishedAt);
    assert.deepEqual(record.links, []);
    assert.equal(record.notifications.length, 1);
    assert.equal(record.notifications[0].payload?.status, "identified");
    assert.equal(record.notifications[0].payload?.title, "API failure identified");

    for (const input of [{ status: "monitoring" }, { status: "monitoring", note: "" }, { status: "monitoring", body: { type: "doc", content: [] } }]) {
      assert.equal((await followup(input, { incidentId: created.incident.id })).status, 400);
    }
    assert.equal((await stored(created.incident.id)).updates.length, 1);
    assert.equal((await followup({ status: "monitoring", note: "A mitigation is in place" }, { incidentId: created.incident.id })).status, 201);
    assert.equal((await stored(created.incident.id)).updates.length, 2);
  });

  await t.test("optional supplied content remains validated and foreign components are rejected without persistence", async () => {
    const before = await db.select().from(schema.incidents).where(eq(schema.incidents.organizationId, organizationId));
    for (const input of [
      { title: "" }, { status: undefined }, { status: "open" }, { note: "x".repeat(4_001) },
      { body: { type: "doc", content: [{ type: "image" }] } }, { componentIds: [id("foreign-component")] },
    ]) {
      assert.equal((await create({ title: "Rejected declaration", status: "investigating", ...input })).status, 400);
    }
    const after = await db.select().from(schema.incidents).where(eq(schema.incidents.organizationId, organizationId));
    assert.equal(after.length, before.length);
    const validEmpty = await create({ title: "Blank rich initial document", status: "monitoring", body: { type: "doc", content: [{ type: "paragraph", content: [] }] } });
    assert.equal(validEmpty.status, 201);
    const { incident } = await validEmpty.json();
    const record = await stored(incident.id);
    assert.equal(record.updates[0].note, "");
    assert.equal(record.updates[0].bodyJson, null);
  });

  await t.test("unpublished page prevents public creation and rolls back incident and initial timeline", async () => {
    await db.update(schema.uptimeStatusPages).set({ published: false }).where(eq(schema.uptimeStatusPages.id, pageId));
    const response = await create({ title: "Must remain unpublished", status: "investigating", publish: true });
    assert.equal(response.status, 409);
    assert.deepEqual(await db.select().from(schema.incidents).where(and(eq(schema.incidents.organizationId, organizationId), eq(schema.incidents.title, "Must remain unpublished"))), []);
  });
});
