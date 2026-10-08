import { useCallback, useEffect, useId, useMemo, useReducer, useRef, type ReactNode } from "react";
import { agentChatReducer, createAgentThread, initialAgentChatState, isAgentThreadPreparing, type AgentRequestContext, type AgentThread } from "./agent-chat-data";
import { AgentActionsContext, AgentStateContext, newAgentId } from "./agent-chat-context";
import { agentResponseError, consumeAgentStream, readAgentThreadList } from "./agent-chat-transport";
import type { AgentChatRequest } from "../../lib/agent/protocol";

/** Workspace-scoped state and transport survive closing the lazy-loaded chat overlay. */
export function AgentChatProvider({ children, orgSlug }: { children: ReactNode; orgSlug: string }) {
  const [state, dispatch] = useReducer(agentChatReducer, initialAgentChatState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const panelId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const requests = useRef(new Map<string, { controller: AbortController; assistantId: string }>());
  const historyRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const endpoint = `/api/${encodeURIComponent(orgSlug)}/agent`;

  useEffect(() => {
    mounted.current = true;
    const activeRequests = requests.current;
    return () => {
      mounted.current = false;
      historyRequest.current?.abort();
      for (const request of activeRequests.values()) request.controller.abort();
      activeRequests.clear();
    };
  }, [orgSlug]);

  const loadHistory = useCallback(async () => {
    if (historyRequest.current) return;
    const controller = new AbortController();
    historyRequest.current = controller;
    dispatch({ type: "load-start" });
    try {
      const response = await fetch(`${endpoint}/threads`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(await agentResponseError(response));
      const history = readAgentThreadList(await response.json(), orgSlug);
      if (mounted.current && !controller.signal.aborted) dispatch({ type: "load", response: history });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) dispatch({ type: "load-failed", error: error instanceof Error ? error.message : "Agent history could not be loaded. Please try again." });
    } finally {
      if (historyRequest.current === controller) historyRequest.current = null;
    }
  }, [endpoint, orgSlug]);

  useEffect(() => {
    if (state.panelOpen && state.historyStatus === "idle") void loadHistory();
  }, [state.panelOpen, state.historyStatus, loadHistory]);

  const runMessage = useCallback(async (thread: AgentThread, input: string) => {
    const message = input.trim().slice(0, 4_000);
    // A synchronous registry closes the double-click/Enter race before React rerenders.
    if (!message || requests.current.has(thread.id) || isAgentThreadPreparing(thread)) return;
    const clientMessageId = newAgentId();
    const assistantId = newAgentId();
    const controller = new AbortController();
    requests.current.set(thread.id, { controller, assistantId });
    dispatch({ type: "send", id: thread.id, text: message, at: Date.now(), messageId: clientMessageId, assistantId });
    const body: AgentChatRequest = { threadId: thread.id, clientMessageId, assistantId, message,
      ...(thread.sourceRequestId ? { sourceRequestId: thread.sourceRequestId } : {}) };
    try {
      const response = await fetch(`${endpoint}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) throw new Error(await agentResponseError(response));
      await consumeAgentStream(response, orgSlug, (event) => {
        if (!mounted.current || controller.signal.aborted) return;
        dispatch({ type: "stream", id: thread.id, messageId: assistantId, event, at: Date.now() });
        if (event.type === "finish" && event.status === "failed") dispatch({ type: "failed", id: thread.id, messageId: assistantId, error: event.error ?? "Agent could not complete this request. Please try again.", retryDraft: input });
      });
    } catch (error) {
      if (mounted.current) dispatch({ type: "failed", id: thread.id, messageId: assistantId, cancelled: controller.signal.aborted,
        error: controller.signal.aborted ? "Response stopped." : error instanceof Error ? error.message : "Agent could not complete this request. Please try again.",
        ...(controller.signal.aborted ? {} : { retryDraft: input }) });
    } finally {
      if (requests.current.get(thread.id)?.controller === controller) requests.current.delete(thread.id);
    }
  }, [endpoint, orgSlug]);

  const captureOpener = useCallback(() => {
    if (typeof document !== "undefined") returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  const openAgent = useCallback(() => { captureOpener(); dispatch({ type: "open" }); }, [captureOpener]);
  const startThread = useCallback((context?: AgentRequestContext) => {
    captureOpener();
    const thread = createAgentThread({ id: newAgentId(), at: Date.now(), context });
    dispatch({ type: "create", thread });
    if (context) void runMessage(thread, "Explain this request.");
  }, [captureOpener, runMessage]);
  const sendMessage = useCallback((text?: string) => {
    const current = stateRef.current;
    let thread = current.threads.find((item) => item.id === current.activeThreadId);
    const prompt = text ?? thread?.draft ?? "";
    if (!prompt.trim()) return;
    if (!thread) {
      thread = createAgentThread({ id: newAgentId(), at: Date.now() });
      // Suggestions may be clicked twice before a rerender creates their active thread.
      stateRef.current = agentChatReducer(current, { type: "create", thread });
      dispatch({ type: "create", thread });
    }
    void runMessage(thread, prompt);
  }, [runMessage]);
  const stopResponse = useCallback((threadId: string) => {
    const request = requests.current.get(threadId);
    if (!request) return;
    request.controller.abort();
    dispatch({ type: "failed", id: threadId, messageId: request.assistantId, error: "Response stopped.", cancelled: true });
  }, []);

  // Typing and streaming do not notify every Ask agent button in the workspace.
  const actions = useMemo(() => ({ openAgent, startThread, isOpen: state.panelOpen, panelId }), [openAgent, startThread, state.panelOpen, panelId]);
  const value = useMemo(() => ({ state, dispatch, orgSlug, panelId, returnFocusRef, sendMessage, stopResponse, loadHistory }), [state, orgSlug, panelId, sendMessage, stopResponse, loadHistory]);
  return <AgentActionsContext.Provider value={actions}><AgentStateContext.Provider value={value}>{children}</AgentStateContext.Provider></AgentActionsContext.Provider>;
}
