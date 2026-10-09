import assert from "node:assert/strict";
import test from "node:test";
import emailConfig from "../../../shared/email-sender";

test("hosted email preserves its existing sender and per-product name", () => {
  assert.deepEqual(emailConfig.emailSender("OutRay Uptime", {}), { address: "no-reply@outray.dev", name: "OutRay Uptime" });
});

test("a self-hosted delivery requires its own verified sender configuration", () => {
  assert.throws(() => emailConfig.emailSender("OutRay", { OUTRAY_DEPLOYMENT_MODE: "self-hosted" }), /verified ZEPTO_FROM_EMAIL/);
  assert.deepEqual(emailConfig.emailSender("OutRay", { OUTRAY_DEPLOYMENT_MODE: "self-hosted", ZEPTO_FROM_EMAIL: "notify@example.net", ZEPTO_FROM_NAME: "Ops" }), { address: "notify@example.net", name: "Ops" });
});

test("invalid sender configuration is rejected without exposing its value", () => {
  const value = "private-invalid-sender";
  assert.throws(() => emailConfig.emailSender("OutRay", { ZEPTO_FROM_EMAIL: value }), (error: unknown) => error instanceof Error && !error.message.includes(value));
});
