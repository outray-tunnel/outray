import type { AgentSavedMessage, AgentStep, AgentStreamEvent, AgentThreadListResponse } from "../../lib/agent/protocol";
import { safeAgentEvidenceHref } from "./agent-chat-data";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown, maximum: number): value is string => typeof value === "string" && value.length <= maximum;
const id = (value: unknown): value is string => string(value, 128) && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
const evidenceId = (value: unknown): value is string => string(value, 512) && value.length > 0 && !/[\p{Cc}]/u.test(value);
const statuses = ["running", "complete", "failed", "cancelled"];

function readStep(value: unknown): AgentStep {
  if (!object(value) || !id(value.id) || !string(value.label, 400)
    || !["running", "complete", "failed"].includes(String(value.status))
    || (value.detail !== undefined && !string(value.detail, 2_000))) throw new Error("Agent returned invalid progress.");
  return { id: value.id, label: value.label, status: value.status as AgentStep["status"], ...(value.detail ? { detail: value.detail as string } : {}) };
}

function readEvidence(value: unknown, orgSlug: string) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Agent returned invalid evidence.");
  return value.flatMap((item) => {
    if (!object(item) || !evidenceId(item.id) || !string(item.label, 400) || !string(item.observedAt, 80)) throw new Error("Agent returned invalid evidence.");
    const href = safeAgentEvidenceHref(item.href, orgSlug);
    // Even a malformed model-supplied URL must never become an external link.
    return href ? [{ id: item.id, label: item.label, href, observedAt: item.observedAt }] : [];
  });
}

export function readAgentStreamEvent(value: unknown, orgSlug: string): AgentStreamEvent {
  if (!object(value)) throw new Error("Agent returned an invalid response event.");
  switch (value.type) {
    case "run": if (id(value.runId)) return { type: "run", runId: value.runId }; break;
    case "step": return { type: "step", step: readStep(value.step) };
    case "evidence": return { type: "evidence", evidence: readEvidence(value.evidence, orgSlug) };
    case "text": if (string(value.delta, 200_000)) return { type: "text", delta: value.delta }; break;
    case "finish": if (["complete", "failed", "cancelled"].includes(String(value.status)) && (value.error === undefined || string(value.error, 2_000))) {
      return { type: "finish", status: value.status as "complete" | "failed" | "cancelled", ...(value.error ? { error: value.error as string } : {}) };
    } break;
  }
  throw new Error("Agent returned an invalid response event.");
}

function readMessage(value: unknown, orgSlug: string): AgentSavedMessage {
  if (!object(value) || !id(value.id) || !["user", "assistant"].includes(String(value.role))
    || !string(value.text, 200_000) || !statuses.includes(String(value.status)) || !Array.isArray(value.steps) || value.steps.length > 100
    || (value.error !== undefined && !string(value.error, 2_000))) throw new Error("Agent history could not be read.");
  return { id: value.id, role: value.role as "user" | "assistant", text: value.text, status: value.status as AgentSavedMessage["status"],
    steps: value.steps.map(readStep), evidence: readEvidence(value.evidence, orgSlug), ...(value.error ? { error: value.error as string } : {}) };
}

export function readAgentThreadList(value: unknown, orgSlug: string): AgentThreadListResponse {
  if (!object(value) || !Array.isArray(value.threads) || value.threads.length > 100 || typeof value.configured !== "boolean"
    || !(value.model === null || string(value.model, 200))) throw new Error("Agent history could not be read.");
  const threads = value.threads.map((thread) => {
    if (!object(thread) || !id(thread.id) || !string(thread.title, 200) || !(thread.sourceRequestId === null || string(thread.sourceRequestId, 128))
      || typeof thread.createdAt !== "number" || !Number.isFinite(thread.createdAt) || typeof thread.updatedAt !== "number" || !Number.isFinite(thread.updatedAt)
      || !Array.isArray(thread.messages) || thread.messages.length > 100) throw new Error("Agent history could not be read.");
    return { id: thread.id, title: thread.title, sourceRequestId: thread.sourceRequestId as string | null, createdAt: thread.createdAt,
      updatedAt: thread.updatedAt, messages: thread.messages.map((message) => readMessage(message, orgSlug)) };
  });
  return { threads, configured: value.configured, model: value.model as string | null };
}

/** Incremental SSE framing supports UTF-8/chunk boundaries, CRLF and multiline data. */
export function createAgentSseParser(onData: (data: unknown) => void) {
  let buffer = "";
  const frame = (raw: string) => {
    const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data) return;
    let parsed: unknown;
    try { parsed = JSON.parse(data); } catch { throw new Error("Agent returned an invalid response stream."); }
    onData(parsed);
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      if (buffer.length > 1_000_000) throw new Error("Agent response stream exceeded its limit.");
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        frame(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
      }
    },
    finish() {
      // SSE events require a terminating blank line. A truncated frame is not a success.
      if (buffer.trim()) throw new Error("Agent connection ended before the response was complete.");
    },
  };
}

export async function consumeAgentStream(response: Response, orgSlug: string, onEvent: (event: AgentStreamEvent) => void) {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("Agent returned an unexpected response. Please try again.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let finished = false;
  const parser = createAgentSseParser((data) => {
    if (finished) throw new Error("Agent returned events after the response finished.");
    const event = readAgentStreamEvent(data, orgSlug);
    onEvent(event);
    if (event.type === "finish") finished = true;
  });
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      parser.push(decoder.decode(next.value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
    if (!finished) throw new Error("Agent connection ended before the response was complete. Please try again.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function agentResponseError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (object(body) && string(body.error, 2_000) && body.error.trim()) return body.error;
  } catch { /* Use a safe, useful fallback rather than rendering an HTML error page. */ }
  return response.status === 401 ? "Your session expired. Sign in and try again."
    : response.status === 403 ? "You do not have access to Agent in this workspace."
      : response.status === 503 ? "Agent is unavailable. Ask your workspace administrator to check its server configuration and database migration."
        : "Agent could not complete this request. Please try again.";
}
