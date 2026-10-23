import { requireMcpAuth } from "@better-auth/mcp";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../../db";
import { mcpActivity } from "../../db/mcp-schema";
import { redis } from "../redis";
import { resolveMcpActor, recordMcpActivity } from "./connections";
import { createOutrayProtocolHandler } from "./protocol";
import { dispatchMcpTool } from "./dispatch";
import { McpAccessError, type McpCatalog } from "./policy";
import { mcpOrigin, resourceFor } from "./config";

const handlers = new Map<McpCatalog, ReturnType<typeof createOutrayProtocolHandler>>();

function protocolFor(catalog: McpCatalog) {
  let handler = handlers.get(catalog);
  if (handler) return handler;
  handler = createOutrayProtocolHandler(catalog, {
    resolveActor: async ({ authInfo }) => resolveMcpActor(authInfo?.extra?.outrayClaims as Record<string, unknown> ?? {}, catalog),
    dispatch: dispatchMcpTool,
    rateLimit: async (actor, write) => {
      const key = `mcp:rate:${actor.user.id}:${write ? "write" : "read"}:${Math.floor(Date.now() / 60000)}`;
      const count = await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n", 1, key) as number;
      if (count > (write ? 20 : 120)) throw new McpAccessError("RATE_LIMITED", 429, "Too many requests. Try again later.");
    },
    auditStart: (actor, tool, args) => recordMcpActivity(actor, tool, args, "started"),
    auditFinish: async (id, outcome) => { await db.update(mcpActivity).set({ outcome }).where(eq(mcpActivity.id, id)); },
  });
  handlers.set(catalog, handler);
  return handler;
}

export async function handleOutrayMcp(request: Request, catalog: McpCatalog) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.OUTRAY_MCP_ENABLED === "false") return Response.json({ error: "MCP is unavailable" }, { status: 503, headers });
  if (new URL(request.url).host !== new URL(mcpOrigin()).host) return new Response(null, { status: 421, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
  if (request.headers.get("origin") && request.headers.get("origin") !== mcpOrigin()) {
    return Response.json({ error: "Origin is not allowed" }, { status: 403, headers });
  }
  // Read a bounded stream before parsing. Content-Length alone is not trusted.
  if (Number(request.headers.get("content-length")) > 2_097_152) return new Response(null, { status: 413, headers });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2_097_152) { await reader.cancel(); return new Response(null, { status: 413, headers }); }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const bounded = new Request(request.url, { method: "POST", headers: request.headers, body });
  const protectedHandler = requireMcpAuth(auth, async (incoming, claims) => {
    try {
      // Discovery also requires a valid, selected organization connection.
      await resolveMcpActor(claims, catalog);
      return await protocolFor(catalog).fetch(incoming, { authInfo: {
        token: "", clientId: String(claims.client_id ?? claims.azp ?? ""),
        scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [], extra: { outrayClaims: claims },
      } });
    } catch (error) {
      if (!(error instanceof McpAccessError)) throw error;
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
  }, { resource: resourceFor(catalog) });
  try {
    const response = await protectedHandler(bounded);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    console.error("[MCP] Authentication or connection storage is unavailable");
    return Response.json({ error: "OutRay could not complete this operation. Try again later." }, { status: 503, headers });
  }
}
