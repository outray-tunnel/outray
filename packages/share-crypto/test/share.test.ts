import assert from "node:assert/strict";
import { test } from "node:test";
import { completeShareUrl, decryptShare, encryptShare, shareNeedsPassword, sharePasswordVerifier, shareVerifier } from "../src/index";

test("encrypts a bundle without exposing its values in stored fields", async () => {
  const content = { type: "bundle" as const, entries: [{ key: "API_KEY", value: "super-secret" }] };
  const encrypted = await encryptShare(content);
  assert.equal(encrypted.key.length, 43);
  assert.equal(encrypted.verifier, await shareVerifier(encrypted.key));
  assert.ok(!JSON.stringify({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, verifier: encrypted.verifier }).includes("super-secret"));
  assert.deepEqual(await decryptShare(encrypted, encrypted.key), content);
  assert.match(completeShareUrl("https://secrets.outray.dev", "a".repeat(22), encrypted.key), /#.+$/);
  await assert.rejects(decryptShare(encrypted, (await encryptShare(content)).key));
});

test("encrypted shares are snapshots, not references to later source edits", async () => {
  const source = { type: "bundle" as const, entries: [{ key: "TOKEN", value: "first" }] };
  const encrypted = await encryptShare(source);
  source.entries[0].value = "second";
  assert.deepEqual(await decryptShare(encrypted, encrypted.key), {
    type: "bundle", entries: [{ key: "TOKEN", value: "first" }],
  });
});

test("a password-protected share requires the fragment and password", async () => {
  const content = { type: "text" as const, text: "private note" };
  const encrypted = await encryptShare(content, "a separate password");
  assert.equal(shareNeedsPassword(encrypted.key), true);
  assert.equal(await shareVerifier(encrypted.key), encrypted.verifier);
  assert.equal(await sharePasswordVerifier(encrypted.key, "a separate password"), encrypted.passwordVerifier);
  assert.notEqual(await sharePasswordVerifier(encrypted.key, "wrong password"), encrypted.passwordVerifier);
  assert.deepEqual(await decryptShare(encrypted, encrypted.key, "a separate password"), content);
  await assert.rejects(decryptShare(encrypted, encrypted.key), /password/i);
  await assert.rejects(decryptShare(encrypted, encrypted.key, "wrong password"));
  assert.ok(!JSON.stringify({ ciphertext: encrypted.ciphertext, salt: encrypted.passwordSalt, proof: encrypted.passwordVerifier }).includes("private note"));
  assert.ok(!JSON.stringify(encrypted).includes("a separate password"));
  await assert.rejects(encryptShare(content, "short"), /password/i);
});

test("rejects too many named entries and oversized plaintext before encryption", async () => {
  await assert.rejects(encryptShare({ type: "bundle", entries: Array.from({ length: 51 }, (_, index) => ({ key: `K${index}`, value: "v" })) }));
  await assert.rejects(encryptShare({ type: "text", text: "x".repeat(256 * 1024) }));
});
