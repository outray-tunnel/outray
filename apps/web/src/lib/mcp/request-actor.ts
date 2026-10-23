import type { users } from "../../db/auth-schema";
import type { McpCatalog } from "./policy";

export interface McpRequestActor {
  user: typeof users.$inferSelect;
  connectionId: string;
  organizationIds: readonly string[];
  scopes: readonly string[];
  catalog: McpCatalog;
}

// Request identity cannot be supplied through headers, cookies, query or body.
// Only an already-authenticated in-process MCP dispatcher can attach an actor.
const actors = new WeakMap<Request, McpRequestActor>();

export function getMcpRequestActor(request: Request) {
  return actors.get(request);
}

export async function withMcpRequestActor<T>(request: Request, actor: McpRequestActor, run: () => Promise<T>) {
  if (actors.has(request)) throw new Error("Request already has an MCP actor");
  actors.set(request, actor);
  try { return await run(); }
  finally { actors.delete(request); }
}
