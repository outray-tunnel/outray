import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUptimeOAuthState,
  dashboardBaseUrl,
  uptimeOAuthCallbackUrl,
  uptimeIntegrationReturnUrl,
  verifyUptimeOAuthState,
} from "../src/lib/uptime/oauth";

test("Uptime OAuth cookie is signed and organization-scoped", () => {
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = "u".repeat(32);
  try {
    const state = createUptimeOAuthState({
      organizationId: "org-1", orgSlug: "acme", provider: "slack", userId: "user-1",
    }, true);
    const request = new Request("https://dash.outray.dev/callback", {
      headers: { cookie: state.cookie.split(";")[0] },
    });
    assert.equal(verifyUptimeOAuthState(request, "slack", state.nonce)?.organizationId, "org-1");
    assert.equal(verifyUptimeOAuthState(request, "discord", state.nonce), null);
    assert.equal(verifyUptimeOAuthState(request, "slack", "wrong"), null);
    assert.match(state.cookie, /HttpOnly; SameSite=Lax/);
    assert.match(state.cookie, /; Secure/);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  }
});

test("Uptime OAuth returns every outcome to Notifications without leaking callback state", () => {
  const previous = process.env.OUTRAY_DASHBOARD_URL;
  process.env.OUTRAY_DASHBOARD_URL = "https://dash.outray.dev/old?state=secret#fragment";
  try {
    for (const result of ["connected", "cancelled", "failed"]) {
      const destination = uptimeIntegrationReturnUrl("acme team", result);
      assert.equal(destination.origin, "https://dash.outray.dev");
      assert.equal(destination.pathname, "/acme%20team/uptime/notifications");
      assert.equal(destination.search, `?integration=${result}`);
      assert.equal(destination.hash, "");
    }
  } finally {
    if (previous === undefined) delete process.env.OUTRAY_DASHBOARD_URL;
    else process.env.OUTRAY_DASHBOARD_URL = previous;
  }
});

test("production Uptime callback requires explicit HTTPS dashboard origin", () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    dashboard: process.env.OUTRAY_DASHBOARD_URL,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.OUTRAY_DASHBOARD_URL;
    assert.throws(() => dashboardBaseUrl(), /OUTRAY_DASHBOARD_URL/);
    process.env.OUTRAY_DASHBOARD_URL = "https://dash.outray.dev";
    assert.equal(uptimeOAuthCallbackUrl("slack").pathname, "/api/uptime/integrations/slack/callback");
    assert.equal(uptimeOAuthCallbackUrl("slack").origin, "https://dash.outray.dev");
  } finally {
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.dashboard === undefined) delete process.env.OUTRAY_DASHBOARD_URL;
    else process.env.OUTRAY_DASHBOARD_URL = original.dashboard;
  }
});
