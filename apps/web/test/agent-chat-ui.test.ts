import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { AgentComposer, AgentConversation, AgentHistory, AgentMessageView, AgentWelcome } from "../src/components/agent/agent-chat-panel";
import { agentChatReducer, createAgentRequestContext, createAgentThread, initialAgentChatState, type AgentChatAction, type AgentMessage, type AgentChatState } from "../src/components/agent/agent-chat-data";
import { requestExplanationDemoScenarios } from "../src/components/observability/request-explanation-data";
import * as transport from "../src/components/agent/agent-chat-transport";
import * as data from "../src/components/agent/agent-chat-data";

Object.assign(globalThis, { React });
type Element = React.ReactElement<any>;
function elements(node: React.ReactNode): Element[] { if (Array.isArray(node)) return node.flatMap(elements); if (!React.isValidElement(node)) return []; const element = node as Element; return [element, ...elements(element.props.children)]; }
function find(tree: React.ReactNode, label: string): Element { const item = elements(tree).filter((element) => element.props["aria-label"] === label).at(-1); assert.ok(item, label); return item; }
const html = (component: React.ElementType, props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(component, props));
const answer: AgentMessage = { id: "reply", role: "assistant", text: "Observed HTTP 503.\n<script>alert(1)</script> [link](https://evil.example)", status: "complete", steps: [{ id: "read", label: "Read requests", status: "complete" }], evidence: [
  { id: "request:abc:def", label: "Source request", href: "/acme/observability/requests?search=id&range=30d", observedAt: "2026-10-08" },
  { id: "evil", label: "External", href: "https://evil.example", observedAt: "2026-10-08" },
] };

test("live answers use escaped plain text and server evidence only, with collapsed real steps", () => {
  const output = html(AgentMessageView, { message: answer, orgSlug: "acme" });
  assert.match(output, /&lt;script&gt;/);
  assert.doesNotMatch(output, /<script|href="https:|Scripted|Prototype/);
  assert.match(output, /href="\/acme\/observability\/requests/);
  assert.match(output, /1 investigation step/);
  assert.match(output, /aria-label="Copy response"/);
  assert.doesNotMatch(output, /<details[^>]*\bopen=/);
});
test("live partial text and dynamic progress are visible while pending without copying or follow-ups", () => {
  const pending = { ...answer, status: "running", localStreaming: true, steps: [{ id: "logs", label: "Read correlated logs", status: "running" }] };
  const output = html(AgentMessageView, { message: pending, orgSlug: "acme" });
  assert.match(output, /aria-busy="true"/);
  assert.match(output, /Observed HTTP 503/);
  assert.match(output, /Read correlated logs/);
  assert.doesNotMatch(output, /Copy response|<details/);
  assert.match(html(AgentMessageView, { message: { ...answer, status: "failed", error: "Apply database migration" }, orgSlug: "acme" }), /role="alert".*Apply database migration/);
});
test("restored unfinished responses stay truthful without fake local progress or inert Stop", () => {
  const output = html(AgentMessageView, { message: { ...answer, status: "running" }, orgSlug: "acme" });
  assert.match(output, /has not finished yet/);
  assert.match(output, /aria-busy="false"/);
  assert.doesNotMatch(output, /animate-pulse/);
});
test("welcome, saved history and contextual provenance no longer call live chat a prototype", () => {
  const context = createAgentRequestContext("acme", requestExplanationDemoScenarios[0].request);
  const thread = { ...createAgentThread({ id: "thread", at: 1, context }), messages: [{ id: "user", role: "user", text: "Explain this request.", status: "complete", steps: [], evidence: [] } as AgentMessage, answer] };
  const output = html(AgentConversation, { thread, orgSlug: "acme", onFollowUp() {} });
  assert.match(output, /Attached from this workspace/);
  assert.match(output, /Suggested follow-ups/);
  assert.ok(output.indexOf("Your message") < output.indexOf("Agent response"));
  assert.match(html(AgentWelcome, { onSuggestion() {} }), /Ask agent.*new chat/);
  assert.match(html(AgentHistory, { threads: [thread], activeId: thread.id, onSelect() {}, onNew() {}, onBack() {} }), /saved to your account/);
  assert.doesNotMatch(output, /scripted|prototype/i);
});
test("composer allows editing, blocks pending duplicate sends and provides a real Stop button", () => {
  let sends = 0, stops = 0, changes = "";
  const tree = AgentComposer({ value: "next question", onSend: () => sends++, onStop: () => stops++, onChange: (value) => changes = value, preparing: true });
  const textarea = find(tree, "Message Agent");
  textarea.props.onChange({ target: { value: "still editable" } });
  textarea.props.onKeyDown({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: false }, preventDefault() {} });
  elements(tree).find((element) => element.type === "form")!.props.onSubmit({ preventDefault() {} });
  find(tree, "Stop response").props.onClick();
  assert.equal(changes, "still editable");
  assert.equal(sends, 0);
  assert.equal(stops, 1);
  assert.equal(textarea.props.disabled, undefined);
  assert.match(html(AgentComposer, { value: "", onSend() {}, onChange() {} }), /AI can make mistakes/);
});
test("Enter sends once while Shift+Enter and composition do not send", () => {
  let sends = 0;
  const tree = AgentComposer({ value: "hello", onSend: () => sends++, onChange() {} });
  const textarea = find(tree, "Message Agent");
  for (const [shiftKey, isComposing] of [[true, false], [false, true], [false, false]]) textarea.props.onKeyDown({ key: "Enter", shiftKey, nativeEvent: { isComposing }, preventDefault() {} });
  assert.equal(sends, 1);
});

/** Real provider/reducer/transport with deterministic React scheduling and mocked network. */
async function providerHarness(fetcher: typeof fetch) {
  const source = await readFile(new URL("../src/components/agent/agent-chat-provider.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const hooks: Array<{ value: any; dependencies?: unknown[]; cleanup?: () => void }> = [];
  const effects: Array<() => void> = [];
  let slot = 0, nextId = 0;
  let state: AgentChatState = initialAgentChatState;
  const dispatch = (event: AgentChatAction) => { state = agentChatReducer(state, event); };
  const memo = (factory: () => any, dependencies: unknown[]) => {
    const index = slot++, old = hooks[index];
    if (!old || dependencies.length !== old.dependencies?.length || dependencies.some((item, i) => !Object.is(item, old.dependencies?.[i]))) hooks[index] = { value: factory(), dependencies: [...dependencies] };
    return hooks[index].value;
  };
  const module = { exports: {} as typeof import("../src/components/agent/agent-chat-provider") };
  runInNewContext(compiled, { React, module, exports: module.exports, fetch: fetcher, AbortController, Date,
    require(specifier: string) {
      if (specifier === "./agent-chat-data") return data;
      if (specifier === "./agent-chat-transport") return transport;
      if (specifier === "./agent-chat-context") return { AgentActionsContext: { Provider: (props: any) => props.children }, AgentStateContext: { Provider: (props: any) => props.children }, newAgentId: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}` };
      if (specifier === "react") return { useReducer: () => [state, dispatch], useId: () => "agent-panel", useMemo: memo, useCallback: (fn: () => void, dependencies: unknown[]) => memo(() => fn, dependencies), useRef: (initial: unknown) => { const index = slot++; return (hooks[index] ??= { value: { current: initial } }).value; },
        useEffect: (callback: () => void | (() => void), dependencies: unknown[]) => {
          const index = slot++, old = hooks[index];
          if (!old || dependencies.length !== old.dependencies?.length || dependencies.some((item, i) => !Object.is(item, old.dependencies?.[i]))) {
            const record = { value: undefined, dependencies: [...dependencies], cleanup: old?.cleanup };
            hooks[index] = record;
            effects.push(() => { record.cleanup?.(); record.cleanup = callback() || undefined; });
          }
        } };
      throw new Error(`Unexpected import ${specifier}`);
    },
  });
  return { dispatch, get state() { return state; }, dispose() { hooks.forEach((hook) => hook.cleanup?.()); }, render() {
    slot = 0;
    const tree = module.exports.AgentChatProvider({ orgSlug: "acme", children: null });
    const providers = elements(tree).filter((element) => element.props.value);
    effects.splice(0).forEach((effect) => effect());
    return { actions: providers[0].props.value as ReturnType<typeof import("../src/components/agent/agent-chat-context").useAgentChat>, chat: providers[1].props.value as ReturnType<typeof import("../src/components/agent/agent-chat-context").useAgentChatState> };
  } };
}
const settle = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
function controlledResponse(signal?: AbortSignal | null) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true }); } });
  return { response: new Response(stream, { headers: { "content-type": "text/event-stream" } }), emit(event: unknown) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)); }, close() { controller.close(); } };
}

test("provider starts contextual live request using IDs only, guards duplicates, and survives overlay/history changes", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let stream!: ReturnType<typeof controlledResponse>;
  const harness = await providerHarness((async (input, init) => { calls.push({ url: String(input), init }); if (String(input).endsWith("/threads")) return Response.json({ threads: [], configured: true, model: "grok-test" }); stream = controlledResponse(init?.signal); return stream.response; }) as typeof fetch);
  const context = createAgentRequestContext("acme", requestExplanationDemoScenarios[0].request);
  harness.render().actions.startThread(context);
  harness.render().chat.sendMessage("duplicate");
  await settle();
  const posts = calls.filter((call) => call.init?.method === "POST");
  assert.equal(posts.length, 1);
  const body = JSON.parse(posts[0].init!.body as string);
  assert.deepEqual(Object.keys(body).sort(), ["assistantId", "clientMessageId", "message", "sourceRequestId", "threadId"]);
  assert.equal(body.message, "Explain this request.");
  assert.equal(body.sourceRequestId, context.request.id);
  assert.doesNotMatch(posts[0].init!.body as string, /preview|service|environment|sourceHref|statusCode/);
  harness.dispatch({ type: "history", open: true });
  harness.dispatch({ type: "close" });
  harness.render();
  assert.equal(posts[0].init!.signal!.aborted, false);
  stream.emit({ type: "text", delta: "Live answer" });
  stream.emit({ type: "finish", status: "complete" });
  stream.close();
  await settle();
  assert.equal(harness.state.threads[0].messages[1].text, "Live answer");
  assert.equal(harness.state.threads[0].messages[1].status, "complete");
  assert.equal(harness.state.panelOpen, false);
  assert.equal(calls.filter((call) => call.url.endsWith("/threads")).length, 1);
  harness.dispose();
});
test("provider restores unavailable-provider drafts and does not generate fallback replies", async () => {
  const harness = await providerHarness((async (input) => String(input).endsWith("/threads") ? Response.json({ threads: [], configured: false, model: null }) : Response.json({ error: "Add XAI_API_KEY on server to enable Agent." }, { status: 503 })) as typeof fetch);
  harness.render().actions.startThread();
  harness.dispatch({ type: "draft", id: harness.state.activeThreadId!, value: " investigate " });
  harness.render().chat.sendMessage();
  await settle();
  assert.equal(harness.state.threads[0].draft, " investigate ");
  assert.equal(harness.state.threads[0].messages[1].text, "");
  assert.equal(harness.state.threads[0].messages[1].status, "failed");
  assert.match(harness.state.threads[0].messages[1].error!, /XAI_API_KEY/);
  harness.dispose();
});
test("Stop and provider disposal abort actual streams, not overlay close", async () => {
  const signals: AbortSignal[] = [];
  const harness = await providerHarness((async (input, init) => { if (String(input).endsWith("/threads")) return Response.json({ threads: [], configured: true, model: "grok-test" }); signals.push(init!.signal!); return controlledResponse(init?.signal).response; }) as typeof fetch);
  const context = createAgentRequestContext("acme", requestExplanationDemoScenarios[0].request);
  harness.render().actions.startThread(context);
  await settle();
  const id = harness.state.activeThreadId!;
  harness.render().chat.stopResponse(id);
  await settle();
  assert.equal(signals[0].aborted, true);
  assert.equal(harness.state.threads[0].messages[1].status, "cancelled");
  harness.render().actions.startThread(context);
  await settle();
  harness.dispose();
  assert.equal(signals[1].aborted, true);
});
test("generic suggestions double-click before rerender produce only one live POST", async () => {
  let posts = 0;
  const harness = await providerHarness((async (input, init) => { if (String(input).endsWith("/threads")) return Response.json({ threads: [], configured: true, model: "grok-test" }); posts++; return controlledResponse(init?.signal).response; }) as typeof fetch);
  const chat = harness.render().chat;
  chat.sendMessage("Hello");
  chat.sendMessage("Hello");
  await settle();
  assert.equal(posts, 1);
  assert.equal(harness.state.threads.length, 1);
  harness.dispose();
});

test("overlay keeps workspace capture protection and restores opener focus on close", async () => {
  const source = await readFile(new URL("../src/components/agent/agent-chat-panel.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  let focused = 0, fallbackFocused = 0, inside = false;
  const opener = { isConnected: true, focus() { focused++; } };
  const returnFocusRef: { current: typeof opener | null } = { current: opener };
  const events: AgentChatAction[] = [];
  const dialog = Object.fromEntries(["Root", "Portal", "Overlay", "Content", "Title"].map((name) => [name, (props: any) => props.children]));
  const module = { exports: {} as typeof import("../src/components/agent/agent-chat-panel") };
  runInNewContext(compiled, { React, module, exports: module.exports, document: { getElementById: () => ({ contains: () => inside }), querySelector: () => ({ focus() { fallbackFocused++; } }) },
    require(specifier: string) {
      if (specifier === "react") return React;
      if (specifier === "@radix-ui/react-dialog") return dialog;
      if (specifier === "@tanstack/react-router") return { Link: () => null };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "./agent-chat-data") return data;
      if (specifier === "./agent-chat-context") return { useAgentChatState: () => ({ state: { ...initialAgentChatState, panelOpen: true }, dispatch: (event: AgentChatAction) => events.push(event), panelId: "agent-panel", returnFocusRef }) };
      if (specifier === "./agent-chat-panel.module.css") return { panel: "agent-panel", overlay: "agent-overlay" };
      if (specifier.endsWith(".css")) return {};
      return new Proxy({}, { get: () => () => null });
    },
  });
  const tree = module.exports.default();
  const content = elements(tree).find((element) => element.type === dialog.Content)!;
  const overlay = elements(tree).find((element) => element.type === dialog.Overlay)!;
  assert.match(content.props.className, /ph-no-capture.*fixed inset-y-0 right-0.*h-dvh w-full max-w-\[720px\]/);
  assert.match(overlay.props.className, /fixed inset-0/);
  let prevented = false;
  content.props.onCloseAutoFocus({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(focused, 1);
  inside = true;
  content.props.onCloseAutoFocus({ preventDefault() {} });
  assert.equal(fallbackFocused, 1);
  tree.props.onOpenChange(false);
  assert.equal(JSON.stringify(events), JSON.stringify([{ type: "close" }]));
});

test("provider disposal aborts a pending history request and never mutates an unmounted workspace", async () => {
  let signal!: AbortSignal;
  const harness = await providerHarness((async (_input, init) => {
    signal = init!.signal!;
    return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  }) as typeof fetch);
  harness.render().actions.openAgent();
  harness.render();
  assert.equal(harness.state.historyStatus, "loading");
  harness.dispose();
  await settle();
  assert.equal(signal.aborted, true);
  assert.equal(harness.state.historyStatus, "loading");
  assert.equal(harness.state.historyError, null);
});
