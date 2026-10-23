import assert from "node:assert/strict";
import test from "node:test";
import { auditCutoff, mcpResource, publicMcpResult, requireCatalogTool, requireMcpScopes } from "../src/lib/mcp/policy";
import { schemaForTool, toolsForCatalog, outrayTools } from "../src/lib/mcp/catalog";
import { withMcpRequestActor, getMcpRequestActor, type McpRequestActor } from "../src/lib/mcp/request-actor";
import { validateAlertCreateInput } from "../src/lib/observability/alert-validation";
import { validateMonitorInput } from "../src/lib/uptime/validation";
import { PUBLIC_MCP_TOOL_NAMES } from "../src/lib/mcp/public-tool-names";

test("public discovery excludes every credential-processing tool and guessed calls fail", () => {
  const names = new Set(toolsForCatalog("openai").map((tool) => tool.name));
  for (const tool of outrayTools.filter((tool) => tool.values || !tool.public)) {
    assert.equal(names.has(tool.name), false, tool.name);
    assert.throws(() => requireCatalogTool("openai", tool), /unavailable/);
    assert.doesNotThrow(() => requireCatalogTool("direct", tool));
  }
  assert.equal(names.has("list_secrets"), true);
  assert.equal(names.has("revoke_credential"), true);
  assert.deepEqual(names, PUBLIC_MCP_TOOL_NAMES);
  assert.equal(new Set(outrayTools.map((tool) => tool.name)).size, outrayTools.length);
  for (const tool of toolsForCatalog("openai")) {
    assert.equal("headers" in tool.shape, false, tool.name);
    assert.equal("value" in tool.shape, false, tool.name);
    assert.equal("envText" in tool.shape, false, tool.name);
  }
});

test("write and secret-value permissions are independently required", () => {
  assert.doesNotThrow(() => requireMcpScopes(["outray:read"], false));
  assert.throws(() => requireMcpScopes(["outray:read"], true), /permission/);
  assert.throws(() => requireMcpScopes(["outray:write"], true, true), /permission/);
  assert.doesNotThrow(() => requireMcpScopes(["outray:write", "outray:secrets:values"], true, true));
});

test("public results omit payloads, credentials and commerce while preserving evidence metadata", () => {
  const original = { requestId: "r1", status: 500, requestBody: "secret", headers: { authorization: "private" },
    attributes: { anything: "private" }, body: "private", subscription: { plan: "private" },
    logs: [{ level: "error", message: "timeout at a private hostname", traceId: "t1" }],
    nested: { token: "private", accessToken: "private", message: "Bearer opaque-token", duration: 25, value: "private", envText: "private",
      url: "https://user:private@example.test/api?key=private#private" } };
  const result = publicMcpResult(original) as Record<string, unknown>;
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /private|opaque-token|hostname|subscription|requestBody/);
  assert.match(serialized, /timeout mentioned/);
  assert.equal(result.requestId, "r1"); assert.equal(result.status, 500);
  assert.equal(original.headers.authorization, "private");
});

test("resource identifiers are stable, distinct and restricted to safe origins", () => {
  assert.equal(mcpResource("https://outray.co", "direct"), "https://outray.co/api/mcp");
  assert.equal(mcpResource("https://outray.co", "openai"), "https://outray.co/api/mcp/openai");
  assert.equal(mcpResource("http://localhost:6767", "direct"), "http://localhost:6767/api/mcp");
  for (const value of ["http://external.test", "https://user:pass@outray.co", "https://outray.co/path", "https://outray.co?key=private"]) {
    assert.throws(() => mcpResource(value, "direct"));
  }
  assert.equal(auditCutoff(new Date("2026-10-22T12:00:00Z")).toISOString(), "2026-07-24T12:00:00.000Z");
});

test("public schemas accept real alert and monitor payloads and reject hidden extra fields", () => {
  const alert = outrayTools.find((tool) => tool.name === "create_alert")!;
  const parsed = schemaForTool(alert).parse({ orgSlug: "demo", name: "Errors", service: "demo", signal: "request_error_rate", operator: "gt", threshold: 5 });
  const { orgSlug: _orgSlug, ...body } = parsed;
  assert.equal(validateAlertCreateInput(body).success, true);
  const monitor = outrayTools.find((tool) => tool.name === "create_monitor")!;
  const input = schemaForTool(monitor).parse({ orgSlug: "demo", name: "Example", url: "https://example.com", enabled: false });
  const { orgSlug: _monitorOrg, ...monitorBody } = input;
  assert.equal(validateMonitorInput(monitorBody).success, true);
  assert.throws(() => schemaForTool(monitor).parse({ ...input, headers: { Authorization: "private" } }));
});

test("request actors are isolated by object identity, concurrency and exceptional cleanup", async () => {
  const requestA = new Request("https://outray.co/api/demo/tunnels");
  const requestB = new Request(requestA);
  const actor = { connectionId: "a" } as McpRequestActor;
  await assert.rejects(withMcpRequestActor(requestA, actor, async () => {
    assert.equal(getMcpRequestActor(requestA), actor);
    assert.equal(getMcpRequestActor(requestB), undefined);
    await Promise.resolve();
    throw new Error("failure");
  }));
  assert.equal(getMcpRequestActor(requestA), undefined);
});

test("new direct tools cannot implicitly join the public allowlist", () => {
  assert.throws(() => requireCatalogTool("openai", { name: "future_tool", public: true }), /unavailable/);
});
