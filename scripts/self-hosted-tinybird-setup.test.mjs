import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { opsTinybirdHost, opsWorkspace, saveConfiguration, updatedConfiguration } from "./self-hosted-config-tinybird.mjs";
import { assertScopes, projectResources } from "./self-hosted-tinybird-setup.mjs";

// Synthetic only: never invoke setup(), the provider API, SSH or a real profile.
const source = `# Independent Ops configuration\nOUTRAY_DEPLOYMENT_MODE=self-hosted\nOUTRAY_APP_HOST=ops.outray.dev\nCONSOLE_PUBLIC_URL=https://ops.outray.dev\nOUTRAY_SIGNUP_ALLOWED_EMAILS=one@example.test,two@example.test\nOUTRAY_SIGNUP_ALLOWED_DOMAINS=\nTINYBIRD_API_HOST=\nTINYBIRD_QUERY_TOKEN=\nTINYBIRD_INGEST_TOKEN=\nTINYBIRD_TUNNEL_INGEST_TOKEN=\nGITHUB_CLIENT_ID=leave-github-id-alone\nGITHUB_CLIENT_SECRET=leave-github-secret-alone\nPOSTGRES_PASSWORD=leave-database-secret-alone\nOUTRAY_SECRETS_ACTIVE_MASTER_KEY=leave-master-key-alone\nUNRELATED_VALUE="a value with spaces"\n`;
const credentials = { apiHost: opsTinybirdHost, queryToken: "synthetic-read-token-not-a-real-secret", ingestToken: "synthetic-append-token-not-a-real-secret", workspaceId: opsWorkspace.id, workspaceName: opsWorkspace.name };
const refused = { message: "Tinybird configuration update refused; credential details suppressed." };

test("runtime scope verification accepts only the exact resource set and access type", () => {
  for (const type of ["PIPES:READ", "DATASOURCES:APPEND"]) {
    assert.doesNotThrow(() => assertScopes([{ type, resource: "second" }, { type, resource: "first" }], type, ["first", "second"]));
    for (const scopes of [
      undefined, {}, [],
      [{ type, resource: "first" }],
      [{ type, resource: "first" }, { type, resource: "first" }],
      [{ type, resource: "first" }, { type, resource: "*" }],
      [{ type, resource: "first" }, { type: "ADMIN", resource: "second" }],
      [{ type, resource: "first" }, { type: type === "PIPES:READ" ? "DATASOURCES:APPEND" : "PIPES:READ", resource: "second" }],
      [{ type, resource: "first" }, { type, resource: "second", filter: "1 = 1" }],
      [{ type, resource: "first" }, { type, resource: 123 }],
      [{ type, resource: "first" }, { type, resource: "second" }, { type: "ADMIN", resource: "*" }],
      [null, { type, resource: "second" }],
    ]) assert.throws(() => assertScopes(scopes, type, ["first", "second"]));
  }
});

test("project resource inventory uses only sorted deployed datasource and endpoint names", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "outray-tinybird-resources-test-")));
  try {
    mkdirSync(join(directory, "tinybird/datasources"), { recursive: true });
    mkdirSync(join(directory, "tinybird/endpoints"), { recursive: true });
    for (const name of ["z.datasource", "a.datasource", "README.md", "ignore.datasource.bak"]) writeFileSync(join(directory, "tinybird/datasources", name), "synthetic only\n");
    for (const name of ["z.pipe", "a.pipe", "README.md", "ignore.pipe.bak"]) writeFileSync(join(directory, "tinybird/endpoints", name), "synthetic only\n");
    assert.deepEqual(projectResources(directory), { datasources: ["a", "z"], pipes: ["a", "z"] });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("Tinybird updater changes only its three runtime values and preserves policy and comments", () => {
  const output = updatedConfiguration(source, credentials), before = parseEnv(source), after = parseEnv(output);
  assert.equal(after.TINYBIRD_API_HOST, credentials.apiHost);
  assert.equal(after.TINYBIRD_QUERY_TOKEN, credentials.queryToken);
  assert.equal(after.TINYBIRD_INGEST_TOKEN, credentials.ingestToken);
  assert.equal(after.TINYBIRD_TUNNEL_INGEST_TOKEN, "");
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  for (const key of Object.keys(before).filter((key) => !["TINYBIRD_API_HOST", "TINYBIRD_QUERY_TOKEN", "TINYBIRD_INGEST_TOKEN"].includes(key))) assert.equal(after[key], before[key]);
  assert.ok(output.startsWith("# Independent Ops configuration\n"));
  assert.equal(updatedConfiguration(output, credentials), output, "Repeating the same scoped credentials should be idempotent");
  const rawInstance = source.replace("CONSOLE_PUBLIC_URL=https://ops.outray.dev\n", "");
  assert.equal(parseEnv(updatedConfiguration(rawInstance, credentials)).TINYBIRD_QUERY_TOKEN, credentials.queryToken, "Raw instance schema derives the console origin from OUTRAY_APP_HOST");
  assert.ok(!output.includes("workspaceId=") && !output.includes("workspaceName="), "Workspace metadata is validation input, not runtime credentials");
});

test("Tinybird updater refuses wrong targets, broad policy, duplicate or injected credentials without echoing them", () => {
  for (const [contents, input] of [
    [source.replace("self-hosted", "hosted"), credentials],
    [source.replace("OUTRAY_APP_HOST=ops.outray.dev", "OUTRAY_APP_HOST=hosted.example.test"), credentials],
    [source.replace("https://ops.outray.dev", "https://hosted.example.test"), credentials],
    [source.replace("one@example.test,two@example.test", ""), credentials],
    [source.replace("OUTRAY_SIGNUP_ALLOWED_DOMAINS=", "OUTRAY_SIGNUP_ALLOWED_DOMAINS=example.test"), credentials],
    [source.replace("TINYBIRD_TUNNEL_INGEST_TOKEN=", "TINYBIRD_TUNNEL_INGEST_TOKEN=other-append-token"), credentials],
    [source.replace("TINYBIRD_QUERY_TOKEN=\n", ""), credentials],
    [source + "TINYBIRD_QUERY_TOKEN=duplicate\n", credentials],
    [source + "TINYBIRD_INGEST_TOKEN=duplicate\n", credentials],
    [source, { ...credentials, workspaceId: "not-the-ops-workspace" }],
    [source, { ...credentials, workspaceName: "hosted-workspace" }],
    [source, { ...credentials, apiHost: "https://other.example.test" }],
    [source, { ...credentials, queryToken: credentials.ingestToken }],
    [source, { ...credentials, queryToken: "secret\nINJECTED=value" }],
    [source, { ...credentials, ingestToken: "secret with whitespace" }],
    [source, { ...credentials, queryToken: "x".repeat(4097) }],
    [source, { ...credentials, adminToken: "never-admit-admin-credentials" }],
    [source, null],
  ]) assert.throws(() => updatedConfiguration(contents, input), refused);
});

test("private Tinybird update is atomic, mode0600 and refuses loose files, parents and symlinks", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "outray-tinybird-config-test-")));
  const file = join(directory, "instance.env");
  try {
    chmodSync(directory, 0o700);
    writeFileSync(file, source, { mode: 0o600 });
    saveConfiguration(file, credentials);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(parseEnv(readFileSync(file, "utf8")).TINYBIRD_QUERY_TOKEN, credentials.queryToken);
    assert.deepEqual(readdirSync(directory), ["instance.env"], "Atomic update must not leave temporary credential files");
    const previous = readFileSync(file, "utf8");
    assert.throws(() => saveConfiguration(file, { ...credentials, workspaceId: "wrong-workspace" }), refused);
    assert.equal(readFileSync(file, "utf8"), previous);
    chmodSync(file, 0o640);
    assert.throws(() => saveConfiguration(file, credentials), refused);
    assert.equal(readFileSync(file, "utf8"), previous);
    chmodSync(file, 0o600);
    chmodSync(directory, 0o750);
    assert.throws(() => saveConfiguration(file, credentials), refused);
    assert.equal(readFileSync(file, "utf8"), previous);
    chmodSync(directory, 0o700);
    const alias = join(directory, "alias.env");
    symlinkSync(file, alias);
    assert.throws(() => saveConfiguration(alias, credentials), refused);
    assert.equal(readFileSync(file, "utf8"), previous);
    for (const name of [".env", ".env.prod", ".env.production"]) {
      const forbidden = join(directory, name);
      writeFileSync(forbidden, source, { mode: 0o600 });
      assert.throws(() => saveConfiguration(forbidden, credentials), refused);
      assert.equal(readFileSync(forbidden, "utf8"), source);
    }
  } finally { chmodSync(directory, 0o700); rmSync(directory, { recursive: true, force: true }); }
});

test("setup source keeps deployment profile private, isolated and bound to the exact Ops identity", () => {
  const code = readFileSync(new URL("./self-hosted-tinybird-setup.mjs", import.meta.url), "utf8");
  assert.match(code, /profile\.host !== opsTinybirdHost \|\| profile\.id === opsWorkspace\.id/);
  assert.match(code, /item\.id === opsWorkspace\.id && item\.name === opsWorkspace\.name/);
  assert.match(code, /identity\.id !== opsWorkspace\.id \|\| identity\.name !== opsWorkspace\.name/);
  assert.ok(code.indexOf('fail("Ops workspace identity")') < code.indexOf('await command("tb"'));
  assert.match(code, /before\.datasources\.length \|\| before\.pipes\.length/);
  assert.match(code, /mkdtempSync\(join\(tmpdir\(\), "outray-internal-ops-tinybird-"\)\)/);
  assert.match(code, /writeFileSync\(join\(directory, "\.tinyb"\).*mode: 0o600/);
  assert.match(code, /TB_HOST: opsTinybirdHost, TB_TOKEN: admin/);
  assert.match(code, /await command\("tb", \["--cloud", \.\.\.args\], \{ cwd: directory, env \}\)/);
  assert.ok(!/cpSync\(root\b|writeFileSync\(join\(root, "\.tinyb"\)/.test(code));
  assert.match(code, /digest\(readFileSync\(join\(root, "\.tinyb"\)\)\) !== digest\(original\)/);
  assert.match(code, /rmSync\(directory, \{ recursive: true, force: true \}\)/);
  assert.match(code, /redirect: "error"/);
  assert.match(code, /child\.stdout\.resume\(\); child\.stderr\.resume\(\)/);
});

test("setup verifies exact READ and APPEND tokens before runtime transfer and excludes account/admin tokens", () => {
  const code = readFileSync(new URL("./self-hosted-tinybird-setup.mjs", import.meta.url), "utf8");
  assert.match(code, /scoped\("OUTRAY_QUERY_TOKEN", "PIPES:READ", expected\.pipes\)/);
  assert.match(code, /scoped\("OUTRAY_INGEST_TOKEN", "DATASOURCES:APPEND", expected\.datasources\)/);
  assert.match(code, /assertScopes\(token\.scopes, type, resources\)/);
  assert.match(code, /token\.token === admin \|\| token\.token === profile\.token/);
  assert.match(code, /queryToken === ingestToken/);
  assert.ok(code.indexOf("assertScopes(token.scopes, type, resources)") < code.indexOf("if (configureOps)"));
  const transfer = code.slice(code.indexOf("if (configureOps)"));
  assert.match(transfer, /JSON\.stringify\(\{ apiHost: opsTinybirdHost, queryToken, ingestToken, workspaceId: identity\.id, workspaceName: identity\.name \}\)/);
  assert.ok(!/JSON\.stringify\(\{[^}]*\b(?:admin|profile|token):/.test(transfer));
  assert.match(transfer, /"BatchMode=yes", "-o", "StrictHostKeyChecking=yes"/);
  assert.match(transfer, /\}, input\)/);
  const updater = readFileSync(new URL("./self-hosted-config-tinybird.mjs", import.meta.url), "utf8");
  assert.match(updater, /info\.uid !== process\.getuid\(\) \|\| parent\.uid !== process\.getuid\(\)/);
  assert.match(updater, /reader = createInterface\(\{ input: process\.stdin/);
  assert.ok(!/process\.argv\[[45]\]/.test(updater), "Runtime token values must never arrive through argv");
});

test("synthetic ingestion smoke requires committed acknowledgement and bounded isolated evidence", () => {
  const code = readFileSync(new URL("./self-hosted-tinybird-setup.mjs", import.meta.url), "utf8");
  assert.match(code, /\/v0\/events\?name=tunnel_events&wait=true/);
  assert.match(code, /append\.successful_rows !== 1 \|\| append\.quarantined_rows/);
  assert.match(code, /org = `ops_smoke_\$\{randomUUID/);
  assert.match(code, /retention_days: 1/);
  assert.match(code, /attempt < 10/);
  assert.match(code, /result\.data\?\.\[0\]\?\.total_requests !== 1/);
});
