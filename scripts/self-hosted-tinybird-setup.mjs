// One-time, explicitly scoped provisioning for the authorized independent Ops workspace.
// Never switches the project's .tinyb or persists account/admin tokens on the VPS.
import { createHash, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { opsWorkspace, opsTinybirdHost } from "./self-hosted-config-tinybird.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fail = (phase) => { throw new Error(`${phase} failed; credential-bearing diagnostics suppressed.`); };
const digest = (value) => createHash("sha256").update(value).digest("hex");

export function projectResources(project = root) {
  return {
    datasources: readdirSync(join(project, "tinybird/datasources")).filter((name) => name.endsWith(".datasource")).map((name) => basename(name, ".datasource")).sort(),
    pipes: readdirSync(join(project, "tinybird/endpoints")).filter((name) => name.endsWith(".pipe")).map((name) => basename(name, ".pipe")).sort(),
  };
}

export function assertScopes(scopes, type, resources) {
  if (!Array.isArray(scopes) || scopes.length !== resources.length
    || scopes.some((scope) => scope.type !== type || typeof scope.resource !== "string" || scope.filter)
    || JSON.stringify(scopes.map((scope) => scope.resource).sort()) !== JSON.stringify([...resources].sort())) fail("Least-privilege token verification");
}

async function request(path, token, { method = "GET", body } = {}) {
  const response = await fetch(new URL(path, opsTinybirdHost), {
    method, body, redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/x-ndjson" } : {}) },
  });
  if (!response.ok) fail(`Tinybird HTTP ${response.status}`);
  return response.json();
}

function command(executable, args, options, input) {
  return new Promise((complete, reject) => {
    const child = spawn(executable, args, { ...options, stdio: ["pipe", "pipe", "pipe"] });
    // Discard CLI output: tokens and API URLs can occur in provider diagnostics.
    child.stdout.resume(); child.stderr.resume();
    child.once("error", () => reject(new Error("Command unavailable; diagnostics suppressed.")));
    child.once("close", (code) => code === 0 ? complete() : reject(new Error(`Command failed (exit ${code}); diagnostics suppressed.`)));
    child.stdin.end(input);
  });
}

export async function setup({ deploy = false, configureOps = false, smoke = false } = {}) {
  const original = readFileSync(join(root, ".tinyb")), profile = JSON.parse(original);
  if (profile.host !== opsTinybirdHost || profile.id === opsWorkspace.id || !profile.token) fail("Source profile isolation");
  const workspaces = await request("/v1/user/workspaces/?with_environments=false", profile.token);
  const matches = workspaces.workspaces?.filter((item) => item.id === opsWorkspace.id && item.name === opsWorkspace.name);
  if (matches?.length !== 1 || !matches[0].token) fail("Exact Ops workspace discovery");
  const admin = matches[0].token;
  const identity = await request("/v1/workspace", admin);
  if (identity.id !== opsWorkspace.id || identity.name !== opsWorkspace.name) fail("Ops workspace identity");
  const inventory = async () => {
    const [datasources, pipes] = await Promise.all([request("/v0/datasources", admin), request("/v0/pipes", admin)]);
    return { datasources: datasources.datasources.map((item) => item.name).sort(), pipes: pipes.pipes.map((item) => item.name).sort() };
  };
  const before = await inventory(), expected = projectResources();
  console.log(JSON.stringify({ workspace: identity.name, id: identity.id, datasources: before.datasources.length, pipes: before.pipes.length }));
  if (deploy) {
    if (before.datasources.length || before.pipes.length) fail("First deployment requires an empty Ops workspace");
    const directory = mkdtempSync(join(tmpdir(), "outray-internal-ops-tinybird-"));
    try {
      cpSync(join(root, "tinybird"), join(directory, "tinybird"), { recursive: true });
      cpSync(join(root, "tinybird.config.json"), join(directory, "tinybird.config.json"));
      writeFileSync(join(directory, ".tinyb"), JSON.stringify({ host: opsTinybirdHost, id: identity.id, name: identity.name, token: admin }), { mode: 0o600 });
      const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "en_US.UTF-8", TB_HOST: opsTinybirdHost, TB_TOKEN: admin, TB_CLI_TELEMETRY_OPTOUT: "1", TB_VERSION_WARNING: "0" };
      for (const args of [["deploy", "--check", "--no-auto"], ["deploy", "--no-auto"], ["deployment", "promote", "--wait"]]) {
        console.log(`internal_ops: ${args.join(" ")}`);
        await command("tb", ["--cloud", ...args], { cwd: directory, env });
      }
    } finally {
      // Only the exact newly-created private temporary tree; no shared configuration.
      rmSync(directory, { recursive: true, force: true });
      if (digest(readFileSync(join(root, ".tinyb"))) !== digest(original)) fail("Local profile changed unexpectedly");
    }
  }
  const after = await inventory();
  if (JSON.stringify(after) !== JSON.stringify(expected)) fail("Deployed resource inventory verification");
  const tokens = (await request("/v0/tokens", admin)).tokens;
  const scoped = async (name, type, resources) => {
    const found = tokens.filter((item) => item.name === name);
    if (found.length !== 1) fail("Exact runtime token lookup");
    const token = await request(`/v0/tokens/${encodeURIComponent(found[0].id)}`, admin);
    assertScopes(token.scopes, type, resources);
    if (typeof token.token !== "string" || token.token === admin || token.token === profile.token) fail("Scoped credential isolation");
    return token.token;
  };
  const [queryToken, ingestToken] = await Promise.all([
    scoped("OUTRAY_QUERY_TOKEN", "PIPES:READ", expected.pipes),
    scoped("OUTRAY_INGEST_TOKEN", "DATASOURCES:APPEND", expected.datasources),
  ]);
  if (queryToken === ingestToken) fail("Reader/writer separation");
  console.log(JSON.stringify({ verified: true, workspace: identity.name, readEndpoints: expected.pipes.length, appendDatasources: expected.datasources.length, adminInRuntime: false }));
  if (smoke) {
    const org = `ops_smoke_${randomUUID().replaceAll("-", "")}`, tunnel = "deployment_smoke";
    const now = new Date(), start = new Date(now.getTime() - 60_000), end = new Date(now.getTime() + 60_000);
    const time = (date) => date.toISOString().replace("T", " ").replace("Z", "");
    const params = new URLSearchParams({ organization_id: org, tunnel_ids: JSON.stringify([tunnel]), start: time(start), end: time(end) });
    const stats = () => request(`/v0/pipes/tunnel_http_stats.json?${params}`, queryToken);
    if ((await stats()).data?.[0]?.total_requests !== 0) fail("Empty-workspace query smoke");
    const event = { timestamp: time(now), ingested_at: time(now), event_id: randomUUID(), tunnel_id: tunnel, organization_id: org, retention_days: 1, host: "deployment-smoke.invalid", method: "GET", path: "/deployment-smoke", status_code: 200, request_duration_ms: 7, bytes_in: 3, bytes_out: 5, client_ip: "", user_agent: "OutRay Ops deployment smoke", request_id: "" };
    const append = await request("/v0/events?name=tunnel_events&wait=true", ingestToken, { method: "POST", body: JSON.stringify(event) + "\n" });
    if (append.successful_rows !== 1 || append.quarantined_rows) fail("Synthetic ingestion smoke");
    let result;
    for (let attempt = 0; attempt < 10; attempt++) {
      result = await stats();
      if (result.data?.[0]?.total_requests === 1) break;
      await new Promise((complete) => setTimeout(complete, 1000));
    }
    if (result.data?.[0]?.total_requests !== 1 || result.data[0].total_bytes !== 8 || result.data[0].avg_duration !== 7) fail("Ingest-to-query smoke");
    console.log("Synthetic APPEND-to-READ verification passed: one isolated test event with one-day retention. No customer data copied.");
  }
  if (configureOps) {
    const input = JSON.stringify({ apiHost: opsTinybirdHost, queryToken, ingestToken, workspaceId: identity.id, workspaceName: identity.name }) + "\n";
    await command("ssh", ["-p", "22022", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "root@209.74.86.89", "node /opt/outray-ops/source/scripts/self-hosted-config-tinybird.mjs --file /opt/outray-ops/config/instance.env"], {}, input);
    console.log("Scoped credentials saved privately on the independent Ops VPS. Hosted and local env files are unchanged.");
  }
  if (digest(readFileSync(join(root, ".tinyb"))) !== digest(original)) fail("Local profile changed unexpectedly");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = process.argv.slice(2);
    if (new Set(flags).size !== flags.length || flags.some((flag) => !["--deploy", "--configure-ops", "--smoke"].includes(flag))) fail("Explicit setup arguments");
    await setup({ deploy: flags.includes("--deploy"), configureOps: flags.includes("--configure-ops"), smoke: flags.includes("--smoke") });
  } catch (error) { console.error(error?.message?.endsWith("diagnostics suppressed.") ? error.message : "Ops Tinybird setup failed; credential details suppressed."); process.exitCode = 1; }
}
