import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createOutrayProtocolHandler } from "../src/lib/mcp/protocol";
import type { McpRequestActor } from "../src/lib/mcp/request-actor";
import { McpAccessError, type McpCatalog } from "../src/lib/mcp/policy";

async function fixture(catalog: McpCatalog = "openai", scopes = ["outray:read", "outray:write"], modern = false) {
  const calls: string[] = [];
  let revoked = false;
  const handler = createOutrayProtocolHandler(catalog, {
    resolveActor: async () => {
      if (revoked) throw new McpAccessError("UNAUTHORIZED", 401, "Reconnect your OutRay account");
      return { catalog, scopes, connectionId: "demo", organizationIds: ["org1"], user: { id: "user1" } } as McpRequestActor;
    },
    dispatch: async (tool, _actor, args) => {
      calls.push(tool.name);
      if (args.orgSlug === "other") throw new McpAccessError("FORBIDDEN", 403, "Forbidden");
      if (args.orgSlug === "failure") throw new Error("API_KEY=must-never-be-returned");
      return { organizations: [{ slug: "demo" }], success: true };
    },
    rateLimit: async () => {}, auditStart: async () => "audit", auditFinish: async () => {},
  });
  const client = new Client({ name: "outray-test", version: "1.0.0" }, {
    versionNegotiation: { mode: modern ? { pin: "2026-07-28" } : "legacy" },
  });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: async (input, init) => handler.fetch(new Request(input, init)),
  });
  await client.connect(transport);
  return { client, handler, calls, revoke: () => { revoked = true; }, close: async () => { await client.close(); await handler.close(); } };
}

test("both MCP catalogs advertise real OutRay branding through SDK discovery and tools", async () => {
  for (const catalog of ["openai", "direct"] as const) {
    const api = await fixture(catalog, ["outray:read", "outray:write"], true);
    try {
      const info = api.client.getServerVersion();
      assert.ok(api.client.getDiscoverResult(), "the client uses server/discover, not a legacy fallback");
      assert.equal(info?.title, "OutRay");
      assert.equal(info?.version, "0.0.1");
      assert.ok(info?.icons);
      assert.equal(info.icons.length, 2);
      assert.deepEqual(info.icons.map((icon) => icon.theme), ["light", "dark"]);
      for (const icon of info.icons) {
        const url = new URL(icon.src);
        assert.equal(url.origin, new URL(info.websiteUrl!).origin);
        assert.equal(url.search, "");
        assert.equal(url.username, "");
        const bytes = await readFile(new URL(`../public${url.pathname}`, import.meta.url));
        assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a");
        assert.equal(bytes.readUInt32BE(16), 680);
        assert.equal(bytes.readUInt32BE(20), 680);
        const original = icon.theme === "dark" ? "logo-dark.png" : "logo.png";
        assert.deepEqual(bytes, await readFile(new URL(`../../../plugins/outray/assets/${original}`, import.meta.url)));
      }
      const tools = await api.client.listTools();
      for (const tool of tools.tools) assert.deepEqual(tool.icons, info.icons);
    } finally { await api.close(); }
  }
});

test("legacy initialization retains OutRay identity and branding", async () => {
  const api = await fixture();
  try {
    const response = await api.handler.fetch(new Request("http://localhost/mcp", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "branding", method: "initialize", params: {
        protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy-branding", version: "1.0.0" },
      } }),
    }));
    assert.equal(response.status, 200);
    const text = await response.text();
    const messages = response.headers.get("content-type")?.includes("text/event-stream")
      ? text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)))
      : [JSON.parse(text)];
    const result = messages.find((message) => message.id === "branding")?.result;
    assert.equal(result?.serverInfo?.title, "OutRay");
    assert.equal(result?.serverInfo?.version, "0.0.1");
    assert.equal(result?.serverInfo?.icons?.length, 2);
  } finally { await api.close(); }
});

test("real MCP client negotiates legacy HTTP, discovers the public catalog and calls a tool", async () => {
  const api = await fixture();
  try {
    const catalog = await api.client.listTools();
    assert.ok(catalog.tools.some((tool) => tool.name === "list_tunnels"));
    assert.equal(catalog.tools.some((tool) => tool.name === "reveal_secret"), false);
    for (const tool of catalog.tools) for (const key of ["readOnlyHint", "destructiveHint", "openWorldHint"] as const) {
      assert.equal(typeof tool.annotations?.[key], "boolean", `${tool.name}.${key}`);
    }
    const result = await api.client.callTool({ name: "list_organizations", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.deepEqual(api.calls, ["list_organizations"]);
    await assert.rejects(api.client.callTool({ name: "reveal_secret", arguments: {} }), /not found/);
    assert.deepEqual(api.calls, ["list_organizations"]);
  } finally { await api.close(); }
});

test("tool calls recheck scope and connection revocation, and keep internal failures private", async () => {
  const api = await fixture("openai", ["outray:read"]);
  try {
    const denied = await api.client.callTool({ name: "stop_tunnel", arguments: { orgSlug: "demo", tunnelId: "id" } });
    assert.equal(denied.isError, true); assert.equal(api.calls.length, 0);
    const other = await api.client.callTool({ name: "list_tunnels", arguments: { orgSlug: "other" } });
    assert.equal(other.isError, true);
    const failed = await api.client.callTool({ name: "list_tunnels", arguments: { orgSlug: "failure" } });
    assert.equal(failed.isError, true); assert.doesNotMatch(JSON.stringify(failed), /API_KEY|must-never/);
    api.revoke();
    const revoked = await api.client.callTool({ name: "list_organizations", arguments: {} });
    assert.equal(revoked.isError, true);
  } finally { await api.close(); }
});

test("direct MCP discovers value tools but rejects a call without value permission", async () => {
  const api = await fixture("direct", ["outray:read"]);
  try {
    assert.ok((await api.client.listTools()).tools.some((tool) => tool.name === "reveal_secret"));
    const result = await api.client.callTool({ name: "reveal_secret", arguments: {
      orgSlug: "demo", vaultSlug: "demo", environmentSlug: "development", secretId: "id", intent: "reveal",
    } });
    assert.equal(result.isError, true); assert.equal(api.calls.length, 0);
  } finally { await api.close(); }
});
