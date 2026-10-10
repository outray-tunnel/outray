// Explicit independent Ops ingestion only. The public gateway is configured
// separately, after private dependency/consumer health has passed.
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { sourceManifest } from "./self-hosted-artifacts.mjs";
import { configurationFrom, hostEnvironment, labelsFor, localDockerEndpoint, missingResource, ownedResource, project } from "./self-hosted-rehearsal.mjs";
import { opsTinybirdHost } from "./self-hosted-config-tinybird.mjs";

export const ingestContainer = "outray-ops-public-ingest";
export const ingestEgressNetwork = "outray-ops-ingest-egress";
export const ingestImageLabel = "com.outray.ingest-preview";
export const ingestConfigurationLabel = "com.outray.ingest-preview.configuration";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => { throw new Error(message); };
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const allowedEnvironment = new Set(["NODE_ENV", "OUTRAY_DEPLOYMENT_MODE", "OUTRAY_PRODUCTS", "OUTRAY_ENABLED", "OUTRAY_RETENTION_DAYS", "INGEST_PORT", "DATABASE_URL", "DATABASE_SSL_REJECT_UNAUTHORIZED", "REDIS_URL", "TINYBIRD_API_HOST", "TINYBIRD_INGEST_TOKEN", "OTLP_MAX_PAYLOAD_BYTES", "OTLP_MAX_RECORDS_PER_REQUEST", "OTLP_RATE_LIMIT_PER_MINUTE", "OTLP_QUEUE_MAX_ENTRIES", "OTLP_LOGS_QUEUE_MAX_ENTRIES", "OTLP_METRICS_QUEUE_MAX_ENTRIES", "OTLP_QUEUE_BATCH_SIZE", "OTLP_QUEUE_MAX_DELIVERY_ATTEMPTS"]);
const imageEnvironment = new Set(["PATH", "NODE_VERSION", "YARN_VERSION"]);

// The worker's /health is only HTTP liveness. This readiness command also
// establishes PostgreSQL/Redis connectivity and checks its own live consumers.
export const ingestHealthScript = `
const pg=require('pg'),Redis=require('ioredis'),os=require('node:os');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1500,query_timeout:1500});
const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,connectTimeout:1500,commandTimeout:1500,maxRetriesPerRequest:0,retryStrategy:()=>null});
redis.on('error',()=>{});
const timer=setTimeout(()=>process.exit(1),6500);
(async()=>{
 await Promise.all([db.connect(),redis.connect()]);
 const [result,pong,response]=await Promise.all([db.query('SELECT 1 AS ready'),redis.ping(),fetch('http://127.0.0.1:4318/health',{signal:AbortSignal.timeout(1500)})]);
 if(result.rows[0]?.ready!==1||pong!=='PONG'||!response.ok||(await response.json()).service!=='outray-ingest')throw new Error();
 for(const key of ['outray:otel:traces','outray:otel:logs','outray:otel:metrics']){
  const consumers=await redis.xinfo('CONSUMERS',key,'tinybird-writers');
  if(!consumers.some(row=>{const item=Object.fromEntries(Array.from({length:row.length/2},(_,i)=>[row[i*2],row[i*2+1]]));return typeof item.name==='string'&&item.name.startsWith(os.hostname()+':')&&Number(item.idle)<10000}))throw new Error();
 }
 await Promise.all([db.end(),redis.quit()]);clearTimeout(timer);
})().catch(()=>process.exit(1));
`;
// Docker CMD-SHELL invokes /bin/sh: JSON's escaped newlines are not shell
// newlines. Keep the launcher one line and decode the fixed script in Node.
export const ingestHealthCommand = `node -e ${JSON.stringify(`eval(Buffer.from('${Buffer.from(ingestHealthScript).toString("base64")}','base64').toString('utf8'))`)}`;

export function ingestArguments(argv) {
  const selected = [], options = { recover: false };
  for (const value of argv) {
    if (value === "--recover") { if (options.recover) fail("Duplicate ingestion option"); options.recover = true; }
    else selected.push(value);
  }
  const result = {};
  for (let index = 0; index < selected.length; index += 2) {
    const key = selected[index], value = selected[index + 1];
    if (!["--file", "--image"].includes(key) || !value || value.startsWith("--") || result[key]) fail("Use --file PRIVATE_FRESH_CONFIG --image AUDITED_INGEST_IMAGE [--recover]");
    result[key] = value;
  }
  if (!result["--file"] || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(result["--image"] || "")) fail("Explicit private configuration and ingestion image are required");
  const file = resolve(result["--file"]);
  if (/\/(?:\.env|\.env\.prod|\.env\.production)$/.test(file)) fail("Hosted environment files cannot be used");
  return { file, image: result["--image"], ...options };
}

export function ingestDefinition(config, raw) {
  if (config.OUTRAY_APP_HOST !== "ops.outray.dev" || config.OUTRAY_INGEST_HOST !== "ingest.ops.outray.dev" || config.OUTRAY_STATUS_HOST !== "status.ops.outray.dev") fail("Only the authorized independent Ops installation is supported");
  if (raw.TINYBIRD_API_HOST !== opsTinybirdHost || !/^[A-Za-z0-9._~+\/=-]{20,4096}$/.test(raw.TINYBIRD_INGEST_TOKEN || "")
    || raw.TINYBIRD_INGEST_TOKEN === raw.TINYBIRD_QUERY_TOKEN || raw.TINYBIRD_TUNNEL_INGEST_TOKEN?.trim()) fail("Use the independent Ops workspace's scoped APPEND credential, not READ, tunnel or admin credentials");
  const retention = raw.OUTRAY_RETENTION_DAYS || "1";
  if (!/^[1-9]\d{0,2}$/.test(retention) || Number(retention) > 365) fail("An explicit valid independent retention limit is required");
  const env = {
    NODE_ENV: "production", OUTRAY_DEPLOYMENT_MODE: "self-hosted", OUTRAY_PRODUCTS: "observability", OUTRAY_ENABLED: "false", OUTRAY_RETENTION_DAYS: retention,
    INGEST_PORT: "4318", DATABASE_URL: `postgresql://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${project}-postgres:5432/${config.POSTGRES_DB}?sslmode=disable`,
    DATABASE_SSL_REJECT_UNAUTHORIZED: "true", REDIS_URL: `redis://${project}-redis:6379`,
    TINYBIRD_API_HOST: opsTinybirdHost, TINYBIRD_INGEST_TOKEN: raw.TINYBIRD_INGEST_TOKEN,
    OTLP_MAX_PAYLOAD_BYTES: "8388608", OTLP_MAX_RECORDS_PER_REQUEST: "10000", OTLP_RATE_LIMIT_PER_MINUTE: "600",
    OTLP_QUEUE_MAX_ENTRIES: "10000", OTLP_LOGS_QUEUE_MAX_ENTRIES: "10000", OTLP_METRICS_QUEUE_MAX_ENTRIES: "10000",
    OTLP_QUEUE_BATCH_SIZE: "10", OTLP_QUEUE_MAX_DELIVERY_ATTEMPTS: "5",
  };
  return { env, command: ["node", "apps/ingest/dist/server.js"], healthCommand: ingestHealthCommand };
}

export function assertIngestEnvironment(values, definition) {
  for (const [key, value] of Object.entries(values)) if (!allowedEnvironment.has(key) && !(imageEnvironment.has(key) && value)) fail("Unexpected ingestion environment; unrelated provider credentials are forbidden");
  for (const [key, value] of Object.entries(definition.env)) if (values[key] !== value) fail("Ingestion configuration does not match the fresh independent installation");
}

export function ingestLabels(config, image, definition) {
  return { ...labelsFor(config), [ingestImageLabel]: "true", [ingestConfigurationLabel]: fingerprint({ image, definition }) };
}

export function safeIngestContainer(metadata, image, labels, definition, networkIds = null) {
  const host = metadata?.HostConfig || {}, cfg = metadata?.Config || {}, attachments = metadata?.NetworkSettings?.Networks || {};
  const env = Object.fromEntries((cfg.Env || []).map((value) => { const separator = value.indexOf("="); return [value.slice(0, separator), value.slice(separator + 1)]; }));
  try { assertIngestEnvironment(env, definition); } catch { return false; }
  return Boolean(ownedResource({ Labels: cfg.Labels }, labels) && metadata.Image === image && cfg.User === "node" && cfg.WorkingDir === "/app" && cfg.Hostname === ingestContainer
    && JSON.stringify(cfg.Cmd) === JSON.stringify(definition.command) && !cfg.Entrypoint?.length && cfg.Healthcheck?.Test?.[0] === "CMD-SHELL"
    && cfg.Healthcheck.Test.length === 2 && cfg.Healthcheck.Test[1] === definition.healthCommand && cfg.Healthcheck.Interval === 10_000_000_000
    && cfg.Healthcheck.Timeout === 8_000_000_000 && cfg.Healthcheck.Retries === 3 && cfg.Healthcheck.StartPeriod === 20_000_000_000
    && host.ReadonlyRootfs && !host.Privileged && !host.PublishAllPorts && !Object.keys(host.PortBindings || {}).length
    && host.CapDrop?.length === 1 && host.CapDrop[0] === "ALL" && !host.CapAdd?.length && host.SecurityOpt?.length === 1 && host.SecurityOpt[0] === "no-new-privileges:true"
    && host.Init === true && host.NetworkMode === project && ["no", "unless-stopped"].includes(host.RestartPolicy?.Name)
    && JSON.stringify(Object.keys(attachments).sort()) === JSON.stringify([project, ingestEgressNetwork].sort())
    // Docker may clear the primary bridge's resolved NetworkID while created
    // or exited. Its exact names + NetworkMode still bind it to the owned
    // networks audited above. Running containers must resolve both exact IDs.
    && (!networkIds || Object.entries(networkIds).every(([name, id]) => attachments[name]?.NetworkID === id
      || (["created", "exited"].includes(metadata.State?.Status) && attachments[name] && !attachments[name].NetworkID)))
    && !host.ExtraHosts?.length && !host.Links?.length && !host.VolumesFrom?.length && !host.Devices?.length
    && host.Memory === 536870912 && host.MemorySwap === 536870912 && host.PidsLimit === 128
    && Object.keys(host.Tmpfs || {}).length === 1 && host.Tmpfs["/tmp"] === "size=64m,mode=1777"
    && (metadata.Mounts || []).every((mount) => mount.Type === "tmpfs" && mount.Destination === "/tmp")
    && host.LogConfig?.Type === "json-file" && host.LogConfig.Config?.["max-size"] === "10m" && host.LogConfig.Config?.["max-file"] === "3");
}

export function safeIngestEgress(metadata, labels, containerId = null) {
  return Boolean(metadata && ownedResource(metadata, labels) && metadata.Name === ingestEgressNetwork && metadata.Driver === "bridge"
    && metadata.Scope === "local" && metadata.Internal === false && !metadata.EnableIPv6 && !metadata.Ingress && !metadata.Attachable
    && Object.keys(metadata.Options || {}).length === 0
    && Object.entries(metadata.Containers || {}).every(([id, member]) => containerId && id === containerId && member.Name === ingestContainer));
}

export function ingestContainerArguments(definition, image, labels) {
  const args = ["create", "--pull", "never", "--name", ingestContainer, "--hostname", ingestContainer, "--restart", "no", "--network", project,
    "--init", "--user", "node", "--read-only", "--tmpfs", "/tmp:size=64m,mode=1777", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
    "--pids-limit", "128", "--memory", "512m", "--memory-swap", "512m", "--log-driver", "json-file", "--log-opt", "max-size=10m", "--log-opt", "max-file=3",
    "--health-cmd", definition.healthCommand, "--health-interval", "10s", "--health-timeout", "8s", "--health-retries", "3", "--health-start-period", "20s"];
  for (const [key, value] of Object.entries(labels)) args.push("--label", `${key}=${value}`);
  for (const key of Object.keys(definition.env)) args.push("-e", key);
  return [...args, image, ...definition.command];
}

export const ingestRuntimeAudit = `
const fs=require('node:fs'),crypto=require('node:crypto');
const m=JSON.parse(fs.readFileSync('/app/self-hosted-artifact-manifest.json'));
if(m.version!==1||m.iconMode!=='free'||m.deploymentMode!=='self-hosted'||m.targetNodeMajor!==22||process.versions.node.split('.')[0]!=='22')process.exit(1);
if(JSON.stringify(fs.readdirSync('/app/apps'))!==JSON.stringify(['ingest']))process.exit(1);
for(const path of ['/app/.env','/app/.env.prod','/app/.npmrc','/app/scripts','/app/packages'])if(fs.existsSync(path))process.exit(1);
for(const file of m.artifacts.files.filter(f=>f.path.startsWith('apps/ingest/dist/'))){
 if(!file.sha256||file.sha256!==crypto.createHash('sha256').update(fs.readFileSync('/app/'+file.path)).digest('hex'))process.exit(1);
}
if(!m.artifacts.files.some(f=>f.path==='apps/ingest/dist/server.js'))process.exit(1);
for(const name of ['pg','ioredis','protobufjs'])require(name);
for(const name of fs.readdirSync('/app/node_modules'))if(name==='@hugeicons-pro'||['seroval','react','astro','express','sharp'].includes(name))process.exit(1);
`;

export async function runIngest(argv = process.argv.slice(2), dependencies = {}) {
  const lifecycle = { interrupted: false, cleanup: null };
  const interrupt = () => {
    lifecycle.interrupted = true;
    try { lifecycle.cleanup?.(); } catch { process.exitCode = 1; }
  };
  process.once("SIGTERM", interrupt); process.once("SIGINT", interrupt);
  try { return await runManagedIngest(argv, dependencies, lifecycle); }
  finally { process.removeListener("SIGTERM", interrupt); process.removeListener("SIGINT", interrupt); }
}

async function runManagedIngest(argv, dependencies, lifecycle) {
  const options = ingestArguments(argv), info = lstatSync(options.file);
  if (!info.isFile() || (info.mode & 0o077)) fail("Use a regular private mode0600 fresh configuration file");
  const raw = parseEnv(readFileSync(options.file, "utf8")), config = configurationFrom(raw), definition = ingestDefinition(config, raw);
  const spawn = dependencies.spawn || spawnSync, pause = dependencies.delay || delay, env = hostEnvironment();
  const context = spawn("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { env, encoding: "utf8", timeout: 10_000 });
  if (context.status !== 0) fail("Cannot inspect local Docker context");
  const endpoint = localDockerEndpoint(context.stdout.trim());
  const invoke = (args, values = {}) => spawn("docker", ["--host", endpoint, ...args], { env: { ...env, ...values }, encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000 });
  const required = (args, values) => { const result = invoke(args, values); if (result.status !== 0) fail("Ingestion operation failed; credential-bearing diagnostics suppressed"); return result.stdout.trim(); };
  const inspect = (kind, target) => {
    const result = invoke([kind, "inspect", "--format", "{{json .}}", target]);
    if (result.status !== 0) { if (missingResource(result.stderr || "", kind, target)) return null; fail("Cannot safely inspect owned ingestion resources"); }
    try { return JSON.parse(result.stdout); } catch { fail("Cannot parse owned ingestion metadata"); }
  };
  const baseLabels = labelsFor(config), core = inspect("network", project);
  if (!core || !ownedResource(core, baseLabels) || !core.Internal || core.Driver !== "bridge" || !core.Id) fail("The matching owned internal Ops network is required");
  for (const kind of ["postgres", "redis"]) {
    const metadata = inspect("container", `${project}-${kind}`), host = metadata?.HostConfig || {}, attachment = metadata?.NetworkSettings?.Networks?.[project];
    if (!metadata || !ownedResource({ Labels: metadata.Config?.Labels }, baseLabels) || metadata.State?.Status !== "running" || metadata.State.Health?.Status !== "healthy"
      || host.NetworkMode !== project || host.Privileged || host.PublishAllPorts || Object.keys(host.PortBindings || {}).length
      || JSON.stringify(Object.keys(metadata.NetworkSettings?.Networks || {})) !== JSON.stringify([project]) || attachment?.NetworkID !== core.Id) fail("Healthy owned isolated PostgreSQL and Redis are required");
  }
  const image = inspect("image", options.image);
  if (!image || image.Config?.User !== "node" || image.Config.WorkingDir !== "/app" || image.Config.Labels?.[ingestImageLabel] !== "true"
    || image.Config.Entrypoint?.length || JSON.stringify(image.Config.Cmd) !== JSON.stringify(definition.command)) fail("Use the audited dedicated ingestion-only image");
  const labels = ingestLabels(config, image.Id, definition), egressLabels = { ...baseLabels, [ingestImageLabel]: "true" };
  let container = inspect("container", ingestContainer), egress = inspect("network", ingestEgressNetwork);
  if (egress && !safeIngestEgress(egress, egressLabels, container?.Id)) fail("Existing ingestion egress is mismatched or shared; refusing foreign network adoption");
  if (container && (!egress || !safeIngestContainer(container, image.Id, labels, definition, { [project]: core.Id, [ingestEgressNetwork]: egress.Id }))) fail("Existing ingestion worker is mismatched; refusing replacement");
  const expectedSource = sourceManifest(dependencies.source || root).sha256;
  required(["run", "--rm", "--pull", "never", "--name", `${ingestContainer}-audit-${randomUUID()}`, "--network", "none", "--read-only", "--user", "node", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", options.image, "node", "-e", `${ingestRuntimeAudit}\nif(m.source.sha256!==${JSON.stringify(expectedSource)})process.exit(1);`]);
  if (lifecycle.interrupted) fail("Ingestion startup interrupted before activation");
  if (container?.State.Status === "running" && container.State.Health?.Status === "healthy") {
    required(["exec", container.Id, "node", "-e", ingestHealthScript]);
    console.log("Exact owned ingestion service is already healthy; PostgreSQL, Redis and all three consumers verified");
    return;
  }
  if (container && !options.recover) fail("An existing inactive worker requires explicit --recover after ownership checks");
  if (container) {
    if (!["running", "created", "exited"].includes(container.State.Status)) fail("Ingestion worker is not in a recoverable state");
    if (container.State.Status === "running") required(["stop", "--time", "15", container.Id]);
    required(["rm", container.Id]);
    container = null;
  }
  if (!egress) {
    required(["network", "create", "--driver", "bridge", ...Object.entries(egressLabels).flatMap(([key, value]) => ["--label", `${key}=${value}`]), ingestEgressNetwork]);
    egress = inspect("network", ingestEgressNetwork);
    if (!safeIngestEgress(egress, egressLabels)) fail("Unexpected new ingestion egress; no worker was started");
  }
  const networkIds = { [project]: core.Id, [ingestEgressNetwork]: egress.Id };
  const id = required(ingestContainerArguments(definition, options.image, labels), definition.env);
  let validated = false;
  try {
    required(["network", "connect", "--gw-priority", "1", ingestEgressNetwork, id]);
    container = inspect("container", ingestContainer);
    if (container?.Id !== id || !safeIngestContainer(container, image.Id, labels, definition, networkIds)) fail("Unexpected new ingestion isolation; never started");
    validated = true;
    lifecycle.cleanup = () => {
      const current = inspect("container", ingestContainer);
      if (current?.Id === id && safeIngestContainer(current, image.Id, labels, definition, networkIds) && current.State?.Status === "running") {
        required(["update", "--restart", "no", id]);
        required(["stop", "--time", "15", id]);
      }
    };
    if (lifecycle.interrupted) fail("Ingestion startup interrupted before activation");
    required(["start", id]);
    let healthy = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (lifecycle.interrupted) fail("Ingestion startup interrupted during readiness");
      container = inspect("container", ingestContainer);
      if (container?.Id !== id || !safeIngestContainer(container, image.Id, labels, definition, networkIds) || container.State?.Status !== "running" || container.State.OOMKilled) fail("Ingestion startup or isolation failed");
      if (container.State.Health?.Status === "healthy") { healthy = true; break; }
      if (container.State.Health?.Status === "unhealthy") break;
      await pause(1000);
    }
    if (!healthy) fail("Ingestion dependency/consumer readiness deadline exceeded; public gateway remains unchanged");
    required(["exec", id, "node", "-e", ingestHealthScript]);
    if (lifecycle.interrupted) fail("Ingestion startup interrupted before restart activation");
    required(["update", "--restart", "unless-stopped", id]);
    container = inspect("container", ingestContainer);
    if (container?.Id !== id || !safeIngestContainer(container, image.Id, labels, definition, networkIds) || container.State?.Health?.Status !== "healthy" || container.HostConfig.RestartPolicy.Name !== "unless-stopped") fail("Ingestion restart/isolation verification failed");
    console.log("Independent ingestion service is healthy on its private network; PostgreSQL, Redis and all three consumers verified. No application ports, probes, email or other products were enabled");
  } catch (error) {
    if (validated) lifecycle.cleanup?.();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runIngest(); } catch (error) { console.error(error?.code ? "Ingestion activation failed; filesystem and credential details suppressed" : error.message); process.exitCode = 1; }
}
