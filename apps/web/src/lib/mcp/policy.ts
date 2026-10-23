import { PUBLIC_MCP_TOOL_NAMES } from "./public-tool-names";
export type McpCatalog = "direct" | "openai";

export const MCP_SCOPES = ["openid", "profile", "email", "offline_access", "outray:read", "outray:write", "outray:secrets:values"] as const;
export const MCP_AUDIT_RETENTION_DAYS = 90;
export const MCP_VERSION = "0.1.0";

export class McpAccessError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "McpAccessError";
  }
}

export function mcpResource(origin: string, catalog: McpCatalog) {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("APP_URL must be an HTTPS origin or loopback HTTP origin");
  }
  return `${url.origin}/api/mcp${catalog === "openai" ? "/openai" : ""}`;
}

export function requireMcpScopes(scopes: readonly string[], write: boolean, values = false) {
  const required = [write ? "outray:write" : "outray:read", ...(values ? ["outray:secrets:values"] : [])];
  if (required.some((scope) => !scopes.includes(scope))) {
    throw new McpAccessError("INSUFFICIENT_SCOPE", 403, "The connection does not have permission for this operation");
  }
}

/** Authorization remains independent of discovery: guessed tool names are denied. */
export function requireCatalogTool(catalog: McpCatalog, tool: { name: string; public: boolean; values?: boolean }) {
  if (catalog === "openai" && (!PUBLIC_MCP_TOOL_NAMES.has(tool.name) || !tool.public || tool.values)) {
    throw new McpAccessError("UNAVAILABLE_TOOL", 403, "This operation is unavailable through this connection");
  }
}

const sensitiveKey = /(?:authorization|cookie|password|passwd|secretvalue|plaintext|ciphertext|privatekey|access.?token|refresh.?token|api.?key|orgtoken|usertoken|headers|requestbody|responsebody|stack|plan|pricing|checkout|upgrade|subscription|attributes|events)|^(?:body|token|content|query|searchParams|envText)$/i;
const credentialText = /(?:\bBearer\s+\S+|\boutray_[A-Za-z0-9_-]+|\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/gi;

/** Only the public catalog uses this additional projection; never mutate source data. */
export function publicMcpResult(value: unknown, depth = 0): unknown {
  if (depth > 15) return "[truncated]";
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        url.username = ""; url.password = ""; url.search = ""; url.hash = "";
        return url.toString().slice(0, 8_000);
      } catch { return "[invalid URL]"; }
    }
    return value.replace(credentialText, "[redacted]").slice(0, 8_000);
  }
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => publicMcpResult(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key, item]) => !sensitiveKey.test(key) && !(key === "value" && typeof item === "string"))
      .map(([key, item]) => [key, key === "message" && ("level" in value || "severityText" in value)
        ? summarizeAgentLogMessage(item) : publicMcpResult(item, depth + 1)]));
  }
  return value;
}

export function auditCutoff(now = new Date()) {
  return new Date(now.getTime() - MCP_AUDIT_RETENTION_DAYS * 86_400_000);
}
import { summarizeAgentLogMessage } from "../agent/log-summary";
