import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { shareDb } from "../src/lib/db";
import { createShare, revealShare } from "../src/lib/shares";

test("shares enforce proof, concurrent view limits, passwords, expiry and revocation", {
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
    const passwordVerifier = randomBytes(32).toString("base64url");
    const protectedId = await createShare({
      ciphertext: randomBytes(40).toString("base64url"),
      iv: randomBytes(12).toString("base64url"),
      verifier,
      passwordSalt: randomBytes(16).toString("base64url"),
      passwordVerifier,
      contentFormat: "text",
      durationValue: 5,
      durationUnit: "minutes",
      maxViews: 1,
    });
    try {
      assert.equal(await revealShare(protectedId, verifier), null);
      assert.equal(await revealShare(protectedId, verifier, randomBytes(32).toString("base64url")), null);
      assert.ok(await revealShare(protectedId, verifier, passwordVerifier));
      assert.equal(await revealShare(protectedId, verifier, passwordVerifier), null);
    } finally {
      await shareDb().query("DELETE FROM secret_share_links WHERE id = $1", [protectedId]);
    }
    for (const unavailable of ["expired", "revoked"] as const) {
      const unavailableId = await createShare({
        ciphertext: randomBytes(40).toString("base64url"),
        iv: randomBytes(12).toString("base64url"),
        verifier,
        contentFormat: "text",
        durationValue: 1,
        durationUnit: "days",
        maxViews: 10,
      });
      try {
        const update = unavailable === "expired"
          ? "UPDATE secret_share_links SET expires_at = now() - interval '1 second' WHERE id = $1"
          : "UPDATE secret_share_links SET revoked_at = now() WHERE id = $1";
        await shareDb().query(update, [unavailableId]);
        assert.equal(await revealShare(unavailableId, verifier), null);
        const stored = await shareDb().query<{ views: number }>("SELECT views FROM secret_share_links WHERE id = $1", [unavailableId]);
        assert.equal(stored.rows[0]?.views, 0, `${unavailable} shares must not consume views`);
      } finally {
        await shareDb().query("DELETE FROM secret_share_links WHERE id = $1", [unavailableId]);
      }
    }
  } finally {
    await shareDb().query("DELETE FROM secret_share_links WHERE id = $1", [id]);
    await shareDb().end();
  }
});
