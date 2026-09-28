import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertOAuthAuthorizeUrl,
  alertOAuthCallbackUrl,
  createAlertOAuthState,
  exchangeAlertOAuthCode,
  verifyAlertOAuthState,
} from "../src/lib/observability/alert-oauth";

test("OAuth state binds the provider and alert to a signed browser cookie", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = "a".repeat(32);
  try {
    const pending = createAlertOAuthState({
      organizationId: "org-1",
      orgSlug: "acme",
      alertId: "alert-1",
      provider: "slack",
      userId: "user-1",
      secure: true,
    });
    const cookie = pending.cookie.split(";")[0];
    const request = new Request("https://outray.test/callback", { headers: { cookie } });
    assert.equal(verifyAlertOAuthState(request, "slack", pending.state)?.alertId, "alert-1");
    assert.equal(verifyAlertOAuthState(request, "discord", pending.state), null);
    assert.equal(verifyAlertOAuthState(request, "slack", "wrong"), null);
    assert.match(pending.cookie, /HttpOnly; SameSite=Lax/);
    assert.match(pending.cookie, /; Secure/);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});

test("provider authorization uses fixed callbacks and channel-picker scopes", () => {
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://beta.outray.dev";
  try {
    const slackCallback = alertOAuthCallbackUrl("slack");
    assert.equal(slackCallback.pathname, "/api/observability/alerts/integrations/slack/callback");
    const slack = alertOAuthAuthorizeUrl("slack", "client", slackCallback, "nonce");
    assert.equal(slack.searchParams.get("scope"), "incoming-webhook");
    assert.equal(slack.searchParams.get("redirect_uri"), slackCallback.toString());
    const discordCallback = alertOAuthCallbackUrl("discord");
    const discord = alertOAuthAuthorizeUrl("discord", "client", discordCallback, "nonce");
    assert.equal(discord.searchParams.get("scope"), "webhook.incoming");
    assert.equal(discord.searchParams.get("response_type"), "code");
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});

test("Slack and Discord OAuth exchanges only retain selected destinations", async () => {
  const originalFetch = globalThis.fetch;
  const credentials = { clientId: "client", clientSecret: "secret" };
  try {
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.redirect, "manual");
      return Response.json({
        ok: true,
        team: { id: "T123", name: "Engineering" },
        incoming_webhook: {
          url: "https://hooks.slack.com/services/T123/B123/token",
          channel: "#alerts",
          channel_id: "C123",
        },
      });
    };
    const slack = await exchangeAlertOAuthCode("slack", "code", new URL("https://outray.test/callback"), credentials);
    assert.equal(slack.target.channelName, "#alerts");
    assert.equal(slack.target.workspaceName, "Engineering");
    globalThis.fetch = async () => Response.json({
      scope: "webhook.incoming",
      webhook: {
        url: "https://discord.com/api/webhooks/123/token",
        channel_id: "456",
        guild_id: "789",
      },
    });
    const discord = await exchangeAlertOAuthCode("discord", "code", new URL("https://outray.test/callback"), credentials);
    assert.equal(discord.target.channelId, "456");
    assert.equal(discord.target.guildId, "789");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
