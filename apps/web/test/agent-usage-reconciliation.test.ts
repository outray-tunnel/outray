import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import * as agentSchema from "../src/db/agent-schema";
import type { AgentUsageSnapshot } from "../src/lib/agent/monthly-usage";
import { reconcileAgentMonthlyUsage } from "../src/lib/agent/usage-reconciliation";

type Query = { sql: string; params: unknown[] };
type Thread = { id: string; organizationId: string; createdBy: string };
type Run = Omit<AgentUsageSnapshot, "organizationId" | "runId"> & {
  id: string;
  threadId: string;
  completedAt?: Date;
};

const organizationId = "org-a";
const month = "2026-10";
const start = new Date("2026-10-01T00:00:00.000Z");
const end = new Date("2026-11-01T00:00:00.000Z");
const threadA = "11111111-1111-4111-8111-111111111111";
const threadB = "22222222-2222-4222-8222-222222222222";
const foreignThread = "33333333-3333-4333-8333-333333333333";
const threads: Thread[] = [
  { id: threadA, organizationId, createdBy: "creator-a" },
  { id: threadB, organizationId, createdBy: "creator-b" },
  { id: foreignThread, organizationId: "org-b", createdBy: "creator-a" },
];

function id(number: number) {
  return `${number.toString(16).padStart(8, "0")}-4444-4444-8444-444444444444`;
}

function run(number: number, overrides: Partial<Run> = {}): Run {
  return {
    id: id(number), threadId: threadA, startedAt: new Date("2026-10-15T12:30:00.123Z"),
    inputTokens: number * 10, outputTokens: number, status: "complete", ...overrides,
  };
}

function parameter(query: Query, expression: RegExp) {
  const match = expression.exec(query.sql);
  return match ? query.params[Number(match[1]) - 1] : undefined;
}

function harness(options: {
  runs?: Run[];
  threads?: Thread[];
  queryError?: Error;
  record?: (snapshot: AgentUsageSnapshot) => Promise<void>;
} = {}) {
  const queries: Query[] = [];
  const recorded: AgentUsageSnapshot[] = [];
  const client = { async query(config: string | { text: string }, params: unknown[] = []) {
    const query = { sql: typeof config === "string" ? config : config.text, params };
    queries.push(query);
    if (options.queryError) throw options.queryError;
    // Real Drizzle produces the query; this fake pg client only models its select predicates.
    // Missing predicates deliberately expose excluded rows so the assertions catch regressions.
    const tenant = parameter(query, /"agent_threads"\."organization_id" = \$(\d+)/);
    const lower = parameter(query, /"agent_runs"\."started_at" >= \$(\d+)/);
    const upper = parameter(query, /"agent_runs"\."started_at" < \$(\d+)/);
    const cursor = parameter(query, /"agent_runs"\."id" > \$(\d+)/);
    const limit = parameter(query, /limit \$(\d+)/);
    const selected = (options.runs ?? []).filter((value) => {
      const owner = (options.threads ?? threads).find((thread) => thread.id === value.threadId);
      if (query.sql.includes('inner join "agent_threads"') && !owner) return false;
      return (tenant === undefined || owner?.organizationId === tenant)
        && (lower === undefined || value.startedAt.getTime() >= new Date(String(lower)).getTime())
        && (upper === undefined || value.startedAt.getTime() < new Date(String(upper)).getTime())
        && (cursor === undefined || value.id > String(cursor));
    });
    if (query.sql.includes('order by "agent_runs"."id" asc')) selected.sort((a, b) => a.id.localeCompare(b.id));
    const page = limit === undefined ? selected : selected.slice(0, Number(limit));
    return { rows: page.map((value) => [value.id, value.startedAt.toISOString(), value.inputTokens, value.outputTokens, value.status]) };
  } };
  // No pool, Redis connection, environment variable, or external service is involved.
  const database = drizzle(client as never, { schema: agentSchema }) as unknown as Parameters<typeof reconcileAgentMonthlyUsage>[0];
  const usage = { async record(snapshot: AgentUsageSnapshot) {
    recorded.push(snapshot);
    await options.record?.(snapshot);
  } };
  return { database, usage, queries, recorded };
}

function assertReadOnly(query: Query) {
  assert.match(query.sql, /^select /);
  assert.match(query.sql, /from "agent_runs" inner join "agent_threads" on "agent_runs"\."thread_id" = "agent_threads"\."id"/);
  assert.match(query.sql, /"agent_threads"\."organization_id" = \$\d+/);
  assert.match(query.sql, /"agent_runs"\."started_at" >= \$\d+/);
  assert.match(query.sql, /"agent_runs"\."started_at" < \$\d+/);
  assert.match(query.sql, /order by "agent_runs"\."id" asc limit \$\d+$/);
  assert.doesNotMatch(query.sql, /\b(?:insert|update|delete|truncate|drop|offset|sum|count)\b/i);
  assert.doesNotMatch(query.sql, /created_by|agent_messages|client_message_id|assistant_message_id|completed_at|updated_at|"users"|"text"|"steps"|"evidence"/);
}

test("monthly reconciliation joins thread ownership across all creators and all stored statuses", async () => {
  const included = [
    run(1, { status: "running", startedAt: start }),
    run(2, { status: "complete", threadId: threadB }),
    run(3, { status: "failed", threadId: threadB }),
    run(4, { status: "cancelled", startedAt: new Date(end.getTime() - 1) }),
  ];
  const f = harness({ runs: [
    ...included.reverse(),
    run(5, { threadId: foreignThread }),
    run(6, { threadId: id(99) }),
    run(7, { startedAt: new Date(start.getTime() - 1), completedAt: start }),
    run(8, { startedAt: end }),
  ] });
  assert.deepEqual(await reconcileAgentMonthlyUsage(f.database, f.usage, { organizationId, month }),
    { organizationId, month, processedRuns: 4 });
  assert.deepEqual(f.recorded.map((value) => value.runId), [id(1), id(2), id(3), id(4)]);
  assert.deepEqual(f.recorded.map((value) => value.status), ["running", "complete", "failed", "cancelled"]);
  assert.equal(f.queries.length, 1);
  const query = f.queries[0];
  assertReadOnly(query);
  assert.deepEqual(query.params, [organizationId, start.toISOString(), end.toISOString(), 250]);
  assert.doesNotMatch(query.sql, /"status"\s*(?:=|in\s*\()/i);
  assert.equal(query.params.includes("creator-a") || query.params.includes("creator-b"), false);
});

test("cross-month runs retain their UTC start month and exact durable token snapshot", async () => {
  const persisted = run(10, {
    startedAt: new Date("2026-10-31T23:59:59.999Z"),
    completedAt: new Date("2026-11-01T08:00:00.000Z"),
    inputTokens: 987, outputTokens: 654, status: "failed",
  });
  const priorMonth = run(11, { startedAt: new Date("2026-09-30T23:59:59.999Z"), completedAt: start });
  const f = harness({ runs: [persisted, priorMonth] });
  await reconcileAgentMonthlyUsage(f.database, f.usage, { organizationId, month });
  assert.deepEqual(f.recorded, [{
    organizationId, runId: persisted.id, startedAt: persisted.startedAt,
    inputTokens: persisted.inputTokens, outputTokens: persisted.outputTokens, status: persisted.status,
  }]);
  assert.deepEqual(Object.keys(f.recorded[0]).sort(), ["inputTokens", "organizationId", "outputTokens", "runId", "startedAt", "status"]);
});

test("bounded UUID keyset pagination is deterministic despite unrelated run timestamps", async () => {
  const f = harness({ runs: [
    run(4, { startedAt: start }),
    run(2, { startedAt: new Date("2026-10-27T00:00:00Z") }),
    run(3, { startedAt: start }),
    run(1, { startedAt: new Date("2026-10-29T00:00:00Z") }),
  ] });
  const result = await reconcileAgentMonthlyUsage(f.database, f.usage, { organizationId, month, pageSize: 2 });
  assert.equal(result.processedRuns, 4);
  assert.deepEqual(f.recorded.map((value) => value.runId), [id(1), id(2), id(3), id(4)]);
  assert.equal(f.queries.length, 3); // Exact full pages need one final empty page.
  for (const query of f.queries) assertReadOnly(query);
  assert.doesNotMatch(f.queries[0].sql, /"agent_runs"\."id" > /);
  assert.deepEqual(f.queries.map((query) => parameter(query, /"agent_runs"\."id" > \$(\d+)/)), [undefined, id(2), id(4)]);
  assert.deepEqual(f.queries.map((query) => query.params.at(-1)), [2, 2, 2]);
  assert.deepEqual(f.queries[1].params, [organizationId, start.toISOString(), end.toISOString(), id(2), 2]);
});

test("empty organizations or months do not create usage, reset aggregates, or write PostgreSQL", async () => {
  const f = harness({ runs: [run(1, { threadId: foreignThread }), run(2, { startedAt: end })] });
  const usage = new Proxy(f.usage, { get(target, property) {
    assert.equal(property, "record", "maintenance must never read or reset the aggregate");
    return target.record;
  } });
  assert.deepEqual(await reconcileAgentMonthlyUsage(f.database, usage, { organizationId, month, pageSize: 1_000 }),
    { organizationId, month, processedRuns: 0 });
  assert.equal(f.recorded.length, 0);
  assert.equal(f.queries.length, 1);
  assert.equal(f.queries[0].params.at(-1), 1_000);
  assertReadOnly(f.queries[0]);
});

test("legacy runs with zero stored counters are replayed without estimates or synthetic usage", async () => {
  const legacy = run(1, { startedAt: new Date("2024-02-29T23:59:59.999Z"), inputTokens: 0, outputTokens: 0, status: "complete" });
  const f = harness({ runs: [legacy] });
  const result = await reconcileAgentMonthlyUsage(f.database, f.usage, { organizationId, month: "2024-02", pageSize: 1 });
  assert.equal(result.processedRuns, 1);
  assert.deepEqual(f.recorded, [{ organizationId, runId: legacy.id, startedAt: legacy.startedAt, inputTokens: 0, outputTokens: 0, status: "complete" }]);
  assert.deepEqual(f.queries[0].params, [organizationId, "2024-02-01T00:00:00.000Z", "2024-03-01T00:00:00.000Z", 1]);
  for (const query of f.queries) assertReadOnly(query);
});

test("December and low-numbered years use exact UTC calendar month boundaries", async () => {
  for (const [selectedMonth, lower, upper] of [
    ["2026-12", "2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
    ["0099-02", "0099-02-01T00:00:00.000Z", "0099-03-01T00:00:00.000Z"],
    ["0000-01", "0000-01-01T00:00:00.000Z", "0000-02-01T00:00:00.000Z"],
  ]) {
    const f = harness();
    await reconcileAgentMonthlyUsage(f.database, f.usage, { organizationId, month: selectedMonth });
    assert.deepEqual(f.queries[0].params, [organizationId, lower, upper, 250]);
  }
});

test("recorder failures stop immediately and retry replays stable IDs without aggregate resets", async () => {
  const runs = [run(1), run(2), run(3)];
  const persisted = new Map<string, AgentUsageSnapshot>();
  const outage = new Error("accounting unavailable");
  let fail = true;
  const record = async (snapshot: AgentUsageSnapshot) => {
    if (fail && snapshot.runId === id(2)) throw outage;
    persisted.set(snapshot.runId, snapshot); // Model an idempotent injected recorder.
  };
  const first = harness({ runs, record });
  await assert.rejects(reconcileAgentMonthlyUsage(first.database, first.usage, { organizationId, month, pageSize: 2 }),
    (error: unknown) => error === outage);
  assert.equal(first.queries.length, 1);
  assert.deepEqual(first.recorded.map((value) => value.runId), [id(1), id(2)]);
  assert.deepEqual([...persisted.keys()], [id(1)]);
  fail = false;
  const retry = harness({ runs, record });
  const usage = new Proxy(retry.usage, { get(target, property) {
    assert.equal(property, "record", "retries must not reset existing usage");
    return target.record;
  } });
  assert.deepEqual(await reconcileAgentMonthlyUsage(retry.database, usage, { organizationId, month, pageSize: 2 }),
    { organizationId, month, processedRuns: 3 });
  assert.deepEqual(retry.recorded.map((value) => value.runId), [id(1), id(2), id(3)]);
  assert.equal(persisted.size, 3);
  assert.equal([...persisted.values()].reduce((sum, value) => sum + value.inputTokens + value.outputTokens, 0), 66);
  for (const query of [...first.queries, ...retry.queries]) assertReadOnly(query);
});

test("PostgreSQL failure propagates before any accounting call or data write", async () => {
  const failure = new Error("database unavailable");
  const f = harness({ queryError: failure });
  await assert.rejects(reconcileAgentMonthlyUsage(f.database, f.usage, { organizationId, month }),
    (error: unknown) => error === failure || error instanceof Error && "cause" in error && error.cause === failure);
  assert.equal(f.recorded.length, 0);
  assert.equal(f.queries.length, 1);
  assertReadOnly(f.queries[0]);
});

test("invalid organization, month, and page size fail before PostgreSQL or accounting calls", async () => {
  type Options = Parameters<typeof reconcileAgentMonthlyUsage>[2];
  const invalid: Options[] = [
    ...["", " ", "x".repeat(257), "\ud800", null, 123].map((value) => ({ organizationId: value as string, month })),
    ...["", "2026-00", "2026-13", "2026-1", "26-10", "2026-10-01", "2026-10 ", null, 202610]
      .map((value) => ({ organizationId, month: value as string })),
    ...[0, -1, 1.5, 1_001, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", null]
      .map((value) => ({ organizationId, month, pageSize: value as number })),
  ];
  for (const options of invalid) {
    const f = harness();
    await assert.rejects(reconcileAgentMonthlyUsage(f.database, f.usage, options), /Invalid agent usage|page size/);
    assert.equal(f.queries.length, 0);
    assert.equal(f.recorded.length, 0);
  }
});
