import assert from "node:assert/strict";
import test from "node:test";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import type { SecretsTransaction } from "../src/lib/secrets/database";
import { createManualIncidentUpdate, editManualIncidentDraft, PublishError } from "../src/lib/uptime/incident-api";

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

const create = (tx: SecretsTransaction, publish = false) => createManualIncidentUpdate(tx, {
  organizationId: "tenant-a", incidentId: incident.id, userId: "user-a",
  data: { note: "New update", status: "investigating", componentStates: {}, publish },
});
const edit = (tx: SecretsTransaction, body: Record<string, unknown>) => editManualIncidentDraft(tx, {
  organizationId: "tenant-a", incidentId: incident.id, updateId: draft.id, body,
});
const lockOrder = ["select:organizations", "lock:organizations:update", "select:incidents", "lock:incidents:update"];

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
  assert.equal(mock.unused(), 0);
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
