import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseUserInput } from "better-auth/db";
import { adminProfileFields } from "../src/lib/auth-profile";

const options = { user: { additionalFields: adminProfileFields } };

test("signup input cannot grant platform administration", () => {
  for (const isAdmin of [true, "true", 1, false, undefined]) {
    assert.equal(parseUserInput(options, { name: "User", email: "user@example.com", isAdmin }, "create").isAdmin, false);
  }
});

test("profile updates cannot change the server-owned admin flag", () => {
  for (const isAdmin of [true, "true", 1]) {
    assert.throws(() => parseUserInput(options, { isAdmin }, "update"));
  }
  assert.equal(parseUserInput(options, { name: "Updated", isAdmin: false }, "update").isAdmin, undefined);
});

test("OAuth creation hook resets privilege without changing existing accounts", () => {
  const auth = readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /additionalFields: adminProfileFields/);
  assert.match(auth, /data: \{ \.\.\.user, isAdmin: false \}/);
});
