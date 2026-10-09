import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, statfsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { validHostname } from "./self-hosted.mjs";

export const project = "outray-ops-rehearsal";
const managedLabel = "com.outray.rehearsal.managed";
const instanceLabel = "com.outray.rehearsal.instance";
const configurationLabel = "com.outray.rehearsal.configuration";
const hostKeys = ["OUTRAY_APP_HOST", "OUTRAY_TUNNEL_DOMAIN", "OUTRAY_EDGE_HOST", "OUTRAY_INGEST_HOST", "OUTRAY_STATUS_HOST", "OUTRAY_SHARE_HOST"];
const secretKeys = ["POSTGRES_PASSWORD", "SHARE_DATABASE_PASSWORD", "BETTER_AUTH_SECRET", "ADMIN_PASSPHRASE", "INTERNAL_API_SECRET", "STATUS_EDGE_SECRET", "UPTIME_RATE_LIMIT_SECRET", "UPTIME_UNSUBSCRIBE_SECRET", "SHARE_RATE_LIMIT_SECRET"];

class RehearsalError extends Error {}
const fail = (message) => { throw new RehearsalError(message); };
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function argumentsFor(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index], value = argv[index + 1];
    if (!["--file", "--image"].includes(option) || !value || value.startsWith("--") || result[option]) fail("Use --file PRIVATE_FRESH_CONFIG --image BUILT_IMAGE; both options are required.");
    result[option] = value;
  }
  if (!result["--file"] || !result["--image"] || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(result["--image"])) fail("Use --file PRIVATE_FRESH_CONFIG --image BUILT_IMAGE; both options are required.");
  const file = resolve(result["--file"]);
  if ([".env", ".env.prod", ".env.production"].includes(basename(file))) fail("Do not use a hosted or production env file for a private rehearsal.");
  return { file, image: result["--image"] };
}

export function configurationFrom(source) {
  if (source.OUTRAY_DEPLOYMENT_MODE !== "self-hosted") fail("A fresh explicitly self-hosted configuration is required.");
  for (const key of hostKeys) if (!validHostname(source[key])) fail("The fresh configuration needs valid, distinct installation hostnames.");
  if (new Set(hostKeys.map((key) => source[key])).size !== hostKeys.length) fail("The fresh configuration needs valid, distinct installation hostnames.");
  for (const key of secretKeys) if (!/^[a-f0-9]{64}$/.test(source[key] || "")) fail("Initialize fresh independent internal credentials before rehearsing.");
  if (new Set(secretKeys.map((key) => source[key])).size !== secretKeys.length) fail("Initialize fresh independent internal credentials before rehearsing.");
  if (!/^[a-z_][a-z0-9_]*$/.test(source.POSTGRES_USER || "") || source.POSTGRES_USER === "outray_share_app" || !/^[a-z_][a-z0-9_]*$/.test(source.POSTGRES_DB || "")) fail("Use safe PostgreSQL identifiers and a separate restricted Share role.");
  if (!source.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID?.trim() || !/^[A-Za-z0-9+/]{43}=$/.test(source.OUTRAY_SECRETS_ACTIVE_MASTER_KEY || "")) fail("The fresh configuration needs its independent Secrets master key.");
  if (source.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS && source.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS !== "{}") fail("Use a fresh configuration, not an existing installation keyring.");
  const selected = [...hostKeys, ...secretKeys, "POSTGRES_USER", "POSTGRES_DB", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY"];
  // Deliberately do not copy OAuth, Tinybird, email, license or host environment values.
  return Object.fromEntries(selected.map((key) => [key, source[key]]));
}

export function serviceDefinitions(config) {
  const databaseUrl = `postgresql://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${project}-postgres:5432/${config.POSTGRES_DB}?sslmode=disable`;
  const shareUrl = `postgresql://outray_share_app:${config.SHARE_DATABASE_PASSWORD}@${project}-postgres:5432/${config.POSTGRES_DB}?sslmode=disable`;
  const origin = (key) => `https://${config[key]}`;
  const policy = {
    NODE_ENV: "production", HOST: "0.0.0.0", OUTRAY_ENABLED: "false", OUTRAY_DEPLOYMENT_MODE: "self-hosted",
    OUTRAY_PRODUCTS: "tunnels,observability,secrets,uptime", OUTRAY_RETENTION_DAYS: "1",
    ...Object.fromEntries(["TUNNELS", "DOMAINS", "SUBDOMAINS", "MEMBERS", "UPTIME_MONITORS", "OBSERVABILITY_ALERTS"].map((name) => [`OUTRAY_MAX_${name}`, "10"])),
    OUTRAY_BANDWIDTH_BYTES_PER_MONTH: "1073741824",
  };
  const database = { DATABASE_URL: databaseUrl, DATABASE_SSL_REJECT_UNAUTHORIZED: "true" };
  const redis = { REDIS_URL: `redis://${project}-redis:6379` };
  const publicUrls = {
    APP_URL: origin("OUTRAY_APP_HOST"), CONSOLE_PUBLIC_URL: origin("OUTRAY_APP_HOST"),
    TUNNEL_PUBLIC_URL: origin("OUTRAY_EDGE_HOST"), INGEST_PUBLIC_URL: origin("OUTRAY_INGEST_HOST"),
    SHARE_PUBLIC_URL: origin("OUTRAY_SHARE_HOST"), BASE_DOMAIN: config.OUTRAY_TUNNEL_DOMAIN,
    SHARE_PUBLIC_ORIGIN: origin("OUTRAY_SHARE_HOST"),
  };
  const uptime = {
    UPTIME_ENABLED: "true", UPTIME_PROBES_ENABLED: "false", UPTIME_NOTIFICATIONS_ENABLED: "false", UPTIME_EGRESS_POLICY_READY: "false",
    OUTRAY_STATUS_URL: origin("OUTRAY_STATUS_HOST"), STATUS_PUBLIC_URL: origin("OUTRAY_STATUS_HOST"),
    OUTRAY_DASHBOARD_URL: origin("OUTRAY_APP_HOST"),
    ...Object.fromEntries(["UPTIME_RATE_LIMIT_SECRET", "UPTIME_UNSUBSCRIBE_SECRET", "STATUS_EDGE_SECRET"].map((key) => [key, config[key]])),
  };
  const crypto = { OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID: config.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID, OUTRAY_SECRETS_ACTIVE_MASTER_KEY: config.OUTRAY_SECRETS_ACTIVE_MASTER_KEY, OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS: "{}" };
  const tinybird = { TINYBIRD_API_HOST: "", TINYBIRD_QUERY_TOKEN: "", TINYBIRD_INGEST_TOKEN: "", TINYBIRD_TUNNEL_INGEST_TOKEN: "" };
  const external = { GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", ZEPTO_API_KEY: "", ZEPTO_FROM_EMAIL: "", XAI_API_KEY: "", PAYSTACK_SECRET_KEY: "", POLAR_ACCESS_TOKEN: "", PLUNK_API_KEY: "" };
  const definitions = {
    postgres: { image: "postgres:16-bookworm", env: Object.fromEntries(["POSTGRES_USER", "POSTGRES_DB", "POSTGRES_PASSWORD"].map((key) => [key, config[key]])), volume: `${project}-postgres-data:/var/lib/postgresql/data`, healthCommand: 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' },
    redis: { image: "redis:7-bookworm", env: {}, volume: `${project}-redis-data:/data`, command: ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec", "--maxmemory", "128mb", "--maxmemory-policy", "noeviction"], healthCommand: "redis-cli ping" },
    migrate: { env: { ...policy, ...database, SHARE_DATABASE_URL: shareUrl }, command: ["sh", "-ec", "node /app/node_modules/drizzle-kit/bin.cjs migrate && node /app/scripts/self-hosted-share-role.mjs"], workingDirectory: "/app/apps/web" },
    bootstrap: { env: { ...policy, ...database, SHARE_DATABASE_URL: shareUrl }, command: ["node", "/app/scripts/self-hosted-share-role.mjs"] },
    sanity: { env: { SHARE_DATABASE_URL: shareUrl }, command: ["node", "-e", restrictedRoleCheck] },
    web: { env: { ...policy, ...database, ...redis, ...publicUrls, ...uptime, ...crypto, ...tinybird, ...external, PORT: "6767", DASHBOARD_DB_POOL_MAX: "10", BETTER_AUTH_URL: origin("OUTRAY_APP_HOST"), BETTER_AUTH_SECRET: config.BETTER_AUTH_SECRET, ADMIN_PASSPHRASE: config.ADMIN_PASSPHRASE, INTERNAL_API_SECRET: config.INTERNAL_API_SECRET, OUTRAY_SIGNUP_ALLOWED_EMAILS: "", OUTRAY_SIGNUP_ALLOWED_DOMAINS: "" }, command: ["node", "apps/web/.output/server/index.mjs"], healthUrl: "http://127.0.0.1:6767/api/health?deep=true" },
    "internal-check": { env: { ...policy, ...database, ...publicUrls, ...uptime, INTERNAL_CHECK_PORT: "3344", OUTRAY_EDGE_HOST: config.OUTRAY_EDGE_HOST, OUTRAY_INGEST_HOST: config.OUTRAY_INGEST_HOST }, command: ["node", "apps/internal-check/dist/index.js"], healthUrl: "http://127.0.0.1:3344/health" },
    tunnel: { env: { ...policy, ...database, ...redis, ...publicUrls, ...uptime, ...tinybird, TUNNEL_PORT: "3547", TUNNEL_BIND_HOST: "0.0.0.0", STATUS_UPSTREAM_URL: `http://${project}-status:4323`, STATUS_TRUSTED_PROXY_IPS: "", WEB_API_URL: `http://${project}-web:6767/api`, INTERNAL_API_SECRET: config.INTERNAL_API_SECRET, TCP_PORT_RANGE_MIN: "20000", TCP_PORT_RANGE_MAX: "20009", UDP_PORT_RANGE_MIN: "30000", UDP_PORT_RANGE_MAX: "30009" }, command: ["node", "apps/tunnel/dist/server.js"], healthUrl: "http://127.0.0.1:3547/health", healthHost: config.OUTRAY_TUNNEL_DOMAIN },
    ingest: { env: { ...policy, ...database, ...redis, ...tinybird, INGEST_PORT: "4318" }, command: ["node", "apps/ingest/dist/server.js"], healthUrl: "http://127.0.0.1:4318/health", expectedMissingTinybird: true },
    cron: { env: { ...policy, ...database, ...redis, ...publicUrls, ...uptime, ...crypto, ...tinybird, ...external }, command: ["node", "apps/cron/dist/index.js"], livenessOnly: true },
    status: { env: { ...policy, ...database, ...uptime, PORT: "4323", STATUS_BIND_HOST: "0.0.0.0", ZEPTO_API_KEY: "", ZEPTO_FROM_EMAIL: "" }, command: ["node", "apps/status/dist/server/entry.mjs"], healthUrl: "http://127.0.0.1:4323/health" },
    "secrets-share": { env: { NODE_ENV: "production", HOST: "0.0.0.0", PORT: "4324", SHARE_DATABASE_URL: shareUrl, SHARE_PUBLIC_ORIGIN: origin("OUTRAY_SHARE_HOST"), SHARE_RATE_LIMIT_SECRET: config.SHARE_RATE_LIMIT_SECRET, SHARE_CLIENT_IP_HEADER: "X-Outray-Client-IP" }, command: ["node", "apps/secrets-share/dist/server/entry.mjs"], healthUrl: "http://127.0.0.1:4324/health" },
  };
  return definitions;
}

const restrictedRoleCheck = `
const pg = require('pg');
const client = new pg.Client({ connectionString: process.env.SHARE_DATABASE_URL });
(async () => {
  await client.connect();
  const id = require('node:crypto').randomUUID();
  await client.query('BEGIN');
  try {
    await client.query("INSERT INTO public.secret_share_links (id,ciphertext,iv,key_verifier,content_format,expires_at,max_views) VALUES ($1,'rehearsal-ciphertext','rehearsal-iv','rehearsal-verifier','text',now()+interval '1 hour',1)", [id]);
    if ((await client.query('SELECT id FROM public.secret_share_links WHERE id=$1', [id])).rowCount !== 1) throw new Error();
    if ((await client.query('UPDATE public.secret_share_links SET views=1 WHERE id=$1', [id])).rowCount !== 1) throw new Error();
    if ((await client.query('DELETE FROM public.secret_share_links WHERE id=$1', [id])).rowCount !== 1) throw new Error();
    await client.query("INSERT INTO public.secret_share_rate_limits (key,count,window_ends_at) VALUES ($1,1,now()+interval '1 hour')", [id]);
    if ((await client.query('SELECT key FROM public.secret_share_rate_limits WHERE key=$1', [id])).rowCount !== 1) throw new Error();
    if ((await client.query('UPDATE public.secret_share_rate_limits SET count=2 WHERE key=$1', [id])).rowCount !== 1) throw new Error();
    if ((await client.query('DELETE FROM public.secret_share_rate_limits WHERE key=$1', [id])).rowCount !== 1) throw new Error();
  } finally { await client.query('ROLLBACK'); }
  await client.query('SELECT share_id FROM public.secret_share_ownership LIMIT 0');
  for (const table of ['users', 'accounts', 'secret_entries']) {
    let denied = false;
    try { await client.query('SELECT id FROM public.' + table + ' LIMIT 0'); }
    catch (error) { if (error.code !== '42501') throw new Error(); denied = true; }
    if (!denied) throw new Error();
  }
  console.log('Restricted Share CRUD, ownership SELECT and account/vault denial passed.');
})().catch(() => { console.error('Restricted Share sanity check failed; credential details suppressed.'); process.exitCode = 1; }).finally(() => client.end());
`;

export function labelsFor(config) {
  return { [managedLabel]: "true", [instanceLabel]: fingerprint(config) };
}

export function ownedResource(metadata, labels) {
  return Object.entries(labels).every(([key, value]) => metadata?.Labels?.[key] === value);
}

export function containerArguments(name, definition, image, labels, temporary = false) {
  const args = ["run", ...(temporary ? ["--rm"] : ["--detach", "--restart", "no"]), "--pull", "never", "--name", name, "--network", project,
    "--log-driver", "json-file", "--log-opt", "max-size=10m", "--log-opt", "max-file=3"];
  for (const [key, value] of Object.entries(labels)) args.push("--label", `${key}=${value}`);
  if (!definition.image) args.push("--init", "--user", "node", "--read-only", "--tmpfs", "/tmp:size=64m,mode=1777", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true");
  if (definition.volume) args.push("--mount", `type=volume,source=${definition.volume.split(":")[0]},target=${definition.volume.split(":")[1]}`);
  if (definition.workingDirectory) args.push("--workdir", definition.workingDirectory);
  if (definition.healthCommand) args.push("--health-cmd", definition.healthCommand, "--health-interval", "2s", "--health-timeout", "3s", "--health-retries", "20", "--health-start-period", "5s");
  for (const key of Object.keys(definition.env)) args.push("-e", key);
  args.push(definition.image || image, ...(definition.command || []));
  return args;
}

export function hostEnvironment(source = process.env) {
  // Service env is added explicitly per invocation; host tokens/options are never inherited.
  return Object.fromEntries(["PATH", "HOME", "XDG_RUNTIME_DIR"].filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

export function localDockerEndpoint(value) {
  if (!/^unix:\/\/\//.test(value) || /[\r\n\0]/.test(value)) fail("Rehearsal requires a local Unix Docker socket, not a remote Docker context.");
  return value;
}

async function execute(args, env, timeoutMs = 60_000) {
  return await new Promise((complete) => {
    const child = spawn("docker", args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;
    const finish = (result) => { if (!settled) { settled = true; clearTimeout(timer); complete(result); } };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ status: -1, stdout, stderr: "", timedOut: true }); }, timeoutMs);
    child.stdout.on("data", (data) => { stdout += data; if (stdout.length > 1_000_000) child.kill("SIGKILL"); });
    child.stderr.on("data", (data) => { stderr += data; if (stderr.length > 1_000_000) child.kill("SIGKILL"); });
    child.on("error", () => finish({ status: -1, stdout: "", stderr: "" }));
    child.on("close", (status) => finish({ status, stdout, stderr }));
  });
}

export async function runRehearsal(argv = process.argv.slice(2)) {
  const { file, image } = argumentsFor(argv);
  const info = lstatSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) fail("The fresh configuration must be a regular private file with no group/other permissions.");
  const config = configurationFrom(parseEnv(readFileSync(file, "utf8")));
  const hostEnv = hostEnvironment();
  const context = await execute(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], hostEnv);
  if (context.status !== 0) fail("Could not resolve the local Docker context; diagnostic output suppressed.");
  const endpoint = localDockerEndpoint(context.stdout.trim());
  const docker = (args, env = {}, timeout) => execute(["--host", endpoint, ...args], { ...hostEnv, ...env }, timeout);
  const required = async (args, env = {}, timeout) => {
    const result = await docker(args, env, timeout);
    if (result.status !== 0) fail("Docker operation failed or timed out; credential-bearing diagnostic output suppressed. Existing volumes are preserved.");
    return result.stdout;
  };
  const labels = labelsFor(config);
  const labelArgs = Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]);
  const inspect = async (kind, name, format = "{{json .}}") => {
    const result = await docker([kind, "inspect", "--format", format, name]);
    if (result.status !== 0) {
      if (/No such (?:network|volume|object|container)/i.test(result.stderr)) return null;
      fail("Could not inspect an existing Docker resource safely; no resources were replaced.");
    }
    try { return JSON.parse(result.stdout); } catch { fail("Could not read Docker resource metadata safely."); }
  };
  const existingNetwork = await inspect("network", project);
  if (existingNetwork) {
    if (!ownedResource(existingNetwork, labels) || !existingNetwork.Internal || existingNetwork.Driver !== "bridge") fail("Existing rehearsal network is unlabelled, belongs to another configuration or is not internal; refusing to reuse it.");
  } else await required(["network", "create", "--driver", "bridge", "--internal", ...labelArgs, project]);
  for (const name of [`${project}-postgres-data`, `${project}-redis-data`]) {
    const existing = await inspect("volume", name);
    if (existing) {
      if (!ownedResource(existing, labels) || existing.Driver !== "local") fail("Existing rehearsal volume is unlabelled or belongs to another configuration; refusing to reuse it.");
    } else await required(["volume", "create", ...labelArgs, name]);
  }
  const imageId = async (name) => (await required(["image", "inspect", "--format", "{{.Id}}", name])).trim();
  const applicationImageId = await imageId(image);
  const definitions = serviceDefinitions(config);
  for (const name of ["postgres", "redis"]) {
    const result = await docker(["image", "inspect", "--format", "{{.Id}}", definitions[name].image]);
    if (result.status !== 0) {
      console.log(`Pulling the ${name} infrastructure image; no application credentials are used.`);
      await required(["pull", definitions[name].image]);
    }
  }
  const state = async (name) => await inspect("container", name, "{{json .State}}");
  const startContainer = async (name) => {
    const definition = definitions[name], container = `${project}-${name}`;
    const selectedImage = definition.image || image;
    const expectedImage = definition.image ? await imageId(selectedImage) : applicationImageId;
    const resourceLabels = { ...labels, [configurationLabel]: fingerprint({ name, expectedImage, definition }) };
    const existing = await inspect("container", container, '{{json .Config.Labels}}');
    if (existing) {
      if (!ownedResource({ Labels: existing }, resourceLabels)) fail("Existing rehearsal container is unlabelled or has a different image/configuration; refusing to overwrite it.");
      const safety = await inspect("container", container, '{{json .HostConfig}}');
      const networks = await inspect("container", container, '{{json .NetworkSettings.Networks}}');
      const actualImage = (await required(["container", "inspect", "--format", "{{.Image}}", container])).trim();
      if (actualImage !== expectedImage || safety.NetworkMode !== project || Object.keys(safety.PortBindings || {}).length || Object.keys(networks || {}).some((network) => network !== project) || safety.Privileged || safety.PublishAllPorts) fail("Existing rehearsal container is not safely isolated; refusing to reuse it.");
      const current = await state(container);
      if (current.Status !== "running") {
        if (!["created", "exited"].includes(current.Status)) fail("Existing rehearsal container is not in a reusable state.");
        await required(["start", container]);
      }
    } else await required(containerArguments(container, definition, image, resourceLabels), definition.env);
    return container;
  };
  const waitInfrastructure = async (container) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const current = await state(container);
      if (current?.Health?.Status === "healthy") return;
      if (!current || current.Status !== "running" || current.OOMKilled) fail("An infrastructure container failed before becoming healthy; volumes and diagnostics are preserved.");
      await delay(2000);
    }
    fail("Infrastructure health deadline exceeded; volumes are preserved.");
  };
  console.log("Private infrastructure rehearsal: internal Docker network, no published ports, no OAuth/Tinybird credentials, no Uptime worker.");
  for (const name of ["postgres", "redis"]) {
    await waitInfrastructure(await startContainer(name));
    console.log(`${name}: infrastructure health passed.`);
  }
  for (const name of ["migrate", "bootstrap", "sanity"]) {
    const definition = definitions[name];
    console.log(`${name}: running an isolated non-root, read-only one-shot check.`);
    await required(containerArguments(`${project}-${name}-${randomUUID()}`, definition, image, labels, true), definition.env);
    console.log(`${name}: passed. No credential values or raw SQL/logs were printed.`);
  }
  const running = [], results = {};
  for (const name of ["web", "internal-check", "tunnel", "ingest", "cron", "status", "secrets-share"]) {
    const definition = definitions[name], container = await startContainer(name);
    let outcome;
    for (let attempt = 0; attempt < 25; attempt++) {
      const current = await state(container);
      if (!current || current.OOMKilled) fail("An application container failed or was OOM-killed; diagnostics and volumes are preserved.");
      if (current.Status !== "running") {
        if (definition.expectedMissingTinybird && current.Status === "exited" && current.ExitCode !== 0) {
          const logs = await docker(["logs", "--tail", "50", container]);
          if (/Error: TINYBIRD_(?:API_HOST|INGEST_TOKEN) is required/.test(logs.stdout + logs.stderr)) { outcome = "expected-unconfigured (Tinybird is required at ingest startup)"; break; }
        }
        fail("An application exited unexpectedly; raw service logs were not printed and volumes are preserved.");
      }
      const check = definition.livenessOnly ? "process.kill(1,0)" : `fetch(${JSON.stringify(definition.healthUrl)},{headers:${JSON.stringify(definition.healthHost ? { Host: definition.healthHost } : {})},signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`;
      const health = await docker(["exec", container, "node", "-e", check], {}, 5000);
      if (health.status === 0) { outcome = definition.livenessOnly ? "process liveness only" : "private health passed"; running.push(container); break; }
      await delay(2000);
    }
    if (!outcome) fail("Application health deadline exceeded; raw service logs were not printed and volumes are preserved.");
    results[name] = outcome;
    console.log(`${name}: ${outcome}.`);
  }
  const stats = await required(["stats", "--no-stream", "--format", "{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}", `${project}-postgres`, `${project}-redis`, ...running]);
  console.log("Read-only container memory/CPU snapshot:\n" + stats.trim());
  const disk = await required(["system", "df"]);
  console.log("Read-only Docker disk usage:\n" + disk.trim());
  const filesystem = statfsSync(dirname(file));
  console.log(`Filesystem available: ${(Number(filesystem.bavail) * Number(filesystem.bsize) / 1024 ** 3).toFixed(1)} GiB.`);
  console.log("Private rehearsal checks completed, NOT a functional deployment. OAuth, Tinybird, DNS/ACME, notifications, public tunnels and Uptime probes remain unverified. Containers and labelled data volumes are retained; nothing was published or deleted.");
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRehearsal().catch((error) => {
    console.error(error instanceof RehearsalError ? error.message : "Private rehearsal failed; sensitive diagnostics suppressed and existing data volumes preserved.");
    process.exitCode = 1;
  });
}
