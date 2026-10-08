import type { AgentChatRequest } from "./protocol";

export class AgentHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const agentUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const agentRequestId = /^[0-9a-f]{32}:[0-9a-f]{16}$/i;

export function validateAgentRequest(value: unknown): AgentChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentHttpError(400, "Invalid Agent message.");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["threadId", "clientMessageId", "assistantId", "message", "sourceRequestId"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new AgentHttpError(400, "Unexpected Agent message fields.");
  for (const key of ["threadId", "clientMessageId", "assistantId"] as const) {
    if (typeof input[key] !== "string" || !agentUuid.test(input[key])) throw new AgentHttpError(400, "Invalid conversation identity.");
  }
  if (input.clientMessageId === input.assistantId) throw new AgentHttpError(400, "Invalid message identity.");
  if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 4_000) throw new AgentHttpError(400, "Enter a message of up to 4,000 characters.");
  if (input.sourceRequestId !== undefined && (typeof input.sourceRequestId !== "string" || !agentRequestId.test(input.sourceRequestId))) throw new AgentHttpError(400, "Invalid source request.");
  return {
    threadId: (input.threadId as string).toLowerCase(),
    clientMessageId: (input.clientMessageId as string).toLowerCase(),
    assistantId: (input.assistantId as string).toLowerCase(),
    message: input.message.trim(),
    ...(typeof input.sourceRequestId === "string" ? { sourceRequestId: input.sourceRequestId.toLowerCase() } : {}),
  };
}

/** Cookie-authenticated writes cannot be initiated by another website. */
export function assertAgentOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
    throw new AgentHttpError(403, "This request must come from the OutRay console.");
  }
}

export async function readAgentRequest(request: Request): Promise<AgentChatRequest> {
  assertAgentOrigin(request);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AgentHttpError(415, "Send an application/json message.");
  const maximum = 24_576; // 4,000 Unicode characters plus the fixed envelope.
  const length = Number(request.headers.get("content-length"));
  if (length > maximum) throw new AgentHttpError(413, "Agent message is too large.");
  if (!request.body) throw new AgentHttpError(400, "Enter a message.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new AgentHttpError(413, "Agent message is too large."); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try { return validateAgentRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer))); }
  catch (error) {
    if (error instanceof AgentHttpError) throw error;
    throw new AgentHttpError(400, "Invalid Agent message.");
  }
}

/** Defense-in-depth for accidentally pasted credentials. It is not a DLP guarantee. */
export function redactAgentPrompt(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>]+/gi, (raw) => {
      try { const url = new URL(raw); return `${url.origin}${url.pathname}`; } catch { return "[URL withheld]"; }
    })
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(\b(?:authorization|proxy-authorization)\s*:\s*)Basic\s+\S+/gi, "$1[redacted]")
    .replace(/(\b(?:cookie|set-cookie)\s*:\s*)[^\r\n]+/gi, "$1[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/\b(?:sk|xai|ghp|gho|github_pat)[-_][A-Za-z0-9_-]{16,}\b/g, "[redacted key]")
    .replace(/((?:["']?)(?:password|passwd|secret|token|api[_-]?key|authorization|cookie)(?:["']?)\s*[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi, "$1[redacted]")
    // Intentionally strip control/bidi characters while keeping tabs and line breaks.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "");
}
