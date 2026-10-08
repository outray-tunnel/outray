import assert from "node:assert/strict";
import test from "node:test";
import { readAgentConfig } from "../src/lib/agent/config";
import { createAgentHandlers } from "../src/lib/agent/handlers";
import type { AgentEvidenceReference, AgentSavedMessage, AgentSavedThread, AgentStreamEvent } from "../src/lib/agent/protocol";
import type { AgentInvestigationOptions } from "../src/lib/agent/runtime";
import { AgentStoreError, type AgentRunResult, type AgentRunUpdate, type AgentScope, type AgentStore, type BeginAgentRun, type FinishAgentRun } from "../src/lib/agent/store";

const scope = { organizationId: "trusted-org", userId: "trusted-user" };
const threadId = "11111111-1111-4111-8111-111111111111";
const clientMessageId = "22222222-2222-4222-8222-222222222222";
const assistantId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const sourceRequestId = `${"a".repeat(32)}:${"b".repeat(16)}`;
const prompt = { threadId, clientMessageId, assistantId, message: "Explain this request.", sourceRequestId };
const configuration = readAgentConfig({ XAI_API_KEY: "synthetic-server-only-key" });
const user: AgentSavedMessage = { id: clientMessageId, role: "user", text: prompt.message, status: "complete", steps: [], evidence: [] };
const assistant: AgentSavedMessage = { ...user, id: assistantId, role: "assistant", text: "", status: "running" };
const thread: AgentSavedThread = { id: threadId, title: prompt.message, sourceRequestId, createdAt: Date.now(), updatedAt: Date.now(), messages: [user, assistant] };
const saved: AgentRunResult = { kind: "created", thread, userMessage: user, assistantMessage: assistant,
  run: { id: runId, threadId, clientMessageId, assistantMessageId: assistantId, status: "running", inputTokens: 0, outputTokens: 0,
    maxTokens: 24_000, maxSteps: 6, error: null, startedAt: new Date(), updatedAt: new Date(), completedAt: null } };
const evidence: AgentEvidenceReference = { id: `request:${sourceRequestId}`, label: "Request", href: "/team/observability/requests?range=30d", observedAt: "2026-10-08T10:00:00Z" };
type Overrides = Partial<Parameters<typeof createAgentHandlers>[0]>;
function harness(overrides: Overrides = {}) {
  const admissions: BeginAgentRun[] = [];
  const checkpoints: AgentRunUpdate[] = [];
  const completions: FinishAgentRun[] = [];
  const scopes: AgentScope[] = [];
  const readers: Parameters<NonNullable<Overrides["evidenceReader"]>>[0][] = [];
  const investigations: AgentInvestigationOptions[] = [];
  const store = {
    async listThreads(value: AgentScope) { scopes.push(value); return [thread]; },
    async beginRun(value: BeginAgentRun) { admissions.push(value); return saved; },
    async updateRun(value: AgentRunUpdate) { checkpoints.push(value); return saved.run; },
    async finishRun(value: FinishAgentRun) { completions.push(value); return { ...saved.run, status: value.status }; },
  } as unknown as AgentStore;
  const handlers = createAgentHandlers({
    authorize: async () => scope, store, config: () => configuration,
    evidenceReader: ((options) => { readers.push(options); return {}; }) as NonNullable<Overrides["evidenceReader"]>,
    investigate: async (options) => {
      investigations.push(options);
      await options.emit({ type: "step", step: { id: "step-1", label: "Read request", status: "running" } });
      await options.emit({ type: "step", step: { id: "step-1", label: "Read request", status: "complete" } });
      await options.emit({ type: "evidence", evidence: [evidence] });
      await options.emit({ type: "text", delta: "Observed a timeout." });
      return { text: "Observed a timeout.", inputTokens: 18, outputTokens: 7 };
    }, ...overrides,
  });
  return { handlers, store, admissions, checkpoints, completions, scopes, readers, investigations };
}
function request(value: unknown = prompt, signal?: AbortSignal) {
  return new Request("https://outray.co/api/team/agent/chat", { method: "POST", body: JSON.stringify(value),
    headers: { "content-type": "application/json", origin: "https://outray.co" }, signal });
}
async function events(response: Response): Promise<AgentStreamEvent[]> {
  return (await response.text()).split("\n\n").filter((value) => value.startsWith("data: "))
    .map((value) => JSON.parse(value.slice(6)) as AgentStreamEvent);
}

test("authenticated chat scopes all work server-side and streams ordered real progress", async () => {
  const f = harness();
  const response = await f.handlers.chat(request(), "team");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  const output = await events(response);
  assert.deepEqual(output.map((event) => event.type), ["run", "step", "step", "evidence", "text", "finish"]);
  assert.deepEqual(output.at(-1), { type: "finish", status: "complete" });
  assert.equal(f.admissions[0].organizationId, scope.organizationId);
  assert.equal(f.admissions[0].userId, scope.userId);
  assert.deepEqual(f.readers[0], { organizationId: scope.organizationId, orgSlug: "team", signal: f.readers[0].signal, requestId: sourceRequestId });
  assert.deepEqual(f.investigations[0].history, [user]);
  assert.equal(f.investigations[0].sourceRequestId, sourceRequestId);
  assert.equal(f.completions[0].inputTokens, 18);
  assert.equal(f.completions[0].outputTokens, 7);
  assert.equal(f.completions[0].text, "Observed a timeout.");
  assert.equal(f.completions[0].steps?.length, 1);
  assert.equal(f.completions[0].steps?.[0].status, "complete");
  assert.deepEqual(f.completions[0].evidence, [evidence]);
  assert.doesNotMatch(JSON.stringify(output), /synthetic-server-only-key/);
});

test("private thread history is scoped to the authenticated creator and contains no provider credentials", async () => {
  const f = harness();
  const response = await f.handlers.list(new Request("https://outray.co/api/team/agent/threads"), "team");
  const json = await response.json();
  assert.deepEqual(f.scopes, [scope]);
  assert.equal(json.configured, true);
  assert.equal(json.model, "grok-4.7");
  assert.equal(json.threads[0].id, threadId);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.doesNotMatch(JSON.stringify(json), /synthetic-server-only-key|apiKey/);
});

test("unauthenticated and foreign-workspace requests cannot read history or start runs", async () => {
  for (const status of [401, 403, 404]) {
    const f = harness({ authorize: async () => Response.json({ error: "Not available" }, { status }) });
    assert.equal((await f.handlers.chat(request(), "foreign-team")).status, status);
    assert.equal((await f.handlers.list(new Request("https://outray.co/api/foreign/agent/threads"), "foreign-team")).status, status);
    assert.equal(f.admissions.length + f.scopes.length + f.readers.length, 0);
  }
});

test("configuration and strict body failures never store a prompt or invoke a model", async () => {
  const f = harness({ config: () => readAgentConfig({}) });
  const response = await f.handlers.chat(request(), "team");
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /XAI_API_KEY/);
  assert.equal(f.admissions.length, 0);
  assert.equal(f.investigations.length, 0);
  const configured = harness();
  assert.equal((await configured.handlers.chat(request({ ...prompt, organizationId: "attacker" }), "team")).status, 400);
  const crossSite = new Request("https://outray.co/api/team/agent/chat", { method: "POST", body: JSON.stringify(prompt),
    headers: { "content-type": "application/json", origin: "https://evil.example" } });
  assert.equal((await configured.handlers.chat(crossSite, "team")).status, 403);
  assert.equal(configured.admissions.length, 0);
});

test("accidentally pasted common credentials are redacted before persistence", async () => {
  const f = harness();
  await events(await f.handlers.chat(request({ ...prompt, message: 'Check "password":"secret-password" at https://host.test/api?token=hidden' }), "team"));
  assert.doesNotMatch(f.admissions[0].text, /secret-password|hidden/);
  assert.match(f.admissions[0].text, /redacted/);
});

test("saved-source identity wins over untrusted subsequent context and pending assistant is excluded", async () => {
  const otherSource = `${"c".repeat(32)}:${"d".repeat(16)}`;
  const f = harness();
  await events(await f.handlers.chat(request({ ...prompt, sourceRequestId: otherSource }), "team"));
  // The real store rejects source changes. Even a stub returning the saved thread cannot rebind the reader.
  assert.equal(f.admissions[0].sourceRequestId, otherSource);
  assert.equal(f.readers[0].requestId, sourceRequestId);
  assert.equal(f.investigations[0].sourceRequestId, sourceRequestId);
  assert.equal(f.investigations[0].history.some((message) => message.id === assistantId), false);
});

test("idempotent terminal replay uses saved output without another investigation", async () => {
  const result: AgentRunResult = { ...saved, kind: "existing", run: { ...saved.run, status: "complete" },
    assistantMessage: { ...assistant, text: "Saved answer", status: "complete", steps: [{ id: "step-a", label: "Read trace", status: "complete" }], evidence: [evidence] } };
  const f = harness({ store: { beginRun: async () => result } as unknown as AgentStore });
  const output = await events(await f.handlers.chat(request(), "team"));
  assert.deepEqual(output.at(-1), { type: "finish", status: "complete" });
  assert.ok(output.some((event) => event.type === "text" && event.delta === "Saved answer"));
  assert.equal(f.investigations.length, 0);
  assert.equal(f.readers.length, 0);
});

test("duplicate in-flight requests and admission limits return actionable non-stream errors", async () => {
  const duplicate = harness({ store: { beginRun: async () => ({ ...saved, kind: "existing" }) } as unknown as AgentStore });
  assert.equal((await duplicate.handlers.chat(request(), "team")).status, 409);
  assert.equal(duplicate.investigations.length, 0);
  const limited = harness({ store: { beginRun: async () => { throw new AgentStoreError("Daily limit reached", "DAILY_RUN_LIMIT", 429); } } as unknown as AgentStore });
  const response = await limited.handlers.chat(request(), "team");
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, "Daily limit reached");
});

test("provider errors are sanitized and running steps fail with the saved partial answer", async () => {
  const f = harness({ investigate: async (options) => {
    await options.emit({ type: "step", step: { id: "step-a", label: "Read trace", status: "running" } });
    await options.emit({ type: "text", delta: "Partial answer" });
    options.onUsage?.({ inputTokens: 16, outputTokens: 4 });
    throw new Error("Authorization: secret-provider-key; prompt: private-payload");
  } });
  const output = await events(await f.handlers.chat(request(), "team"));
  assert.doesNotMatch(JSON.stringify(output), /secret-provider-key|private-payload/);
  assert.equal(f.completions[0].status, "failed");
  assert.equal(f.completions[0].text, "Partial answer");
  assert.equal(f.completions[0].steps?.[0].status, "failed");
  assert.equal(f.completions[0].inputTokens, 16);
  assert.equal(f.completions[0].outputTokens, 4);
  assert.equal(output.at(-1)?.type, "finish");
});

test("actual request cancellation aborts model work and saves a cancelled run", async () => {
  const controller = new AbortController();
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const f = harness({ investigate: async (options) => {
    entered();
    await new Promise<void>((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }));
    throw new Error("Unexpected continuation");
  } });
  const response = await f.handlers.chat(request(prompt, controller.signal), "team");
  const outputPromise = events(response);
  await ready; controller.abort();
  const output = await outputPromise;
  assert.equal(f.completions[0].status, "cancelled");
  assert.deepEqual(output.at(-1), { type: "finish", status: "cancelled", error: "Investigation stopped." });
});

test("hard deadline is a failed, timed-out investigation, not a user cancellation", async () => {
  const f = harness({ config: () => ({ ...configuration, timeoutMs: 10 }), investigate: async (options) => {
    await new Promise<void>((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("Timeout")), { once: true }));
    throw new Error("Unexpected continuation");
  } });
  const output = await events(await f.handlers.chat(request(), "team"));
  assert.equal(f.completions[0].status, "failed");
  assert.match(f.completions[0].error!, /timed out/);
  assert.equal(output.at(-1)?.type, "finish");
});

test("cancelling the SSE reader aborts work and persists a cancelled run without a browser", async () => {
  let completed!: () => void;
  const done = new Promise<void>((resolve) => { completed = resolve; });
  const f = harness({ investigate: async (options) => {
    await new Promise<void>((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("Disconnect")), { once: true }));
    throw new Error("Unexpected continuation");
  } });
  const finishRun = f.store.finishRun;
  f.store.finishRun = async (value) => { const result = await finishRun(value); completed(); return result; };
  const response = await f.handlers.chat(request(), "team");
  const reader = response.body!.getReader();
  assert.equal((await reader.read()).done, false);
  await reader.cancel();
  await done;
  assert.equal(f.completions[0].status, "cancelled");
});

test("failed checkpoints stop model work and never report successful saving", async () => {
  const f = harness();
  f.store.updateRun = async () => { throw new Error("SQL and password details"); };
  const output = await events(await f.handlers.chat(request(), "team"));
  assert.equal(f.completions[0].status, "failed");
  assert.match(f.completions[0].error!, /could not be saved/);
  assert.doesNotMatch(JSON.stringify(output), /SQL and password/);
  assert.equal(output.some((event) => event.type === "finish" && event.status === "complete"), false);
});

test("schema readiness and unexpected database errors never expose SQL or credentials", async () => {
  for (const [error, expected] of [
    [Object.assign(new Error("select agent_runs secret"), { cause: { code: "42P01" } }), /migration/],
    [Object.assign(new Error("column missing secret"), { cause: { code: "42703" } }), /migration/],
    [new Error("postgres://user:password@private-host"), /temporarily unavailable/],
  ] as const) {
    const f = harness({ store: { beginRun: async () => { throw error; }, listThreads: async () => { throw error; } } as unknown as AgentStore });
    for (const response of [await f.handlers.chat(request(), "team"), await f.handlers.list(new Request("https://outray.co/api/team/agent/threads"), "team")]) {
      assert.equal(response.status, 503);
      const json = await response.json();
      assert.match(json.error, expected);
      assert.doesNotMatch(json.error, /select agent_runs|postgres|private-host|password/);
    }
  }
});
