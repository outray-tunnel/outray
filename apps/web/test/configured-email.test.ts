import assert from "node:assert/strict";
import test from "node:test";
import { sendViaZepto } from "../src/lib/send-email";

async function withEnvironment(values: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { await run(); }
  finally { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

const message = { recipientEmail: "recipient@example.net", subject: "Test invitation", htmlString: "<p>Test only</p>" };

test("self-hosted invitations use the configured sender without hosted identity fallback", async (context) => {
  let body: { from: { address: string; name: string } } | undefined;
  context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    body = JSON.parse(String(options.body)); return new Response(null, { status: 204 });
  });
  await withEnvironment({ OUTRAY_DEPLOYMENT_MODE: "self-hosted", ZEPTO_API_KEY: "test-provider-key", ZEPTO_FROM_EMAIL: "notify@example.net", ZEPTO_FROM_NAME: "Internal Ops" }, async () => {
    await sendViaZepto(message);
    assert.deepEqual(body?.from, { address: "notify@example.net", name: "Internal Ops" });
  });
});

test("missing self-hosted sender or provider key rejects before contacting any provider", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => { throw new Error("Must not send"); });
  await withEnvironment({ OUTRAY_DEPLOYMENT_MODE: "self-hosted", ZEPTO_API_KEY: "test-provider-key", ZEPTO_FROM_EMAIL: undefined }, async () => {
    await assert.rejects(sendViaZepto(message), /ZEPTO_FROM_EMAIL/);
  });
  await withEnvironment({ OUTRAY_DEPLOYMENT_MODE: "self-hosted", ZEPTO_API_KEY: undefined, ZEPTO_FROM_EMAIL: "notify@example.net" }, async () => {
    await assert.rejects(sendViaZepto(message), /not configured/);
  });
  assert.equal(fetch.mock.callCount(), 0);
});

test("hosted email defaults and explicit sender overrides remain compatible", async (context) => {
  const senders: Array<{ address: string; name: string }> = [];
  context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    senders.push(JSON.parse(String(options.body)).from); return new Response(null, { status: 204 });
  });
  await withEnvironment({ OUTRAY_DEPLOYMENT_MODE: "hosted", ZEPTO_API_KEY: "test-provider-key", ZEPTO_FROM_EMAIL: undefined, ZEPTO_FROM_NAME: undefined }, async () => {
    await sendViaZepto(message);
    await sendViaZepto({ ...message, senderEmail: "Support <support@example.net>", senderName: "Support" });
  });
  assert.deepEqual(senders, [{ address: "no-reply@outray.dev", name: "OutRay" }, { address: "support@example.net", name: "Support" }]);
});
