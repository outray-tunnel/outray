import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMonthlyUsageRecorder, AgentUsageSnapshot } from "../src/lib/agent/monthly-usage";
import type { AgentSavedMessage, AgentSavedThread } from "../src/lib/agent/protocol";
import type { AgentRunResult, AgentStore, AgentStoredRun, BeginAgentRun } from "../src/lib/agent/store";
import { createAgentUsageStore } from "../src/lib/agent/usage-store";

const scope = { organizationId: "trusted-org", userId: "private-user" };
const threadId = "11111111-1111-4111-8111-111111111111";
const clientMessageId = "22222222-2222-4222-8222-222222222222";
const assistantId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-09-30T23:59:59.000Z");
const later = new Date("2026-10-01T00:01:00.000Z");
const user: AgentSavedMessage = { id: clientMessageId, role: "user", text: "Private investigation prompt",
  status: "complete", steps: [], evidence: [] };
const assistant: AgentSavedMessage = { ...user, id: assistantId, role: "assistant", text: "", status: "running" };
const thread: AgentSavedThread = { id: threadId, title: user.text, sourceRequestId: null,
  createdAt: now.getTime(), updatedAt: now.getTime(), messages: [user, assistant] };
const initialRun: AgentStoredRun = { id: runId, threadId, clientMessageId, assistantMessageId: assistantId,
  status: "running", inputTokens: 0, outputTokens: 0, maxTokens: 12_000, maxSteps: 8, error: null,
  startedAt: now, updatedAt: now, completedAt: null };
const input: BeginAgentRun = { ...scope, threadId, clientMessageId, assistantId, runId, text: user.text };

type Call = { method: keyof AgentStore; input: unknown };
function snapshot(run: AgentStoredRun): AgentUsageSnapshot {
  return { organizationId: scope.organizationId, runId: run.id, startedAt: run.startedAt,
    inputTokens: run.inputTokens, outputTokens: run.outputTokens, status: run.status };
}
function harness(options: {
  run?: AgentStoredRun;
  kind?: AgentRunResult["kind"];
  overrides?: Partial<AgentStore>;
  record?: AgentMonthlyUsageRecorder["record"];
  onAccountingError?: () => void;
} = {}) {
  let run = options.run ?? initialRun;
  const calls: Call[] = [];
  const accounting: AgentUsageSnapshot[] = [];
  const order: string[] = [];
  const saved: AgentRunResult = { kind: options.kind ?? "created", thread, run,
    userMessage: user, assistantMessage: assistant };
  const threads = [thread];
  function called(method: keyof AgentStore, value: unknown) {
    calls.push({ method, input: value });
    order.push(`store:${method}`);
  }
  // A complete fake AgentStore: no database, provider, Redis client, or environment exists.
  const raw: AgentStore = {
    async beginRun(value) { called("beginRun", value); return saved; },
    async updateRun(value) { called("updateRun", value); return run; },
    async finishRun(value) { called("finishRun", value); return run; },
    async cancelRun(value) { called("cancelRun", value); return run; },
    async getRun(value) { called("getRun", value); return run; },
    async getThread(value) { called("getThread", value); return thread; },
    async listThreads(value) { called("listThreads", value); return threads; },
    ...options.overrides,
  };
  const usage: AgentMonthlyUsageRecorder = { async record(value) {
    order.push("accounting");
    accounting.push(value);
    await options.record?.(value);
  } };
  const store = createAgentUsageStore(raw, usage, { onAccountingError: options.onAccountingError });
  return { store, raw, saved, threads, calls, accounting, order, setRun(value: AgentStoredRun) { run = value; } };
}

test("created runs, persisted checkpoints and completion record cumulative saved snapshots after persistence", async () => {
  const f = harness();
  assert.equal(await f.store.beginRun(input), f.saved);
  const checkpoint: AgentStoredRun = { ...initialRun, inputTokens: 11, outputTokens: 4, updatedAt: later };
  f.setRun(checkpoint);
  assert.equal(await f.store.updateRun({ ...scope, runId, inputTokens: 10, outputTokens: 3, text: "Private output" }), checkpoint);
  const complete: AgentStoredRun = { ...checkpoint, status: "complete", inputTokens: 23,
    outputTokens: 8, completedAt: later };
  f.setRun(complete);
  assert.equal(await f.store.finishRun({ ...scope, runId, status: "complete", inputTokens: 22, outputTokens: 7 }), complete);
  assert.deepEqual(f.accounting, [snapshot(initialRun), snapshot(checkpoint), snapshot(complete)]);
  assert.deepEqual(f.order, ["store:beginRun", "accounting", "store:updateRun", "accounting", "store:finishRun", "accounting"]);
  assert.ok(f.accounting.every((value) => value.startedAt === now));
});

test("accounting waits for the underlying successful store result", async () => {
  let resolveRun!: (value: AgentStoredRun) => void;
  const pendingRun = new Promise<AgentStoredRun>((resolve) => { resolveRun = resolve; });
  const f = harness({ overrides: { updateRun: async () => pendingRun } });
  const result = f.store.updateRun({ ...scope, runId, inputTokens: 400, outputTokens: 200 });
  await Promise.resolve();
  assert.equal(f.accounting.length, 0);
  const persisted = { ...initialRun, inputTokens: 17, outputTokens: 6 };
  resolveRun(persisted);
  assert.equal(await result, persisted);
  assert.deepEqual(f.accounting, [snapshot(persisted)]);
});

test("an existing terminal admission repairs accounting using the returned saved run", async () => {
  const existingId = "55555555-5555-4555-8555-555555555555";
  const persisted: AgentStoredRun = { ...initialRun, id: existingId, status: "complete", inputTokens: 31,
    outputTokens: 12, completedAt: later };
  const f = harness({ kind: "existing", run: persisted });
  const result = await f.store.beginRun(input);
  assert.equal(result, f.saved);
  assert.equal(result.kind, "existing");
  assert.deepEqual(f.accounting, [snapshot(persisted)]);
  assert.equal(f.calls[0].input, input);
});

for (const status of ["complete", "failed", "cancelled"] as const) {
  test(`a persisted ${status} finish records the returned status and counters`, async () => {
    const persisted: AgentStoredRun = { ...initialRun, status, inputTokens: 13, outputTokens: 5, completedAt: later };
    const f = harness({ run: persisted });
    const submitted = { ...scope, runId, status, inputTokens: 100, outputTokens: 80,
      text: "Private provider answer", error: "Private provider error" };
    assert.equal(await f.store.finishRun(submitted), persisted);
    assert.equal(f.calls[0].input, submitted);
    assert.deepEqual(f.accounting, [snapshot(persisted)]);
  });
}

test("explicit cancellation and late callbacks account the authoritative terminal snapshot without resurrection", async () => {
  const cancelled: AgentStoredRun = { ...initialRun, status: "cancelled", inputTokens: 19,
    outputTokens: 7, completedAt: later };
  const f = harness({ run: cancelled });
  const cancellation = { ...scope, runId };
  assert.equal(await f.store.cancelRun(cancellation), cancelled);
  assert.equal(f.calls[0].input, cancellation);
  assert.equal(await f.store.updateRun({ ...scope, runId, inputTokens: 9_000, outputTokens: 8_000 }), cancelled);
  assert.equal(await f.store.finishRun({ ...scope, runId, status: "complete", inputTokens: 9_000, outputTokens: 8_000 }), cancelled);
  assert.equal(await f.store.cancelRun(cancellation), cancelled);
  assert.deepEqual(f.accounting, Array.from({ length: 4 }, () => snapshot(cancelled)));
});

test("an owned run read repairs accounting and returns the exact stored row", async () => {
  const persisted: AgentStoredRun = { ...initialRun, status: "failed", inputTokens: 41,
    outputTokens: 9, completedAt: later };
  const f = harness({ run: persisted });
  const query = { ...scope, runId };
  assert.equal(await f.store.getRun(query), persisted);
  assert.equal(f.calls[0].input, query);
  assert.deepEqual(f.accounting, [snapshot(persisted)]);
});

test("foreign or missing run reads stay null and never broaden store ownership or write accounting", async () => {
  const calls: unknown[] = [];
  const f = harness({ overrides: { getRun: async (value) => { calls.push(value); return null; } } });
  const foreign = { organizationId: "different-org", userId: "different-user", runId };
  const missing = { ...scope, runId: "66666666-6666-4666-8666-666666666666" };
  assert.equal(await f.store.getRun(foreign), null);
  assert.equal(await f.store.getRun(missing), null);
  assert.deepEqual(calls, [foreign, missing]);
  assert.equal(calls[0], foreign);
  assert.equal(calls[1], missing);
  assert.equal(f.accounting.length, 0);
  assert.equal(f.calls.length, 0);
});

test("accounting contains only trusted organization and returned usage fields, not prompts, users or increments", async () => {
  const persisted = { ...initialRun, organizationId: "untrusted-row-org", inputTokens: 29, outputTokens: 11 };
  const f = harness({ run: persisted });
  await f.store.beginRun(input);
  assert.deepEqual(f.accounting, [snapshot(persisted)]);
  assert.deepEqual(Object.keys(f.accounting[0]).sort(), ["inputTokens", "organizationId", "outputTokens", "runId", "startedAt", "status"].sort());
  assert.doesNotMatch(JSON.stringify(f.accounting), /untrusted-row-org|private-user|Private investigation prompt|userId|increment|threadId|assistantMessageId/);
});

test("Redis accounting outages fail open for every successful persistence and read operation", async () => {
  let errors = 0;
  const f = harness({ record: async () => { throw new Error("Redis credentials and private connection details"); },
    onAccountingError: () => { errors++; } });
  assert.equal(await f.store.beginRun(input), f.saved);
  assert.equal(await f.store.updateRun({ ...scope, runId }), initialRun);
  assert.equal(await f.store.finishRun({ ...scope, runId, status: "complete" }), initialRun);
  assert.equal(await f.store.cancelRun({ ...scope, runId }), initialRun);
  assert.equal(await f.store.getRun({ ...scope, runId }), initialRun);
  assert.equal(f.accounting.length, 5);
  assert.equal(errors, 5);
});

test("accounting outages need no error callback and callback failures cannot fail a saved run", async () => {
  const record = async () => { throw new Error("Redis unavailable"); };
  const withoutCallback = harness({ record });
  assert.equal(await withoutCallback.store.beginRun(input), withoutCallback.saved);
  const brokenCallback = harness({ record, onAccountingError: () => { throw new Error("Logger unavailable"); } });
  assert.equal(await brokenCallback.store.finishRun({ ...scope, runId, status: "complete" }), initialRun);
  assert.equal(brokenCallback.accounting.length, 1);
});

test("underlying store failures propagate unchanged with no accounting writes or accounting error callback", async () => {
  const failure = new Error("Postgres transaction failed");
  let accountingErrors = 0;
  const fail = async () => { throw failure; };
  const f = harness({ overrides: { beginRun: fail, updateRun: fail, finishRun: fail, cancelRun: fail, getRun: fail },
    onAccountingError: () => { accountingErrors++; } });
  for (const operation of [
    () => f.store.beginRun(input),
    () => f.store.updateRun({ ...scope, runId }),
    () => f.store.finishRun({ ...scope, runId, status: "complete" }),
    () => f.store.cancelRun({ ...scope, runId }),
    () => f.store.getRun({ ...scope, runId }),
  ]) await assert.rejects(operation(), (error) => error === failure);
  assert.equal(f.accounting.length, 0);
  assert.equal(accountingErrors, 0);
});

test("thread listing and thread retrieval remain unchanged and never record run usage", async () => {
  const f = harness();
  const query = { ...scope, threadId };
  assert.equal(f.store.listThreads, f.raw.listThreads);
  assert.equal(f.store.getThread, f.raw.getThread);
  assert.equal(await f.store.listThreads(scope), f.threads);
  assert.equal(await f.store.getThread(query), thread);
  assert.deepEqual(f.calls, [{ method: "listThreads", input: scope }, { method: "getThread", input: query }]);
  assert.equal(f.accounting.length, 0);
});
