// One guarded lifecycle for every standard Compose installation. No instance-specific names.
import { createHash, randomUUID } from "node:crypto";
import { constants, closeSync, existsSync, lstatSync, openSync, readFileSync, readlinkSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { createProbePolicy } from "./self-hosted-probe-policy.mjs";

export const standardProbeProject = "outray-self-hosted";
export const standardProbeUnit = "outray-self-hosted-probe.service";
export const standardProbeActivation = createHash("sha256").update("outray-self-hosted-probe-gate-v1").digest("hex");
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const networkEnvironment = { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C" };
const unitMarker = "# Managed by OutRay standard self-hosted probe lifecycle\n";
const fail = (message) => { throw new Error(message); };
const containerEnv = (metadata) => Object.fromEntries((metadata?.Config?.Env || []).map((item) => { const index = item.indexOf("="); return [item.slice(0, index), item.slice(index + 1)]; }));
const labelsFor = (service) => ({ "com.docker.compose.project": standardProbeProject, "com.docker.compose.service": service });
const owns = (metadata, service) => Object.entries(labelsFor(service)).every(([key, value]) => metadata?.Config?.Labels?.[key] === value);
const imageKeys = new Set(["PATH", "NODE_VERSION", "YARN_VERSION", "HOST"]);
const probeKeys = new Set(["NODE_ENV", "OUTRAY_DEPLOYMENT_MODE", "OUTRAY_PRODUCTS", "UPTIME_ENABLED", "UPTIME_PROBES_ENABLED", "UPTIME_NOTIFICATIONS_ENABLED", "UPTIME_EGRESS_POLICY_READY", "UPTIME_PROBE_CONCURRENCY", "UPTIME_PROBE_BATCH_SIZE", "UPTIME_PROBE_POLL_MS", "DATABASE_URL", "DATABASE_SSL_REJECT_UNAUTHORIZED", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY", "OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS", "OUTRAY_PROBE_ACTIVATION_ID", "OUTRAY_DASHBOARD_URL", "STATUS_PUBLIC_URL", "OUTRAY_STATUS_URL"]);
const deliveryKeys = new Set(["ZEPTO_API_KEY", "ZEPTO_FROM_EMAIL", "ZEPTO_FROM_NAME", "UPTIME_UNSUBSCRIBE_SECRET", "UPTIME_RATE_LIMIT_SECRET", "STATUS_EDGE_SECRET"]);

export function probeComposeEnvironment(config, postgresIp) {
  if (isIP(postgresIp) !== 4) fail("The probe requires the inspected PostgreSQL IPv4 address.");
  const enabled = config.UPTIME_NOTIFICATIONS_ENABLED === "true";
  return {
    OUTRAY_PROBE_DATABASE_HOST: postgresIp,
    ...Object.fromEntries([...deliveryKeys].map((key) => [`OUTRAY_PROBE_NOTIFY_${key}`, enabled ? config[key] || (key === "ZEPTO_FROM_NAME" ? "OutRay" : "") : ""])),
  };
}

export function standardProbeOptions(args, root = defaultRoot) {
  const options = { command: "activate", root, envFile: join(root, ".env.self-hosted") };
  const input = [...args];
  if (["activate", "supervise"].includes(input[0])) options.command = input.shift();
  const seen = new Set();
  for (let index = 0; index < input.length; index++) {
    const key = input[index];
    if (seen.has(key)) fail("Duplicate probe lifecycle option.");
    seen.add(key);
    if (key === "--supervise") { options.command = "supervise"; continue; }
    if (!["--file", "--root"].includes(key) || !input[index + 1] || input[index + 1].startsWith("--")) fail("Use activate|supervise --file PRIVATE_ENV [--root CHECKOUT].");
    options[key === "--file" ? "envFile" : "root"] = resolve(root, input[++index]);
  }
  if (!seen.has("--file")) options.envFile = join(options.root, ".env.self-hosted");
  return options;
}

function privateConfiguration(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) || info.size > 1024 * 1024) fail("Probe configuration must be a private regular file.");
  const config = parseEnv(readFileSync(path, "utf8"));
  if (config.OUTRAY_DEPLOYMENT_MODE !== "self-hosted" || !["true", "false"].includes(config.UPTIME_PROBES_ENABLED) || !["true", "false"].includes(config.UPTIME_NOTIFICATIONS_ENABLED)) fail("Explicit self-hosted Uptime configuration is required.");
  if (config.UPTIME_PROBES_ENABLED !== "true" && config.UPTIME_NOTIFICATIONS_ENABLED !== "true") fail("The Uptime worker is disabled in this installation.");
  if (config.UPTIME_PROBES_ENABLED === "true" && config.UPTIME_EGRESS_POLICY_READY !== "true") fail("Probe policy readiness must be explicitly enabled.");
  return config;
}

function assertHost() {
  if (process.platform !== "linux" || process.getuid?.() !== 0) fail("Guarded self-hosted probes require root on Linux with iptables and nsenter.");
}

export function probePolicyConfiguration(config, postgresIp, interfaces, routes) {
  if (!Array.isArray(interfaces) || !Array.isArray(routes)) fail("Complete host address and route metadata is required.");
  const blocked = [];
  for (const device of interfaces) for (const address of device.addr_info || []) {
    if (address.family === "inet" && isIP(address.local) === 4) blocked.push(address.local);
  }
  for (const route of routes) {
    // Exact local addresses are already included above. Broadcast/unreachable
    // routes can reject sockets before OUTPUT and cannot prove a DROP counter.
    if (route.type && route.type !== "unicast") continue;
    if (route.dst && route.dst !== "default" && !route.dst.includes(":")) blocked.push(route.dst.includes("/") ? route.dst : `${route.dst}/32`);
  }
  blocked.push(...(config.OUTRAY_PROBE_BLOCKED_CIDRS || "").split(",").map((value) => value.trim()).filter(Boolean));
  return {
    networkName: `${standardProbeProject}_probe`, bridgeName: config.OUTRAY_PROBE_BRIDGE || "br-outray-prb",
    subnet: config.OUTRAY_PROBE_SUBNET || "172.30.41.0/29", address: config.OUTRAY_PROBE_ADDRESS || "172.30.41.2",
    gateway: config.OUTRAY_PROBE_GATEWAY || "172.30.41.1", resolver: config.OUTRAY_PROBE_RESOLVER || "1.1.1.1",
    postgresIp, blockedHostAddresses: [...new Set(blocked)].sort(),
  };
}

export function assertStandardProbe(metadata, config, policy, postgresIp) {
  const host = metadata?.HostConfig || {}, image = metadata?.Config || {}, state = metadata?.State || {};
  if (!owns(metadata, "uptime-probe") || !/^[a-f0-9]{64}$/.test(metadata?.Id || "") || !/^sha256:[a-f0-9]{64}$/.test(metadata?.Image || "")) fail("Probe must be the exact standard Compose service.");
  if (image.User !== "node" || image.WorkingDir !== "/app" || JSON.stringify(image.Cmd) !== JSON.stringify(["node", "/app/probe-boot.mjs"]) || image.Entrypoint?.length) fail("Probe must use the non-root inert activation entrypoint.");
  if (!host.ReadonlyRootfs || host.Privileged || host.PublishAllPorts || Object.keys(host.PortBindings || {}).length || host.RestartPolicy?.Name !== "no" || host.Init !== true) fail("Probe must be read-only, unpublished, inert and restart=no.");
  if (host.Memory !== 268435456 || host.MemorySwap !== 268435456 || host.PidsLimit !== 64) fail("Probe requires its bounded memory, swap and process limits.");
  if (host.CapDrop?.length !== 1 || host.CapDrop[0] !== "ALL" || host.CapAdd?.length || !host.SecurityOpt?.includes("no-new-privileges:true") || host.PidMode || host.IpcMode === "host" || host.Links?.length || host.VolumesFrom?.length || host.Devices?.length || host.ExtraHosts?.length) fail("Probe isolation settings differ from the standard policy.");
  if ((metadata.Mounts || []).some((mount) => mount.Type !== "tmpfs" || mount.Destination !== "/tmp") || Object.keys(host.Tmpfs || {}).length !== 1 || !Object.hasOwn(host.Tmpfs, "/tmp")) fail("Probe may only mount its temporary activation directory.");
  const attachments = metadata.NetworkSettings?.Networks || {}, attachment = attachments[policy.probeNetwork];
  if (host.NetworkMode !== policy.probeNetwork || Object.keys(attachments).length !== 1 || !attachment || attachment.IPAMConfig?.IPv4Address !== policy.probeAddress || attachment.IPAddress && attachment.IPAddress !== policy.probeAddress || JSON.stringify(host.Dns) !== JSON.stringify([policy.probeResolver])) fail("Probe must use its dedicated verified network, static IPv4 and resolver.");
  const env = containerEnv(metadata), delivery = config.UPTIME_NOTIFICATIONS_ENABLED === "true";
  for (const key of Object.keys(env)) if (!probeKeys.has(key) && !imageKeys.has(key) && !(deliveryKeys.has(key) && (delivery || env[key] === ""))) fail("Probe received unrelated runtime credentials or configuration.");
  const composeEnvironment = probeComposeEnvironment(config, postgresIp);
  for (const key of deliveryKeys) if ((env[key] || "") !== composeEnvironment[`OUTRAY_PROBE_NOTIFY_${key}`]) fail("Probe notification credentials differ from the enabled installation settings.");
  for (const [key, expected] of Object.entries({ OUTRAY_DASHBOARD_URL: `https://${config.OUTRAY_APP_HOST}`, OUTRAY_STATUS_URL: `https://${config.OUTRAY_STATUS_HOST}`, STATUS_PUBLIC_URL: `https://${config.OUTRAY_STATUS_HOST}` })) if (env[key] !== expected) fail("Probe public origins differ from the installation configuration.");
  for (const [key, value] of Object.entries({ NODE_ENV: "production", OUTRAY_DEPLOYMENT_MODE: "self-hosted", OUTRAY_PRODUCTS: "uptime", UPTIME_ENABLED: "true", UPTIME_PROBES_ENABLED: config.UPTIME_PROBES_ENABLED, UPTIME_NOTIFICATIONS_ENABLED: config.UPTIME_NOTIFICATIONS_ENABLED, UPTIME_EGRESS_POLICY_READY: config.UPTIME_EGRESS_POLICY_READY, OUTRAY_PROBE_ACTIVATION_ID: standardProbeActivation, OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID: config.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID, OUTRAY_SECRETS_ACTIVE_MASTER_KEY: config.OUTRAY_SECRETS_ACTIVE_MASTER_KEY })) if (env[key] !== value) fail("Probe environment does not match the installation configuration.");
  try {
    const database = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(database.protocol) || database.hostname !== postgresIp || database.port !== "5432" || decodeURIComponent(database.username) !== config.POSTGRES_USER || decodeURIComponent(database.password) !== config.POSTGRES_PASSWORD || decodeURIComponent(database.pathname) !== `/${config.POSTGRES_DB}` || database.search !== "?sslmode=disable" || database.hash) fail("Probe database endpoint does not match the inspected private installation database.");
    if (JSON.stringify(JSON.parse(env.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS || "{}")) !== JSON.stringify(JSON.parse(config.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS || "{}"))) fail("Probe encryption keyring differs from the installation.");
  } catch { fail("Probe database or keyring configuration is invalid."); }
  if (!["created", "running", "exited"].includes(state.Status) || state.OOMKilled) fail("Probe state is not safely recoverable.");
  return env;
}

function dockerContext(options) {
  const spawn = options.spawn || spawnSync;
  const env = Object.fromEntries(["PATH", "HOME", "DOCKER_CONFIG", "XDG_RUNTIME_DIR"].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  const run = (binary, args, selectedEnv = env) => spawn(binary, args, { env: selectedEnv, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  let endpoint = options.endpoint;
  if (!endpoint) {
    const context = run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
    if (context.status !== 0) fail("Cannot inspect the local Docker context.");
    endpoint = String(context.stdout).trim();
  }
  if (!/^unix:\/\/\/[^\r\n\0]+$/.test(endpoint) || process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix:///")) fail("Probe lifecycle requires a local Unix Docker daemon.");
  const docker = (args) => run("docker", ["--host", endpoint, ...args]);
  const required = (args) => { const result = docker(args); if (result.status !== 0) fail("Probe Docker operation failed; private diagnostics suppressed."); return String(result.stdout).trim(); };
  const inspect = (kind, name) => { const result = JSON.parse(required([kind, "inspect", name])); if (!Array.isArray(result) || result.length !== 1) fail("Cannot inspect exact probe resources."); return result[0]; };
  const service = (role) => {
    const ids = required(["ps", "-aq", ...Object.entries(labelsFor(role)).flatMap(([key, value]) => ["--filter", `label=${key}=${value}`])]).split(/\s+/).filter(Boolean);
    if (ids.length !== 1) fail("Exactly one standard Compose database and probe service is required.");
    const metadata = inspect("container", ids[0]);
    if (!owns(metadata, role)) fail("Compose service ownership changed.");
    return metadata;
  };
  const hostJson = (args) => { const result = run("ip", args, networkEnvironment); if (result.status !== 0) fail("Cannot inspect host routing; no probe activated."); try { return JSON.parse(result.stdout); } catch { fail("Host routing metadata is invalid."); } };
  return { spawn, endpoint, docker, required, inspect, service, hostJson };
}

const readyAudit = `const fs=require('node:fs');try{const r=JSON.parse(fs.readFileSync('/tmp/outray-probe-ready'));const ns=fs.readlinkSync('/proc/self/ns/net');if(r.activation!==process.env.OUTRAY_PROBE_ACTIVATION_ID||r.namespace!==ns||!Number.isInteger(r.pid)||r.pid<2||fs.readlinkSync('/proc/'+r.pid+'/ns/net')!==ns)process.exit(1);process.kill(r.pid,0);process.stdout.write('ready')}catch{process.exit(1)}`;
const inertAudit = `const fs=require('node:fs');if(fs.existsSync('/tmp/outray-probe-activate')||fs.existsSync('/tmp/outray-probe-ready'))process.exit(1);process.stdout.write('inert')`;

export function standardProbeMarkerCode(namespace) {
  if (!/^net:\[\d+\]$/.test(namespace || "")) fail("A verified pinned network namespace is required.");
  return `const fs=require('node:fs');const namespace=${JSON.stringify(namespace)};if(fs.readlinkSync('/proc/self/ns/net')!==namespace)process.exit(1);fs.writeFileSync('/tmp/outray-probe-activate',JSON.stringify({activation:process.env.OUTRAY_PROBE_ACTIVATION_ID,namespace}),{mode:0o600,flag:'wx'});`;
}

export async function activateStandardProbe(options = {}) {
  (options.assertHost || assertHost)();
  const root = resolve(options.root || defaultRoot), envFile = resolve(options.envFile || join(root, ".env.self-hosted"));
  if (!options.allowUpdateLock && (existsSync(join(root, ".self-hosted-state/update.lock")) || existsSync(join(root, ".self-hosted-state/maintenance.lock")))) fail("Probe activation is paused during installation maintenance.");
  const context = dockerContext(options);
  let ownedId, namespaceFd, retainedNamespace = false, interrupted = false;
  const releaseNamespace = () => { if (namespaceFd !== undefined) { closeSync(namespaceFd); namespaceFd = undefined; } };
  const stopOwned = () => {
    if (!ownedId) return;
    const current = context.inspect("container", ownedId);
    if (current.Id === ownedId && owns(current, "uptime-probe") && current.State?.Running && context.docker(["stop", "--time", "15", ownedId]).status !== 0) fail("Could not stop the exact probe after verification failure.");
  };
  const interrupt = () => { interrupted = true; try { stopOwned(); } catch { process.exitCode = 1; } };
  process.once("SIGTERM", interrupt); process.once("SIGINT", interrupt);
  try {
    let probe = context.service("uptime-probe");
    ownedId = probe.Id;
    const config = privateConfiguration(envFile);
    const pg = context.service("postgres"), pgEnv = containerEnv(pg), networks = pg.NetworkSettings?.Networks || {}, databaseNetwork = `${standardProbeProject}_database`;
    if (!pg.State?.Running || pg.State.Health?.Status !== "healthy" || pg.HostConfig?.Privileged || Object.keys(pg.HostConfig?.PortBindings || {}).length || Object.keys(networks).length !== 1 || !networks[databaseNetwork]) fail("The isolated standard PostgreSQL service must be healthy.");
    for (const key of ["POSTGRES_USER", "POSTGRES_DB", "POSTGRES_PASSWORD"]) if (pgEnv[key] !== config[key]) fail("PostgreSQL configuration differs from the installation.");
    const postgresIp = networks[databaseNetwork].IPAddress;
    const interfaces = context.hostJson(["-j", "-4", "address", "show"]), routes = context.hostJson(["-j", "-4", "route", "show", "table", "all"]);
    const policy = createProbePolicy(probePolicyConfiguration(config, postgresIp, interfaces, routes));
    assertStandardProbe(probe, config, policy, postgresIp);
    const labels = { "com.docker.compose.project": standardProbeProject, "com.docker.compose.network": "probe" };
    const networkIds = context.required(["network", "ls", "--format", "{{.ID}}"]);
    if (!networkIds || networkIds.split("\n").some((id) => !/^[a-f0-9]{12,64}$/.test(id))) fail("Cannot enumerate complete Docker network metadata.");
    const allNetworks = networkIds.split("\n").map((id) => context.inspect("network", id));
    policy.assertProbeNetworkCollisions({ networks: allNetworks, routes, interfaces, labels, containerId: probe.Id });
    const database = context.inspect("network", databaseNetwork);
    if (!database.Internal || database.Driver !== "bridge" || database.Labels?.["com.docker.compose.project"] !== standardProbeProject) fail("Database network is not the standard isolated network.");
    const policyOptions = { spawn: context.spawn, env: networkEnvironment };
    if (!probe.State.Running) {
      policy.installProbeHostPolicy(policyOptions);
      context.required(["start", probe.Id]);
      probe = context.inspect("container", probe.Id);
      assertStandardProbe(probe, config, policy, postgresIp);
    }
    if (!probe.State.Running || !Number.isSafeInteger(probe.State.Pid) || probe.State.Pid < 2) fail("Inert probe namespace did not start.");
    // Keep the verified namespace alive. Firewall commands use the held FD,
    // never a PID that might now refer to a different/restarted namespace.
    namespaceFd = openSync(`/proc/${probe.State.Pid}/ns/net`, constants.O_RDONLY);
    const namespacePath = `/proc/${process.pid}/fd/${namespaceFd}`;
    const namespaceIdentity = readlinkSync(namespacePath);
    if (!/^net:\[\d+\]$/.test(namespaceIdentity) || namespaceIdentity === readlinkSync("/proc/self/ns/net") || readlinkSync(`/proc/${probe.State.Pid}/ns/net`) !== namespaceIdentity) fail("Probe network namespace changed while being pinned.");
    if (context.required(["exec", probe.Id, "node", "-e", "process.stdout.write(require('node:fs').readlinkSync('/proc/self/ns/net'))"]) !== namespaceIdentity) fail("Pinned namespace does not belong to the exact probe container.");
    const namespace = { ...policyOptions, pid: probe.State.Pid, namespacePath };
    const alreadyReady = context.docker(["exec", probe.Id, "node", "-e", readyAudit]);
    if (alreadyReady.status === 0 && String(alreadyReady.stdout) === "ready") {
      policy.verifyProbeHostPolicy(policyOptions);
      policy.verifyProbeNamespace(namespace);
    } else {
      if (context.required(["exec", probe.Id, "node", "-e", inertAudit]) !== "inert") fail("Existing activation state is not safe to reuse.");
      policy.installProbeHostPolicy(policyOptions);
      policy.installProbeNamespace(namespace);
      policy.verifyProbeHostPolicy(policyOptions);
      policy.verifyProbeNamespace(namespace);
      await policy.verifyProbeConnectivity({ ...namespace, containerId: probe.Id, required: context.required });
      if (interrupted) fail("Probe activation was interrupted before authorization.");
      const current = context.inspect("container", probe.Id);
      assertStandardProbe(current, config, policy, postgresIp);
      if (current.State?.Pid !== probe.State.Pid || !current.State?.Running || readlinkSync(`/proc/${probe.State.Pid}/ns/net`) !== namespaceIdentity) fail("Probe namespace changed during verification.");
      context.required(["exec", probe.Id, "node", "-e", standardProbeMarkerCode(namespaceIdentity)]);
      let ready = false;
      for (let attempt = 0; attempt < 75; attempt++) {
        if (interrupted) fail("Probe activation was interrupted during readiness.");
        const current = context.inspect("container", probe.Id);
        assertStandardProbe(current, config, policy, postgresIp);
        if (current.State?.Pid !== probe.State.Pid || !current.State?.Running || readlinkSync(`/proc/${probe.State.Pid}/ns/net`) !== namespaceIdentity) fail("Probe exited during activation.");
        if (context.docker(["exec", probe.Id, "node", "-e", readyAudit]).status === 0) { ready = true; break; }
        await (options.delay || delay)(1000);
      }
      if (!ready) fail("Probe readiness deadline expired.");
    }
    retainedNamespace = options.holdNamespace === true;
    return {
      id: probe.Id, pid: probe.State.Pid, namespace: namespaceIdentity, endpoint: context.endpoint,
      stop: () => { try { stopOwned(); } finally { releaseNamespace(); } },
      verify: () => {
        const current = context.service("uptime-probe"), currentPg = context.service("postgres");
        assertStandardProbe(current, config, policy, postgresIp);
        if (namespaceFd === undefined || current.Id !== probe.Id || current.State?.Pid !== probe.State.Pid || !current.State?.Running || readlinkSync(`/proc/${probe.State.Pid}/ns/net`) !== namespaceIdentity || currentPg.Id !== pg.Id || currentPg.NetworkSettings?.Networks?.[databaseNetwork]?.IPAddress !== postgresIp) fail("Probe/database identity changed; activation must be repeated.");
        const currentInterfaces = context.hostJson(["-j", "-4", "address", "show"]), currentRoutes = context.hostJson(["-j", "-4", "route", "show", "table", "all"]);
        if (JSON.stringify(probePolicyConfiguration(config, postgresIp, currentInterfaces, currentRoutes)) !== JSON.stringify(probePolicyConfiguration(config, postgresIp, interfaces, routes))) fail("Host routing changed; probe isolation must be reverified.");
        if (context.docker(["exec", probe.Id, "node", "-e", readyAudit]).status !== 0) fail("Probe readiness was lost.");
        if (!policy.safeProbeNetwork(context.inspect("network", policy.probeNetwork), labels, probe.Id)) fail("Probe network membership changed.");
        policy.verifyProbeHostPolicy(policyOptions); policy.verifyProbeNamespace(namespace);
      },
    };
  } catch (error) { try { stopOwned(); } catch { fail("Probe verification failed and its exact container needs operator stop/review."); } throw error; }
  finally { if (!retainedNamespace) releaseNamespace(); process.removeListener("SIGTERM", interrupt); process.removeListener("SIGINT", interrupt); }
}

export function standardProbeUnitText({ root = defaultRoot, envFile = join(root, ".env.self-hosted"), node = process.execPath } = {}) {
  const script = join(resolve(root), "scripts/self-hosted-probe-lifecycle.mjs");
  for (const path of [resolve(root), resolve(envFile), node, script]) if (!/^\/[A-Za-z0-9_./-]+$/.test(path)) fail("Probe supervisor paths must be absolute and contain no shell/systemd escapes.");
  return `${unitMarker}[Unit]\nDescription=OutRay self-hosted guarded Uptime probe\nRequires=docker.service\nAfter=docker.service network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${resolve(root)}\nExecStart=${node} ${script} supervise --root ${resolve(root)} --file ${resolve(envFile)}\nRestart=on-failure\nRestartSec=10\nTimeoutStopSec=45\nUser=root\nGroup=root\nNoNewPrivileges=yes\nProtectSystem=full\nProtectHome=read-only\nPrivateTmp=yes\n\n[Install]\nWantedBy=multi-user.target\n`;
}

export function manageProbeSupervisor(action, options = {}) {
  (options.assertHost || assertHost)();
  if (!["start", "stop"].includes(action)) fail("Use start or stop for the generic probe supervisor.");
  const path = join(options.unitDirectory || "/etc/systemd/system", standardProbeUnit), spawn = options.spawn || spawnSync;
  const systemctl = (args) => { const result = spawn("systemctl", args, { env: networkEnvironment, encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 }); if (result.status !== 0) fail("Could not manage the generic probe supervisor; private diagnostics suppressed."); return result; };
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o022) || !readFileSync(path, "utf8").startsWith(unitMarker)) fail("The existing probe unit is not an owned managed unit.");
  } else if (action === "stop") return { installed: false };
  if (action === "stop") { systemctl(["stop", standardProbeUnit]); return { installed: true, stopped: true }; }
  const content = standardProbeUnitText(options);
  if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
    const temporary = `${path}.${randomUUID()}`;
    writeFileSync(temporary, content, { mode: 0o644, flag: "wx" });
    try { renameSync(temporary, path); } catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
    systemctl(["daemon-reload"]);
  }
  systemctl(["enable", standardProbeUnit]); systemctl(["start", standardProbeUnit]);
  return { installed: true, started: true };
}

export async function superviseStandardProbe(options = {}) {
  let stopping = false, active;
  const stop = () => { stopping = true; try { active?.stop(); } catch { process.exitCode = 1; } };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    const root = resolve(options.root || defaultRoot);
    while (!stopping && (existsSync(join(root, ".self-hosted-state/update.lock")) || existsSync(join(root, ".self-hosted-state/maintenance.lock")))) await (options.delay || delay)(1000);
    if (stopping) return;
    active = await activateStandardProbe({ ...options, holdNamespace: true });
    if (stopping) { active.stop(); return; }
    while (!stopping) {
      await (options.delay || delay)(15_000);
      if (stopping) break;
      active.verify();
    }
  } finally {
    try { active?.stop(); } finally { process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = standardProbeOptions(process.argv.slice(2));
    if (options.command === "supervise") await superviseStandardProbe(options);
    else { await activateStandardProbe(options); console.log("Standard self-hosted probe activated after namespace and denial-counter checks."); }
  } catch { console.error("Self-hosted probe lifecycle failed; the exact owned worker was stopped when safely identifiable. Private diagnostics suppressed."); process.exitCode = 1; }
}
