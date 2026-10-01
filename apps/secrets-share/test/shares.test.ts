import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { clientRateKey, isShareId, validateShareInput } from "../src/lib/shares";
import { readJsonLimited, RequestTooLarge } from "../src/lib/http";
import { shareConfig } from "../src/lib/config";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    ciphertext: randomBytes(40).toString("base64url"),
    iv: randomBytes(12).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    contentFormat: "text",
    durationValue: 7,
    durationUnit: "days",
    maxViews: 10,
    ...overrides,
  };
}

test("accepts default limits and generates an expiry", () => {
  const before = Date.now();
  const result = validateShareInput(payload());
  assert.equal(result.data.maxViews, 10);
  assert.ok(result.expiresAt.getTime() >= before + 7 * 86_400_000 - 1_000);
  assert.ok(result.expiresAt.getTime() <= before + 7 * 86_400_000 + 1_000);
});

test("supports expiry presets from five minutes to three months", () => {
  const now = Date.now();
  const soon = validateShareInput(payload({ durationValue: 5, durationUnit: "minutes" })).expiresAt.getTime();
  assert.ok(soon >= now + 5 * 60_000 - 1_000 && soon <= now + 5 * 60_000 + 1_000);
  const later = validateShareInput(payload({ durationValue: 3, durationUnit: "months" })).expiresAt.getTime();
  assert.ok(later > now + 89 * 86_400_000);
});

test("rejects invalid limits, format and oversized ciphertext", () => {
  for (const invalid of [
    { maxViews: 0 }, { maxViews: 101 }, { durationValue: 0 }, { durationValue: 91 },
    { durationUnit: "minutes", durationValue: 4 },
    { durationUnit: "months", durationValue: 4 }, { contentFormat: "html" },
    { ciphertext: "a".repeat(355_000) }, { iv: "short" },
    { passwordSalt: randomBytes(16).toString("base64url") },
    { passwordVerifier: randomBytes(32).toString("base64url") },
    { passwordSalt: "bad", passwordVerifier: randomBytes(32).toString("base64url") },
  ]) assert.throws(() => validateShareInput(payload(invalid)));
  assert.doesNotThrow(() => validateShareInput(payload({
    passwordSalt: randomBytes(16).toString("base64url"),
    passwordVerifier: randomBytes(32).toString("base64url"),
  })));
});

test("IDs and rate-limit keys do not disclose client IPs", () => {
  assert.equal(isShareId("a".repeat(22)), true);
  assert.equal(isShareId("a".repeat(21)), false);
  const key = clientRateKey("203.0.113.4", "create");
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.ok(!key.includes("203.0.113.4"));
  assert.notEqual(key, clientRateKey("203.0.113.4", "reveal"));
});

test("request bodies are bounded before JSON parsing", async () => {
  assert.deepEqual(await readJsonLimited(new Request("https://example.test", {
    method: "POST", body: JSON.stringify({ ok: true }),
  }), 20), { ok: true });
  await assert.rejects(readJsonLimited(new Request("https://example.test", {
    method: "POST", body: JSON.stringify({ long: "x".repeat(100) }),
  }), 20), RequestTooLarge);
});

test("production requires an explicit HTTPS origin and rate-limit secret", () => {
  assert.throws(() => shareConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv));
  assert.throws(() => shareConfig({ NODE_ENV: "production", SHARE_PUBLIC_ORIGIN: "http://secrets.example", SHARE_RATE_LIMIT_SECRET: "test" } as NodeJS.ProcessEnv));
  assert.equal(shareConfig({ NODE_ENV: "production", SHARE_PUBLIC_ORIGIN: "https://secrets.example", SHARE_RATE_LIMIT_SECRET: "x".repeat(32) } as NodeJS.ProcessEnv).publicOrigin, "https://secrets.example");
});
