import { auth } from "../auth";
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { mcpOrigin, resourceFor, scopesFor } from "./config";

export async function handleMcpWellKnown(request: Request): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const path = new URL(request.url).pathname;
  const prefix = "/.well-known/oauth-protected-resource";
  const catalog = path === prefix || path === `${prefix}/api/mcp/openai` ? "openai"
    : path === `${prefix}/api/mcp` ? "direct" : null;
  if (catalog) return Response.json({
    resource: resourceFor(catalog), authorization_servers: [`${mcpOrigin()}/api/auth`],
    scopes_supported: scopesFor(catalog).filter((scope) => scope.startsWith("outray:")),
    bearer_methods_supported: ["header"], resource_documentation: `${mcpOrigin()}/plugins/codex`,
    resource_policy_uri: `${mcpOrigin()}/privacy`, resource_tos_uri: `${mcpOrigin()}/terms`,
  }, { headers: { "Cache-Control": "public, max-age=300" } });
  if (["/.well-known/oauth-authorization-server/api/auth", "/.well-known/oauth-authorization-server"].includes(path)) {
    return oauthProviderAuthServerMetadata(auth)(request);
  }
  if (["/.well-known/openid-configuration/api/auth", "/.well-known/openid-configuration"].includes(path)) {
    return oauthProviderOpenIdConfigMetadata(auth)(request);
  }
  return null;
}
