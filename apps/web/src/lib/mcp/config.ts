import { mcpResource, MCP_SCOPES, type McpCatalog } from "./policy";

export const MCP_CONNECTION_CLAIM = "https://outray.co/mcp/connection";
export function mcpOrigin() {
  const value = process.env.APP_URL || "http://localhost:6767";
  mcpResource(value, "direct");
  return new URL(value).origin;
}
export function resourceFor(catalog: McpCatalog) { return mcpResource(mcpOrigin(), catalog); }
export function scopesFor(catalog: McpCatalog) {
  return MCP_SCOPES.filter((scope) => catalog === "direct" || scope !== "outray:secrets:values");
}
export function catalogForResource(resource: string): McpCatalog {
  if (resource === resourceFor("openai")) return "openai";
  if (resource === resourceFor("direct")) return "direct";
  throw new Error("Unsupported MCP resource");
}
