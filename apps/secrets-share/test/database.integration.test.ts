import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { shareDb } from "../src/lib/db";
import { createShare, revealShare } from "../src/lib/shares";

test("a path ID alone cannot consume a view, and simultaneous reveals honor the cap", {
  skip: !process.env.TEST_SHARE_DATABASE_URL && "Set TEST_SHARE_DATABASE_URL to a migrated disposable database",
}, async () => {
  process.env.SHARE_DATABASE_URL = process.env.TEST_SHARE_DATABASE_URL;
  const verifier = randomBytes(32).toString("base64url");
  const id = await createShare({
    ciphertext: randomBytes(40).toString("base64url"),
    iv: randomBytes(12).toString("base64url"),
    verifier,
    contentFormat: "text",
    durationValue: 1,
    durationUnit: "days",
    maxViews: 1,
  });
  try {
    assert.equal(await revealShare(id, randomBytes(32).toString("base64url")), null);
    const results = await Promise.all(Array.from({ length: 20 }, () => revealShare(id, verifier)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await revealShare(id, verifier), null);
  } finally {
    await shareDb().query("DELETE FROM secret_share_links WHERE id = $1", [id]);
    await shareDb().end();
  }
});
