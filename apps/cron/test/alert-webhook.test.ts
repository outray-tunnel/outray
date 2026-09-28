import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOrganizationKey,
  encryptAlertWebhook,
  wrapOrganizationKey,
} from "../../web/src/lib/secrets/crypto";
import {
  decryptAlertWebhook,
  unwrapAlertOrganizationKey,
} from "../src/lib/alert-webhook-crypto";
import { sendAlertWebhook } from "../src/lib/alert-webhook";

test("cron can unwrap and decrypt web-created alert destinations", () => {
  const previousId = process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID;
  const previousValue = process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY;
  const master = Buffer.alloc(32, 0x42);
  process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID = "test-key";
  process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY = master.toString("base64");
  try {
    const organizationKey = createOrganizationKey();
    const wrapped = wrapOrganizationKey("org-1", 1, organizationKey, {
      id: "test-key",
      key: master,
    });
    const decryptedKey = unwrapAlertOrganizationKey("org-1", 1, {
      wrapped_key: wrapped.ciphertext,
      iv: wrapped.iv,
      auth_tag: wrapped.authTag,
      wrapping_key_id: wrapped.wrappingKeyId,
    });
    const encrypted = encryptAlertWebhook(organizationKey, {
      organizationId: "org-1",
      alertId: "alert-1",
      channel: "discord",
      organizationKeyVersion: 1,
      url: "https://discord.com/api/webhooks/123/token",
    });
    assert.equal(
      decryptAlertWebhook(decryptedKey, "org-1", "alert-1", "discord", encrypted),
      "https://discord.com/api/webhooks/123/token",
    );
    assert.throws(() =>
      decryptAlertWebhook(decryptedKey, "org-1", "alert-2", "discord", encrypted),
    );
    decryptedKey.fill(0);
  } finally {
    if (previousId === undefined) delete process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID;
    else process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID = previousId;
    if (previousValue === undefined) delete process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY;
    else process.env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY = previousValue;
  }
});

test("Discord webhook delivery disables mentions and waits for confirmation", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; body: Record<string, unknown>; redirect: string } | null = null;
  globalThis.fetch = async (input, init) => {
    captured = {
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      redirect: String(init?.redirect),
    };
    return new Response(null, { status: 200 });
  };
  try {
    await sendAlertWebhook(
      "discord",
      "https://discord.com/api/webhooks/123/token",
      {
        alertId: "alert-1",
        alertName: "@everyone latency",
        organizationSlug: "acme",
        service: "api",
        signal: "request_latency_p95",
        state: "firing",
        value: 800,
        threshold: 750,
        incidentStartedAt: "2026-09-28T00:00:00.000Z",
      },
    );
    assert.equal(captured?.url, "https://discord.com/api/webhooks/123/token?wait=true");
    assert.deepEqual(captured?.body.allowed_mentions, { parse: [] });
    assert.equal(captured?.redirect, "manual");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Slack webhook delivery escapes channel mentions and never follows redirects", async () => {
  const originalFetch = globalThis.fetch;
  let body: { text: string } | null = null;
  let redirect: string | undefined;
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as { text: string };
    redirect = init?.redirect;
    return new Response(null, { status: 200 });
  };
  try {
    await sendAlertWebhook(
      "slack",
      "https://hooks.slack.com/services/T/B/token",
      {
        alertId: "alert-1",
        alertName: "<!channel> outage @here",
        service: "api",
        signal: "request_error_rate",
        state: "firing",
        value: 9,
        threshold: 5,
        incidentStartedAt: "2026-09-28T00:00:00.000Z",
      },
    );
    assert.equal(body?.text.includes("<!channel>"), false);
    assert.equal(body?.text.includes("@here"), false);
    assert.equal(redirect, "manual");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
