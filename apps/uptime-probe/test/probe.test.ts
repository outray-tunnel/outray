import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import test from "node:test";
import {
  isPublicIp,
  pinnedRequestOptions,
  probeHttp,
  validateHeaders,
  validatePublicUrl,
} from "../src/probe";
import { effectiveMonitorState, transitionMonitor } from "../src/state";
import { assertWorkerStartupPolicy, validDashboardUrl } from "../src/worker";
import { makeUnsubscribeToken, publicStatusPageUrl, subscriberEmailHtml, validWebhookUrl } from "../src/notifications";
import { verifyUnsubscribeToken } from "../../status/src/lib/security";
import { decryptIntegrationWebhook, decryptMonitorHeaders } from "../src/crypto";
import {
  createOrganizationKey, encryptUptimeHeaders, encryptUptimeWebhook,
  wrapOrganizationKey,
} from "../../web/src/lib/secrets/crypto";

test("subscriber email renders the stored published body with safe links", () => {
  const html = subscriberEmailHtml({ title: "API <issue>", status: "monitoring", note: "payload fallback" },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Read more", marks: [{ type: "link", attrs: { href: "https://outray.dev/help" } }] }] }] },
    "stored text", "https://status.outray.app", "https://status.outray.app/unsubscribe?token=test");
  assert.match(html, /API &lt;issue&gt;/);
  assert.match(html, /href="https:\/\/outray.dev\/help"/);
  assert.doesNotMatch(html, /payload fallback/);
  const legacy = subscriberEmailHtml({ title: "Legacy", status: "investigating", note: "payload" }, null, "Stored <text>", "https://status.outray.app", "https://status.outray.app/unsubscribe");
  assert.match(legacy, /Stored &lt;text&gt;/);
});
import type pg from "pg";

test("rejects private, special-use and mapped IP addresses", () => {
  for (const address of [
    "127.0.0.1", "10.2.3.4", "172.16.1.1", "192.168.1.2",
    "169.254.169.254", "100.64.0.1", "198.18.1.1", "192.0.2.5",
    "0.0.0.0", "255.255.255.255", "::1", "fc00::1", "fe80::1",
    "::ffff:127.0.0.1", "2001:db8::1", "2002:c0a8:0101::1",
  ]) assert.equal(isPublicIp(address), false, address);
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
});

test("rejects parser tricks, credentials, internal names and nonstandard ports", () => {
  for (const value of [
    "http://127.0.0.1/", "http://2130706433/", "http://0x7f000001/",
    "http://[::ffff:127.0.0.1]/", "http://user:password@example.com/",
    "http://example.com:8080/", "https://example.com:80/",
    "file:///etc/passwd", "http://service.local/", "http://example.com\\@127.0.0.1/",
    "http://example.com/#fragment", "http://example.com\n.internal/",
  ]) assert.throws(() => validatePublicUrl(value), value);
  assert.equal(validatePublicUrl("https://example.com/path?query=yes").hostname, "example.com");
});

test("rejects unsafe request headers and control characters", () => {
  for (const headers of [
    { Host: "example.org" }, { Connection: "keep-alive" },
    { "X-Forwarded-For": "127.0.0.1" }, { "Proxy-Authorization": "secret" },
    { Cookie: "a\r\nHost: internal" }, { "Bad Name": "value" },
    { "X-Too-Large": "a".repeat(9_000) },
  ] as Record<string, string>[]) assert.throws(() => validateHeaders(headers));
  assert.deepEqual(validateHeaders({ Authorization: "Bearer secret", "X-Key": "abc" }),
    { Authorization: "Bearer secret", "X-Key": "abc" });
});

test("rejects a DNS answer set containing a private address before connecting", async () => {
  const result = await probeHttp({
    url: "https://example.com/", method: "GET", headers: {},
    expectedStatus: null, responseText: null,
  }, { resolve: async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.4", family: 4 },
  ] });
  assert.equal(result.errorKind, "unsafe_dns");
  assert.equal(result.statusCode, null);
});

test("socket lookup uses the vetted IP while Host and TLS retain the original name", () => {
  const options = pinnedRequestOptions(new URL("https://monitor.example.com/check"),
    "GET", { Authorization: "Bearer private" }, { address: "8.8.8.8", family: 4 },
    new AbortController().signal);
  assert.equal(options.hostname, "monitor.example.com");
  assert.equal(options.servername, "monitor.example.com");
  assert.equal(options.path, "/check");
  assert.equal((options.headers as Record<string, string>).Authorization, "Bearer private");
  let returned: string | undefined;
  options.lookup?.("monitor.example.com", {}, (_error, address) => {
    returned = typeof address === "string" ? address : address[0]?.address;
  });
  assert.equal(returned, "8.8.8.8");

  let returnedAll: unknown;
  options.lookup?.("monitor.example.com", { all: true }, (_error, addresses) => {
    returnedAll = addresses;
  });
  assert.deepEqual(returnedAll, [{ address: "8.8.8.8", family: 4 }]);
});

test("pinned lookup completes a real Node request with auto-family selection", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200);
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const options = pinnedRequestOptions(
      new URL(`http://monitor.example.com:${address.port}/health`),
      "GET",
      {},
      { address: "127.0.0.1", family: 4 },
      new AbortController().signal,
    );
    const status = await new Promise<number>((resolve, reject) => {
      const outbound = request(options, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      });
      outbound.once("error", reject);
      outbound.setTimeout(2_000, () => outbound.destroy(new Error("test request timed out")));
      outbound.end();
    });
    assert.equal(status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("monitor transitions confirm outage and recovery with two observations", () => {
  const first = transitionMonitor("unknown", 0, 0, true);
  assert.equal(first.state, "up");
  const failOne = transitionMonitor(first.state, first.failureStreak, first.successStreak, false);
  assert.equal(failOne.state, "up");
  assert.equal(failOne.incidentAction, null);
  const failTwo = transitionMonitor(failOne.state, failOne.failureStreak, failOne.successStreak, false);
  assert.equal(failTwo.state, "down");
  assert.equal(failTwo.incidentAction, "open");
  const successOne = transitionMonitor(failTwo.state, failTwo.failureStreak, failTwo.successStreak, true);
  assert.equal(successOne.state, "down");
  const successTwo = transitionMonitor(successOne.state, successOne.failureStreak, successOne.successStreak, true);
  assert.equal(successTwo.state, "up");
  assert.equal(successTwo.incidentAction, "resolve");
});

test("a configurable failure threshold delays Down without changing recovery", () => {
  const first = transitionMonitor("up", 0, 0, false, 3);
  const second = transitionMonitor(first.state, first.failureStreak, first.successStreak, false, 3);
  assert.equal(second.state, "up");
  assert.equal(second.incidentAction, null);
  const third = transitionMonitor(second.state, second.failureStreak, second.successStreak, false, 3);
  assert.equal(third.state, "down");
  assert.equal(third.incidentAction, "open");
  assert.equal(transitionMonitor("down", third.failureStreak, 0, true, 3).state, "down");
});

test("missing and stale evidence is Unknown", () => {
  const now = new Date("2026-09-29T12:00:00.000Z");
  assert.equal(effectiveMonitorState("up", null, now), "unknown");
  assert.equal(effectiveMonitorState("up", new Date("2026-09-29T11:56:59.000Z"), now), "unknown");
  assert.equal(effectiveMonitorState("up", new Date("2026-09-29T11:59:00.000Z"), now), "up");
});

test("outbound links and webhook destinations remain explicit and provider-scoped", () => {
  assert.equal(validDashboardUrl("https://outray.co"), true);
  assert.equal(validDashboardUrl("http://localhost:6767"), false);
  assert.equal(validDashboardUrl("https://localhost:6767"), false);
  assert.equal(validDashboardUrl("https://outray.co/extra"), false);
  assert.ok(validWebhookUrl("https://hooks.slack.com/services/T/B/token", "slack"));
  assert.throws(() => validWebhookUrl("https://example.com/services/T/B/token", "slack"));
  assert.throws(() => validWebhookUrl("https://discord.com.evil.test/api/webhooks/1/x", "discord"));
});

test("production probe startup fails closed without verified egress policy", () => {
  assert.throws(() => assertWorkerStartupPolicy({
    production: true, probesEnabled: true, egressPolicyReady: false,
  }), /verified egress policy/);
  assert.doesNotThrow(() => assertWorkerStartupPolicy({
    production: true, probesEnabled: true, egressPolicyReady: true,
  }));
  assert.doesNotThrow(() => assertWorkerStartupPolicy({
    production: true, probesEnabled: false, egressPolicyReady: false,
  }));
  assert.doesNotThrow(() => assertWorkerStartupPolicy({
    production: false, probesEnabled: true, egressPolicyReady: false,
  }));
});

test("subscriber unsubscribe links verify in the public status service", () => {
  process.env.UPTIME_UNSUBSCRIBE_SECRET = "test-secret-with-at-least-32-bytes";
  const token = makeUnsubscribeToken("sub-123", "page-456", Date.now() + 60_000,
    process.env.UPTIME_UNSUBSCRIBE_SECRET);
  assert.deepEqual(verifyUnsubscribeToken(token),
    { subscriberId: "sub-123", pageId: "page-456" });
  assert.equal(verifyUnsubscribeToken(`${token}tampered`), null);
});

test("subscriber links use the status page subdomain", () => {
  assert.equal(publicStatusPageUrl("byteship", "https://status.outray.app"),
    "https://byteship.status.outray.app/");
  assert.throws(() => publicStatusPageUrl("bad.slug", "https://status.outray.app"),
    /invalid_page_slug/);
});

test("probe decrypts web-encrypted monitor headers and integrations", async () => {
  const master = Buffer.alloc(32, 7);
  const orgKey = createOrganizationKey();
  process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID = "test-v1";
  process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY = master.toString("base64");
  const wrapped = wrapOrganizationKey("org-1", 1, orgKey, { id: "test-v1", key: master });
  const fakePool = {
    query: async () => ({ rows: [{ wrapped_key: wrapped.ciphertext,
      iv: wrapped.iv, auth_tag: wrapped.authTag, wrapping_key_id: wrapped.wrappingKeyId }] }),
  } as unknown as pg.Pool;
  const headers = encryptUptimeHeaders(orgKey, { organizationId: "org-1",
    monitorId: "mon-1", organizationKeyVersion: 1,
    headers: { Authorization: "Bearer not-logged" } });
  assert.deepEqual(await decryptMonitorHeaders(fakePool, "org-1", "mon-1", headers),
    { Authorization: "Bearer not-logged" });
  await assert.rejects(decryptMonitorHeaders(fakePool, "org-1", "mon-2", headers));
  const webhook = encryptUptimeWebhook(orgKey, { organizationId: "org-1",
    channel: "slack", organizationKeyVersion: 1,
    url: "https://hooks.slack.com/services/T/B/token" });
  assert.equal(await decryptIntegrationWebhook(fakePool, "org-1", "slack", webhook),
    "https://hooks.slack.com/services/T/B/token");
  await assert.rejects(decryptIntegrationWebhook(fakePool, "org-1", "discord", webhook));
  orgKey.fill(0);
  master.fill(0);
});
