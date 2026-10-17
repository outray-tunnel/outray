import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as drizzle from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import * as alertSchema from "../src/db/alerts-schema";
import * as uptimeSchema from "../src/db/uptime-schema";
import * as incidentApi from "../src/lib/uptime/incident-api";

type Row = Record<string, unknown>;
type Selection = { table: string; rows: Row[] };
const organizationId = "tenant-create";
const page = { id: "page-create", organizationId, published: true, slug: "services" };
const access = { organization: { id: organizationId }, session: { user: { id: "manager-create" } } };

// Run the actual route with its actual parser/publication helpers. A strict
// transaction script checks writes and locking without accessing the live DB.
async function harness(selections: Selection[], options: { denied?: boolean; followup?: boolean } = {}) {
  const filename = options.followup
    ? "../src/routes/api/$orgSlug/uptime/incidents/$incidentId/updates/index.ts"
    : "../src/routes/api/$orgSlug/uptime/incidents/index.ts";
  const source = await readFile(new URL(filename, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const pending = [...selections];
  const calls: string[] = [];
  const predicates: Array<{ sql: string; params: unknown[] }> = [];
  const writes: Array<{ table: string; values: Row | Row[] }> = [];
  let committed: typeof writes = [];
  const tx = {
    select() {
      let table = "";
      const builder = {
        from(value: PgTable) { table = drizzle.getTableName(value); calls.push(`select:${table}`); return builder; },
        where(value: drizzle.SQL) { predicates.push(new PgDialect().sqlToQuery(value)); return builder; },
        for(mode: string) { calls.push(`lock:${table}:${mode}`); return builder; },
        limit() { return builder; },
        then(resolve: (value: Row[]) => unknown, reject?: (error: unknown) => unknown) {
          const next = pending.shift();
          assert.ok(next, `Unexpected query for ${table}`);
          assert.equal(next.table, table);
          return Promise.resolve(next.rows).then(resolve, reject);
        },
      };
      return builder;
    },
    insert(value: PgTable) {
      const table = drizzle.getTableName(value);
      calls.push(`insert:${table}`);
      return { values(values: Row | Row[]) {
        assert.ok(!Array.isArray(values) || values.length > 0, "never call values([])");
        writes.push({ table, values });
        return { returning: async () => Array.isArray(values) ? values : [values], onConflictDoNothing: async () => {} };
      } };
    },
    update(value: PgTable) {
      const table = drizzle.getTableName(value);
      calls.push(`update:${table}`);
      return { set(values: Row) {
        writes.push({ table, values });
        return { where(predicate: drizzle.SQL) { predicates.push(new PgDialect().sqlToQuery(predicate)); return Promise.resolve(); } };
      } };
    },
  };
  const db = { ...tx, transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => {
    calls.push("transaction");
    const result = await action(tx);
    committed = [...writes];
    return result;
  } };
  type Handler = (args: { request: Request; params: { orgSlug: string; incidentId?: string } }) => Promise<Response>;
  const module = { exports: {} as { Route: { server: { handlers: { POST: Handler } } } } };
  runInNewContext(compiled, {
    Response, Date, crypto, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (route: unknown) => route };
      if (specifier === "drizzle-orm") return drizzle;
      if (specifier === "@/db") return { db };
      if (specifier === "@/db/alerts-schema") return alertSchema;
      if (specifier === "@/db/uptime-schema") return uptimeSchema;
      if (specifier === "@/lib/uptime/incident-api") return incidentApi;
      if (specifier === "@/lib/uptime/incident-query") return {};
      if (specifier === "@/lib/uptime/api") return {
        findStatusPage: async () => (await db.select().from(uptimeSchema.uptimeStatusPages).where(drizzle.eq(uptimeSchema.uptimeStatusPages.organizationId, organizationId)).limit(1))[0] ?? null,
        requireUptimeManager: async (_request: Request, slug: string) => {
          assert.equal(slug, "url-workspace");
          return options.denied ? { error: Response.json({ error: "Forbidden" }, { status: 403 }) } : access;
        },
        jsonBody: async (request: Request) => request.json(),
        badInput: (error: string, field?: string) => Response.json({ error, field }, { status: 400 }),
        notFound: (label: string) => Response.json({ error: `${label} not found` }, { status: 404 }),
      };
      throw new Error(`Unexpected creation dependency: ${specifier}`);
    },
  });
  return {
    post: (body: Row) => module.exports.Route.server.handlers.POST({
      request: new Request("https://example.invalid/api/url-workspace/uptime/incidents", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      params: { orgSlug: "url-workspace", incidentId: "incident-create" },
    }), calls, writes, predicates, committed: () => committed, unused: () => pending.length,
  };
}

const initialRows = (publish: boolean, subscribers: Row[] = []): Selection[] => [
  { table: "uptime_status_pages", rows: [page] }, { table: "organizations", rows: [{ id: organizationId }] },
  ...(publish ? [
    { table: "organizations", rows: [{ id: organizationId }] }, { table: "uptime_status_pages", rows: [page] },
    { table: "uptime_incident_updates", rows: [{ count: 0 }] }, { table: "uptime_subscribers", rows: subscribers },
  ] : []),
];

test("manual declaration POST creates a real blank status timeline with name/status only, draft or public", async () => {
  for (const publish of [false, true]) for (const componentIds of [undefined, []]) {
    const mock = await harness(initialRows(publish));
    const response = await mock.post({ title: " API unavailable ", status: "identified", publish, ...(componentIds === undefined ? {} : { componentIds }) });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.incident.title, "API unavailable");
    assert.equal(result.incident.sourceType, "uptime_manual");
    assert.equal(result.incident.sourceId, result.incident.id);
    assert.deepEqual(result.incident.sourceSnapshot.affectedComponents, []);
    assert.equal(result.update.incidentId, result.incident.id);
    assert.equal(result.update.status, "identified");
    assert.equal(result.update.note, "");
    assert.equal(result.update.bodyJson, null);
    assert.equal(Boolean(result.update.publishedAt), publish);
    assert.equal(mock.committed().length, 2);
    assert.ok(!mock.calls.includes("select:uptime_status_components"));
    assert.ok(!mock.calls.includes("insert:uptime_incident_components"));
    assert.ok(mock.predicates.every((predicate) => predicate.params.includes(organizationId)), "every lookup uses the URL tenant");
    assert.deepEqual(mock.calls.slice(0, 4), ["select:uptime_status_pages", "transaction", "select:organizations", "lock:organizations:update"]);
    assert.equal(mock.unused(), 0);
  }
});

test("empty declaration drafts stay private; explicit public declaration keeps safe subscriber queueing", async () => {
  const draft = await harness(initialRows(false));
  assert.equal((await draft.post({ title: "API unavailable", status: "investigating" })).status, 201);
  assert.ok(!draft.calls.includes("select:uptime_subscribers"));
  assert.ok(!draft.calls.includes("insert:notifications"));

  const published = await harness(initialRows(true, [{ id: "subscriber-create", email: "customer@example.invalid" }]));
  assert.equal((await published.post({ title: "API unavailable", status: "investigating", publish: true })).status, 201);
  const queued = published.committed().find((write) => write.table === "notifications");
  assert.ok(queued && Array.isArray(queued.values));
  assert.equal(queued.values.length, 1);
  assert.equal(queued.values[0].recipient, "customer@example.invalid");
  assert.equal(queued.values[0].sourceType, "uptime_incident_update");
  assert.deepEqual((queued.values[0].payload as Row).note, "", "do not invent customer prose");
});

test("declaration still requires valid name/status and validates optional supplied fields before writes", async () => {
  const unsafeBody = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " ", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] };
  for (const [fields, field] of [
    [{ title: "" }, "title"], [{ title: "x".repeat(161) }, "title"], [{ status: undefined }, "status"],
    [{ status: "open" }, "status"], [{ status: null }, "status"], [{ note: null }, "note"],
    [{ note: "x".repeat(4_001) }, "note"], [{ body: unsafeBody }, "body"], [{ body: null }, "body"],
    [{ body: { type: "doc", content: [{ type: "image" }] } }, "body"],
    [{ componentIds: null }, "componentIds"], [{ componentIds: [false] }, "componentIds"],
    [{ componentIds: Array.from({ length: 101 }, (_, index) => `component-${index}`) }, "componentIds"],
    [{ componentStates: { "component-a": "up" } }, "componentStates"], [{ publish: "true" }, "publish"],
  ] as Array<[Row, string]>) {
    const mock = await harness([]);
    const response = await mock.post({ title: "API unavailable", status: "investigating", ...fields });
    assert.equal(response.status, 400, JSON.stringify(fields));
    assert.equal((await response.json()).field, field);
    assert.deepEqual(mock.calls, []);
    assert.deepEqual(mock.writes, []);
  }
});

test("optional valid first content is retained and a valid blank rich document is normalized", async () => {
  for (const input of [
    { note: " We are investigating " },
    { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "We are investigating", marks: [{ type: "bold" }] }] }] } },
    { body: { type: "doc", content: [{ type: "paragraph", content: [] }] } },
  ]) {
    const mock = await harness(initialRows(false));
    const response = await mock.post({ title: "API unavailable", status: "investigating", ...input });
    assert.equal(response.status, 201);
    const { update } = await response.json();
    const hasText = "note" in input || Boolean(input.body?.content[0].content.length);
    assert.equal(update.note, hasText ? "We are investigating" : "");
    assert.equal(Boolean(update.bodyJson), hasText && "body" in input);
  }
});

test("declaration rejects foreign components and still requires a status page and manager", async () => {
  const foreign = await harness([
    { table: "uptime_status_pages", rows: [page] }, { table: "uptime_status_components", rows: [] },
  ]);
  const unavailable = await foreign.post({ title: "API unavailable", status: "investigating", componentIds: ["other-tenant-component"] });
  assert.equal(unavailable.status, 400);
  assert.equal((await unavailable.json()).field, "componentIds");
  assert.deepEqual(foreign.writes, []);
  assert.ok(foreign.predicates[1].params.includes(organizationId));
  assert.ok(foreign.predicates[1].params.includes(page.id));

  const missingPage = await harness([{ table: "uptime_status_pages", rows: [] }]);
  assert.equal((await missingPage.post({ title: "API unavailable", status: "investigating" })).status, 404);
  assert.deepEqual(missingPage.writes, []);
  const denied = await harness([], { denied: true });
  assert.equal((await denied.post({ title: "API unavailable", status: "investigating" })).status, 403);
  assert.deepEqual(denied.calls, []);
});

test("optional chosen components retain tenant-scoped validation, deduplication, and transactional links", async () => {
  const component = { id: "component-create", name: "API" };
  const mock = await harness([
    { table: "uptime_status_pages", rows: [page] }, { table: "uptime_status_components", rows: [component] },
    { table: "organizations", rows: [{ id: organizationId }] },
  ]);
  const response = await mock.post({ title: "API unavailable", status: "investigating", componentIds: [component.id, component.id] });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.deepEqual(result.incident.sourceSnapshot.affectedComponents, [component]);
  const associations = mock.committed().find((write) => write.table === "uptime_incident_components");
  assert.ok(associations && Array.isArray(associations.values));
  assert.equal(associations.values.length, 1);
  assert.equal(associations.values[0].organizationId, organizationId);
  assert.equal(associations.values[0].incidentId, result.incident.id);
  assert.equal(associations.values[0].componentId, component.id);
  assert.ok(mock.predicates[1].params.includes(organizationId));
  assert.ok(mock.predicates[1].params.includes(page.id));
  assert.ok(mock.calls.indexOf("lock:organizations:update") < mock.calls.indexOf("insert:uptime_incident_components"));
  assert.equal(mock.unused(), 0);
});

test("blank declaration publication keeps status-page publication, quota, and component ownership guards", async () => {
  for (const [rows, input, status] of [
    [[...initialRows(false), { table: "organizations", rows: [{ id: organizationId }] }, { table: "uptime_status_pages", rows: [{ ...page, published: false }] }], {}, 409],
    [[...initialRows(false), { table: "organizations", rows: [{ id: organizationId }] }, { table: "uptime_status_pages", rows: [page] }, { table: "uptime_incident_updates", rows: [{ count: 20 }] }], {}, 429],
    [[...initialRows(false), { table: "organizations", rows: [{ id: organizationId }] }, { table: "uptime_status_pages", rows: [page] }, { table: "uptime_incident_updates", rows: [{ count: 0 }] }], { componentStates: { foreign: "outage" } }, 400],
  ] as Array<[Selection[], Row, number]>) {
    const mock = await harness(rows);
    assert.equal((await mock.post({ title: "API unavailable", status: "investigating", publish: true, ...input })).status, status);
    assert.deepEqual(mock.committed(), [], "publication failure rolls back the declaration transaction");
    assert.ok(!mock.calls.includes("insert:notifications"));
  }
});

test("explicit follow-up POST remains text-required even though initial declaration text is optional", async () => {
  for (const body of [{ status: "monitoring" }, { status: "monitoring", note: "" }, { status: "monitoring", body: { type: "doc", content: [] } }]) {
    const mock = await harness([], { followup: true });
    const response = await mock.post(body);
    assert.equal(response.status, 400);
    assert.deepEqual(mock.calls, []);
    assert.deepEqual(mock.writes, []);
  }
});

test("optional initial-note migration follows the bridge migration and only replaces the bounded note check", async () => {
  const [migration, snapshot, previous, journal] = await Promise.all([
    readFile(new URL("../drizzle/0031_optional_initial_incident_update.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/0031_snapshot.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../drizzle/meta/0030_snapshot.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(snapshot.prevId, previous.id);
  const initialIndex = journal.entries.findIndex((entry: { tag: string }) => entry.tag === "0031_optional_initial_incident_update");
  assert.ok(initialIndex > 0);
  assert.equal(journal.entries[initialIndex - 1].tag, "0030_observability_status_bridge");
  assert.equal(migration.split("--> statement-breakpoint").length, 2);
  assert.match(migration, /DROP CONSTRAINT "uptime_incident_updates_note_check"/);
  assert.match(migration, /length\(trim\("uptime_incident_updates"\."note"\)\) <= 4000/);
  assert.ok(snapshot.tables["public.uptime_incident_updates"].columns.note.notNull);
});
