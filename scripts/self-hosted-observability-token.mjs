// Operator-only bootstrap for the independent Ops installation. Never prints credentials.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { configurationFrom, hostEnvironment, labelsFor, localDockerEndpoint, ownedResource, project } from "./self-hosted-rehearsal.mjs";

export const tokenName = "OutRay web internal observability";
export const tokenContainer = "outray-ops-public-ingest";
export const tokenEndpoint = "https://ingest.ops.outray.dev";
const failureMessage = "Ops observability token bootstrap refused; credential-bearing diagnostics suppressed. Existing data and credentials are preserved.";
const fail = () => { throw new Error(failureMessage); };
const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const credentialKeys = ["OUTRAY_INTERNAL_OBSERVABILITY_API_KEY", "OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT", "OUTRAY_INTERNAL_OBSERVABILITY_SERVICE_NAME", "OUTRAY_INTERNAL_OBSERVABILITY_ENVIRONMENT"];

export function tokenArguments(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!["--file", "--org", "--owner"].includes(key) || args[key] || !value || value.startsWith("--")) fail();
    args[key] = value;
  }
  if (!args["--file"] || ![args["--org"], args["--owner"]].every((value) => /^[A-Za-z0-9_-]{20,64}$/.test(value || ""))) fail();
  const file = resolve(args["--file"]);
  if (!file.endsWith("/instance.env")) fail();
  return { file, output: resolve(dirname(file), "outray-web-observability.env"), organizationId: args["--org"], ownerId: args["--owner"] };
}

export function assertOpsConfiguration(source) {
  const config = configurationFrom(source);
  const expected = {
    OUTRAY_APP_HOST: "ops.outray.dev", OUTRAY_INGEST_HOST: "ingest.ops.outray.dev",
    OUTRAY_EDGE_HOST: "edge.ops.outray.dev", OUTRAY_STATUS_HOST: "status.ops.outray.dev", OUTRAY_SHARE_HOST: "share.ops.outray.dev",
  };
  if (Object.entries(expected).some(([key, value]) => config[key] !== value)
    || (source.CONSOLE_PUBLIC_URL && source.CONSOLE_PUBLIC_URL !== "https://ops.outray.dev")) fail();
  return config;
}

function containerEnvironment(metadata) {
  return Object.fromEntries((metadata?.Config?.Env || []).map((entry) => { const index = entry.indexOf("="); return [entry.slice(0, index), entry.slice(index + 1)]; }));
}

export function assertTokenResources(config, network, postgres, ingest) {
  const labels = labelsFor(config), postgresHost = postgres?.HostConfig || {}, ingestHost = ingest?.HostConfig || {};
  if (!network?.Internal || network.Driver !== "bridge" || !ownedResource(network, labels)) fail();
  if (!ownedResource({ Labels: postgres?.Config?.Labels }, labels) || postgres?.State?.Status !== "running"
    || postgres.State.Health?.Status !== "healthy" || postgresHost.NetworkMode !== project || postgresHost.Privileged
    || postgresHost.PublishAllPorts || Object.keys(postgresHost.PortBindings || {}).length
    || JSON.stringify(Object.keys(postgres.NetworkSettings?.Networks || {}).sort()) !== JSON.stringify([project])) fail();
  const database = `postgresql://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${project}-postgres:5432/${config.POSTGRES_DB}?sslmode=disable`;
  const env = containerEnvironment(ingest), pgEnv = containerEnvironment(postgres);
  if (["POSTGRES_USER", "POSTGRES_DB", "POSTGRES_PASSWORD"].some((key) => pgEnv[key] !== config[key])) fail();
  if (!/^[a-f0-9]{64}$/.test(ingest?.Id || "") || !ownedResource({ Labels: ingest?.Config?.Labels }, labels)
    || ingest.Config.Labels["com.outray.ingest-preview"] !== "true" || ingest.State?.Status !== "running"
    || ingest.State.Health?.Status !== "healthy" || ingest.Config.User !== "node" || ingest.Config.WorkingDir !== "/app"
    || JSON.stringify(ingest.Config.Cmd) !== JSON.stringify(["node", "apps/ingest/dist/server.js"])
    || env.DATABASE_URL !== database || env.OUTRAY_DEPLOYMENT_MODE !== "self-hosted"
    || !ingestHost.ReadonlyRootfs || ingestHost.Privileged || ingestHost.PublishAllPorts || Object.keys(ingestHost.PortBindings || {}).length
    || ingestHost.CapDrop?.length !== 1 || ingestHost.CapDrop[0] !== "ALL" || ingestHost.CapAdd?.length
    || !ingestHost.SecurityOpt?.includes("no-new-privileges:true") || !ingest.NetworkSettings?.Networks?.[project]
    || (ingest.Mounts || []).some((mount) => mount.Type !== "tmpfs")) fail();
}

export function tokenConfiguration(token) {
  if (!/^outray_[A-Za-z0-9_-]{43}$/.test(token || "")) fail();
  return Object.fromEntries(credentialKeys.map((key, index) => [key, [token, tokenEndpoint, "outray-web", "production"][index]]));
}

export function privateToken(contents) {
  const env = parseEnv(contents);
  if (Object.keys(env).sort().join(",") !== [...credentialKeys].sort().join(",")) fail();
  const expected = tokenConfiguration(env.OUTRAY_INTERNAL_OBSERVABILITY_API_KEY);
  if (credentialKeys.some((key) => expected[key] !== env[key])) fail();
  // Duplicate assignments can hide malformed or hand-modified private credentials.
  for (const key of credentialKeys) if ((contents.match(new RegExp(`^${key}=`, "gm")) || []).length !== 1) fail();
  return env.OUTRAY_INTERNAL_OBSERVABILITY_API_KEY;
}

function privateInfo(file, requireFile = true) {
  const parent = lstatSync(dirname(file));
  if (!parent.isDirectory() || parent.mode & 0o077 || parent.uid !== process.getuid() || realpathSync(dirname(file)) !== dirname(file)) fail();
  let info;
  try { info = lstatSync(file); } catch (error) { if (error.code === "ENOENT" && !requireFile) return null; fail(); }
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600 || info.uid !== process.getuid() || info.nlink !== 1 || realpathSync(file) !== file) fail();
  return info;
}

/** Stage before DB commit: failures preserve the only raw credential, allowing an exact retry. */
export function stagePrivateToken(file, token) {
  const values = tokenConfiguration(token);
  privateInfo(file, false);
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeFileSync(descriptor, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n");
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  const parentDescriptor = openSync(dirname(file), "r");
  try { fsyncSync(parentDescriptor); } finally { closeSync(parentDescriptor); }
  privateInfo(file);
}

/** Mirrors normal hashed machine-token creation and audit, without manufacturing a login session. */
export async function provisionObservabilityToken(client, input) {
  const refused = () => { throw new Error("Token bootstrap refused"); };
  if (!input || ![input.organizationId, input.ownerId].every((value) => /^[A-Za-z0-9_-]{20,64}$/.test(value || ""))
    || input.name !== "OutRay web internal observability" || !/^[a-f0-9]{64}$/.test(input.tokenHash || "")
    || !/^outray_[A-Za-z0-9_-]{8}$/.test(input.prefix || "") || !/^[a-z_][a-z0-9_]*$/.test(input.database || "")
    || !/^[a-f0-9-]{36}$/.test(input.id || "") || !/^[a-f0-9-]{36}$/.test(input.auditId || "")) refused();
  await client.query("BEGIN");
  try {
    const database = await client.query("SELECT current_database() AS name");
    if (database.rows.length !== 1 || database.rows[0].name !== input.database) refused();
    // Organization lock is the same serialization boundary used by token creation in the console.
    const organization = await client.query("SELECT id, slug FROM organizations WHERE id=$1 FOR UPDATE", [input.organizationId]);
    if (organization.rows.length !== 1 || organization.rows[0].slug !== "outray") refused();
    const membership = await client.query("SELECT m.role, u.email_verified FROM members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 FOR SHARE OF m,u", [input.organizationId, input.ownerId]);
    if (membership.rows.length !== 1 || membership.rows[0].role !== "owner" || membership.rows[0].email_verified !== true) refused();
    const existing = await client.query("SELECT id, token_hash, prefix, scopes, created_by_id, project_id, environment_id, expires_at, revoked_at FROM secrets_machine_tokens WHERE organization_id=$1 AND name=$2 FOR UPDATE", [input.organizationId, input.name]);
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (existing.rows.length !== 1 || row.token_hash !== input.tokenHash || row.prefix !== input.prefix
        || JSON.stringify(row.scopes) !== JSON.stringify(["observability:write"]) || row.created_by_id !== input.ownerId
        || row.project_id !== null || row.environment_id !== null || row.expires_at !== null || row.revoked_at !== null) refused();
      await client.query("ROLLBACK");
      return { state: "existing", id: row.id };
    }
    if (input.auditOnly) { await client.query("ROLLBACK"); return { state: "absent" }; }
    await client.query("INSERT INTO secrets_machine_tokens (id,name,organization_id,project_id,environment_id,token_hash,prefix,scopes,created_by_id,expires_at) VALUES ($1,$2,$3,NULL,NULL,$4,$5,$6::jsonb,$7,NULL)", [input.id, input.name, input.organizationId, input.tokenHash, input.prefix, JSON.stringify(["observability:write"]), input.ownerId]);
    await client.query("INSERT INTO secret_audit_events (id,organization_id,actor_type,actor_credential,actor_id,action,result,request_id,target_type,target_id,target_name,metadata) VALUES ($1,$2,'system','system',NULL,'machine_token.created','success',$3,'machine_token',$4,$5,$6::jsonb)", [input.auditId, input.organizationId, input.auditId, input.id, input.name, JSON.stringify({ prefix: input.prefix, scopes: ["observability:write"], bootstrapOwnerId: input.ownerId, source: "independent-ops-observability-bootstrap" })]);
    await client.query("COMMIT");
    return { state: "created", id: input.id };
  } catch { await client.query("ROLLBACK"); refused(); }
}

export const tokenRpc = `
const { createRequire } = require('node:module');
const pg = createRequire('/app/ops-token-bootstrap.cjs')('pg');
const provision = ${provisionObservabilityToken.toString()};
let input=''; process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input+=chunk; if(input.length>10000) process.exit(1); });
process.stdin.on('end', async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis:5000, statement_timeout:10000 });
  try { await client.connect(); const result=await provision(client,JSON.parse(input)); process.stdout.write(JSON.stringify(result)); }
  catch { process.stderr.write('Token bootstrap refused; diagnostics suppressed.'); process.exitCode=1; }
  finally { await client.end().catch(()=>{}); }
});
`;

export async function runTokenBootstrap(argv = process.argv.slice(2), dependencies = {}) {
  const options = tokenArguments(argv);
  privateInfo(options.file);
  const config = assertOpsConfiguration(parseEnv(readFileSync(options.file, "utf8")));
  const present = privateInfo(options.output, false);
  const token = present ? privateToken(readFileSync(options.output, "utf8")) : `outray_${randomBytes(32).toString("base64url")}`;
  const env = hostEnvironment(), spawn = dependencies.spawn || spawnSync;
  const context = spawn("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { env, encoding: "utf8", timeout: 10000 });
  if (context.status !== 0) fail();
  const endpoint = localDockerEndpoint(context.stdout.trim());
  const inspect = (kind, name) => {
    const result = spawn("docker", ["--host", endpoint, kind, "inspect", "--format", "{{json .}}", name], { env, encoding: "utf8", timeout: 10000, maxBuffer: 1000000 });
    if (result.status !== 0) fail();
    try { return JSON.parse(result.stdout); } catch { fail(); }
  };
  const network = inspect("network", project), postgres = inspect("container", `${project}-postgres`), ingest = inspect("container", tokenContainer);
  assertTokenResources(config, network, postgres, ingest);
  const input = { organizationId: options.organizationId, ownerId: options.ownerId, database: config.POSTGRES_DB,
    name: tokenName, id: randomUUID(), auditId: randomUUID(), tokenHash: hash(token), prefix: token.slice(0, 15) };
  const invoke = (auditOnly) => {
    // Raw credentials and SQL parameters never occur in arguments or process environment.
    const result = spawn("docker", ["--host", endpoint, "exec", "-i", ingest.Id, "node", "-e", tokenRpc], {
      env, encoding: "utf8", input: JSON.stringify({ ...input, auditOnly }), timeout: 30000, maxBuffer: 10000,
    });
    if (result.status !== 0) fail();
    let value;
    try { value = JSON.parse(result.stdout); } catch { fail(); }
    if (!value || !(auditOnly ? ["existing", "absent"] : ["existing", "created"]).includes(value.state)
      || (value.state !== "absent" && !/^[a-f0-9-]{36}$/.test(value.id || "")) || (value.state === "created" && value.id !== input.id)) fail();
    return value;
  };
  const before = invoke(true);
  if (!present && before.state !== "absent") fail();
  if (!present) stagePrivateToken(options.output, token);
  // Recheck exact IDs, ownership and database before mutating, not just at initial inspection.
  const current = inspect("container", tokenContainer);
  if (current.Id !== ingest.Id) fail();
  assertTokenResources(config, inspect("network", project), inspect("container", `${project}-postgres`), current);
  const result = invoke(false);
  console.log(`Scoped Ops observability token ${result.state === "created" ? "created" : "verified"}; its credential is saved only in the private server-side integration file.`);
  return { state: result.state, file: options.output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runTokenBootstrap(); } catch { console.error(failureMessage); process.exitCode = 1; }
}
