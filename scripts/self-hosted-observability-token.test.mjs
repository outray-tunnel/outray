import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { initialEnvironment } from "./self-hosted.mjs";
import { labelsFor, project } from "./self-hosted-rehearsal.mjs";
import { assertOpsConfiguration, assertTokenResources, privateToken, provisionObservabilityToken, runTokenBootstrap, stagePrivateToken, tokenArguments, tokenConfiguration, tokenContainer, tokenEndpoint, tokenName, tokenRpc } from "./self-hosted-observability-token.mjs";

const token = `outray_${"a".repeat(43)}`, org = "o".repeat(32), owner = "u".repeat(32);
const input = { organizationId: org, ownerId: owner, database: "outray_ops", name: tokenName,
  id: "10000000-0000-4000-8000-000000000001", auditId: "10000000-0000-4000-8000-000000000002",
  tokenHash: createHash("sha256").update(token).digest("hex"), prefix: token.slice(0, 15) };
const row = { id: input.id, token_hash: input.tokenHash, prefix: input.prefix, scopes: ["observability:write"], created_by_id: owner,
  project_id: null, environment_id: null, expires_at: null, revoked_at: null };

function clientFixture(options = {}) {
  const calls = [];
  const client = { query: async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    if (sql.startsWith("SELECT current_database")) return { rows: [{ name: options.database || input.database }] };
    if (sql.startsWith("SELECT id, slug")) return { rows: options.noOrg ? [] : [{ id: org, slug: options.slug || "outray" }] };
    if (sql.startsWith("SELECT m.role")) return { rows: [{ role: options.role || "owner", email_verified: options.verified !== false }] };
    if (sql.startsWith("SELECT id, token_hash")) return { rows: options.existing || [] };
    if (options.failAudit && sql.startsWith("INSERT INTO secret_audit")) throw new Error(`SQL/secret-bearing error ${token}`);
    return { rows: [] };
  } };
  return { client, calls };
}

function resourceFixture() {
  const text = initialEnvironment("ops.outray.dev", "owner@example.net"), config = assertOpsConfiguration(parseEnv(text));
  const labels = labelsFor(config), envList = (values) => Object.entries(values).map(([key, value]) => `${key}=${value}`);
  const network = { Internal: true, Driver: "bridge", Labels: labels };
  const postgres = { Config: { Labels: labels, Env: envList(Object.fromEntries(["POSTGRES_USER", "POSTGRES_DB", "POSTGRES_PASSWORD"].map((key) => [key, config[key]]))) },
    State: { Status: "running", Health: { Status: "healthy" } }, HostConfig: { NetworkMode: project, PortBindings: {} }, NetworkSettings: { Networks: { [project]: {} } } };
  const ingest = { Id: "c".repeat(64), Config: { Labels: { ...labels, "com.outray.ingest-preview": "true" }, User: "node", WorkingDir: "/app",
    Cmd: ["node", "apps/ingest/dist/server.js"], Env: envList({ OUTRAY_DEPLOYMENT_MODE: "self-hosted", DATABASE_URL: `postgresql://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${project}-postgres:5432/${config.POSTGRES_DB}?sslmode=disable` }) },
    State: { Status: "running", Health: { Status: "healthy" } }, HostConfig: { ReadonlyRootfs: true, PortBindings: {}, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"] }, NetworkSettings: { Networks: { [project]: {}, "outray-ops-ingest-egress": {} } }, Mounts: [{ Type: "tmpfs" }] };
  return { text, config, network, postgres, ingest };
}

test("bootstrap arguments cannot select a hosted env file or arbitrary scope/name", () => {
  const result = tokenArguments(["--file", "/opt/outray-ops/config/instance.env", "--org", org, "--owner", owner]);
  assert.equal(result.output, "/opt/outray-ops/config/outray-web-observability.env");
  for (const args of [[], ["--file", ".env.prod", "--org", org, "--owner", owner], ["--file", "instance.env", "--org", "';DROP", "--owner", owner],
    ["--file", "instance.env", "--org", org, "--owner", owner, "--scope", "secrets:read"]]) assert.throws(() => tokenArguments(args));
});

test("fresh configuration refuses hosted mode and origins while preserving the existing independent labels", () => {
  const f = resourceFixture();
  for (const values of [{ OUTRAY_DEPLOYMENT_MODE: "hosted" }, { OUTRAY_APP_HOST: "outray.co" }, { OUTRAY_INGEST_HOST: "ingest.outray.dev" }, { CONSOLE_PUBLIC_URL: "https://outray.dev" }])
    assert.throws(() => assertOpsConfiguration({ ...parseEnv(f.text), ...values }));
  assert.doesNotThrow(() => assertTokenResources(f.config, f.network, f.postgres, f.ingest));
});

test("resource guard rejects foreign database, remote/missing network, published ports and unhealthy ingest", () => {
  const f = resourceFixture();
  const changes = [
    (v) => v.network.Internal = false,
    (v) => v.network.Labels = {},
    (v) => v.postgres.Config.Env[0] = "POSTGRES_USER=foreign",
    (v) => v.postgres.HostConfig.PortBindings = { "5432/tcp": [] },
    (v) => v.ingest.Config.Env[1] = "DATABASE_URL=postgresql://hosted",
    (v) => v.ingest.State.Health.Status = "unhealthy",
    (v) => v.ingest.Config.User = "root",
    (v) => v.ingest.Config.Labels["com.outray.ingest-preview"] = "false",
    (v) => v.ingest.HostConfig.CapAdd = ["NET_ADMIN"],
    (v) => v.ingest.Mounts.push({ Type: "bind" }),
    (v) => delete v.ingest.NetworkSettings.Networks[project],
  ];
  for (const change of changes) { const v = structuredClone(f); change(v); assert.throws(() => assertTokenResources(v.config, v.network, v.postgres, v.ingest)); }
});

test("new token uses only a hashed scoped machine row and system audit, with owner validation and serialized org lock", async () => {
  const f = clientFixture();
  assert.equal((await provisionObservabilityToken(f.client, input)).state, "created");
  const tokenInsert = f.calls.find((call) => call.sql.startsWith("INSERT INTO secrets_machine_tokens"));
  assert.ok(tokenInsert); assert.equal(tokenInsert.parameters[3], input.tokenHash);
  assert.equal(tokenInsert.parameters[5], JSON.stringify(["observability:write"]));
  assert.ok(f.calls.find((call) => call.sql.startsWith("SELECT id, slug")).sql.includes("FOR UPDATE"));
  const audit = f.calls.find((call) => call.sql.startsWith("INSERT INTO secret_audit_events"));
  assert.ok(audit.sql.includes("'system','system',NULL,'machine_token.created'"));
  assert.deepEqual(JSON.parse(audit.parameters.at(-1)).scopes, ["observability:write"]);
  assert.equal(f.calls.at(-1).sql, "COMMIT");
  assert.ok(!JSON.stringify(f.calls).includes(token));
  assert.ok(!f.calls.some((call) => call.sql.includes("auth_tokens")));
});

test("read-only preflight and exact idempotent reuse never insert, rotate or update a token", async () => {
  const fresh = clientFixture(); assert.equal((await provisionObservabilityToken(fresh.client, { ...input, auditOnly: true })).state, "absent");
  assert.equal(fresh.calls.at(-1).sql, "ROLLBACK"); assert.ok(!fresh.calls.some((call) => call.sql.startsWith("INSERT")));
  const existing = clientFixture({ existing: [row] });
  assert.equal((await provisionObservabilityToken(existing.client, input)).state, "existing");
  assert.ok(!existing.calls.some((call) => /^(INSERT|UPDATE|DELETE)/.test(call.sql)));
});

test("wrong database/org, unverified or non-owner identity and existing scope/hash/expiry drift are refused", async () => {
  for (const options of [{ database: "foreign" }, { noOrg: true }, { slug: "other" }, { role: "admin" }, { verified: false },
    { existing: [row, row] }, { existing: [{ ...row, scopes: ["observability:write", "secrets:read"] }] },
    { existing: [{ ...row, token_hash: "a".repeat(64) }] }, { existing: [{ ...row, created_by_id: "another" }] },
    { existing: [{ ...row, revoked_at: new Date() }] }, { existing: [{ ...row, expires_at: new Date() }] }]) {
    const f = clientFixture(options); await assert.rejects(provisionObservabilityToken(f.client, input), /refused/);
    assert.equal(f.calls.at(-1).sql, "ROLLBACK"); assert.ok(!f.calls.some((call) => call.sql.startsWith("INSERT")));
  }
});

test("audit failure rolls back and never exposes database error text", async () => {
  const f = clientFixture({ failAudit: true });
  await assert.rejects(provisionObservabilityToken(f.client, input), (error) => !error.message.includes(token) && error.message === "Token bootstrap refused");
  assert.equal(f.calls.at(-1).sql, "ROLLBACK"); assert.ok(!f.calls.some((call) => call.sql === "COMMIT"));
});

test("private credentials contain only four server-side values and exact endpoint, rejecting duplicates and other variables", () => {
  const text = Object.entries(tokenConfiguration(token)).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n";
  assert.equal(privateToken(text), token); assert.equal(tokenConfiguration(token).OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT, tokenEndpoint);
  assert.throws(() => privateToken(text + "VITE_SECRET=bad\n"));
  assert.throws(() => privateToken(text + `OUTRAY_INTERNAL_OBSERVABILITY_API_KEY=${token}\n`));
  assert.throws(() => privateToken(text.replace(tokenEndpoint, "https://ingest.outray.dev")));
});

test("exclusive staging uses mode0600, preserves existing credential and refuses symlinks or shared directories", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outray-token-test-"))), file = join(dir, "outray-web-observability.env");
  try {
    stagePrivateToken(file, token); assert.equal(lstatSync(file).mode & 0o777, 0o600); assert.equal(privateToken(readFileSync(file, "utf8")), token);
    assert.throws(() => stagePrivateToken(file, `outray_${"b".repeat(43)}`)); assert.equal(privateToken(readFileSync(file, "utf8")), token);
    symlinkSync(file, join(dir, "linked.env")); assert.throws(() => stagePrivateToken(join(dir, "linked.env"), token));
    chmodSync(dir, 0o755); assert.throws(() => stagePrivateToken(join(dir, "other.env"), token));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("RPC carries only bound hashes, not plaintext, and suppresses all database diagnostics", () => {
  assert.ok(tokenRpc.includes("new pg.Client")); assert.ok(tokenRpc.includes("JSON.parse(input)"));
  assert.ok(!tokenRpc.includes(token)); assert.ok(!tokenRpc.includes("console.log")); assert.ok(!tokenRpc.includes("error.message"));
  assert.ok(tokenRpc.includes("diagnostics suppressed"));
});

test("host bootstrap stages before mutating, keeps credentials out of docker argv/environment and reuses exact file on retry", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outray-token-test-"))), f = resourceFixture(), file = join(dir, "instance.env"), output = join(dir, "outray-web-observability.env");
  writeFileSync(file, f.text, { mode: 0o600 });
  const calls = [], dbStates = []; let created = false, storedHash;
  const spawn = (_command, args, options) => {
    calls.push({ args, options });
    if (args[0] === "context") return { status: 0, stdout: "unix:///var/run/docker.sock" };
    if (args[3] === "inspect") {
      const value = args[2] === "network" ? f.network : args.at(-1) === tokenContainer ? f.ingest : f.postgres;
      return { status: 0, stdout: JSON.stringify(value) };
    }
    assert.equal(args[2], "exec");
    const value = JSON.parse(options.input);
    dbStates.push(value.auditOnly);
    assert.ok(!JSON.stringify(args).includes(value.tokenHash));
    assert.equal(options.env.DATABASE_URL, undefined); assert.equal(options.env.OUTRAY_INTERNAL_OBSERVABILITY_API_KEY, undefined);
    if (created) { assert.equal(value.tokenHash, storedHash); return { status: 0, stdout: JSON.stringify({ state: "existing", id: input.id }) }; }
    if (value.auditOnly) { assert.throws(() => readFileSync(output)); return { status: 0, stdout: '{"state":"absent"}' }; }
    assert.equal(lstatSync(output).mode & 0o777, 0o600);
    assert.equal(createHash("sha256").update(privateToken(readFileSync(output, "utf8"))).digest("hex"), value.tokenHash);
    storedHash = value.tokenHash; created = true;
    return { status: 0, stdout: JSON.stringify({ state: "created", id: value.id }) };
  };
  try {
    const args = ["--file", file, "--org", org, "--owner", owner];
    assert.equal((await runTokenBootstrap(args, { spawn })).state, "created");
    const saved = readFileSync(output, "utf8");
    assert.equal((await runTokenBootstrap(args, { spawn })).state, "existing");
    assert.equal(readFileSync(output, "utf8"), saved); assert.deepEqual(dbStates, [true, false, true, false]);
    const secret = privateToken(saved);
    assert.ok(!calls.some((call) => JSON.stringify(call.args).includes(secret) || JSON.stringify(call.options.env).includes(secret)));
    assert.equal(readFileSync(file, "utf8"), f.text);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("unsafe filesystem/context/resources stop before credential staging or database RPC", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "outray-token-test-"))), f = resourceFixture(), file = join(dir, "instance.env");
  writeFileSync(file, f.text, { mode: 0o600 });
  const args = ["--file", file, "--org", org, "--owner", owner];
  try {
    chmodSync(file, 0o644); await assert.rejects(runTokenBootstrap(args, { spawn: () => assert.fail("Docker must not be called") }));
    chmodSync(file, 0o600);
    await assert.rejects(runTokenBootstrap(args, { spawn: () => ({ status: 0, stdout: "ssh://hosted-vps" }) }));
    assert.throws(() => readFileSync(join(dir, "outray-web-observability.env")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
