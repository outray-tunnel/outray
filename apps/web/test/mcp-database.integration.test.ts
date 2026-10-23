import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { eq } from "drizzle-orm";

test("OAuth and product tools enforce their boundaries against real PostgreSQL and Redis", { skip: !process.env.MCP_TEST_DATABASE_URL, timeout: 120000 }, async (t) => {
  const originalFetch = globalThis.fetch;
  process.env.TINYBIRD_API_HOST = "https://tinybird-mcp-test.invalid";
  process.env.TINYBIRD_QUERY_TOKEN = "test-only";
  const emails: string[] = [];
  globalThis.fetch = async (input, options) => {
    if (String(input).startsWith("https://tinybird-mcp-test.invalid/")) return Response.json({ error: "Upstream unavailable" }, { status: 503 });
    if (String(input).startsWith("https://api.zeptomail.com/")) {
      const mail = JSON.parse(String(options?.body));
      const link = /href="([^"]+)"/.exec(mail.htmlbody)?.[1];
      if (link) emails.push(link.replaceAll("&amp;", "&"));
      return Response.json({ success: true });
    }
    return originalFetch(input, options);
  };
  let handler: (request: Request) => Promise<Response> = async () => new Response(null, { status: 503 });
  const clients: Client[] = [];
  let cleanupPool: { end: () => Promise<void> } | undefined;
  let cleanupRedis: { quit: () => Promise<unknown> } | undefined;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const request = new Request(new URL(incoming.url!, process.env.APP_URL), { method: incoming.method, headers,
        ...(incoming.method === "GET" || incoming.method === "HEAD" ? {} : { body: Buffer.concat(chunks) }) });
      const response = await handler(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => { if (key !== "set-cookie") outgoing.setHeader(key, value); });
      const cookies = response.headers.getSetCookie(); if (cookies.length) outgoing.setHeader("set-cookie", cookies);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.statusCode = 500; outgoing.end("Test server failed"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let cleanupJob: Promise<void> | undefined;
  const cleanup = () => cleanupJob ??= (async () => {
    for (const client of clients) await client.close().catch(() => {});
    await cleanupRedis?.quit().catch(() => {}); await cleanupPool?.end();
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((done) => server.close(() => done()));
    globalThis.fetch = originalFetch;
  })();
  t.after(cleanup);
  const address = server.address(); assert.ok(address && typeof address === "object");
  process.env.APP_URL = `http://127.0.0.1:${address.port}`;
  let origin = process.env.APP_URL;
  const { auth } = await import("../src/lib/auth");
  const { db, pool } = await import("../src/db");
  cleanupPool = pool;
  const { users, organizations, members } = await import("../src/db/auth-schema");
  const { mcpActivity, mcpConnections } = await import("../src/db/mcp-schema");
  const { handleOutrayMcp } = await import("../src/lib/mcp/server");
  const { handleMcpConsent, handleMcpConnections, redirectMcpConnectionsToDashboard, continueMcpLogin } = await import("../src/lib/mcp/consent");
  const { handleMcpWellKnown } = await import("../src/lib/mcp/well-known");
  const { redis } = await import("../src/lib/redis");
  cleanupRedis = redis;
  handler = async (request) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/.well-known/")) return await handleMcpWellKnown(request) ?? new Response(null, { status: 404 });
    if (path.startsWith("/api/auth/")) return auth.handler(request);
    if (path === "/api/mcp/consent") return handleMcpConsent(request);
    if (path === "/api/mcp/connections") return handleMcpConnections(request);
    if (path === "/plugins/connections") return redirectMcpConnectionsToDashboard(request);
    if (path === "/plugins/continue") return continueMcpLogin(request);
    return handleOutrayMcp(request, path.endsWith("/openai") ? "openai" : "direct");
  };
  const userId = crypto.randomUUID(), orgId = crypto.randomUUID(), otherOrgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  try {
    await db.insert(users).values({ id: userId, email: "mcp-test@example.test", name: "MCP test", emailVerified: true });
    await db.insert(organizations).values([{ id: orgId, name: "MCP Demo", slug: "mcp-demo", logo: "/logo.png", createdAt: new Date() }, { id: otherOrgId, name: "Unselected", slug: "unselected", createdAt: new Date() }]);
    await db.insert(members).values([{ id: memberId, userId, organizationId: orgId, role: "owner", createdAt: new Date() }, { id: crypto.randomUUID(), userId, organizationId: otherOrgId, role: "owner", createdAt: new Date() }]);
    const signedIn = await originalFetch(`${origin}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email: "mcp-test@example.test", callbackURL: `${origin}/select` }) });
    assert.equal(signedIn.status, 200, "magic link request succeeds"); assert.equal(emails.length, 1);
    const verified = await originalFetch(emails[0], { redirect: "manual" });
    const cookie = verified.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
    assert.ok(cookie.includes("session_token"), "magic link creates a browser session");

    async function startConnection(catalog: "direct" | "openai", resourceMode: "single" | "repeated" | "multiple" | "missing" = "single", extraScope?: string, withSession = true) {
      const resource = `${origin}/api/mcp${catalog === "openai" ? "/openai" : ""}`;
      const scopes = `openid profile email offline_access outray:read outray:write${catalog === "direct" ? " outray:secrets:values" : ""}${extraScope ? ` ${extraScope}` : ""}`;
      const registered = await originalFetch(`${origin}/api/auth/oauth2/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        client_name: `OutRay test ${catalog}`, redirect_uris: ["http://127.0.0.1:8123/callback"], token_endpoint_auth_method: "none", application_type: "native", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: scopes,
      }) });
      assert.equal(registered.status, 201, "dynamic client registration");
      const registration = await registered.json();
      const verifier = randomBytes(32).toString("base64url");
      const query = new URLSearchParams({ response_type: "code", client_id: registration.client_id, redirect_uri: "http://127.0.0.1:8123/callback", scope: scopes, resource,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "test-state" });
      if (resourceMode === "repeated") query.append("resource", resource);
      if (resourceMode === "multiple") query.append("resource", `${origin}/api/mcp${catalog === "openai" ? "" : "/openai"}`);
      if (resourceMode === "missing") query.delete("resource");
      const authorize = await originalFetch(`${origin}/api/auth/oauth2/authorize?${query}`, { headers: { ...(withSession ? { cookie } : {}), accept: "text/html", "sec-fetch-mode": "navigate" }, redirect: "manual" });
      assert.ok([200, 302].includes(authorize.status), "authorization returns a consent redirect");
      const destination = authorize.headers.get("location") || (await authorize.json()).url;
      assert.equal(typeof destination, "string", "authorization returns a destination URL");
      const location = new URL(destination, origin);
      assert.equal(location.pathname, withSession ? "/plugins/authorize" : "/plugins/sign-in");
      const oauthQuery = location.search.slice(1);
      return { resource, registration, verifier, oauthQuery };
    }

    async function connect(catalog: "direct" | "openai", badPkce = false, repeatResource = false) {
      const { resource, registration, verifier, oauthQuery } = await startConnection(catalog, repeatResource ? "repeated" : "single");
      const preview = await originalFetch(`${origin}/api/mcp/consent?${new URLSearchParams({ oauth_query: oauthQuery })}`, { headers: { cookie } });
      assert.equal(preview.status, 200, "signed consent preview");
      assert.equal((await preview.json()).organizations.find((org: { id: string }) => org.id === orgId)?.logo, "/logo.png", "consent includes the saved organization logo");
      const tampered = await originalFetch(`${origin}/api/mcp/consent?${new URLSearchParams({ oauth_query: oauthQuery + "&scope=outray:secrets:values" })}`, { headers: { cookie } });
      assert.equal(tampered.status, 400, "signed consent parameters cannot be changed");
      const foreignOrigin = await originalFetch(`${origin}/api/mcp/consent`, { method: "POST", headers: { cookie, origin: "https://other.example", "content-type": "application/json" }, body: JSON.stringify({ oauth_query: oauthQuery, organizationIds: [orgId], accept: true }) });
      assert.equal(foreignOrigin.status, 403, "cross-origin consent is refused");
      const allowed = await originalFetch(`${origin}/api/mcp/consent`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ oauth_query: oauthQuery, organizationIds: [orgId], accept: true }) });
      assert.equal(allowed.status, 200, "consent saves the organization selection");
      const callback = new URL((await allowed.json()).url);
      assert.equal(callback.searchParams.get("state"), "test-state"); assert.ok(callback.searchParams.get("iss"));
      const tokenBody = { grant_type: "authorization_code", code: callback.searchParams.get("code")!, client_id: registration.client_id, redirect_uri: "http://127.0.0.1:8123/callback", code_verifier: verifier, resource };
      const tokenParams = new URLSearchParams({ ...tokenBody, ...(badPkce ? { code_verifier: randomBytes(32).toString("base64url") } : {}) });
      if (repeatResource) tokenParams.append("resource", resource);
      const tokensResponse = await originalFetch(`${origin}/api/auth/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tokenParams });
      if (badPkce) {
        assert.equal(tokensResponse.status, 400, "a wrong PKCE verifier cannot exchange the authorization code");
        throw new Error("Invalid PKCE rejected");
      }
      assert.equal(tokensResponse.status, 200, "PKCE code exchange");
      const tokens = await tokensResponse.json(); assert.ok(tokens.access_token && tokens.refresh_token);
      const client = new Client({ name: "outray-integration", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
      clients.push(client);
      return { client, tokens, resource, clientId: registration.client_id, tokenBody };
    }

    await t.test("discovery and unauthenticated challenges identify the exact resource", async () => {
      const discovery = await originalFetch(`${origin}/.well-known/oauth-protected-resource/api/mcp/openai`);
      const metadata = await discovery.json(); assert.equal(metadata.resource, `${origin}/api/mcp/openai`);
      assert.equal(metadata.scopes_supported.includes("outray:secrets:values"), false);
      const issuerResponse = await originalFetch(`${origin}/.well-known/oauth-authorization-server/api/auth`);
      assert.equal(issuerResponse.status, 200, "path-aware authorization-server discovery");
      const issuer = await issuerResponse.json(); assert.equal(issuer.issuer, `${origin}/api/auth`);
      assert.equal(issuer.token_endpoint, `${origin}/api/auth/oauth2/token`); assert.ok(issuer.code_challenge_methods_supported.includes("S256"));
      assert.equal(issuer.revocation_endpoint, `${origin}/api/auth/oauth2/revoke`);
      const oidcResponse = await originalFetch(`${origin}/.well-known/openid-configuration/api/auth`);
      assert.equal(oidcResponse.status, 200, "path-aware OpenID discovery");
      const canonicalOidc = await originalFetch(`${origin}/api/auth/.well-known/openid-configuration`);
      assert.equal(canonicalOidc.status, 200); assert.equal((await canonicalOidc.json()).issuer, `${origin}/api/auth`);
      const unauthorized = await originalFetch(`${origin}/api/mcp/openai`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
      assert.equal(unauthorized.status, 401); assert.match(unauthorized.headers.get("www-authenticate") || "", /resource_metadata/);
    });
    await t.test("connected-app links open personal settings without requiring an organization", async () => {
      const signedOut = await originalFetch(`${origin}/plugins/connections`, { redirect: "manual" });
      assert.equal(signedOut.status, 302);
      const login = new URL(signedOut.headers.get("location")!);
      assert.equal(login.pathname, "/login"); assert.equal(login.searchParams.get("redirect"), "/plugins/connections");
      assert.equal(signedOut.headers.get("cache-control"), "no-store");
      const active = await originalFetch(`${origin}/plugins/connections`, { headers: { cookie }, redirect: "manual" });
      assert.equal(active.status, 302); assert.equal(new URL(active.headers.get("location")!).pathname, "/account/settings/connected-apps");
      const memberships = await db.select().from(members).where(eq(members.userId, userId));
      try {
        await db.delete(members).where(eq(members.userId, userId));
        const fallback = await originalFetch(`${origin}/plugins/connections`, { headers: { cookie }, redirect: "manual" });
        assert.equal(fallback.status, 302); assert.equal(new URL(fallback.headers.get("location")!).pathname, "/account/settings/connected-apps", "personal connection management stays reachable without memberships");
      } finally {
        await db.insert(members).values(memberships);
      }
    });
    await t.test("fresh browser sign-in resumes authorization and reaches organization consent", async () => {
      for (const mode of ["single", "repeated"] as const) {
        const { oauthQuery } = await startConnection("openai", mode, undefined, false);
        const url = `${origin}/plugins/continue?${oauthQuery}`;
        const signedOut = await originalFetch(url, { redirect: "manual" });
        assert.equal(signedOut.status, 401, "a valid signed request still requires a browser session");
        const resumed = await originalFetch(url, { headers: { cookie, "sec-fetch-mode": "navigate" }, redirect: "manual" });
        assert.equal(resumed.status, 302, "completed sign-in resumes the provider's authorization flow");
        assert.equal(resumed.headers.get("cache-control"), "no-store");
        const consent = new URL(resumed.headers.get("location")!, origin);
        assert.equal(consent.pathname, "/plugins/authorize");
        const preview = await originalFetch(`${origin}/api/mcp/consent?${new URLSearchParams({ oauth_query: consent.search.slice(1) })}`, { headers: { cookie } });
        assert.equal(preview.status, 200, "the resumed signed query can preview organization selection");
        const changed = await originalFetch(`${url}&scope=outray:secrets:values`, { headers: { cookie }, redirect: "manual" });
        assert.equal(changed.status, 400, "continuation cannot bypass signed scope validation");
      }
    });
    await t.test("invalid PKCE proofs are refused", async () => {
      await assert.rejects(connect("openai", true), /Invalid PKCE rejected/);
    });
    await t.test("identical resource indicators work through consent, exchange and refresh", async () => {
      const repeated = await connect("openai", false, true);
      const result = await repeated.client.callTool({ name: "list_organizations", arguments: {} });
      assert.notEqual(result.isError, true);
      const refreshBody = new URLSearchParams({ grant_type: "refresh_token", refresh_token: repeated.tokens.refresh_token, client_id: repeated.clientId, resource: repeated.resource });
      refreshBody.append("resource", repeated.resource);
      const refresh = await originalFetch(`${origin}/api/auth/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: refreshBody });
      assert.equal(refresh.status, 200, "repeated identical resources retain the connection binding on refresh");
      const tokens = await refresh.json();
      const wrongAudience = await originalFetch(`${origin}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" }, body: "{}" });
      assert.equal(wrongAudience.status, 401, "deduplication does not grant access to the other catalog");
    });
    await t.test("distinct or missing resource indicators cannot create a connection", async () => {
      for (const mode of ["multiple", "missing"] as const) {
        const { oauthQuery, registration } = await startConnection("openai", mode);
        const preview = await originalFetch(`${origin}/api/mcp/consent?${new URLSearchParams({ oauth_query: oauthQuery })}`, { headers: { cookie } });
        assert.equal(preview.status, 400, `${mode} resources are refused in the consent preview`);
        const consent = await originalFetch(`${origin}/api/mcp/consent`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ oauth_query: oauthQuery, organizationIds: [orgId], accept: true }) });
        assert.equal(consent.status, 400, `${mode} resources are refused on submission`);
        assert.equal(await db.query.mcpConnections.findFirst({ where: eq(mcpConnections.clientId, registration.client_id) }), undefined);
      }
    });
    await t.test("public consent refuses direct-only secret permissions", async () => {
      const { oauthQuery, registration } = await startConnection("openai", "repeated", "outray:secrets:values");
      const preview = await originalFetch(`${origin}/api/mcp/consent?${new URLSearchParams({ oauth_query: oauthQuery })}`, { headers: { cookie } });
      assert.equal(preview.status, 400);
      assert.equal((await preview.json()).error, "This connection requests unsupported permissions");
      const consent = await originalFetch(`${origin}/api/mcp/consent`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ oauth_query: oauthQuery, organizationIds: [orgId], accept: true }) });
      assert.equal(consent.status, 400);
      assert.equal(await db.query.mcpConnections.findFirst({ where: eq(mcpConnections.clientId, registration.client_id) }), undefined);
    });
    const publicConnection = await connect("openai");
    const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
      const response = await client.callTool({ name, arguments: args });
      assert.notEqual(response.isError, true, `${name} succeeds: ${JSON.stringify(response.structuredContent)}`);
      return (response.structuredContent as { result: any }).result;
    };
    await t.test("selected organizations, product mutations and changed roles are enforced", async () => {
      const list = await call(publicConnection.client, "list_organizations"); assert.deepEqual(list.organizations.map((org: { slug: string }) => org.slug), ["mcp-demo"]);
      assert.equal((await publicConnection.client.callTool({ name: "list_tunnels", arguments: { orgSlug: "unselected" } })).isError, true);
      assert.deepEqual((await call(publicConnection.client, "list_tunnels", { orgSlug: "mcp-demo" })).tunnels, []);
      await call(publicConnection.client, "create_vault", { orgSlug: "mcp-demo", name: "Demo", slug: "demo" });
      const vault = await call(publicConnection.client, "get_vault", { orgSlug: "mcp-demo", vaultSlug: "demo" }); assert.ok(vault.environments.some((env: { slug: string }) => env.slug === "development"));
      const monitor = await call(publicConnection.client, "create_monitor", { orgSlug: "mcp-demo", name: "Review endpoint", url: "https://example.com", enabled: false }); assert.equal(monitor.monitor.enabled, false);
      await call(publicConnection.client, "delete_monitor", { orgSlug: "mcp-demo", monitorId: monitor.monitor.id });
      await db.update(members).set({ role: "member" }).where(eq(members.id, memberId));
      const denied = await publicConnection.client.callTool({ name: "create_vault", arguments: { orgSlug: "mcp-demo", name: "Denied" } }); assert.equal(denied.isError, true);
      await db.update(members).set({ role: "owner" }).where(eq(members.id, memberId));
    });
    await t.test("organization, alert, billing and quota operations preserve product policy", async () => {
      const args = { orgSlug: "mcp-demo" };
      assert.equal((await call(publicConnection.client, "get_billing_link", args)).url, `${origin}/mcp-demo/billing`);
      const membership = await call(publicConnection.client, "list_members", args); assert.equal(membership.members.length, 1);
      await call(publicConnection.client, "update_organization", { ...args, name: "Updated MCP Demo" });
      await call(publicConnection.client, "update_organization", { ...args, name: "MCP Demo" });
      const quota = await publicConnection.client.callTool({ name: "create_vault", arguments: { ...args, name: "Over allowance", slug: "another" } });
      assert.equal(quota.isError, true); assert.doesNotMatch(JSON.stringify(quota), /checkout|upgrade|pricing|subscription|Free|Ray|Beam|Pulse/);
      const memberQuota = await publicConnection.client.callTool({ name: "invite_member", arguments: { ...args, email: "no-capacity@example.test", role: "member" } });
      assert.equal(memberQuota.isError, true); assert.equal((memberQuota.structuredContent as any).error.status, 403);
      assert.doesNotMatch(JSON.stringify(memberQuota), /plan|upgrade|pricing|subscription/i);
      const { subscriptions } = await import("../src/db/subscription-schema");
      await db.insert(subscriptions).values({ id: crypto.randomUUID(), organizationId: orgId, plan: "beam" });
      const invited = await call(publicConnection.client, "invite_member", { ...args, email: "invited-test@example.test", role: "member" });
      await call(publicConnection.client, "cancel_invitation", { ...args, invitationId: invited.invitation.id });
      const lastOwner = await publicConnection.client.callTool({ name: "remove_member", arguments: { ...args, memberId } });
      assert.equal(lastOwner.isError, true); assert.equal((lastOwner.structuredContent as any).error.code, "LAST_OWNER");
      const alert = await call(publicConnection.client, "create_alert", { ...args, name: "Demo errors", service: "demo-service", signal: "request_error_rate", operator: "gt", threshold: 5, enabled: false });
      await call(publicConnection.client, "get_alert", { ...args, alertId: alert.alert.id });
      await call(publicConnection.client, "update_alert", { ...args, alertId: alert.alert.id, name: "Demo error rate" });
      await call(publicConnection.client, "delete_alert", { ...args, alertId: alert.alert.id });
      const unavailable = await publicConnection.client.callTool({ name: "list_services", arguments: { ...args, range: "1h" } });
      assert.equal(unavailable.isError, true); assert.doesNotMatch(JSON.stringify(unavailable), /TINYBIRD|stack|checkout|upgrade/);
    });
    const direct = await connect("direct");
    await t.test("review fixtures are isolated, repeatable and leave publication paused", async () => {
      const { prepareMcpReview } = await import("../src/lib/mcp/review-fixtures");
      const prepared = await prepareMcpReview("isolated-review@example.test");
      const repeated = await prepareMcpReview("isolated-review@example.test");
      assert.equal(prepared.pageId, repeated.pageId); assert.equal(prepared.monitorId, repeated.monitorId);
      const { uptimeMonitors, uptimeStatusPages, uptimeIncidentUpdates } = await import("../src/db/uptime-schema");
      const [monitor] = await db.select().from(uptimeMonitors).where(eq(uptimeMonitors.id, prepared.monitorId));
      const [page] = await db.select().from(uptimeStatusPages).where(eq(uptimeStatusPages.id, prepared.pageId));
      assert.equal(monitor.enabled, false); assert.equal(page.published, false);
      const updates = await db.select().from(uptimeIncidentUpdates).where(eq(uptimeIncidentUpdates.organizationId, page.organizationId));
      assert.ok(updates.length > 0 && updates.every((update) => update.publishedAt === null));
      await assert.rejects(prepareMcpReview("mcp-test@example.test"), /dedicated reviewer/);
    });
    await t.test("direct secrets work while public calls never expose values", async () => {
      const target = { orgSlug: "mcp-demo", vaultSlug: "demo", environmentSlug: "development" };
      const revision = await call(direct.client, "get_environment_revision", target);
      const created = await call(direct.client, "create_secret", { ...target, key: "DEMO_KEY", value: "dummy-value-not-a-real-credential", expectedRevision: revision.revision });
      const secretId = created.secret.id;
      const revealed = await call(direct.client, "reveal_secret", { ...target, secretId, intent: "reveal" });
      assert.match(JSON.stringify(revealed), /dummy-value-not-a-real-credential/);
      const metadata = await call(publicConnection.client, "list_secrets", target); assert.doesNotMatch(JSON.stringify(metadata), /dummy-value/);
      await assert.rejects(publicConnection.client.callTool({ name: "reveal_secret", arguments: { ...target, secretId, intent: "reveal" } }), /not found/);
      const wrongAudience = await originalFetch(`${origin}/api/mcp/openai`, { method: "POST", headers: { authorization: `Bearer ${direct.tokens.access_token}`, "content-type": "application/json" }, body: "{}" });
      assert.equal(wrongAudience.status, 401);
    });
    if (process.env.MCP_TEST_PRODUCTION === "1") await t.test("the production bundle serves discovery, consent, pages and shared product handlers", async () => {
      const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
      const address = socket.address(); assert.ok(address && typeof address === "object");
      await new Promise<void>((done) => socket.close(() => done()));
      const initialOrigin = origin; origin = `http://127.0.0.1:${address.port}`;
      const production = spawn(process.execPath, [".output/server/index.mjs"], { cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "production", APP_URL: origin, PORT: String(address.port), HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
      let diagnostics = ""; production.stdout.on("data", (chunk) => { diagnostics += String(chunk); });
      production.stderr.on("data", (chunk) => { diagnostics += String(chunk); });
      try {
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          try { ready = (await originalFetch(`${origin}/.well-known/oauth-protected-resource/api/mcp/openai`)).status === 200; } catch {}
          if (ready || production.exitCode !== null) break;
          await new Promise((done) => setTimeout(done, 100));
        }
        assert.ok(ready, `production starts: ${diagnostics.slice(-3000)}`);
        const issuerResponse = await originalFetch(`${origin}/.well-known/oauth-authorization-server/api/auth`);
        assert.equal(issuerResponse.status, 200); assert.equal((await issuerResponse.json()).issuer, `${origin}/api/auth`);
        for (const path of ["/plugins/codex", "/privacy", "/terms", "/login"]) {
          const page = await originalFetch(`${origin}${path}`); assert.equal(page.status, 200, `${path} renders`);
          assert.match(await page.text(), /OutRay/);
        }
        const dashboardRedirect = await originalFetch(`${origin}/plugins/connections`, { headers: { cookie }, redirect: "manual" });
        assert.equal(dashboardRedirect.status, 302); assert.equal(new URL(dashboardRedirect.headers.get("location")!).pathname, "/account/settings/connected-apps");
        const dashboard = await originalFetch(`${origin}/account/settings/connected-apps`, { headers: { cookie } });
        assert.equal(dashboard.status, 200); assert.match(await dashboard.text(), /Connected apps/);
        const connected = await connect("openai");
        await call(connected.client, "list_tunnels", { orgSlug: "mcp-demo" });
        const vault = await call(connected.client, "get_vault", { orgSlug: "mcp-demo", vaultSlug: "demo" });
        const privateConnection = await connect("direct");
        const credential = await call(privateConnection.client, "create_credential", { orgSlug: "mcp-demo", name: "Opaque injection check", scopes: ["secrets:read"], expiresIn: "30d",
          projectId: vault.project.id, environmentId: vault.environments.find((env: { slug: string }) => env.slug === "development").id });
        try {
          const { SecretsApiClient } = await import("../../cli/src/secrets-api");
          const { runWithSecretsOnce } = await import("../../cli/src/secrets-run");
          let diagnostic = "";
          const exit = await runWithSecretsOnce({ api: new SecretsApiClient(origin, credential.token),
            target: { organization: "mcp-demo", project: "demo", environment: "development" },
            command: [process.execPath, "-e", "process.exit(process.env.DEMO_KEY && !process.env.OUTRAY_TOKEN && !process.env.OUTRAY_API_KEY ? 0 : 1)"],
            baseEnvironment: { PATH: process.env.PATH, OUTRAY_TOKEN: credential.token }, stderr: { write(chunk: string) { diagnostic += chunk; return true; } } });
          assert.equal(exit, 0, "the child receives the secret without receiving the authentication token");
          assert.doesNotMatch(diagnostic, /dummy-value|outray_|Bearer/);
        } finally { await call(privateConnection.client, "revoke_credential", { orgSlug: "mcp-demo", id: credential.machineToken.id }); }
        const monitor = await call(connected.client, "create_monitor", { orgSlug: "mcp-demo", name: "Production build check", url: "https://example.com", enabled: false });
        await call(connected.client, "delete_monitor", { orgSlug: "mcp-demo", monitorId: monitor.monitor.id });
        if (process.env.MCP_TEST_HOLD_UI === "1") {
          console.log(`Disposable UI preview: ${origin}/plugins/codex`);
          await new Promise((done) => setTimeout(done, 60000));
        }
      } finally {
        origin = initialOrigin; production.kill("SIGTERM");
        if (production.exitCode === null) await once(production, "exit");
      }
    });
    await t.test("OAuth client revocation also disables existing JWT access tokens", async () => {
      const revoked = await originalFetch(`${origin}/api/auth/oauth2/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: publicConnection.tokens.refresh_token, token_type_hint: "refresh_token", client_id: publicConnection.clientId }) });
      assert.equal(revoked.status, 200);
      const response = await originalFetch(publicConnection.resource, { method: "POST", headers: { authorization: `Bearer ${publicConnection.tokens.access_token}`, "content-type": "application/json" }, body: "{}" });
      assert.equal(response.status, 401);
    });
    await t.test("refresh rotates access and revoked generations fail immediately", async () => {
      const refreshed = await originalFetch(`${origin}/api/auth/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: direct.tokens.refresh_token, client_id: direct.clientId, resource: direct.resource }) });
      assert.equal(refreshed.status, 200);
      const rotatedTokens = await refreshed.json(); assert.ok(rotatedTokens.refresh_token);
      const connection = await db.query.mcpConnections.findFirst({ where: eq(mcpConnections.clientId, direct.clientId) }); assert.ok(connection);
      const revoked = await originalFetch(`${origin}/api/mcp/connections`, { method: "DELETE", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ id: connection.id }) }); assert.equal(revoked.status, 200);
      const denied = await originalFetch(direct.resource, { method: "POST", headers: { authorization: `Bearer ${direct.tokens.access_token}`, "content-type": "application/json" }, body: "{}" }); assert.equal(denied.status, 401);
      const oldRefresh = await originalFetch(`${origin}/api/auth/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: direct.tokens.refresh_token, client_id: direct.clientId, resource: direct.resource }) }); assert.notEqual(oldRefresh.status, 200);
      const rotatedRefresh = await originalFetch(`${origin}/api/auth/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rotatedTokens.refresh_token, client_id: direct.clientId, resource: direct.resource }) }); assert.notEqual(rotatedRefresh.status, 200);
      const { cleanupMcpActivity } = await import("../../../shared/mcp-activity");
      const publicRow = await db.query.mcpConnections.findFirst({ where: eq(mcpConnections.clientId, publicConnection.clientId) }); assert.ok(publicRow);
      const oldId = crypto.randomUUID();
      await db.insert(mcpActivity).values({ id: oldId, userId, connectionId: publicRow.id, tool: "list_organizations", resourceIds: {}, outcome: "success", createdAt: new Date(Date.now() - 91 * 86400000) });
      await cleanupMcpActivity(pool);
      assert.equal((await db.select().from(mcpActivity).where(eq(mcpActivity.id, oldId))).length, 0, "activity expires after 90 days");
      const activity = await db.select().from(mcpActivity);
      assert.ok(activity.length > 0); assert.doesNotMatch(JSON.stringify(activity), /dummy-value|DEMO_KEY|example\.com|email|arguments|result/);
      assert.ok(activity.some((entry) => entry.tool === "create_secret" && entry.resourceIds.projectId && entry.resourceIds.environmentId));
    });
  } finally {
    await cleanup();
  }
});
