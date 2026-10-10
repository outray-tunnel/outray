import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { saveConfiguration, updatedConfiguration } from "./self-hosted-config-github.mjs";

const source = `# Independent runtime\nOUTRAY_DEPLOYMENT_MODE=self-hosted\nOUTRAY_SIGNUP_ALLOWED_EMAILS=owner@example.test\nOUTRAY_SIGNUP_ALLOWED_DOMAINS=\nGITHUB_CLIENT_ID=\nGITHUB_CLIENT_SECRET=\nUNRELATED_VALUE="leave me alone"\n`;
const credentials = { clientId: "example-client-id", clientSecret: "synthetic-test-secret-only" };

test("changes only GitHub credentials and preserves comments and policy", () => {
  const result = updatedConfiguration(source, credentials);
  const values = parseEnv(result);
  assert.equal(values.GITHUB_CLIENT_ID, credentials.clientId);
  assert.equal(values.GITHUB_CLIENT_SECRET, credentials.clientSecret);
  assert.equal(values.UNRELATED_VALUE, "leave me alone");
  assert.equal(values.OUTRAY_SIGNUP_ALLOWED_EMAILS, "owner@example.test");
  assert.ok(result.startsWith("# Independent runtime\n"));
});

test("refuses hosted, open-signup, duplicate and injected inputs without echoing values", () => {
  for (const [contents, input] of [
    [source.replace("self-hosted", "hosted"), credentials],
    [source.replace("owner@example.test", ""), credentials],
    [source.replace("OUTRAY_SIGNUP_ALLOWED_DOMAINS=", "OUTRAY_SIGNUP_ALLOWED_DOMAINS=example.test"), credentials],
    [source + "GITHUB_CLIENT_SECRET=duplicate\n", credentials],
    [source, { ...credentials, clientSecret: "sensitive\nINJECTED=value" }],
    [source, { ...credentials, extra: "value" }],
  ]) assert.throws(() => updatedConfiguration(contents, input), { message: "GitHub configuration update refused; credential details suppressed." });
});

test("atomically saves a private runtime file but refuses broad permissions and env.prod", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "outray-github-config-test-")));
  try {
    const file = join(directory, "instance.env");
    writeFileSync(file, source, { mode: 0o600 });
    saveConfiguration(file, credentials);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(parseEnv(readFileSync(file, "utf8")).GITHUB_CLIENT_ID, credentials.clientId);
    chmodSync(file, 0o644);
    assert.throws(() => saveConfiguration(file, credentials));
    const hosted = join(directory, ".env.prod");
    writeFileSync(hosted, source, { mode: 0o600 });
    assert.throws(() => saveConfiguration(hosted, credentials));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
