import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as agentSchema from "../src/db/agent-schema";
import { AgentStoreError, createAgentStore } from "../src/lib/agent/store";

const { agentThreads, agentMessages, agentRuns } = agentSchema;
const scope = { organizationId: "org-a", userId: "user-a" };
const threadId = "11111111-1111-4111-8111-111111111111";
const clientMessageId = "22222222-2222-4222-8222-222222222222";
const assistantId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-10-08T10:00:00Z");
const thread = { id: threadId, ...scope, createdBy: scope.userId, title: "Explain this request",
  sourceRequestId: "request-a", createdAt: now, updatedAt: now };
const user = { id: clientMessageId, threadId, role: "user", text: "Explain this request", status: "complete",
  steps: [], evidence: [], error: null, createdAt: now };
const assistant = { ...user, id: assistantId, role: "assistant", text: "", status: "pending",
  createdAt: new Date(now.getTime() + 1) };
const run = { id: runId, threadId, clientMessageId, assistantMessageId: assistantId, status: "running",
  inputTokens: 0, outputTokens: 0, maxTokens: 12_000, maxSteps: 8, error: null,
  startedAt: now, updatedAt: now, completedAt: null };
const input = { ...scope, threadId, clientMessageId, assistantId, runId, text: user.text, sourceRequestId: "request-a" };

function row(table: PgTable, value: Record<string, unknown>) {
  return Object.keys(getTableColumns(table)).map((key) => value[key] instanceof Date ? value[key].toISOString() : value[key]);
}
type Query = { sql: string; params: unknown[] };
function harness(options: { existing?: boolean; reply?: (query: Query) => unknown[][] | undefined } = {}) {
  const queries: Query[] = [];
  let existing = options.existing ?? false;
  // Exercise real Drizzle-generated SQL against a fake pg client; no pool, URL, or connection exists.
  const client = { async query(config: string | { text: string }, params: unknown[] = []) {
    const query = { sql: typeof config === "string" ? config : config.text, params };
    queries.push(query);
    const supplied = options.reply?.(query);
    if (supplied !== undefined) return { rows: supplied };
    if (/^select .*count\(\*\)/.test(query.sql)) return { rows: [[0, 0, 0, 0]] };
    if (query.sql.startsWith('select "id", "organization_id"')) return { rows: [row(agentThreads, thread)] };
    if (query.sql.startsWith('select "id", "thread_id", "role"')) return { rows: query.sql.includes('from (select')
      ? [row(agentMessages, user), row(agentMessages, assistant)] : [row(agentMessages, assistant), row(agentMessages, user)] };
    if (query.sql.startsWith('select "id", "thread_id", "client_message_id"')) return { rows: existing ? [row(agentRuns, run)] : [] };
    if (query.sql.startsWith('insert into "agent_runs"')) { existing = true; return { rows: [row(agentRuns, run)] }; }
    if (query.sql.startsWith('update "agent_runs"') && query.sql.includes('returning "id"')) return { rows: [row(agentRuns, run)] };
    return { rows: [] };
  } };
  const database = drizzle(client as never, { schema: agentSchema }) as unknown as Parameters<typeof createAgentStore>[0];
  return { store: createAgentStore(database), queries };
}
function error(code: string, status: number) {
  return (value: unknown) => value instanceof AgentStoreError && value.code === code && value.status === status;
}
function assertOwned(query: Query) {
  assert.match(query.sql, /"agent_threads"\."organization_id" = \$\d+/);
  assert.match(query.sql, /"agent_threads"\."created_by" = \$\d+/);
  assert.ok(query.params.includes(scope.organizationId));
  assert.ok(query.params.includes(scope.userId));
}

test("agent schema enforces private ownership FKs, durable JSON, statuses and idempotency", () => {
  const threads = getTableConfig(agentThreads);
  assert.equal(threads.foreignKeys.length, 2);
  assert.equal(agentThreads.createdBy.notNull, true);
  assert.equal(agentMessages.steps.dataType, "json");
  assert.equal(agentMessages.evidence.dataType, "json");
  assert.deepEqual(getTableConfig(agentMessages).checks.map((check) => check.name), ["agent_messages_role_check", "agent_messages_status_check"]);
  const runs = getTableConfig(agentRuns);
  assert.ok(runs.indexes.some((index) => index.config.name === "agent_runs_client_message_unique" && index.config.unique));
  assert.ok(runs.indexes.some((index) => index.config.name === "agent_runs_assistant_message_unique" && index.config.unique));
});

test("private thread listing is tenant/creator scoped and bounded with chronological history", async () => {
  const f = harness();
  const threads = await f.store.listThreads(scope);
  assert.equal(threads[0].id, threadId);
  assert.deepEqual(threads[0].messages.map((message) => message.id), [clientMessageId, assistantId]);
  assert.equal(threads[0].messages[1].status, "running");
  const threadRead = f.queries.find((query) => query.sql.startsWith('select "id", "organization_id"'))!;
  const messageRead = f.queries.find((query) => query.sql.startsWith('select "id", "thread_id", "role"'))!;
  assertOwned(threadRead); assertOwned(messageRead);
  assert.equal(threadRead.params.at(-1), 30);
  assert.equal(messageRead.params.at(-1), 100);
  assert.match(messageRead.sql, /row_number\(\) OVER \(PARTITION BY "thread_id" ORDER BY "created_at" DESC/);
  assert.equal(f.queries.filter((query) => query.sql.startsWith("select")).length, 2);
});

test("run admission serializes user and org caps before any inserts", async () => {
  const f = harness();
  const result = await f.store.beginRun(input);
  assert.equal(result.kind, "created");
  assert.equal(result.run.id, runId);
  assert.equal(result.assistantMessage.status, "running");
  const locks = f.queries.filter((query) => query.sql.includes("pg_advisory_xact_lock"));
  assert.deepEqual(locks.map((query) => query.params[0]), ["outray:agent:org:org-a", "outray:agent:user:user-a"]);
  const usage = f.queries.findIndex((query) => query.sql.includes("count(*) FILTER"));
  const insertion = f.queries.findIndex((query) => query.sql.startsWith('insert into "agent_threads"'));
  assert.ok(f.queries.indexOf(locks[1]) < usage && usage < insertion);
  assert.match(f.queries[insertion].sql, /on conflict \("id"\) do nothing/);
  for (const query of f.queries.filter((entry) => entry.sql.startsWith('update "agent_threads"'))) assertOwned(query);
});

test("listing many threads batches histories once and groups private messages by thread", async () => {
  const secondThreadId = "55555555-5555-4555-8555-555555555555";
  const f = harness({ reply: ({ sql }) => {
    if (sql.startsWith('select "id", "organization_id"')) return [row(agentThreads, thread), row(agentThreads, { ...thread, id: secondThreadId })];
    if (sql.includes('from (select')) return [row(agentMessages, user), row(agentMessages, assistant), row(agentMessages, { ...user, threadId: secondThreadId })];
    return undefined;
  } });
  const threads = await f.store.listThreads(scope);
  assert.equal(threads.length, 2);
  assert.equal(threads[0].messages.length, 2);
  assert.equal(threads[1].messages.length, 1);
  assert.equal(f.queries.filter((query) => query.sql.includes('from (select')).length, 1);
  const history = f.queries.find((query) => query.sql.includes("from (select"))!;
  assert.ok(history.params.includes(threadId) && history.params.includes(secondThreadId));
});

for (const [counts, code] of [
  [[1, 0, 0, 0], "CONCURRENT_RUN_LIMIT"], [[0, 3, 0, 0], "CONCURRENT_RUN_LIMIT"],
  [[0, 0, 50, 0], "DAILY_RUN_LIMIT"], [[0, 0, 0, 250], "DAILY_RUN_LIMIT"],
] as const) {
  test(`hard admission cap ${counts.join("/")} rejects and rolls back without storing a prompt`, async () => {
    const f = harness({ reply: ({ sql }) => sql.includes("count(*) FILTER") ? [[...counts]] : undefined });
    await assert.rejects(f.store.beginRun(input), error(code, 429));
    assert.equal(f.queries.some((query) => query.sql.startsWith("insert")), false);
    assert.equal(f.queries.at(-1)?.sql, "rollback");
  });
}

test("duplicate client message returns persisted pair without a second run or prompt", async () => {
  const f = harness({ existing: true });
  const result = await f.store.beginRun(input);
  assert.equal(result.kind, "existing");
  assert.equal(result.userMessage.text, input.text);
  assert.equal(f.queries.some((query) => query.sql.startsWith("insert") || query.sql.includes("count(*)")), false);
  const existingRead = f.queries.find((query) => query.sql.startsWith('select "id", "thread_id", "client_message_id"'))!;
  assertOwned(existingRead);
  await assert.rejects(f.store.beginRun({ ...input, text: "A different prompt" }), error("IDEMPOTENCY_CONFLICT", 409));
});

test("foreign thread UUID conflicts never overwrite ownership or accept its messages", async () => {
  const f = harness({ reply: ({ sql }) => sql.startsWith('select "id", "organization_id"') ? [] : undefined });
  await assert.rejects(f.store.beginRun(input), error("NOT_FOUND", 404));
  assert.equal(f.queries.some((query) => query.sql.startsWith('insert into "agent_messages"')), false);
  const insert = f.queries.find((query) => query.sql.startsWith('insert into "agent_threads"'))!;
  assert.match(insert.sql, /on conflict \("id"\) do nothing/);
  assert.doesNotMatch(insert.sql, /do update/);
});

test("a UUID message collision is generic and the entire new run is rolled back", async () => {
  const f = harness({ reply: ({ sql }) => {
    if (sql.startsWith('insert into "agent_messages"')) throw Object.assign(new Error("foreign UUID"), { code: "23505" });
    return undefined;
  } });
  await assert.rejects(f.store.beginRun(input), error("IDEMPOTENCY_CONFLICT", 409));
  assert.equal(f.queries.at(-1)?.sql, "rollback");
  assert.equal(f.queries.some((query) => query.sql.startsWith('insert into "agent_runs"')), false);
});

test("thread source request cannot be rebound on subsequent messages", async () => {
  const f = harness();
  await assert.rejects(f.store.beginRun({ ...input, sourceRequestId: "request-b" }), error("SOURCE_CONFLICT", 409));
  assert.equal(f.queries.some((query) => query.sql.startsWith('insert into "agent_messages"')), false);
});

test("step/evidence snapshots persist only into the owned assistant and running run", async () => {
  const f = harness();
  await f.store.updateRun({ ...scope, runId, text: "Investigating", steps: [{ id: "step-1", label: "Query request", status: "complete" }],
    evidence: [{ id: "request-a", label: "Request", href: "/team/observability/requests", observedAt: now.toISOString() }], inputTokens: 9, outputTokens: 3 });
  const runWrite = f.queries.find((query) => query.sql.startsWith('update "agent_runs"'))!;
  const messageWrite = f.queries.find((query) => query.sql.startsWith('update "agent_messages"'))!;
  assertOwned(runWrite); assertOwned(messageWrite);
  assert.match(runWrite.sql, /"agent_runs"\."status" = \$\d+/);
  assert.ok(runWrite.params.includes("running"));
  assert.ok(messageWrite.params.includes(assistantId));
  assert.ok(messageWrite.params.includes(threadId));
  assert.ok(messageWrite.params.some((value) => typeof value === "string" && value.includes('"id":"step-1"')));
});

test("terminal runs cannot be resurrected by late stream updates", async () => {
  const f = harness({ existing: true, reply: ({ sql }) => {
    if (sql.startsWith('update "agent_runs"')) return [];
    if (sql.startsWith('select "id", "thread_id", "client_message_id"')) return [row(agentRuns, { ...run, status: "cancelled" })];
    return undefined;
  } });
  const result = await f.store.updateRun({ ...scope, runId, text: "Late output" });
  assert.equal(result.status, "cancelled");
  assert.equal(f.queries.some((query) => query.sql.startsWith('update "agent_messages"')), false);
});

test("final status, token accounting and assistant output are persisted atomically", async () => {
  const f = harness({ reply: ({ sql }) => sql.startsWith('update "agent_runs"') && sql.includes('returning "id"')
    ? [row(agentRuns, { ...run, status: "complete", inputTokens: 21, outputTokens: 8, completedAt: now })] : undefined });
  const saved = await f.store.finishRun({ ...scope, runId, status: "complete", text: "The request completed normally", inputTokens: 21, outputTokens: 8 });
  assert.equal(saved.status, "complete");
  assert.equal(saved.inputTokens, 21);
  const runWrite = f.queries.find((query) => query.sql.startsWith('update "agent_runs"'))!;
  const messageWrite = f.queries.find((query) => query.sql.startsWith('update "agent_messages"'))!;
  assert.ok(runWrite.params.includes("complete") && runWrite.params.includes(21) && runWrite.params.includes(8));
  assert.ok(messageWrite.params.includes("complete") && messageWrite.params.includes("The request completed normally"));
  assert.equal(f.queries[0].sql, "begin");
  assert.equal(f.queries.at(-1)?.sql, "commit");
});

test("a run inaccessible in this organization or creator scope returns no data or writes", async () => {
  const f = harness({ reply: ({ sql }) => sql.startsWith('update "agent_runs"') || sql.startsWith('select "id", "thread_id", "client_message_id"')
    ? [] : undefined });
  await assert.rejects(f.store.finishRun({ ...scope, runId, status: "cancelled" }), error("NOT_FOUND", 404));
  assert.equal(f.queries.some((query) => query.sql.startsWith('update "agent_messages"')), false);
  for (const query of f.queries.filter((entry) => entry.sql.startsWith("select") || entry.sql.startsWith("update"))) assertOwned(query);
});

test("stale work is marked interrupted with failed steps, without touching another creator", async () => {
  const f = harness({ reply: ({ sql }) => sql.startsWith('update "agent_runs"') && sql.includes('returning "assistant_message_id"')
    ? [[assistantId, threadId]] : undefined });
  await f.store.listThreads(scope);
  const stale = f.queries.find((query) => query.sql.startsWith('update "agent_runs"'))!;
  const message = f.queries.find((query) => query.sql.startsWith('update "agent_messages"'))!;
  assertOwned(stale); assertOwned(message);
  assert.ok(stale.params.includes("failed"));
  assert.ok(stale.params.includes("running"));
  assert.ok(stale.params.some((value) => typeof value === "string" && value.includes("interrupted")));
  assert.match(message.sql, /jsonb_array_elements/);
  assert.match(message.sql, /"status":"failed"/);
});

test("invalid identifiers, missing scope and duplicate step IDs fail before querying", async () => {
  const f = harness();
  await assert.rejects(f.store.beginRun({ ...input, userId: "" }), error("UNAUTHORIZED", 401));
  await assert.rejects(f.store.getThread({ ...scope, threadId: "not-a-uuid" }), error("INVALID_ID", 400));
  await assert.rejects(f.store.updateRun({ ...scope, runId, steps: [
    { id: "same", label: "One", status: "running" }, { id: "same", label: "Two", status: "running" },
  ] }), error("INVALID_STEPS", 400));
  assert.equal(f.queries.length, 0);
});

test("generated agent migration is additive and contains no unrelated table changes", async () => {
  const migration = await readFile(new URL("../drizzle/0028_agent_conversations.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /^(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.equal((migration.match(/CREATE TABLE /g) ?? []).length, 3);
  assert.match(migration, /CREATE UNIQUE INDEX "agent_runs_client_message_unique"/);
  for (const line of migration.split("\n").filter((entry) => entry.startsWith("ALTER TABLE"))) {
    assert.match(line, /^ALTER TABLE "agent_(?:messages|runs|threads)" ADD CONSTRAINT/);
  }
});
