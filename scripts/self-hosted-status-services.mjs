// Explicit Ops status-only trial. Never publishes application/database ports.
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { sourceManifest } from "./self-hosted-artifacts.mjs";
import { argumentsFor, applicationHealthCommand, configurationFrom, containerArguments, hostEnvironment, labelsFor, localDockerEndpoint, missingResource, ownedResource, project, serviceDefinitions } from "./self-hosted-rehearsal.mjs";

export const publicStatus = "outray-ops-public-status";
export const statusCheck = "outray-ops-status-check";
export const statusImageLabel = "com.outray.status-preview";
export const statusConfigurationLabel = "com.outray.status-preview.configuration";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const names = { status: publicStatus, "internal-check": statusCheck };
const fail = (message) => { throw new Error(message); };
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assertStatusEnvironment(values) {
  if (values.OUTRAY_DEPLOYMENT_MODE !== "self-hosted" || values.OUTRAY_PRODUCTS !== "uptime" || values.OUTRAY_ENABLED !== "false"
    || values.UPTIME_ENABLED !== "true" || values.UPTIME_PROBES_ENABLED !== "false" || values.UPTIME_NOTIFICATIONS_ENABLED !== "false"
    || values.UPTIME_EGRESS_POLICY_READY !== "false" || values.STATUS_PUBLIC_URL !== "https://status.ops.outray.dev"
    || values.OUTRAY_STATUS_URL !== values.STATUS_PUBLIC_URL) fail("Status preview requires the authorized Ops status origin and disabled workers.");
  for (const key of Object.keys(values)) {
    if (/^(?:GITHUB_|GOOGLE_|TINYBIRD_|ZEPTO_|PLUNK_|XAI_|PAYSTACK_|POLAR_|HUGEICONS_|OUTRAY_SIGNUP_|SHARE_DATABASE_URL$|OUTRAY_SECRETS_)/.test(key)
      && values[key]) fail("Status preview must not receive OAuth, analytics, billing, email, license or vault credentials.");
  }
  for (const key of ["STATUS_EDGE_SECRET", "UPTIME_RATE_LIMIT_SECRET", "UPTIME_UNSUBSCRIBE_SECRET"]) {
    if (!/^[a-f0-9]{64}$/.test(values[key] || "")) fail("Status preview needs the independent installation's configured internal secrets.");
  }
  if (!values.DATABASE_URL?.includes(`@${project}-postgres:5432/`)) fail("Status preview must use the private owned installation database.");
}

export function statusServiceDefinitions(config) {
  const definitions = serviceDefinitions(config);
  return Object.fromEntries(Object.keys(names).map((kind) => {
    const definition = definitions[kind];
    definition.env.OUTRAY_PRODUCTS = "uptime";
    definition.healthCommand = `node -e ${JSON.stringify(applicationHealthCommand(definition))}`;
    assertStatusEnvironment(definition.env);
    return [kind, definition];
  }));
}

export function statusServiceLabels(config, image, kind, definition) {
  return { ...labelsFor(config), [statusImageLabel]: "true", [statusConfigurationLabel]: fingerprint({ image, kind, definition }) };
}

function environmentFrom(metadata) {
  return Object.fromEntries((metadata?.Config?.Env || []).map((item) => { const index = item.indexOf("="); return [item.slice(0, index), item.slice(index + 1)]; }));
}

export function safeStatusContainer(metadata, expectedImage, labels, definition) {
  const values = environmentFrom(metadata), host = metadata?.HostConfig || {};
  try { assertStatusEnvironment(values); } catch { return false; }
  return Boolean(ownedResource({ Labels: metadata?.Config?.Labels }, labels) && metadata.Image === expectedImage
    && metadata.Config?.User === "node" && JSON.stringify(metadata.Config?.Cmd) === JSON.stringify(definition.command)
    && metadata.Config?.WorkingDir === "/app" && metadata.Config?.Healthcheck?.Test?.[0] === "CMD-SHELL"
    && metadata.Config.Healthcheck.Test.length === 2 && metadata.Config.Healthcheck.Test[1] === definition.healthCommand
    && metadata.Config.Healthcheck.Interval === 2_000_000_000 && metadata.Config.Healthcheck.Timeout === 3_000_000_000
    && metadata.Config.Healthcheck.Retries === 20 && metadata.Config.Healthcheck.StartPeriod === 5_000_000_000
    && host.ReadonlyRootfs && !host.Privileged && !host.PublishAllPorts && !Object.keys(host.PortBindings || {}).length
    && host.CapDrop?.length === 1 && host.CapDrop[0] === "ALL" && !host.CapAdd?.length && host.SecurityOpt?.includes("no-new-privileges:true")
    && host.Init === true && host.NetworkMode === project && ["no", "unless-stopped"].includes(host.RestartPolicy?.Name)
    && JSON.stringify(Object.keys(metadata.NetworkSettings?.Networks || {}).sort()) === JSON.stringify([project])
    && (metadata.Mounts || []).every((mount) => mount.Type === "tmpfs")
    && Object.entries(definition.env).every(([key, value]) => values[key] === value));
}

export function statusContainerArguments(name, definition, image, labels) {
  if (!Object.values(names).includes(name)) fail("Unknown status preview target.");
  const args = containerArguments(name, definition, image, labels);
  args[0] = "create";
  args.splice(args.indexOf("--detach"), 1);
  // Do not enable automatic restarts until both new services pass Docker health.
  return args;
}

export const statusRuntimeAudit = `
const fs = require('node:fs');
const m = JSON.parse(fs.readFileSync('/app/self-hosted-artifact-manifest.json'));
const v = JSON.parse(fs.readFileSync('/app/node_modules/seroval/package.json')).version;
const p = v.split('.').map(Number);
if (m.version !== 1 || m.iconMode !== 'free' || m.deploymentMode !== 'self-hosted' || m.targetNodeMajor !== 22
  || process.versions.node.split('.')[0] !== '22' || !/^[a-f0-9]{64}$/.test(m.source?.sha256 || '')
  || !/^\\d+\\.\\d+\\.\\d+$/.test(v) || p[0] < 1 || (p[0] === 1 && (p[1] < 6 || (p[1] === 6 && p[2] < 3)))) process.exit(1);
for (const path of ['/app/apps/web', '/app/apps/tunnel', '/app/.npmrc', '/app/.env', '/app/.env.prod', '/app/scripts']) if (fs.existsSync(path)) process.exit(1);
for (const path of ['/app/apps/status/dist/server/entry.mjs', '/app/apps/internal-check/dist/index.js']) if (!fs.existsSync(path)) process.exit(1);
if (!fs.readFileSync('/app/apps/internal-check/dist/index.js', 'utf8').includes('/internal/status-domain-check')) process.exit(1);
if (fs.existsSync('/app/node_modules/@hugeicons-pro') && fs.readdirSync('/app/node_modules/@hugeicons-pro').length) process.exit(1);
(async () => { for (const name of ['astro/app/node', 'pg', 'express', 'dotenv', 'react', 'react-dom/server', 'recharts', 'sharp', '@outray/incident-content']) await import(name); })().catch(() => process.exit(1));
`;

export async function runStatusServices(argv = process.argv.slice(2), dependencies = {}) {
  const options = argumentsFor(argv), info = lstatSync(options.file);
  if (!info.isFile() || (info.mode & 0o077)) fail("Use a regular private fresh installation configuration.");
  const config = configurationFrom(parseEnv(readFileSync(options.file, "utf8"))), definitions = statusServiceDefinitions(config);
  const env = hostEnvironment(), spawn = dependencies.spawn || spawnSync, pause = dependencies.delay || delay;
  const context = spawn("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { env, encoding: "utf8", timeout: 10_000 });
  if (context.status !== 0) fail("Cannot inspect the local Docker context.");
  const endpoint = localDockerEndpoint(context.stdout.trim());
  const invoke = (args, values = {}) => spawn("docker", ["--host", endpoint, ...args], { env: { ...env, ...values }, encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000 });
  const required = (args, values) => { const result = invoke(args, values); if (result.status !== 0) fail("Status operation failed; credential-bearing diagnostics suppressed. Existing data is preserved."); return result.stdout.trim(); };
  const inspect = (kind, target) => {
    const result = invoke([kind, "inspect", "--format", "{{json .}}", target]);
    if (result.status !== 0) { if (missingResource(result.stderr || "", kind, target)) return null; fail("Cannot safely inspect an owned status resource."); }
    try { return JSON.parse(result.stdout); } catch { fail("Cannot safely parse status resource metadata."); }
  };
  const rehearsalLabels = labelsFor(config), network = inspect("network", project);
  if (!network || !ownedResource(network, rehearsalLabels) || !network.Internal || network.Driver !== "bridge") fail("The matching owned internal rehearsal network is required.");
  for (const kind of ["postgres", "redis"]) {
    const metadata = inspect("container", `${project}-${kind}`), host = metadata?.HostConfig || {};
    if (!metadata || !ownedResource({ Labels: metadata.Config?.Labels }, rehearsalLabels) || metadata.State?.Status !== "running" || metadata.State.Health?.Status !== "healthy"
      || host.NetworkMode !== project || host.Privileged || host.PublishAllPorts || Object.keys(host.PortBindings || {}).length
      || JSON.stringify(Object.keys(metadata.NetworkSettings?.Networks || {}).sort()) !== JSON.stringify([project])) fail("Healthy isolated owned PostgreSQL and Redis are required.");
  }
  const image = inspect("image", options.image);
  if (!image || image.Config?.User !== "node" || image.Config?.Labels?.[statusImageLabel] !== "true"
    || image.Config?.WorkingDir !== "/app" || JSON.stringify(image.Config?.Cmd) !== JSON.stringify(definitions.status.command)) fail("Use the audited fresh status-only preview image.");
  const targets = Object.entries(names).map(([kind, name]) => ({ kind, name, definition: definitions[kind], labels: statusServiceLabels(config, image.Id, kind, definitions[kind]), metadata: inspect("container", name) }));
  for (const target of targets) if (target.metadata && (!safeStatusContainer(target.metadata, image.Id, target.labels, target.definition)
    || target.metadata.State?.Status !== "running" || target.metadata.State?.Health?.Status !== "healthy")) fail("An existing status target is mismatched or unhealthy; refusing to replace it.");
  if (targets.filter((target) => target.metadata).length === 1) fail("Partial status installation detected; inspect the exact owned targets before retrying.");
  const expectedSource = sourceManifest(dependencies.source || root).sha256;
  // Audit with no network and no runtime secrets, before creating either service.
  required(["run", "--rm", "--name", `${publicStatus}-audit-${randomUUID()}`, "--network", "none", "--read-only", "--user", "node", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", options.image, "node", "-e", `${statusRuntimeAudit}\nif(m.source.sha256!==${JSON.stringify(expectedSource)})process.exit(1);`]);
  if (targets.every((target) => target.metadata)) { console.log("Exact owned status renderer and certificate checker are already healthy and isolated."); return; }
  for (const target of targets) {
    const created = required(statusContainerArguments(target.name, target.definition, options.image, target.labels), target.definition.env);
    target.metadata = inspect("container", target.name);
    if (!safeStatusContainer(target.metadata, image.Id, target.labels, target.definition)) fail("Unexpected new status isolation; the service was not started.");
    target.id = created;
  }
  for (const target of targets) required(["start", target.id]);
  for (const target of targets) {
    let healthy = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      const metadata = inspect("container", target.name);
      if (!safeStatusContainer(metadata, image.Id, target.labels, target.definition) || metadata.State?.Status !== "running" || metadata.State.OOMKilled) fail("Status startup/isolation failed; the public gateway remains unchanged.");
      if (metadata.State.Health?.Status === "healthy") { healthy = true; break; }
      if (metadata.State.Health?.Status === "unhealthy") break;
      await pause(1000);
    }
    if (!healthy) fail("Status health deadline exceeded; the public gateway remains unchanged.");
  }
  for (const target of targets) required(["update", "--restart", "unless-stopped", target.id]);
  console.log("Fresh status renderer and status-only certificate checker are healthy on the private network. No application ports, probes, email or other products were enabled.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runStatusServices(); } catch (error) { console.error(error?.code ? "Status preview failed; filesystem/credential details suppressed." : error.message); process.exitCode = 1; }
}
