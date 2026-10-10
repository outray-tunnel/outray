// Authorized independent Ops worker only. Activation follows real checks of
// this exact namespace; Docker never automatically restarts an active worker.
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { sourceManifest } from "./self-hosted-artifacts.mjs";
import { configurationFrom, hostEnvironment, labelsFor, localDockerEndpoint, missingResource, ownedResource, project } from "./self-hosted-rehearsal.mjs";

export const probeContainer = "outray-ops-uptime-probe";
export const probeImageLabel = "com.outray.probe-preview";
export const probeConfigurationLabel = "com.outray.probe.configuration";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (message) => { throw new Error(message); };
const allowedEnv = new Set(["NODE_ENV", "OUTRAY_DEPLOYMENT_MODE", "OUTRAY_PRODUCTS", "UPTIME_ENABLED", "UPTIME_PROBES_ENABLED", "UPTIME_NOTIFICATIONS_ENABLED", "UPTIME_EGRESS_POLICY_READY", "UPTIME_PROBE_CONCURRENCY", "UPTIME_PROBE_BATCH_SIZE", "UPTIME_PROBE_POLL_MS", "DATABASE_URL", "DATABASE_SSL_REJECT_UNAUTHORIZED", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY", "OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS", "OUTRAY_PROBE_ACTIVATION_ID"]);
const imageEnv = new Set(["PATH", "NODE_VERSION", "YARN_VERSION"]);
const networkHostEnv = { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C" };
export const probeHealthCommand = `node -e ${JSON.stringify("try{const r=JSON.parse(require('node:fs').readFileSync('/tmp/outray-probe-ready'));if(r.activation!==process.env.OUTRAY_PROBE_ACTIVATION_ID||!Number.isInteger(r.pid)||r.pid<2)process.exit(1);process.kill(r.pid,0)}catch{process.exit(1)}")}`;

export function probeArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (["--recover", "--supervise"].includes(key)) { if (options[key]) fail("Duplicate worker option"); options[key] = true; continue; }
    if (!["--file", "--image"].includes(key) || options[key] || !argv[index + 1] || argv[index + 1].startsWith("--")) fail("Use --file PRIVATE_FRESH_CONFIG --image AUDITED_PROBE_IMAGE [--recover] [--supervise]");
    options[key] = argv[++index];
  }
  if (!options["--file"] || !options["--image"] || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(options["--image"])) fail("Explicit private configuration and probe image are required");
  const file = resolve(options["--file"]);
  if (/\/(?:\.env|\.env\.prod|\.env\.production)$/.test(file)) fail("Hosted environment files cannot be used");
  return { file, image: options["--image"], recover: Boolean(options["--recover"]), supervise: Boolean(options["--supervise"]) };
}

export function probeDefinition(config, postgresIp) {
  if (config.OUTRAY_APP_HOST !== "ops.outray.dev" || config.OUTRAY_STATUS_HOST !== "status.ops.outray.dev") fail("Only the authorized independent Ops installation is supported");
  if (!/^172\.18\.(?:\d{1,3})\.(?:\d{1,3})$/.test(postgresIp) || postgresIp.split(".").some((part) => Number(part) > 255)) fail("A validated private PostgreSQL address is required");
  const env = {
    NODE_ENV: "production", OUTRAY_DEPLOYMENT_MODE: "self-hosted", OUTRAY_PRODUCTS: "uptime",
    UPTIME_ENABLED: "true", UPTIME_PROBES_ENABLED: "true", UPTIME_NOTIFICATIONS_ENABLED: "false",
    UPTIME_EGRESS_POLICY_READY: "true", UPTIME_PROBE_CONCURRENCY: "5", UPTIME_PROBE_BATCH_SIZE: "5", UPTIME_PROBE_POLL_MS: "5000",
    DATABASE_URL: `postgresql://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${postgresIp}:5432/${config.POSTGRES_DB}?sslmode=disable`,
    DATABASE_SSL_REJECT_UNAUTHORIZED: "true", OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID: config.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID,
    OUTRAY_SECRETS_ACTIVE_MASTER_KEY: config.OUTRAY_SECRETS_ACTIVE_MASTER_KEY, OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS: "{}",
  };
  env.OUTRAY_PROBE_ACTIVATION_ID = fingerprint({ env, imageMode: "probe-only-gated-v1" });
  return { env, command: ["node", "probe-boot.mjs"], healthCommand: probeHealthCommand };
}

export function assertProbeEnvironment(env, definition) {
  for (const [key, value] of Object.entries(env)) if (!allowedEnv.has(key) && !(imageEnv.has(key) && value)) fail("Unexpected worker environment; no provider or unrelated credentials are allowed");
  for (const [key, value] of Object.entries(definition.env)) if (env[key] !== value) fail("Worker configuration does not match the fresh installation");
}

export function probeLabels(config, image, definition) {
  return { ...labelsFor(config), [probeImageLabel]: "true", [probeConfigurationLabel]: fingerprint({ image, definition }) };
}

export function safeProbeContainer(metadata, image, labels, definition, network) {
  const host = metadata?.HostConfig || {}, cfg = metadata?.Config || {};
  const attachment = metadata?.NetworkSettings?.Networks?.[network.probeNetwork];
  const env = Object.fromEntries((cfg.Env || []).map((item) => { const index = item.indexOf("="); return [item.slice(0, index), item.slice(index + 1)]; }));
  try { assertProbeEnvironment(env, definition); } catch { return false; }
  return Boolean(ownedResource({ Labels: cfg.Labels }, labels) && metadata.Image === image && cfg.User === "node" && cfg.WorkingDir === "/app"
    && JSON.stringify(cfg.Cmd) === JSON.stringify(definition.command) && cfg.Healthcheck?.Test?.[0] === "CMD-SHELL" && cfg.Healthcheck.Test.length === 2
    && cfg.Healthcheck.Test[1] === definition.healthCommand && cfg.Healthcheck.Interval === 10_000_000_000 && cfg.Healthcheck.Timeout === 3_000_000_000
    && cfg.Healthcheck.Retries === 3 && cfg.Healthcheck.StartPeriod === 120_000_000_000
    && host.ReadonlyRootfs && !host.Privileged && !host.PublishAllPorts && !Object.keys(host.PortBindings || {}).length
    && host.CapDrop?.length === 1 && host.CapDrop[0] === "ALL" && !host.CapAdd?.length && host.SecurityOpt?.length === 1 && host.SecurityOpt[0] === "no-new-privileges:true"
    && host.Init === true && host.NetworkMode === network.probeNetwork && host.RestartPolicy?.Name === "no"
    && Object.keys(metadata.NetworkSettings?.Networks || {}).length === 1
    && attachment?.IPAMConfig?.IPv4Address === network.probeAddress
    && (attachment.IPAddress === network.probeAddress || (["created", "exited"].includes(metadata.State?.Status) && !attachment.IPAddress))
    && JSON.stringify(host.Dns) === JSON.stringify([network.probeResolver]) && !host.ExtraHosts?.length
    && !host.Links?.length && !host.VolumesFrom?.length && !host.Devices?.length
    && host.Memory === 268435456 && host.MemorySwap === 268435456 && host.PidsLimit === 64
    && Object.keys(host.Tmpfs || {}).length === 1 && Object.hasOwn(host.Tmpfs, "/tmp")
    && (metadata.Mounts || []).every((mount) => mount.Type === "tmpfs" && mount.Destination === "/tmp") && !cfg.Entrypoint?.length);
}

export function probeContainerArguments(definition, image, labels, network) {
  const args = ["create", "--pull", "never", "--name", probeContainer, "--restart", "no", "--network", network.probeNetwork,
    "--ip", network.probeAddress, "--dns", network.probeResolver, "--init", "--user", "node", "--read-only", "--tmpfs", "/tmp:size=16m,mode=1777",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--pids-limit", "64", "--memory", "256m", "--memory-swap", "256m",
    "--log-driver", "json-file", "--log-opt", "max-size=10m", "--log-opt", "max-file=3",
    "--health-cmd", definition.healthCommand, "--health-interval", "10s", "--health-timeout", "3s", "--health-retries", "3", "--health-start-period", "120s"];
  for (const [key, value] of Object.entries(labels)) args.push("--label", `${key}=${value}`);
  for (const key of Object.keys(definition.env)) args.push("-e", key);
  return [...args, image, ...definition.command];
}

export const probeRuntimeAudit = `
const fs=require('node:fs'),crypto=require('node:crypto');
const m=JSON.parse(fs.readFileSync('/app/self-hosted-artifact-manifest.json'));
if(m.version!==1||m.iconMode!=='free'||m.deploymentMode!=='self-hosted'||m.targetNodeMajor!==22||process.versions.node.split('.')[0]!=='22')process.exit(1);
for(const path of ['/app/apps/web','/app/apps/tunnel','/app/apps/status','/app/apps/internal-check','/app/.env','/app/.env.prod','/app/.npmrc','/app/scripts'])if(fs.existsSync(path))process.exit(1);
if(JSON.stringify(fs.readdirSync('/app/apps'))!==JSON.stringify(['uptime-probe']))process.exit(1);
const path='apps/uptime-probe/dist/index.js',file=m.artifacts.files.find(f=>f.path===path);
if(!file||file.sha256!==crypto.createHash('sha256').update(fs.readFileSync('/app/'+path)).digest('hex'))process.exit(1);
for(const name of ['pg','dotenv','ipaddr.js'])require(name);
for(const name of fs.readdirSync('/app/node_modules'))if(name.startsWith('@')||['seroval','react','astro','express','sharp'].includes(name))process.exit(1);
`;

function ipv4Bounds(value) {
  const match = /^(\d+\.\d+\.\d+\.\d+)(?:\/(\d+))?$/.exec(value || "");
  if (!match || match[1].split(".").some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255) || Number(match[2] ?? 32) > 32) fail("Invalid network range in collision audit");
  const bits = Number(match[2] ?? 32), address = match[1].split(".").reduce((sum, part) => sum * 256 + Number(part), 0), size = 2 ** (32 - bits), start = Math.floor(address / size) * size;
  return [start, start + size - 1];
}

export function assertProbeNetworkCollisions({ networks, routes, interfaces, network, labels, containerId = null }) {
  if (!Array.isArray(networks) || !Array.isArray(routes) || !Array.isArray(interfaces)) fail("Complete Docker and host routing metadata is required");
  const own = networks.find((item) => item.Name === network.probeNetwork);
  if (own && !network.safeProbeNetwork(own, labels, containerId)) fail("Existing dedicated worker network is not exact and owned");
  const candidate = ipv4Bounds(network.probeSubnet), overlaps = (value) => { const range = ipv4Bounds(value); return range[0] <= candidate[1] && candidate[0] <= range[1]; };
  for (const item of networks) {
    if (item.Name === network.probeNetwork) continue;
    for (const range of item.IPAM?.Config || []) if (range.Subnet && !range.Subnet.includes(":" ) && overlaps(range.Subnet)) fail("Worker subnet overlaps another Docker network");
    if (item.Options?.["com.docker.network.bridge.name"] === network.probeBridge) fail("Dedicated worker bridge belongs to another network");
  }
  for (const route of routes) {
    if (!route.dst || route.dst === "default" || route.dst.includes(":")) continue;
    if (overlaps(route.dst) && !(own && route.dev === network.probeBridge && ipv4Bounds(route.dst)[0] >= candidate[0] && ipv4Bounds(route.dst)[1] <= candidate[1])) fail("Worker subnet conflicts with host routes");
  }
  if (!own && interfaces.some((item) => item.ifname === network.probeBridge)) fail("Dedicated worker bridge already exists without ownership");
}

export async function runProbe(argv = process.argv.slice(2), dependencies = {}) {
  const lifecycle = { stopped: false, cleanup: null };
  const stop = () => {
    lifecycle.stopped = true;
    try { lifecycle.cleanup?.(); } catch { process.exitCode = 1; }
  };
  // Register before activation, not only after readiness. Docker containers are
  // not systemd children, so a signal during startup must stop the owned ID too.
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try { return await runManagedProbe(argv, dependencies, lifecycle); }
  finally { process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop); }
}

async function runManagedProbe(argv, dependencies, lifecycle) {
  const options = probeArguments(argv), info = lstatSync(options.file);
  if (!info.isFile() || (info.mode & 0o077)) fail("Use a regular private mode0600 fresh configuration file");
  const config = configurationFrom(parseEnv(readFileSync(options.file, "utf8")));
  const spawn = dependencies.spawn || spawnSync, pause = dependencies.delay || delay, env = hostEnvironment();
  const context = spawn("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { env, encoding: "utf8", timeout: 10_000 });
  if (context.status !== 0) fail("Cannot inspect local Docker context");
  const endpoint = localDockerEndpoint(context.stdout.trim());
  const invoke = (args, values = {}) => spawn("docker", ["--host", endpoint, ...args], { env: { ...env, ...values }, encoding: "utf8", timeout: 60_000, maxBuffer: 1_000_000 });
  const required = (args, values) => { const result = invoke(args, values); if (result.status !== 0) fail("Probe operation failed; credential-bearing diagnostics suppressed"); return result.stdout.trim(); };
  const inspect = (kind, name) => {
    const result = invoke([kind, "inspect", "--format", "{{json .}}", name]);
    if (result.status !== 0) { if (missingResource(result.stderr || "", kind, name)) return null; fail("Cannot inspect exact owned probe resources"); }
    try { return JSON.parse(result.stdout); } catch { fail("Cannot parse exact owned probe metadata"); }
  };
  const labels = labelsFor(config), internal = inspect("network", project), pg = inspect("container", `${project}-postgres`);
  if (!internal || !ownedResource(internal, labels) || !internal.Internal || internal.Driver !== "bridge" || !pg || !ownedResource({ Labels: pg.Config?.Labels }, labels)
    || pg.State?.Status !== "running" || pg.State.Health?.Status !== "healthy" || pg.HostConfig?.NetworkMode !== project || pg.HostConfig.Privileged
    || Object.keys(pg.HostConfig.PortBindings || {}).length || Object.keys(pg.NetworkSettings?.Networks || {}).length !== 1) fail("Healthy owned isolated PostgreSQL is required");
  const postgresIp = pg.NetworkSettings.Networks[project]?.IPAddress, definition = probeDefinition(config, postgresIp);
  const image = inspect("image", options.image);
  if (!image || image.Config?.User !== "node" || image.Config.WorkingDir !== "/app" || image.Config.Labels?.[probeImageLabel] !== "true"
    || JSON.stringify(image.Config.Cmd) !== JSON.stringify(definition.command) || image.Config.Entrypoint?.length) fail("Use the audited dedicated probe-only image");
  const resourceLabels = probeLabels(config, image.Id, definition);
  const network = dependencies.network || await import("./self-hosted-probe-network.mjs");
  let container = inspect("container", probeContainer);
  if (container && !safeProbeContainer(container, image.Id, resourceLabels, definition, network)) fail("Existing worker is mismatched or not safely isolated; refusing replacement");
  lifecycle.cleanup = () => {
    const current = inspect("container", probeContainer);
    if (safeProbeContainer(current, image.Id, resourceLabels, definition, network) && current.State?.Status === "running") required(["stop", "--time", "15", current.Id]);
  };
  const checkedHost = (binary, args) => {
    const result = spawn(binary, args, { env: networkHostEnv, encoding: "utf8", timeout: 10_000, maxBuffer: 1_000_000 });
    if (result.status !== 0) fail("Host routing audit failed; no worker activated");
    try { return JSON.parse(result.stdout); } catch { fail("Cannot parse host routing metadata"); }
  };
  const networkIds = required(["network", "ls", "--format", "{{.ID}}"]);
  if (!networkIds || networkIds.split("\n").some((id) => !/^[a-f0-9]{12,64}$/.test(id))) fail("Cannot enumerate every local Docker network");
  const allNetworks = networkIds.split("\n").map((id) => inspect("network", id));
  assertProbeNetworkCollisions({ networks: allNetworks, routes: checkedHost("ip", ["-j", "-4", "route", "show", "table", "all"]), interfaces: checkedHost("ip", ["-j", "link", "show"]), network, labels: resourceLabels, containerId: container?.Id || null });
  const expectedSource = sourceManifest(dependencies.source || root).sha256;
  const bootDigest = fingerprint(readFileSync(resolve(dependencies.source || root, "deploy/self-hosted/probe-boot.mjs"), "utf8"));
  required(["run", "--rm", "--pull", "never", "--name", `${probeContainer}-audit-${randomUUID()}`, "--network", "none", "--read-only", "--user", "node", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", options.image, "node", "-e", `${probeRuntimeAudit}\nif(m.source.sha256!==${JSON.stringify(expectedSource)}||crypto.createHash('sha256').update(JSON.stringify(fs.readFileSync('/app/probe-boot.mjs','utf8'))).digest('hex')!==${JSON.stringify(bootDigest)})process.exit(1);`]);
  if (lifecycle.stopped) fail("Worker startup interrupted before activation");
  if (container?.State.Status === "running" && container.State.Health?.Status === "healthy") {
    try {
      network.verifyProbeHostPolicy({ postgresIp, spawn, env: networkHostEnv });
      network.verifyProbeNamespace({ pid: container.State.Pid, postgresIp, spawn, env: networkHostEnv });
      network.verifyProbeConnectivity({ containerId: container.Id, required, pid: container.State.Pid, postgresIp, spawn, env: networkHostEnv });
    } catch (error) { lifecycle.cleanup(); throw error; }
    console.log("Exact owned Uptime probe is already active; namespace checks passed");
  } else {
    if (container && !options.recover) fail("Existing inactive worker requires explicit --recover after ownership checks");
    // Only this exact validated owned worker may be stopped/recreated. Recreate
    // guarantees a fresh tmpfs without a previous activation marker.
    if (container) {
      if (!["running", "created", "exited"].includes(container.State.Status)) fail("Worker is not in a recoverable state");
      if (container.State.Status === "running") required(["stop", "--time", "15", container.Id]);
      required(["rm", container.Id]);
      container = null;
    }
    await network.ensureProbeNetwork({ required, inspect, labels: resourceLabels });
    network.installProbeHostPolicy({ postgresIp, spawn, env: networkHostEnv, persist: true });
    required(probeContainerArguments(definition, options.image, resourceLabels, network), definition.env);
    container = inspect("container", probeContainer);
    if (!safeProbeContainer(container, image.Id, resourceLabels, definition, network)) fail("Unexpected new worker isolation; never activated");
    required(["start", container.Id]);
    container = inspect("container", probeContainer);
    if (!safeProbeContainer(container, image.Id, resourceLabels, definition, network) || container.State?.Status !== "running" || !Number.isInteger(container.State.Pid) || container.State.Pid < 2) fail("Inert worker namespace did not start safely");
    try {
      network.installProbeNamespace({ pid: container.State.Pid, postgresIp, spawn, env: networkHostEnv });
      network.verifyProbeNamespace({ pid: container.State.Pid, postgresIp, spawn, env: networkHostEnv });
      network.verifyProbeConnectivity({ containerId: container.Id, required, pid: container.State.Pid, postgresIp, spawn, env: networkHostEnv });
      if (lifecycle.stopped) fail("Worker startup interrupted before activation");
      required(["exec", container.Id, "node", "-e", "require('node:fs').writeFileSync('/tmp/outray-probe-activate',process.env.OUTRAY_PROBE_ACTIVATION_ID,{mode:0o600,flag:'wx'})"]);
      let ready = false;
      for (let attempt = 0; attempt < 70; attempt++) {
        const current = inspect("container", probeContainer);
        if (lifecycle.stopped) fail("Worker startup interrupted during readiness");
        if (!safeProbeContainer(current, image.Id, resourceLabels, definition, network) || current.State?.Status !== "running" || current.State.OOMKilled) fail("Worker readiness/isolation failed");
        if (current.State.Health?.Status === "healthy") { ready = true; break; }
        await pause(1000);
      }
      if (!ready) fail("Worker readiness deadline exceeded");
    } catch (error) {
      // Exact owned ID only: never leave an unverified or failed worker active.
      const current = inspect("container", probeContainer);
      if (safeProbeContainer(current, image.Id, resourceLabels, definition, network) && current.State?.Status === "running") required(["stop", "--time", "15", current.Id]);
      throw error;
    }
    console.log("Uptime probe ready after isolated network verification; delivery remains disabled");
  }
  if (options.supervise) {
      while (!lifecycle.stopped) {
        await pause(15_000);
        if (lifecycle.stopped) break;
        const current = inspect("container", probeContainer);
        if (!safeProbeContainer(current, image.Id, resourceLabels, definition, network) || current.State?.Status !== "running" || current.State.OOMKilled || current.State.Health?.Status === "unhealthy") fail("Owned worker stopped; supervised restart must reverify egress before activation");
        try {
          network.verifyProbeHostPolicy({ postgresIp, spawn, env: networkHostEnv });
          network.verifyProbeNamespace({ pid: current.State.Pid, postgresIp, spawn, env: networkHostEnv });
        } catch (error) { lifecycle.cleanup(); throw error; }
      }
      lifecycle.cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runProbe(); } catch (error) { console.error(error?.code ? "Probe setup failed; filesystem/credential details suppressed" : error.message); process.exitCode = 1; }
}
