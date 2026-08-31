import assert from "node:assert/strict";
import test from "node:test";
import {
  createMachineToken,
  hashMachineToken,
  machineTokenExpiry,
  machineTokenHashMatches,
  normalizeMachineTokenScopes,
} from "../src/lib/machine-tokens";

test("machine tokens are high entropy, prefixed, and hash-only comparable", () => {
  const first = createMachineToken();
  const second = createMachineToken();

  assert.match(first.token, /^outray_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.tokenHash, hashMachineToken(first.token));
  assert.equal(machineTokenHashMatches(first.token, first.tokenHash), true);
  assert.equal(machineTokenHashMatches(second.token, first.tokenHash), false);
  assert.equal(first.token.startsWith(first.prefix), true);
});

test("machine-token scope normalization rejects unknown and empty grants", () => {
  assert.deepEqual(
    normalizeMachineTokenScopes([
      "secrets:read",
      "secrets:read",
      "secrets:write",
    ]),
    ["secrets:read", "secrets:write"],
  );
  assert.equal(normalizeMachineTokenScopes([]), null);
  assert.equal(normalizeMachineTokenScopes(["secrets:admin"]), null);
  assert.equal(normalizeMachineTokenScopes("secrets:read"), null);
});

test("machine-token expiry defaults to 90 days and supports deliberate choices", () => {
  const now = new Date("2026-08-31T00:00:00.000Z");
  assert.equal(
    machineTokenExpiry(undefined, now)?.toISOString(),
    "2026-11-29T00:00:00.000Z",
  );
  assert.equal(
    machineTokenExpiry("30d", now)?.toISOString(),
    "2026-09-30T00:00:00.000Z",
  );
  assert.equal(machineTokenExpiry("never", now), null);
  assert.equal(machineTokenExpiry("invalid", now), undefined);
});
