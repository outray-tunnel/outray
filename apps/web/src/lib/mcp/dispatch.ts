import { productRoutes } from "./product-routes";
import { schemaForTool, type McpArguments, type OutrayTool } from "./catalog";
import { requireCatalogTool, requireMcpScopes, publicMcpResult, McpAccessError } from "./policy";
import { withMcpRequestActor, type McpRequestActor } from "./request-actor";
import { requireMcpOrganization, runOrganizationTool } from "./organization-service";
import { mcpOrigin } from "./config";
import { instancePathAvailable } from "../../../../../shared/instance-config";
import { createMcpSecretShare } from "./secret-service";
import { SecretsError } from "../secrets/types";
import { APIError } from "better-auth/api";

type ProductHandler = (context: { request: Request; params: Record<string, string> }) => Promise<Response>;
type ProductRouteModule = { Route: { options: { server?: { handlers?: Record<string, ProductHandler> } } } };

export async function dispatchMcpTool(tool: OutrayTool, actor: McpRequestActor, raw: McpArguments) {
  requireCatalogTool(actor.catalog, tool);
  requireMcpScopes(actor.scopes, tool.write, tool.values);
  const args = schemaForTool(tool).parse(raw);
  if (typeof args.orgSlug === "string") await requireMcpOrganization(actor, args.orgSlug, tool.manager);
  if (tool.operation === "secret_share") {
    try { return await createMcpSecretShare(actor, args); }
    catch (error) {
      if (error instanceof SecretsError) throw new McpAccessError(error.code, error.status, error.message);
      throw error;
    }
  }
  if (tool.operation) {
    try {
      const result = await runOrganizationTool(tool.operation, actor, args);
      return actor.catalog === "openai" ? publicMcpResult(result) : result;
    } catch (error) {
      if (error instanceof APIError) throw new McpAccessError(`HTTP_${error.statusCode}`, error.statusCode, publicErrorMessage(error.statusCode));
      throw error;
    }
  }
  if (!tool.route) throw new McpAccessError("UNAVAILABLE_TOOL", 404, "Unknown tool");
  const entry = productRoutes[tool.route];
  const params: Record<string, string> = {};
  const path = entry.path.replace(/\$([A-Za-z0-9]+)/g, (_, key: string) => {
    const value = args[key === "projectSlug" ? "vaultSlug" : key];
    if (typeof value !== "string") throw new McpAccessError("INVALID_INPUT", 400, `Missing ${key}`);
    params[key] = value;
    return encodeURIComponent(value);
  });
  const url = new URL(path, mcpOrigin());
  if (!instancePathAvailable(url.pathname)) throw new McpAccessError("UNAVAILABLE_TOOL", 404, "This product is disabled on this installation");
  for (const key of tool.query ?? []) {
    if (args[key] !== undefined) url.searchParams.set(key, String(args[key]));
  }
  const body = Object.fromEntries((tool.body ?? []).filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
  const request = new Request(url, { method: tool.method, headers: {
    "content-type": "application/json", "user-agent": "OutRay MCP", "x-request-id": crypto.randomUUID(),
  }, ...(tool.method === "GET" ? {} : { body: JSON.stringify(body) }) });
  const module = await entry.load() as unknown as ProductRouteModule;
  const handler = module.Route.options.server?.handlers?.[tool.method];
  if (!handler) throw new McpAccessError("UNAVAILABLE_TOOL", 404, "Product operation is unavailable");
  const response = await withMcpRequestActor(request, actor, () => handler({ request, params }));
  const content = await response.text();
  if (content.length > 4_194_304) throw new McpAccessError("RESULT_TOO_LARGE", 413, "Narrow the request to retrieve fewer results");
  let result: unknown;
  try { result = content ? JSON.parse(content) : { success: response.ok }; }
  catch { result = { content }; }
  if (!response.ok) {
    const error = result && typeof result === "object" ? result as Record<string, unknown> : {};
    // Public errors never repeat product upsells, credentials, or provider diagnostics.
    const message = actor.catalog === "openai" ? publicErrorMessage(response.status) :
      typeof error.error === "string" ? error.error.slice(0, 500) : publicErrorMessage(response.status);
    throw new McpAccessError(typeof error.code === "string" ? error.code : `HTTP_${response.status}`, response.status, message);
  }
  return actor.catalog === "openai" ? publicMcpResult(result) : result;
}

function publicErrorMessage(status: number) {
  if (status === 400 || status === 422) return "The input was rejected. Check the requested fields and required confirmations.";
  if (status === 401) return "Reconnect your OutRay account.";
  if (status === 403) return "This account cannot perform this operation or has reached its allowance.";
  if (status === 404) return "The requested resource was not found in this organization.";
  if (status === 409) return "The resource changed or conflicts with existing data. Refresh it before trying again.";
  if (status === 429) return "Too many requests. Try again later.";
  return "OutRay could not complete this operation. Try again later.";
}
