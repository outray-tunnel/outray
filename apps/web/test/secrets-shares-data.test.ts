import assert from "node:assert/strict";
import test from "node:test";
import { filterShares, remainingReveals, shareStatus } from "../src/components/secrets/shares-data";
import type { SecretShareRecord } from "../src/lib/secrets-client";

const now = Date.parse("2026-10-07T09:00:00Z");

function share(id: string, overrides: Partial<SecretShareRecord> = {}): SecretShareRecord {
  return {
    id,
    createdAt: "2026-10-06T09:00:00Z",
    expiresAt: "2026-10-14T09:00:00Z",
    maxViews: 10,
    views: 3,
    revokedAt: null,
    keyNames: ["DATABASE_URL", "API_KEY"],
    projectId: "project-1",
    environmentId: "environment-1",
    ...overrides,
  };
}

test("share state is determined from expiry and reveal limits, not its creation time", () => {
  assert.equal(shareStatus(share("active"), now), "active");
  assert.equal(shareStatus(share("future", { createdAt: "2026-10-08T09:00:00Z" }), now), "active");
  assert.equal(shareStatus(share("expired", { expiresAt: "2026-10-06T09:00:00Z" }), now), "expired");
  assert.equal(shareStatus(share("boundary", { expiresAt: "2026-10-07T09:00:00Z" }), now), "expired");
  assert.equal(shareStatus(share("invalid-expiry", { expiresAt: "invalid" }), now), "expired");
  assert.equal(shareStatus(share("last-view", { views: 10 }), now), "exhausted");
  assert.equal(shareStatus(share("over-limit", { views: 11 }), now), "exhausted");
  assert.equal(shareStatus(share("still-active", { views: 9 }), now), "active");
});

test("revocation takes precedence over expiry and exhaustion, and expiry precedes exhaustion", () => {
  const allEnded = share("all-ended", {
    revokedAt: "2026-10-06T12:00:00Z",
    expiresAt: "2026-10-06T09:00:00Z",
    views: 10,
  });
  assert.equal(shareStatus(allEnded, now), "revoked");
  assert.equal(shareStatus({ ...allEnded, revokedAt: null }, now), "expired");
  assert.equal(shareStatus({ ...allEnded, revokedAt: null, expiresAt: "2026-10-14T09:00:00Z" }, now), "exhausted");
});

test("remaining reveals are clamped to the configured limit", () => {
  assert.equal(remainingReveals(share("normal")), 7);
  assert.equal(remainingReveals(share("none", { views: 10 })), 0);
  assert.equal(remainingReveals(share("over-limit", { views: 50 })), 0);
  assert.equal(remainingReveals(share("negative-count", { views: -4 })), 10);
  assert.equal(remainingReveals(share("zero-limit", { maxViews: 0, views: 0 })), 0);
});

test("search matches key names and share identifiers case-insensitively with surrounding whitespace ignored", () => {
  const shares = [
    share("Z-Beta", { keyNames: ["DATABASE_URL", "PAYMENTS_KEY"] }),
    share("a-Alpha", { keyNames: ["SMTP_PASSWORD"] }),
    share("c-Gamma", { keyNames: ["SERVICE_ACCOUNT_JSON"] }),
  ];
  assert.deepEqual(filterShares(shares, "  payments  ", "all", now).map(({ id }) => id), ["Z-Beta"]);
  assert.deepEqual(filterShares(shares, "smtp_password", "all", now).map(({ id }) => id), ["a-Alpha"]);
  assert.deepEqual(filterShares(shares, " A-ALPHA ", "all", now).map(({ id }) => id), ["a-Alpha"]);
  assert.deepEqual(filterShares(shares, "not-a-secret", "all", now), []);
  assert.deepEqual(filterShares(shares, "  ", "all", now).map(({ id }) => id), ["Z-Beta", "a-Alpha", "c-Gamma"]);
});

test("status filtering combines with search without changing server-provided ordering", () => {
  const shares = [
    share("newest", { keyNames: ["PAYMENT_TOKEN"] }),
    share("revoked", { keyNames: ["PAYMENT_TOKEN"], revokedAt: "2026-10-06T12:00:00Z" }),
    share("expired", { keyNames: ["DATABASE_URL"], expiresAt: "2026-10-06T09:00:00Z" }),
    share("exhausted", { keyNames: ["PAYMENT_TOKEN"], views: 10 }),
    share("oldest", { keyNames: ["SMTP_PASSWORD"] }),
  ];
  assert.deepEqual(filterShares(shares, "", "all", now).map(({ id }) => id), shares.map(({ id }) => id));
  assert.deepEqual(filterShares(shares, "", "active", now).map(({ id }) => id), ["newest", "oldest"]);
  assert.deepEqual(filterShares(shares, "", "ended", now).map(({ id }) => id), ["revoked", "expired", "exhausted"]);
  assert.deepEqual(filterShares(shares, "payment", "ended", now).map(({ id }) => id), ["revoked", "exhausted"]);
  assert.deepEqual(filterShares(shares, "database", "active", now), []);
});

test("filtering never mutates cached rows, key names, or their ordering", () => {
  const shares = [share("z"), share("a", { revokedAt: "2026-10-06T12:00:00Z" })];
  const before = JSON.stringify(shares);
  for (const item of shares) {
    Object.freeze(item.keyNames);
    Object.freeze(item);
  }
  Object.freeze(shares);
  filterShares(shares, "api", "all", now);
  filterShares(shares, "", "active", now);
  filterShares(shares, "", "ended", now);
  assert.equal(JSON.stringify(shares), before);
});

test("metadata search does not inspect unrecognized plaintext or source fields", () => {
  const shares = [{
    ...share("metadata-only"),
    value: "do-not-search-plaintext",
    url: "https://secrets.example/metadata-only#decryption-key",
    projectName: "not-part-of-share-metadata",
  }];
  assert.deepEqual(filterShares(shares, "do-not-search-plaintext", "all", now), []);
  assert.deepEqual(filterShares(shares, "decryption-key", "all", now), []);
  assert.deepEqual(filterShares(shares, "not-part-of-share-metadata", "all", now), []);
});
