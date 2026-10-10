import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { saveConfiguration, updatedConfiguration } from "./self-hosted-config-allowlist.mjs";

// Use only synthetic addresses, credentials and temporary configuration files.
const correction = { expectedEmail: "old@example.test", replacementEmail: "corrected@example.test", keepEmail: "keep@example.test" };
const source = `# Independent Ops policy\nOUTRAY_DEPLOYMENT_MODE=self-hosted\nOUTRAY_APP_HOST=ops.outray.dev\nCONSOLE_PUBLIC_URL=https://ops.outray.dev\nOUTRAY_SIGNUP_ALLOWED_EMAILS=old@example.test,keep@example.test\nOUTRAY_SIGNUP_ALLOWED_DOMAINS=\nGITHUB_CLIENT_ID=synthetic-client-id\nGITHUB_CLIENT_SECRET=synthetic-client-secret\nTINYBIRD_API_HOST=https://api.example.test\nTINYBIRD_QUERY_TOKEN=synthetic-read-token\nTINYBIRD_INGEST_TOKEN=synthetic-append-token\nTINYBIRD_TUNNEL_INGEST_TOKEN=\nPOSTGRES_PASSWORD=synthetic-database-password\nBETTER_AUTH_SECRET=synthetic-auth-secret\nOUTRAY_SECRETS_ACTIVE_MASTER_KEY=synthetic-master-key\nUPTIME_PROBES_ENABLED=false\nUNRELATED_VALUE="a value with spaces"\n# Preserve this trailing comment\n`;
const refused = { message: "Ops allowlist update refused; configuration details suppressed." };

test("confirmed correction replaces only the expected address and preserves the other approval and all settings", () => {
  for (const addresses of ["old@example.test,keep@example.test", "keep@example.test,old@example.test"]) {
    const contents = source.replace("old@example.test,keep@example.test", addresses);
    const output = updatedConfiguration(contents, correction), before = parseEnv(contents), after = parseEnv(output);
    assert.equal(after.OUTRAY_SIGNUP_ALLOWED_EMAILS, addresses.replace("old@example.test", "corrected@example.test"));
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    for (const key of Object.keys(before).filter((key) => key !== "OUTRAY_SIGNUP_ALLOWED_EMAILS")) assert.equal(after[key], before[key]);
    assert.equal(output.replace(/^OUTRAY_SIGNUP_ALLOWED_EMAILS=.*$/m, "ALLOWLIST"), contents.replace(/^OUTRAY_SIGNUP_ALLOWED_EMAILS=.*$/m, "ALLOWLIST"), "Every other byte, including credentials and comments, must be unchanged");
    assert.deepEqual(new Set(after.OUTRAY_SIGNUP_ALLOWED_EMAILS.split(",")), new Set([correction.replacementEmail, correction.keepEmail]));
  }
  const rawInstance = source.replace("CONSOLE_PUBLIC_URL=https://ops.outray.dev\n", "");
  assert.equal(parseEnv(updatedConfiguration(rawInstance, correction)).OUTRAY_SIGNUP_ALLOWED_EMAILS, "corrected@example.test,keep@example.test");
});

test("replay is byte-for-byte idempotent only for the exact corrected two-address state", () => {
  const output = updatedConfiguration(source, correction);
  assert.equal(updatedConfiguration(output, correction), output);
  const alreadyCorrected = source.replace("old@example.test,keep@example.test", "keep@example.test,corrected@example.test");
  assert.equal(updatedConfiguration(alreadyCorrected, correction), alreadyCorrected, "Replay must not rewrite or reorder an already corrected list");
  for (const addresses of ["stranger@example.test,keep@example.test", "old@example.test,stranger@example.test", "corrected@example.test,stranger@example.test", "old@example.test,corrected@example.test", "keep@example.test", "keep@example.test,corrected@example.test,stranger@example.test"]) {
    assert.throws(() => updatedConfiguration(source.replace("old@example.test,keep@example.test", addresses), correction), refused);
  }
});

test("allowlist updater rejects hosted, wrong-origin, open-domain, missing and duplicate policy states", () => {
  for (const contents of [
    source.replace("self-hosted", "hosted"),
    source.replace("OUTRAY_APP_HOST=ops.outray.dev", "OUTRAY_APP_HOST=hosted.example.test"),
    source.replace("CONSOLE_PUBLIC_URL=https://ops.outray.dev", "CONSOLE_PUBLIC_URL=https://hosted.example.test"),
    source.replace("OUTRAY_SIGNUP_ALLOWED_DOMAINS=", "OUTRAY_SIGNUP_ALLOWED_DOMAINS=example.test"),
    source.replace("OUTRAY_SIGNUP_ALLOWED_EMAILS=old@example.test,keep@example.test\n", ""),
    source.replace("old@example.test,keep@example.test", ""),
    source.replace("old@example.test,keep@example.test", "old@example.test,old@example.test"),
    source.replace("old@example.test,keep@example.test", "old@example.test,keep@example.test,"),
    source.replace("old@example.test,keep@example.test", "old@example.test,invalid"),
    source + "OUTRAY_SIGNUP_ALLOWED_EMAILS=old@example.test,keep@example.test\n",
  ]) assert.throws(() => updatedConfiguration(contents, correction), refused);
});

test("allowlist updater rejects wrong expectations, duplicates, unnormalized and injected correction inputs", () => {
  for (const input of [
    null, {},
    { expectedEmail: correction.expectedEmail, replacementEmail: correction.replacementEmail },
    { ...correction, extra: "never-change-another-field" },
    { ...correction, expectedEmail: "wrong@example.test" },
    { ...correction, keepEmail: "wrong@example.test" },
    { ...correction, replacementEmail: correction.expectedEmail },
    { ...correction, replacementEmail: correction.keepEmail },
    { ...correction, keepEmail: correction.expectedEmail },
    { ...correction, replacementEmail: "Corrected@example.test" },
    { ...correction, replacementEmail: " corrected@example.test" },
    { ...correction, replacementEmail: "corrected@example.test " },
    { ...correction, replacementEmail: "corrected@example.test\nINJECTED=true" },
    { ...correction, replacementEmail: "corrected@example.test,third@example.test" },
    { ...correction, replacementEmail: "not-an-email" },
    { ...correction, replacementEmail: 123 },
  ]) assert.throws(() => updatedConfiguration(source, input), refused);
});

test("private file update is atomic, mode0600, leaves no temporary files and does not rewrite replay", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "outray-allowlist-config-test-"))), file = join(directory, "instance.env");
  try {
    chmodSync(directory, 0o700);
    writeFileSync(file, source, { mode: 0o600 });
    saveConfiguration(file, correction);
    const output = readFileSync(file, "utf8"), beforeReplay = statSync(file);
    assert.equal(beforeReplay.mode & 0o777, 0o600);
    assert.equal(parseEnv(output).OUTRAY_SIGNUP_ALLOWED_EMAILS, "corrected@example.test,keep@example.test");
    assert.equal(output, updatedConfiguration(source, correction));
    assert.deepEqual(readdirSync(directory), ["instance.env"]);
    saveConfiguration(file, correction);
    assert.equal(readFileSync(file, "utf8"), output);
    assert.equal(statSync(file).ino, beforeReplay.ino, "Replay must not replace the configuration inode");
    assert.equal(statSync(file).mtimeMs, beforeReplay.mtimeMs, "Replay must not rewrite the configuration");
    assert.throws(() => saveConfiguration(file, { ...correction, keepEmail: "wrong@example.test" }), refused);
    assert.equal(readFileSync(file, "utf8"), output);
    assert.deepEqual(readdirSync(directory), ["instance.env"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("private file updater refuses loose permissions, parent permissions, symlinks and hosted env filenames", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "outray-allowlist-permissions-test-"))), file = join(directory, "instance.env");
  try {
    chmodSync(directory, 0o700);
    writeFileSync(file, source, { mode: 0o600 });
    for (const mode of [0o640, 0o604, 0o644]) {
      chmodSync(file, mode);
      assert.throws(() => saveConfiguration(file, correction), refused);
      assert.equal(readFileSync(file, "utf8"), source);
    }
    chmodSync(file, 0o600);
    for (const mode of [0o750, 0o705, 0o755]) {
      chmodSync(directory, mode);
      assert.throws(() => saveConfiguration(file, correction), refused);
      assert.equal(readFileSync(file, "utf8"), source);
    }
    chmodSync(directory, 0o700);
    const alias = join(directory, "alias.env");
    symlinkSync(file, alias);
    assert.throws(() => saveConfiguration(alias, correction), refused);
    assert.equal(readFileSync(file, "utf8"), source);
    for (const name of [".env", ".env.prod", ".env.production"]) {
      const forbidden = join(directory, name);
      writeFileSync(forbidden, source, { mode: 0o600 });
      assert.throws(() => saveConfiguration(forbidden, correction), refused);
      assert.equal(readFileSync(forbidden, "utf8"), source);
    }
  } finally { chmodSync(directory, 0o700); rmSync(directory, { recursive: true, force: true }); }
});

test("CLI accepts the correction only through stdin and never prints addresses or configuration", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "outray-allowlist-stdin-test-"))), file = join(directory, "instance.env");
  const executable = fileURLToPath(new URL("./self-hosted-config-allowlist.mjs", import.meta.url));
  const invoke = (args, input) => spawnSync(process.execPath, [executable, ...args], { env: {}, input, encoding: "utf8", timeout: 5_000 });
  try {
    chmodSync(directory, 0o700);
    writeFileSync(file, source, { mode: 0o600 });
    const success = invoke(["--file", file], JSON.stringify(correction) + "\n");
    assert.equal(success.status, 0, success.stderr);
    assert.equal(parseEnv(readFileSync(file, "utf8")).OUTRAY_SIGNUP_ALLOWED_EMAILS, "corrected@example.test,keep@example.test");
    const badInput = invoke(["--file", file], JSON.stringify({ ...correction, extra: "private-synthetic-detail" }) + "\n");
    assert.equal(badInput.status, 1);
    assert.match(badInput.stderr, /Ops allowlist update refused; configuration details suppressed/);
    const argv = invoke(["--file", file, correction.replacementEmail], JSON.stringify(correction) + "\n");
    assert.equal(argv.status, 1);
    for (const result of [success, badInput, argv]) {
      for (const value of [...Object.values(correction), "synthetic-client-secret", "private-synthetic-detail", file]) assert.ok(!(result.stdout + result.stderr).includes(value));
    }
    const code = readFileSync(executable, "utf8");
    assert.match(code, /info\.uid !== process\.getuid\(\) \|\| parent\.uid !== process\.getuid\(\)/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
