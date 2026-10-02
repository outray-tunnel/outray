import assert from "node:assert/strict";
import test from "node:test";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import type { SecretsTransaction } from "../src/lib/secrets/database";
import { createUptimeIncidentUpdate, editUptimeIncidentDraft, parseIncidentUpdate, publishUptimeUpdate, PublishError } from "../src/lib/uptime/incident-api";

const incident = { id: "incident-a", organizationId: "tenant-a", title: "API incident", status: "open", sourceType: "uptime_manual" };
const draft = { id: "update-a", incidentId: incident.id, organizationId: incident.organizationId,
  note: "Original note", status: "investigating", componentStates: { "component-a": "outage" }, publishedAt: null };

// A strict scripted transaction checks real mutation control flow and lock order,
// without importing the application's database connection or touching live data.
function transaction(selectRows: unknown[][]) {
  const calls: string[] = [];
  const predicates: Array<{ sql: string; params: unknown[] }> = [];
  const writes: Array<Record<string, unknown>> = [];
  const rows = [...selectRows];
  const tx = {
    select() {
      let table = "";
      const selection = {
        from(value: PgTable) { table = getTableName(value); calls.push(`select:${table}`); return selection; },
        leftJoin() { return selection; },
        where(value: SQL) { predicates.push(new PgDialect().sqlToQuery(value)); return selection; },
        for(value: string) { calls.push(`lock:${table}:${value}`); return selection; },
        limit() { return selection; },
        then(resolve: (value: unknown[]) => unknown) {
          assert.ok(rows.length, `Unexpected query for ${table}`);
          return Promise.resolve(rows.shift()!).then(resolve);
        },
      };
      return selection;
    },
    insert(value: PgTable) {
      calls.push(`insert:${getTableName(value)}`);
      return { values(row: Record<string, unknown>) {
        writes.push(row);
        return { returning: async () => [row] };
      } };
    },
    update(value: PgTable) {
      calls.push(`update:${getTableName(value)}`);
      return { set(row: Record<string, unknown>) {
        writes.push(row);
        return { where(predicate: SQL) {
          predicates.push(new PgDialect().sqlToQuery(predicate));
          return { returning: async () => [{ ...draft, ...row }] };
        } };
      } };
    },
  } as unknown as SecretsTransaction;
  return { tx, calls, writes, predicates, unused: () => rows.length };
}

const create = (tx: SecretsTransaction, publish = false) => createUptimeIncidentUpdate(tx, {
  organizationId: "tenant-a", incidentId: incident.id, userId: "user-a",
  data: { note: "New update", bodyJson: null, status: "investigating", componentStates: {}, publish },
});
const edit = (tx: SecretsTransaction, body: Record<string, unknown>) => editUptimeIncidentDraft(tx, {
  organizationId: "tenant-a", incidentId: incident.id, updateId: draft.id, body,
});
const lockOrder = ["select:organizations", "lock:organizations:update", "select:incidents", "lock:incidents:update"];

test("rich update requests derive legacy note and reject unsafe formatting", () => {
  const good = parseIncidentUpdate({ body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Investigating ", marks: [{ type: "bold" }] }, { type: "text", text: "API" }] }] }, status: "investigating" });
  assert.equal(good.success, true);
  if (good.success) { assert.equal(good.data.note, "Investigating API"); assert.ok(good.data.bodyJson); }
  const legacy = parseIncidentUpdate({ note: "Old text update" });
  assert.equal(legacy.success, true);
  if (legacy.success) assert.equal(legacy.data.bodyJson, null);
  const unsafe = parseIncidentUpdate({ body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] } });
  assert.deepEqual(unsafe, { success: false, field: "body", error: "The update contains unsupported formatting or needs text" });
});

test("POST update checks resolved lifecycle after organization and incident row locks", async () => {
  for (const publish of [false, true]) {
    const mock = transaction([[{ id: "tenant-a" }], [{ ...incident, status: "resolved" }]]);
    await assert.rejects(create(mock.tx, publish), (error: unknown) => error instanceof PublishError && error.status === 409 && /read-only/.test(error.message));
    assert.deepEqual(mock.calls, lockOrder);
    assert.deepEqual(mock.writes, []);
  }
});

test("PATCH cannot save or publish a draft after incident resolution", async () => {
  for (const body of [{ note: "Edited note" }, { publish: true }]) {
    const mock = transaction([[{ id: "tenant-a" }], [{ ...incident, status: "resolved" }], [draft]]);
    await assert.rejects(edit(mock.tx, body), /Resolved incidents are read-only/);
    assert.deepEqual(mock.calls, [...lockOrder, "select:uptime_incident_updates", "lock:uptime_incident_updates:update"]);
    assert.deepEqual(mock.writes, []);
  }
});

test("published updates remain immutable, including duplicate publication requests", async () => {
  for (const status of ["open", "resolved"]) {
    const mock = transaction([[{ id: "tenant-a" }], [{ ...incident, status }], [{ ...draft, publishedAt: new Date() }]]);
    await assert.rejects(edit(mock.tx, { publish: true }), /Published updates are immutable/);
    assert.deepEqual(mock.writes, []);
  }
});

test("draft creation only inserts a private update and scopes every lookup to its tenant", async () => {
  const mock = transaction([[{ id: "tenant-a" }], [incident], [{ componentId: "component-a" }]]);
  const update = await create(mock.tx);
  assert.equal(update?.publishedAt, null);
  assert.deepEqual(mock.calls, [...lockOrder, "select:uptime_incident_components", "insert:uptime_incident_updates"]);
  assert.equal(mock.writes.length, 1);
  assert.equal(mock.writes[0].organizationId, "tenant-a");
  assert.ok(mock.predicates.every((predicate) => predicate.params.includes("tenant-a")));
  assert.ok(mock.predicates[1].params.includes("uptime_manual"));
  assert.ok(mock.predicates[1].params.includes("uptime_monitor"));
  assert.equal(mock.unused(), 0);
});

test("monitor incidents accept team updates without changing monitor-owned lifecycle", async () => {
  for (const lifecycle of ["open", "resolved"] as const) {
    const automatic = { ...incident, sourceType: "uptime_monitor", status: lifecycle };
    const mock = transaction([
      [{ id: "tenant-a" }], [automatic], [{ componentId: "component-a" }],
      [{ id: "tenant-a" }], [{ id: "page-a", published: true }], [{ count: 0 }], [],
    ]);
    const update = await createUptimeIncidentUpdate(mock.tx, {
      organizationId: "tenant-a", incidentId: incident.id, userId: "user-a",
      data: { note: "Team context", bodyJson: null, status: "monitoring", componentStates: {}, publish: true },
    });
    assert.ok(update?.publishedAt);
    assert.equal(update.status, "monitoring");
    assert.ok(!mock.calls.includes("update:incidents"));
    assert.equal(mock.unused(), 0);
  }
});

test("ignored and recovered private detections cannot be published", async () => {
  for (const [publicationState, lifecycle] of [["ignored", "open"], ["detected", "resolved"]] as const) {
    const privateIncident = { ...incident, sourceType: "uptime_monitor", status: lifecycle,
      uptimePublicationState: publicationState };
    const createMock = transaction([[{ id: "tenant-a" }], [privateIncident]]);
    await assert.rejects(create(createMock.tx, true), (error: unknown) =>
      error instanceof PublishError && error.status === 409);
    assert.deepEqual(createMock.writes, []);

    const editMock = transaction([[{ id: "tenant-a" }], [privateIncident], [{ ...draft, componentStates: {} }]]);
    await assert.rejects(edit(editMock.tx, { publish: true }), (error: unknown) =>
      error instanceof PublishError && error.status === 409);
    assert.deepEqual(editMock.writes, []);
  }
});

test("first publication needs a visible component and atomically marks a detection public", async () => {
  const input = {
    organizationId: "tenant-a", incidentId: incident.id, updateId: "update-a", title: incident.title,
    affectedComponentIds: ["component-a"], note: "Investigating the outage", status: "investigating" as const,
    componentStates: {}, applyManualLifecycle: false, publishMonitorIncident: true, now: new Date(),
  };
  const hidden = transaction([[{ id: "tenant-a" }], [{ id: "page-a", published: true }], []]);
  assert.deepEqual(await publishUptimeUpdate(hidden.tx, input), {
    success: false, status: 409, error: "A visible affected component is required to publish this incident",
  });
  assert.deepEqual(hidden.writes, []);

  const visible = transaction([
    [{ id: "tenant-a" }], [{ id: "page-a", published: true }], [{ id: "component-a" }],
    [{ count: 0 }], [],
  ]);
  assert.deepEqual(await publishUptimeUpdate(visible.tx, input), { success: true, recipients: 0 });
  assert.ok(visible.calls.includes("update:incidents"));
  assert.ok(visible.writes.some((row) => row.uptimePublicationState === "published"));
  assert.equal(visible.unused(), 0);
});

test("monitor updates cannot override component state", async () => {
  const mock = transaction([[{ id: "tenant-a" }], [{ ...incident, sourceType: "uptime_monitor" }]]);
  await assert.rejects(createUptimeIncidentUpdate(mock.tx, {
    organizationId: "tenant-a", incidentId: incident.id, userId: "user-a",
    data: { note: "Override", bodyJson: null, status: "resolved", componentStates: { "component-a": "operational" }, publish: false },
  }), (error: unknown) => error instanceof PublishError && error.field === "componentStates" && error.status === 400);
  assert.deepEqual(mock.writes, []);
});

test("a team update cannot mark an ongoing monitor incident resolved", async () => {
  const mock = transaction([[{ id: "tenant-a" }], [{ ...incident, sourceType: "uptime_monitor" }]]);
  await assert.rejects(createUptimeIncidentUpdate(mock.tx, {
    organizationId: "tenant-a", incidentId: incident.id, userId: "user-a",
    data: { note: "Recovered?", bodyJson: null, status: "resolved", componentStates: {}, publish: true },
  }), (error: unknown) => error instanceof PublishError && error.field === "status" && error.status === 409);
  assert.deepEqual(mock.writes, []);
});

test("a monitor incident draft retains the team's selected update status", async () => {
  const mock = transaction([[{ id: "tenant-a" }], [{ ...incident, sourceType: "uptime_monitor", status: "resolved" }],
    [{ ...draft, componentStates: {} }], [{ componentId: "component-a" }]]);
  const updated = await editUptimeIncidentDraft(mock.tx, {
    organizationId: "tenant-a", incidentId: incident.id, updateId: draft.id,
    body: { note: "Mitigation complete", status: "identified" },
  });
  assert.equal(updated?.status, "identified");
  assert.equal(updated?.publishedAt, null);
  assert.ok(!mock.calls.includes("update:incidents"));
});

test("editing a draft preserves omitted fields and never applies public state or queues delivery", async () => {
  const mock = transaction([[{ id: "tenant-a" }], [incident], [draft], [{ componentId: "component-a" }]]);
  const updated = await edit(mock.tx, { note: "Revised note" });
  assert.equal(updated?.note, "Revised note");
  assert.equal(updated?.status, "investigating");
  assert.deepEqual(updated?.componentStates, draft.componentStates);
  assert.equal(updated?.publishedAt, null);
  assert.deepEqual(mock.calls, [...lockOrder, "select:uptime_incident_updates", "lock:uptime_incident_updates:update",
    "select:uptime_incident_components", "update:uptime_incident_updates"]);
  assert.ok(mock.predicates.every((predicate) => predicate.params.includes("tenant-a")));
});

test("missing or other-tenant incidents stop before an update is read or written", async () => {
  for (const operation of [create, (tx: SecretsTransaction) => edit(tx, { note: "Denied" })]) {
    const mock = transaction([[{ id: "tenant-a" }], []]);
    assert.equal(await operation(mock.tx), null);
    assert.deepEqual(mock.calls, lockOrder);
    assert.deepEqual(mock.writes, []);
  }
});

test("invalid draft fields retain actionable field errors without writing", async () => {
  const mock = transaction([[{ id: "tenant-a" }], [incident], [draft]]);
  await assert.rejects(edit(mock.tx, { note: "" }), (error: unknown) => error instanceof PublishError && error.field === "note" && error.status === 400);
  assert.deepEqual(mock.writes, []);
});
