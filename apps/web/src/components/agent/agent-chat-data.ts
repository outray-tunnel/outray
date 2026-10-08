import {
  buildRequestExplanationPreview,
  type RequestExplanationPreview,
} from "../observability/request-explanation-data";
import type {
  HttpRequestSummary,
  RequestDetailsResponse,
} from "../observability/http-requests-data";
import type { AgentSavedMessage, AgentSavedThread, AgentStreamEvent, AgentThreadListResponse } from "../../lib/agent/protocol";

export interface AgentRequestContext {
  kind: "request";
  label: string;
  sourceHref: string;
  preview: RequestExplanationPreview;
  request: {
    id: string;
    method: string;
    path: string;
    service: string;
    environment: string;
    statusCode: number;
    duration: number;
    timestamp: string;
  };
}

export type AgentMessage = AgentSavedMessage & { localStreaming?: boolean };

export interface AgentThread extends AgentSavedThread {
  context?: AgentRequestContext;
  messages: AgentMessage[];
  draft: string;
}

export interface AgentChatState {
  threads: AgentThread[];
  activeThreadId: string | null;
  panelOpen: boolean;
  historyOpen: boolean;
  historyStatus: "idle" | "loading" | "loaded" | "failed";
  historyError: string | null;
  configured: boolean | null;
  model: string | null;
}

export type AgentChatEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "history"; open: boolean }
  | { type: "create"; thread: AgentThread }
  | { type: "select"; id: string }
  | { type: "draft"; id: string; value: string }
  | { type: "send"; id: string; text: string; at: number; messageId: string; assistantId: string }
  | { type: "stream"; id: string; messageId: string; event: AgentStreamEvent; at: number }
  | { type: "failed"; id: string; messageId: string; error: string; retryDraft?: string; cancelled?: boolean }
  | { type: "load-start" }
  | { type: "load"; response: AgentThreadListResponse }
  | { type: "load-failed"; error: string }
  | { type: "delete"; id: string };

export type AgentChatAction = AgentChatEvent;

export const AGENT_THREAD_LIMIT = 30;
export const AGENT_MESSAGE_LIMIT = 100;
export const AGENT_PROMPT_LIMIT = 4_000;
export const AGENT_MAX_PROMPT_LENGTH = AGENT_PROMPT_LIMIT;
export const initialAgentChatState: AgentChatState = {
  threads: [], activeThreadId: null, panelOpen: false, historyOpen: false,
  historyStatus: "idle", historyError: null, configured: null, model: null,
};

const validId = (value: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const validTime = (value: number) => Number.isFinite(value) && value >= 0;
const unprintableText = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu;

function stripControls(value: string): string {
  return value.replace(unprintableText, (character) => ["\t", "\n", "\r"].includes(character) ? character : "");
}

// React renders these as text; do not turn telemetry or prompts into HTML.
function text(value: unknown, maximum = 200): string {
  return typeof value === "string"
    ? stripControls(value).trim().slice(0, maximum)
    : "";
}

function draftText(value: string): string {
  return stripControls(value).slice(0, AGENT_PROMPT_LIMIT);
}

function pathWithoutQuery(value: unknown): string {
  const raw = text(value, 4_096);
  if (!raw) return "/";
  try {
    const parsed = new URL(raw, "https://agent-context.invalid");
    if (!["http:", "https:"].includes(parsed.protocol)) return "/";
    return parsed.pathname.slice(0, 512) || "/";
  } catch {
    // A malformed absolute URL can contain credentials; never retain it verbatim.
    return "/";
  }
}

function clonePreview(preview: RequestExplanationPreview): RequestExplanationPreview {
  return {
    category: preview.category,
    title: text(preview.title, 200), summary: text(preview.summary, 2_000),
    evidence: preview.evidence.slice(0, 20).map((item) => ({
      id: text(item.id), label: text(item.label), value: text(item.value, 512),
      detail: text(item.detail, 1_024), target: item.target === "response" ? "response" : "context",
    })),
    hypothesis: preview.hypothesis ? {
      title: text(preview.hypothesis.title), detail: text(preview.hypothesis.detail, 1_024),
    } : null,
    nextChecks: preview.nextChecks.slice(0, 12).map((item) => text(item, 1_024)),
    limitations: preview.limitations.slice(0, 16).map((item) => text(item, 1_024)),
    followUps: preview.followUps.slice(0, 12).map((item) => ({
      id: text(item.id), label: text(item.label), answer: text(item.answer, 2_000),
    })),
  };
}

function cloneContext(context: AgentRequestContext): AgentRequestContext {
  return {
    kind: "request", label: text(context.label, 600),
    sourceHref: context.sourceHref.startsWith("/") && !context.sourceHref.startsWith("//")
      ? text(context.sourceHref, 2_048) : "",
    preview: clonePreview(context.preview),
    request: {
      id: text(context.request.id), method: text(context.request.method, 32),
      path: pathWithoutQuery(context.request.path), service: text(context.request.service),
      environment: text(context.request.environment), statusCode: context.request.statusCode,
      duration: context.request.duration, timestamp: text(context.request.timestamp, 40),
    },
  };
}

/** Snapshot only metadata: no bodies, headers, query values, log messages or trace IDs survive. */
export function createAgentRequestContext(
  orgSlug: string,
  request: HttpRequestSummary,
  details?: RequestDetailsResponse | null,
): AgentRequestContext {
  const safeRequest: HttpRequestSummary = {
    id: text(request.id), requestId: text(request.requestId),
    method: text(request.method, 32) || "HTTP", path: pathWithoutQuery(request.path || request.route), route: "",
    service: text(request.service), environment: text(request.environment), region: "",
    statusCode: Number.isInteger(request.statusCode) && request.statusCode >= 100 && request.statusCode <= 599 ? request.statusCode : 0,
    duration: Number.isFinite(request.duration) && request.duration >= 0 ? request.duration : -1,
    timestamp: Number.isFinite(Date.parse(request.timestamp)) ? new Date(request.timestamp).toISOString() : "",
    traceId: typeof request.traceId === "string" && request.traceId.trim() ? "attached" : "", spanId: "",
    captureState: ["full", "metadata", "redacted"].includes(request.captureState) ? request.captureState : "metadata",
    requestSize: 0, responseSize: 0,
  };
  const matchingDetails = details?.request.id === request.id && details.request.requestId === request.requestId ? details : null;
  const captureFlags = (capture: RequestDetailsResponse["request"]["response"]) => ({
    headersCaptured: capture.headersCaptured === true, headersTruncated: capture.headersTruncated === true,
    bodyCaptured: capture.bodyCaptured === true, bodyTruncated: capture.bodyTruncated === true,
    headers: {}, body: null, bodyContentType: "", size: 0,
  });
  // The preview builder sees only flags and log levels, never original payload objects.
  const safeDetails: RequestDetailsResponse | undefined = matchingDetails ? {
    request: {
      ...safeRequest, url: "", clientAddress: "", userAgent: "", protocol: "",
      request: { ...captureFlags(matchingDetails.request.request), query: {} },
      response: captureFlags(matchingDetails.request.response), attributes: {}, resourceAttributes: {},
    },
    logs: matchingDetails.logs.map((log) => ({ id: "", timestamp: "", message: "", level: log.level })),
  } : undefined;
  const sourceParameters = new URLSearchParams({ search: safeRequest.requestId || safeRequest.id, range: "30d" });
  return {
    kind: "request", label: `${safeRequest.method} ${safeRequest.path}`,
    // Requests has a search parameter (including request IDs), not a selected-ID URL parameter.
    sourceHref: `/${encodeURIComponent(text(orgSlug, 200))}/observability/requests?${sourceParameters}`,
    preview: buildRequestExplanationPreview(safeRequest, safeDetails),
    request: {
      id: safeRequest.id, method: safeRequest.method, path: safeRequest.path,
      service: safeRequest.service, environment: safeRequest.environment, statusCode: safeRequest.statusCode,
      duration: safeRequest.duration, timestamp: safeRequest.timestamp,
    },
  };
}

export function createAgentThread({ id, at, context }: {
  id: string; at: number; context?: AgentRequestContext;
}): AgentThread {
  if (!validId(id) || !validTime(at)) throw new Error("Invalid Agent thread identity");
  const snapshot = context ? cloneContext(context) : undefined;
  return {
    id, title: snapshot ? text(`Explain ${snapshot.label}`, 72) : "New chat",
    createdAt: at, updatedAt: at, ...(snapshot ? { context: snapshot } : {}), draft: "",
    sourceRequestId: snapshot?.request.id ?? null, messages: [],
  };
}

export function isAgentThreadPreparing(thread?: AgentThread | null): boolean {
  return thread?.messages.some((message) => message.role === "assistant" && message.status === "running" && message.localStreaming === true) ?? false;
}

/** Only workspace observability links supplied by the server can become anchors. */
export function safeAgentEvidenceHref(href: unknown, orgSlug: string): string | null {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")
    || /[\\\p{Cc}]/u.test(href) || href.length > 2_048) return null;
  try {
    const url = new URL(href, "https://agent-links.invalid");
    const prefix = `/${encodeURIComponent(orgSlug)}/observability/`;
    if (url.origin !== "https://agent-links.invalid" || !["requests", "logs", "traces"].some((kind) => url.pathname === `${prefix}${kind}`)) return null;
    return `${url.pathname}${url.search}`;
  } catch { return null; }
}

function limitThreads(threads: AgentThread[]): AgentThread[] {
  // Never evict an in-flight response or a locally edited draft while merging history.
  return threads.filter((thread, index) => index < AGENT_THREAD_LIMIT || thread.draft !== "" || isAgentThreadPreparing(thread));
}

/** Browser conversation state. Server events, not local clocks, supply responses and progress. */
export function agentChatReducer(state: AgentChatState, event: AgentChatEvent): AgentChatState {
  switch (event.type) {
    case "open": return { ...state, panelOpen: true };
    case "close": return { ...state, panelOpen: false };
    case "history": return { ...state, historyOpen: event.open, panelOpen: true };
    case "create": {
      if (!validId(event.thread.id) || !validTime(event.thread.createdAt) || !validTime(event.thread.updatedAt)
        || state.threads.some((thread) => thread.id === event.thread.id)) return state;
      const thread = { ...event.thread, draft: draftText(event.thread.draft), context: event.thread.context ? cloneContext(event.thread.context) : undefined };
      return { ...state, threads: limitThreads([thread, ...state.threads]), activeThreadId: thread.id, panelOpen: true, historyOpen: false };
    }
    case "select": return state.threads.some((thread) => thread.id === event.id)
      ? { ...state, activeThreadId: event.id, panelOpen: true, historyOpen: false } : state;
    case "draft": return state.threads.some((thread) => thread.id === event.id)
      ? { ...state, threads: state.threads.map((thread) => thread.id === event.id ? { ...thread, draft: draftText(event.value) } : thread) } : state;
    case "send": {
      const prompt = text(event.text, AGENT_PROMPT_LIMIT);
      const thread = state.threads.find((item) => item.id === event.id);
      if (!thread || isAgentThreadPreparing(thread) || !prompt || !validTime(event.at) || !validId(event.messageId) || !validId(event.assistantId)
        || event.messageId === event.assistantId || thread.messages.some((item) => item.id === event.messageId || item.id === event.assistantId)) return state;
      const nextThread: AgentThread = {
        ...thread, title: thread.title === "New chat" ? text(prompt, 72) : thread.title,
        updatedAt: Math.max(thread.updatedAt, event.at), draft: thread.draft.trim() === prompt ? "" : thread.draft,
        messages: [...thread.messages,
          { id: event.messageId, role: "user" as const, text: prompt, status: "complete" as const, steps: [], evidence: [] },
          { id: event.assistantId, role: "assistant" as const, text: "", status: "running" as const, localStreaming: true, steps: [], evidence: [] },
        ].slice(-AGENT_MESSAGE_LIMIT),
      };
      return { ...state, threads: [nextThread, ...state.threads.filter((item) => item.id !== thread.id)] };
    }
    case "stream": {
      const thread = state.threads.find((item) => item.id === event.id);
      const message = thread?.messages.find((item) => item.id === event.messageId);
      if (!message || message.role !== "assistant" || message.status !== "running") return state;
      const update = event.event;
      const next = update.type === "text" ? { ...message, text: (message.text + stripControls(update.delta)).slice(0, 200_000) }
        : update.type === "step" ? { ...message, steps: (message.steps.some((step) => step.id === update.step.id) ? message.steps.map((step) => step.id === update.step.id ? update.step : step) : [...message.steps, update.step]).slice(-100) }
          : update.type === "evidence" ? { ...message, evidence: [...new Map([...message.evidence, ...update.evidence].map((item) => [item.id, item])).values()].slice(-100) }
            : update.type === "finish" ? { ...message, status: update.status, ...(update.error ? { error: update.error } : {}) }
              : message;
      return { ...state, threads: state.threads.map((item) => item.id !== event.id ? item : {
        ...item, updatedAt: Math.max(item.updatedAt, event.at), messages: item.messages.map((entry) => entry.id !== event.messageId ? entry : next),
      }) };
    }
    case "failed": return { ...state, threads: state.threads.map((thread) => thread.id !== event.id ? thread : {
      ...thread, draft: thread.draft || (event.retryDraft ? draftText(event.retryDraft) : ""),
      messages: thread.messages.map((message) => message.id !== event.messageId || message.status !== "running" ? message : {
        ...message, status: event.cancelled ? "cancelled" as const : "failed" as const, error: text(event.error, 2_000),
      }),
    }) };
    case "load-start": return { ...state, historyStatus: "loading", historyError: null };
    case "load-failed": return { ...state, historyStatus: "failed", historyError: text(event.error, 2_000) };
    case "load": {
      const localById = new Map(state.threads.map((thread) => [thread.id, thread]));
      const loaded = event.response.threads.map((saved) => {
        const local = localById.get(saved.id);
        localById.delete(saved.id);
        // A history request can race typing or streaming. Those local changes win.
        if (local && (isAgentThreadPreparing(local) || local.updatedAt >= saved.updatedAt)) return local;
        return { ...saved, draft: local?.draft ?? "", ...(local?.context ? { context: local.context } : {}) };
      });
      const threads = limitThreads([...localById.values(), ...loaded].sort((a, b) => b.updatedAt - a.updatedAt));
      return { ...state, threads, activeThreadId: state.activeThreadId ?? threads[0]?.id ?? null,
        historyStatus: "loaded", historyError: null, configured: event.response.configured, model: event.response.model };
    }
    case "delete": {
      if (!state.threads.some((thread) => thread.id === event.id)) return state;
      const threads = state.threads.filter((thread) => thread.id !== event.id);
      return { ...state, threads, activeThreadId: state.activeThreadId === event.id ? threads[0]?.id ?? null : state.activeThreadId };
    }
  }
}
