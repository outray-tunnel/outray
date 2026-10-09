import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_MAX_PROMPT_LENGTH, agentChatReducer, createAgentRequestContext, createAgentThread, initialAgentChatState, isAgentThreadPreparing, safeAgentEvidenceHref, type AgentChatState } from "../src/components/agent/agent-chat-data";
import { requestExplanationDemoScenarios } from "../src/components/observability/request-explanation-data";
import type { AgentSavedThread, AgentStreamEvent } from "../src/lib/agent/protocol";

const context = createAgentRequestContext("acme", requestExplanationDemoScenarios[0].request);
const create = (state = initialAgentChatState, id = "first", at = 1) => agentChatReducer(state, { type: "create", thread: createAgentThread({ id, at }) });
const send = (state: AgentChatState, id = "first") => agentChatReducer(state, { type: "send", id, text: "Investigate this", at: 2, messageId: `${id}-user`, assistantId: `${id}-assistant` });
const stream = (state: AgentChatState, event: AgentStreamEvent, id = "first") => agentChatReducer(state, { type: "stream", id, messageId: `${id}-assistant`, event, at: 3 });
const saved = (id = "saved"): AgentSavedThread => ({ id, title: "Saved chat", createdAt: 1, updatedAt: 10, sourceRequestId: null, messages: [{ id: "saved-user", role: "user", text: "hello", status: "complete", steps: [], evidence: [] }] });

test("generic and contextual new threads are blank until sent, with distinct identities", () => {
  const first = createAgentThread({ id: "first", at: 1, context });
  const second = createAgentThread({ id: "second", at: 2, context });
  assert.deepEqual(first.messages, []);
  assert.equal(first.sourceRequestId, context.request.id);
  assert.equal(first.title, `Explain ${context.label}`.slice(0, 72));
  assert.notEqual(first.context, context);
  let state = agentChatReducer(initialAgentChatState, { type: "create", thread: first });
  state = agentChatReducer(state, { type: "create", thread: second });
  assert.equal(state.activeThreadId, "second");
  assert.deepEqual(state.threads.map((thread) => thread.id), ["second", "first"]);
  assert.deepEqual(createAgentThread({ id: "generic", at: 1 }).messages, []);
});

test("drafts, overlay and history navigation stay independent per thread", () => {
  let state = create();
  state = agentChatReducer(state, { type: "draft", id: "first", value: "  draft\n" });
  state = create(state, "second", 2);
  state = agentChatReducer(state, { type: "history", open: true });
  state = agentChatReducer(state, { type: "close" });
  state = agentChatReducer(state, { type: "select", id: "first" });
  assert.equal(state.panelOpen, true);
  assert.equal(state.historyOpen, false);
  assert.equal(state.threads.find((thread) => thread.id === "first")?.draft, "  draft\n");
});

test("send adds only an empty running assistant; progress and text arrive from the server", () => {
  let state = agentChatReducer(create(), { type: "draft", id: "first", value: "Investigate this" });
  state = send(state);
  assert.equal(state.threads[0].title, "Investigate this");
  assert.equal(state.threads[0].draft, "");
  assert.equal(state.threads[0].messages[1].text, "");
  assert.equal(isAgentThreadPreparing(state.threads[0]), true);
  state = stream(state, { type: "step", step: { id: "query", label: "Read requests", status: "running" } });
  state = stream(state, { type: "text", delta: "Confirmed: " });
  state = stream(state, { type: "text", delta: "HTTP 503\n" });
  state = stream(state, { type: "step", step: { id: "query", label: "Read requests", status: "complete" } });
  state = stream(state, { type: "finish", status: "complete" });
  assert.equal(state.threads[0].messages[1].text, "Confirmed: HTTP 503\n");
  assert.deepEqual(state.threads[0].messages[1].steps, [{ id: "query", label: "Read requests", status: "complete" }]);
  assert.equal(isAgentThreadPreparing(state.threads[0]), false);
  assert.equal(stream(state, { type: "text", delta: "stale" }), state);
});

test("active runs reject duplicate sends without blocking other threads or editable drafts", () => {
  let state = send(create());
  assert.equal(send(state), state);
  state = agentChatReducer(state, { type: "draft", id: "first", value: "my next question" });
  state = create(state, "second");
  state = send(state, "second");
  state = agentChatReducer(state, { type: "close" });
  state = stream(state, { type: "text", delta: "Hidden stream is still alive" });
  assert.equal(state.threads.find((thread) => thread.id === "first")?.draft, "my next question");
  assert.equal(state.threads.find((thread) => thread.id === "first")?.messages[1].text, "Hidden stream is still alive");
  assert.equal(isAgentThreadPreparing(state.threads.find((thread) => thread.id === "second")), true);
});

test("errors restore the submitted draft without overwriting new typing; stopped runs ignore stale chunks", () => {
  let state = send(create());
  state = agentChatReducer(state, { type: "failed", id: "first", messageId: "first-assistant", error: "Provider unavailable", retryDraft: " Investigate this " });
  assert.equal(state.threads[0].draft, " Investigate this ");
  assert.equal(state.threads[0].messages[1].status, "failed");
  let newer = agentChatReducer(send(create()), { type: "draft", id: "first", value: "new typing" });
  newer = agentChatReducer(newer, { type: "failed", id: "first", messageId: "first-assistant", error: "Failure", retryDraft: "old" });
  assert.equal(newer.threads[0].draft, "new typing");
  const stopped = agentChatReducer(send(create()), { type: "failed", id: "first", messageId: "first-assistant", error: "Response stopped.", cancelled: true });
  assert.equal(stopped.threads[0].messages[1].status, "cancelled");
  assert.equal(stream(stopped, { type: "text", delta: "stale" }), stopped);
});

test("saved history restores messages, preserves local drafts and active streams during racing load", () => {
  let state = send(create());
  state = agentChatReducer(state, { type: "draft", id: "first", value: "next question" });
  state = agentChatReducer(state, { type: "load", response: { configured: true, model: "grok-test", threads: [saved("first"), saved()] } });
  assert.equal(state.activeThreadId, "first");
  assert.equal(state.threads.find((thread) => thread.id === "first")?.draft, "next question");
  assert.equal(state.threads.find((thread) => thread.id === "first")?.messages[1].status, "running");
  assert.equal(state.threads.find((thread) => thread.id === "saved")?.messages[0].text, "hello");
  assert.equal(state.configured, true);
  assert.equal(state.model, "grok-test");
  const refresh = agentChatReducer(initialAgentChatState, { type: "load", response: { configured: false, model: null, threads: [saved()] } });
  assert.equal(refresh.activeThreadId, "saved");
  assert.equal(refresh.threads[0].draft, "");
});

test("unavailable history errors do not discard drafts or invent a reply", () => {
  let state = agentChatReducer(create(), { type: "draft", id: "first", value: "keep me" });
  state = agentChatReducer(state, { type: "load-start" });
  state = agentChatReducer(state, { type: "load-failed", error: "Apply the Agent database migration" });
  assert.equal(state.historyStatus, "failed");
  assert.match(state.historyError!, /migration/);
  assert.equal(state.threads[0].draft, "keep me");
  assert.deepEqual(state.threads[0].messages, []);
});

test("refreshing a restored running response can resolve it while retaining an unsent draft", () => {
  const unfinished = { ...saved(), messages: [{ id: "remote-reply", role: "assistant" as const, text: "partial", status: "running" as const, steps: [], evidence: [] }] };
  let state = agentChatReducer(initialAgentChatState, { type: "load", response: { threads: [unfinished], configured: true, model: "grok-test" } });
  assert.equal(isAgentThreadPreparing(state.threads[0]), false, "There is no browser-owned stream after reload");
  state = agentChatReducer(state, { type: "draft", id: "saved", value: "my next question" });
  const completed = { ...unfinished, updatedAt: 20, messages: unfinished.messages.map((message) => ({ ...message, status: "failed" as const, error: "Investigation interrupted" })) };
  state = agentChatReducer(state, { type: "load", response: { threads: [completed], configured: true, model: "grok-test" } });
  assert.equal(state.threads[0].draft, "my next question");
  assert.equal(state.threads[0].messages[0].status, "failed");
});

test("only known workspace observability paths can become evidence links", () => {
  assert.equal(safeAgentEvidenceHref("/acme/observability/requests?search=42&range=24h", "acme"), "/acme/observability/requests?search=42&range=24h");
  for (const link of ["https://evil.example", "//evil.example", "/other/observability/requests", "/acme/settings", "/acme/observability/requests/extra", "/acme/observability/../settings", "/\\evil.example", "javascript:alert(1)", "/acme/observability/requests\n"]) assert.equal(safeAgentEvidenceHref(link, "acme"), null, link);
});

test("the canonical tunnel namespace does not widen the Agent evidence allowlist or workspace scope", () => {
  for (const page of ["", "/tunnels", "/tunnels/tunnel-1", "/requests", "/subdomains", "/domains"]) {
    assert.equal(safeAgentEvidenceHref(`/acme/tunnel${page}`, "acme"), null);
    assert.equal(safeAgentEvidenceHref(`/other/tunnel${page}`, "acme"), null);
  }
  for (const kind of ["requests", "logs", "traces"]) {
    const href = `/acme/observability/${kind}?range=24h&search=source`;
    assert.equal(safeAgentEvidenceHref(href, "acme"), href);
    assert.equal(safeAgentEvidenceHref(href, "other"), null);
  }
});

test("context uses a safe local metadata snapshot, not private request payloads", () => {
  const request = { ...requestExplanationDemoScenarios[0].request, path: "https://name:secret@private.example/path?token=secret#secret", traceId: "private-trace", spanId: "private-span", region: "private-region" };
  const snapshot = createAgentRequestContext("acme", request);
  assert.equal(snapshot.request.path, "/path");
  assert.doesNotMatch(JSON.stringify(snapshot), /name:|private\.example|token=|private-trace|private-span|private-region/);
  assert.equal(new URL(snapshot.sourceHref, "https://outray.co").pathname, "/acme/observability/requests");
});

test("draft length and controls are bounded, malformed identities cannot create threads", () => {
  const state = agentChatReducer(create(), { type: "draft", id: "first", value: "\u0000" + "x".repeat(AGENT_MAX_PROMPT_LENGTH + 20) });
  assert.equal(state.threads[0].draft.length, AGENT_MAX_PROMPT_LENGTH);
  assert.throws(() => createAgentThread({ id: "bad/id", at: 1 }));
  assert.throws(() => createAgentThread({ id: "valid", at: Infinity }));
  assert.equal(agentChatReducer(state, { type: "select", id: "missing" }), state);
});
