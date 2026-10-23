import * as z from "zod";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../../db";
import { mcpConnections } from "../../db/mcp-schema";
import { oauthClients } from "../../db/oauth-schema";
import { catalogForResource, mcpOrigin, scopesFor } from "./config";
import { listMcpOrganizations, revokeMcpConnection, saveMcpConnection } from "./connections";
import { McpAccessError } from "./policy";

export async function verifiedOAuthQuery(query: string) {
  const context = await auth.$context;
  if (!query || query.length > 16384 || !await verifyOAuthQueryParams(query, context.secret)) {
    throw new McpAccessError("INVALID_REQUEST", 400, "This connection request is invalid or has expired");
  }
  const params = new URLSearchParams(query);
  // Clients can repeat the discovered resource alongside an explicit override.
  // Keep the signed query intact; only identical resource identifiers collapse.
  const resources = [...new Set(params.getAll("resource"))];
  if (params.getAll("client_id").length !== 1 || resources.length !== 1 || params.getAll("scope").length > 1) {
    throw new McpAccessError("INVALID_REQUEST", 400, "Select a single OutRay connection");
  }
  const resource = resources[0];
  let catalog;
  try { catalog = catalogForResource(resource); }
  catch { throw new McpAccessError("INVALID_REQUEST", 400, "Unsupported OutRay resource"); }
  const scopes = (params.get("scope") || "").split(" ").filter(Boolean);
  if (scopes.some((scope) => !scopesFor(catalog).includes(scope as never))) {
    throw new McpAccessError("INVALID_SCOPE", 400, "This connection requests unsupported permissions");
  }
  return { clientId: params.get("client_id")!, resource, catalog, scopes, params };
}

function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== mcpOrigin()) throw new McpAccessError("FORBIDDEN", 403, "Origin is not allowed");
}

async function requireBrowserUser(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user) throw new McpAccessError("UNAUTHORIZED", 401, "Sign in to OutRay first");
  return { session, headers };
}

export async function handleMcpConsent(request: Request) {
  return withConsentErrors(async () => {
    const { session, headers } = await requireBrowserUser(request);
    if (request.method === "GET") {
      const query = new URL(request.url).searchParams.get("oauth_query") || "";
      const details = await verifiedOAuthQuery(query);
      const client = await auth.api.getOAuthClientPublic({ headers, query: { client_id: details.clientId } });
      return Response.json({ clientName: client.client_name || "MCP client", catalog: details.catalog,
        scopes: details.scopes, organizations: await listMcpOrganizations(session.user.id),
        requestedClaims: details.params.get("claims") ? Object.keys(JSON.parse(details.params.get("claims")!).userinfo ?? {}) : [],
      });
    }
    requireSameOrigin(request);
    if (Number(request.headers.get("content-length")) > 32768) throw new McpAccessError("INVALID_REQUEST", 413, "Request too large");
    const input = z.strictObject({ oauth_query: z.string().max(16384), accept: z.boolean(), organizationIds: z.array(z.string().max(256)).max(100) }).parse(await request.json());
    const details = await verifiedOAuthQuery(input.oauth_query);
    await auth.api.getOAuthClientPublic({ headers, query: { client_id: details.clientId } });
    if (input.accept) await saveMcpConnection(session.user.id, details.clientId, details.resource, input.organizationIds);
    headers.set("accept", "application/json");
    const response = await auth.api.oauth2Consent({ request, headers, body: { oauth_query: input.oauth_query, accept: input.accept }, asResponse: true });
    const result = await providerRedirect(response);
    const outgoing = Response.json(result);
    for (const cookie of response.headers.getSetCookie()) outgoing.headers.append("set-cookie", cookie);
    return outgoing;
  });
}

export async function handleMcpConnections(request: Request) {
  return withConsentErrors(async () => {
    const { session } = await requireBrowserUser(request);
    if (request.method === "GET") {
      const connections = await db.select({ id: mcpConnections.id, clientName: oauthClients.name, resource: mcpConnections.resource,
        organizationIds: mcpConnections.organizationIds, createdAt: mcpConnections.createdAt, updatedAt: mcpConnections.updatedAt, revokedAt: mcpConnections.revokedAt,
      }).from(mcpConnections).leftJoin(oauthClients, eq(oauthClients.clientId, mcpConnections.clientId)).where(eq(mcpConnections.userId, session.user.id));
      return Response.json({ connections, organizations: await listMcpOrganizations(session.user.id) });
    }
    requireSameOrigin(request);
    const { id } = z.strictObject({ id: z.string().uuid() }).parse(await request.json());
    // The user predicate is repeated by the transactional mutation.
    const [owned] = await db.select({ id: mcpConnections.id }).from(mcpConnections).where(and(eq(mcpConnections.id, id), eq(mcpConnections.userId, session.user.id))).limit(1);
    if (!owned || !await revokeMcpConnection(session.user.id, id)) throw new McpAccessError("NOT_FOUND", 404, "Connection not found");
    return Response.json({ revoked: true });
  });
}

export async function redirectMcpConnectionsToDashboard(request: Request) {
  return withConsentErrors(async () => {
    try { await requireBrowserUser(request); }
    catch (error) {
      if (!(error instanceof McpAccessError) || error.status !== 401) throw error;
      return Response.redirect(new URL(`/login?${new URLSearchParams({ redirect: "/plugins/connections" })}`, mcpOrigin()), 302);
    }
    return Response.redirect(new URL("/account/settings/connected-apps", mcpOrigin()), 302);
  });
}

async function withConsentErrors(run: () => Promise<Response>) {
  try {
    const response = await run();
    // Redirect responses have immutable headers in the Fetch API.
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    const status = error instanceof McpAccessError ? error.status : error instanceof APIError ? error.statusCode : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
    if (status === 503) {
      const failure = (error && typeof error === "object" ? error : {}) as { name?: string; status?: string; cause?: { code?: string; constraint?: string; table?: string; column?: string } };
      console.error("[MCP] Connection operation failed", { name: failure.name, status: failure.status,
        databaseCode: failure.cause?.code, constraint: failure.cause?.constraint, table: failure.cause?.table, column: failure.cause?.column });
    }
    return Response.json({ error: error instanceof McpAccessError ? error.message : status === 400 ? "Invalid request" : "The connection could not be completed" }, {
      status, headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function continueMcpLogin(request: Request) {
  return withConsentErrors(async () => {
    const query = new URL(request.url).search.slice(1);
    await verifiedOAuthQuery(query);
    const { headers } = await requireBrowserUser(request);
    headers.set("accept", "application/json");
    const response = await auth.api.oauth2Continue({ request, headers, body: { oauth_query: query, postLogin: true }, asResponse: true });
    const result = await providerRedirect(response);
    const outgoing = new Headers({ Location: new URL(result.url, mcpOrigin()).toString() });
    for (const cookie of response.headers.getSetCookie()) outgoing.append("set-cookie", cookie);
    return new Response(null, { status: 302, headers: outgoing });
  });
}

async function providerRedirect(response: Response): Promise<{ redirect: true; url: string }> {
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) return { redirect: true, url: location };
  if (!response.ok) throw new McpAccessError("AUTHORIZATION_FAILED", response.status, "The authorization request could not be completed");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("url" in result) || typeof result.url !== "string") {
    throw new McpAccessError("AUTHORIZATION_FAILED", 503, "The authorization request could not be completed");
  }
  return { redirect: true, url: result.url };
}
