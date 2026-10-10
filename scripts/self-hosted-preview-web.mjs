// Explicit console-only trial; never replaces normal full self-hosted preflight.
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { argumentsFor, configurationFrom, serviceDefinitions, labelsFor, ownedResource, containerArguments, hostEnvironment, localDockerEndpoint, applicationHealthCommand, missingResource, project } from "./self-hosted-rehearsal.mjs";

export const publicWeb = "outray-ops-public-web";
export const webEgressNetwork = "outray-ops-public-web-egress";
export const githubLabel = "com.outray.console-preview.github";
export const tinybirdLabel = "com.outray.console-preview.tinybird-read";
export const previewConfigurationLabel = "com.outray.preview.configuration";
export const previewImageLabel = "com.outray.console-preview";
export const gatewayStatusLabel = "com.outray.preview.status";
export const pinnedCaddyImage = "caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f";
const gateway = "outray-ops-preview-caddy", gatewayEgress = "outray-ops-preview-egress";
const configDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../deploy/self-hosted/preview");
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (message) => { throw new Error(message); };

export function consoleOptions(argv) {
  const selected = [], options = { enableGithub: false, enableTinybird: false, replaceOwned: false };
  for (const value of argv) {
    const key = { "--enable-github": "enableGithub", "--enable-tinybird": "enableTinybird", "--replace-owned": "replaceOwned" }[value];
    if (key) { if (options[key]) fail("Preview flags must be explicit and unique."); options[key] = true; }
    else selected.push(value);
  }
  return { ...argumentsFor(selected), ...options };
}

export function approvedConsoleEmails(value) {
  const emails = (value || "").split(",").map((email) => email.trim().toLowerCase());
  if (emails.length !== 2 || new Set(emails).size !== 2 || emails.some((email) => !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email))) fail("GitHub console mode requires exactly two distinct valid approved email addresses in the private configuration.");
  return emails.join(",");
}

export function approvedTinybirdReadConfiguration(values) {
  const host = values.TINYBIRD_API_HOST, token = values.TINYBIRD_QUERY_TOKEN;
  let url;
  try { url = new URL(host); } catch { fail("Explicit Tinybird console mode requires a bare HTTPS API origin and a scoped READ-only token in the private configuration."); }
  if (typeof host !== "string" || url.protocol !== "https:" || url.origin !== host || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || typeof token !== "string" || !/^[A-Za-z0-9._~+\/=-]{20,4096}$/.test(token)) fail("Explicit Tinybird console mode requires a bare HTTPS API origin and a scoped READ-only token in the private configuration.");
  return { TINYBIRD_API_HOST: host, TINYBIRD_QUERY_TOKEN: token };
}

export function assertConsoleEnvironment(values, { enableGithub = false, enableTinybird = false } = {}) {
  const forbidden = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TINYBIRD_INGEST_TOKEN", "TINYBIRD_TUNNEL_INGEST_TOKEN", "OUTRAY_SIGNUP_ALLOWED_DOMAINS", "ZEPTO_API_KEY", "ZEPTO_FROM_EMAIL", "PLUNK_API_KEY", "XAI_API_KEY", "PAYSTACK_SECRET_KEY", "POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET", "HUGEICONS_LICENSE_KEY"];
  if (!enableGithub) forbidden.push("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "OUTRAY_SIGNUP_ALLOWED_EMAILS");
  if (!enableTinybird) forbidden.push("TINYBIRD_API_HOST", "TINYBIRD_QUERY_TOKEN");
  for (const key of forbidden) if (values[key]) fail("Console preview requires other providers, telemetry ingestion, email, billing, license and domain-wide signup to remain disabled.");
  if (enableTinybird) approvedTinybirdReadConfiguration(values);
  if (enableGithub) {
    if (!/^[A-Za-z0-9_.-]{1,256}$/.test(values.GITHUB_CLIENT_ID || "") || !/^[A-Za-z0-9_.-]{1,512}$/.test(values.GITHUB_CLIENT_SECRET || "")) fail("Explicit GitHub console mode requires valid GitHub client credentials in the private configuration.");
    if (approvedConsoleEmails(values.OUTRAY_SIGNUP_ALLOWED_EMAILS) !== values.OUTRAY_SIGNUP_ALLOWED_EMAILS) fail("GitHub console email policy must be normalized and explicit.");
  }
  for (const key of ["APP_URL", "CONSOLE_PUBLIC_URL", "BETTER_AUTH_URL"]) if (values[key] !== "https://ops.outray.dev") fail("Console preview is restricted to the authorized dashboard origin.");
  if (values.OUTRAY_DEPLOYMENT_MODE !== "self-hosted" || values.OUTRAY_ENABLED !== "false" || values.UPTIME_PROBES_ENABLED !== "false" || values.UPTIME_NOTIFICATIONS_ENABLED !== "false" || values.UPTIME_EGRESS_POLICY_READY !== "false") fail("Console preview must retain the self-hosted trial and disabled public worker policy.");
}

export function consoleDefinition(config, rawSource = {}, { enableGithub = false, enableTinybird = false } = {}) {
  const definition = serviceDefinitions(config).web;
  // These explicit assignments are the complete external credential whitelist;
  // never spread rawSource or send APPEND credentials to the public dashboard.
  if (enableTinybird) Object.assign(definition.env, approvedTinybirdReadConfiguration(rawSource));
  if (enableGithub) {
    if (rawSource.OUTRAY_SIGNUP_ALLOWED_DOMAINS?.trim()) fail("Do not enable a domain-wide signup allowlist for this restricted GitHub preview.");
    definition.env.GITHUB_CLIENT_ID = rawSource.GITHUB_CLIENT_ID;
    definition.env.GITHUB_CLIENT_SECRET = rawSource.GITHUB_CLIENT_SECRET;
    definition.env.OUTRAY_SIGNUP_ALLOWED_EMAILS = approvedConsoleEmails(rawSource.OUTRAY_SIGNUP_ALLOWED_EMAILS);
  }
  assertConsoleEnvironment(definition.env, { enableGithub, enableTinybird });
  return definition;
}

export function consoleLabels(config, image, definition, { enableGithub = false, enableTinybird = false } = {}) {
  return { ...labelsFor(config), [previewImageLabel]: "true", ...(enableGithub ? { [githubLabel]: "true" } : {}), ...(enableTinybird ? { [tinybirdLabel]: "true" } : {}), [previewConfigurationLabel]: fingerprint({ image, definition }) };
}

export function consoleModesFromContainer(metadata) {
  return { enableGithub: metadata?.Config?.Labels?.[githubLabel] === "true", enableTinybird: metadata?.Config?.Labels?.[tinybirdLabel] === "true" };
}

export function containerEnvironment(metadata) {
  return Object.fromEntries((metadata?.Config?.Env || []).map((item) => { const index = item.indexOf("="); return [item.slice(0, index), item.slice(index + 1)]; }));
}

export function safeConsoleContainer(metadata, expectedImage, labels, expectedEnvironment, { enableGithub = false, enableTinybird = false } = {}) {
  const values = containerEnvironment(metadata);
  try { assertConsoleEnvironment(values, { enableGithub, enableTinybird }); } catch { return false; }
  const host = metadata?.HostConfig || {}, networks = [project, ...(enableGithub || enableTinybird ? [webEgressNetwork] : [])].sort();
  return ownedResource({ Labels: metadata?.Config?.Labels }, labels) && metadata.Image === expectedImage && metadata.Config?.User === "node"
    && metadata.Config.Labels?.[githubLabel] === (enableGithub ? "true" : undefined) && metadata.Config.Labels?.[tinybirdLabel] === (enableTinybird ? "true" : undefined)
    && JSON.stringify(metadata.Config.Cmd) === JSON.stringify(["node", "apps/web/.output/server/index.mjs"])
    && host.ReadonlyRootfs && !host.Privileged && !host.PublishAllPorts && !Object.keys(host.PortBindings || {}).length
    && host.CapDrop?.includes("ALL") && !host.CapAdd?.length && host.SecurityOpt?.includes("no-new-privileges:true")
    && (metadata.Mounts || []).every((mount) => mount.Type === "tmpfs")
    && (!expectedEnvironment || Object.entries(expectedEnvironment).every(([key, value]) => values[key] === value))
    && host.NetworkMode === project && JSON.stringify(Object.keys(metadata.NetworkSettings?.Networks || {}).sort()) === JSON.stringify(networks);
}

export function consoleContainerArguments(definition, image, labels) {
  const args = containerArguments(publicWeb, definition, image, labels);
  args[0] = "create";
  args.splice(args.indexOf("--detach"), 1);
  args[args.indexOf("--restart") + 1] = "unless-stopped";
  return args;
}

export function consoleEgressArguments(container) { return ["network", "connect", "--gw-priority", "1", webEgressNetwork, container]; }

export function gatewayTemplate(mode, enableStatus = false) {
  if (!["maintenance", "proxy"].includes(mode)) fail("Invalid gateway mode.");
  return enableStatus ? (mode === "proxy" ? "Caddyfile.status" : "Caddyfile.status-maintenance") : (mode === "proxy" ? "Caddyfile.proxy" : "Caddyfile");
}

export function gatewayConfigurationFingerprint(mode, image, email, enableStatus = false, edgeSecret, directory = configDirectory) {
  if (enableStatus && !/^[a-f0-9]{64}$/.test(edgeSecret || "")) fail("Status gateway requires its independent generated edge credential.");
  // Keep the historical fingerprint shape byte-for-byte compatible. New modes
  // hash the credential; labels, adaptation output and arguments never contain it.
  return fingerprint({ mode, image, email, config: readFileSync(resolve(directory, gatewayTemplate(mode, enableStatus)), "utf8"),
    ...(enableStatus ? { statusEdgeSecretDigest: createHash("sha256").update(edgeSecret).digest("hex") } : {}) });
}

export function safeMaintenanceGateway(metadata, caddyId, rehearsalLabels, directory = configDirectory) {
  const values = containerEnvironment(metadata), host = metadata?.HostConfig || {}, mode = "maintenance";
  const enableStatus = metadata?.Config?.Labels?.[gatewayStatusLabel] === "true";
  if (metadata?.Config?.Labels?.[gatewayStatusLabel] !== (enableStatus ? "true" : undefined)) return false;
  let configuration;
  try { configuration = gatewayConfigurationFingerprint(mode, caddyId, values.CADDY_EMAIL, enableStatus, values.STATUS_EDGE_SECRET, directory); } catch { return false; }
  const labels = { ...rehearsalLabels, "com.outray.preview.managed": "true", "com.outray.preview.mode": mode,
    ...(enableStatus ? { [gatewayStatusLabel]: "true" } : {}), [previewConfigurationLabel]: configuration };
  const ports = host.PortBindings || {}, mounts = metadata?.Mounts || [];
  return metadata?.State?.Status === "running" && metadata.Image === caddyId && ownedResource({ Labels: metadata.Config?.Labels }, labels)
    && JSON.stringify(metadata.Config.Cmd) === JSON.stringify(["caddy", "run", "--config", `/etc/caddy/${gatewayTemplate(mode, enableStatus)}`, "--adapter", "caddyfile"])
    && host.ReadonlyRootfs && !host.Privileged && !host.PublishAllPorts && host.CapDrop?.includes("ALL")
    && host.CapAdd?.length === 1 && ["NET_BIND_SERVICE", "CAP_NET_BIND_SERVICE"].includes(host.CapAdd[0]) && host.SecurityOpt?.includes("no-new-privileges:true")
    && host.NetworkMode === gatewayEgress && JSON.stringify(Object.keys(metadata.NetworkSettings?.Networks || {}).sort()) === JSON.stringify([project, gatewayEgress].sort())
    && Object.keys(ports).length === 2 && ["80/tcp", "443/tcp"].every((key) => ports[key]?.length >= 1 && ports[key].every((value) => value.HostPort === key.split("/")[0]))
    && mounts.length === 3 && mounts.some((mount) => mount.Type === "bind" && mount.Source === directory && mount.Destination === "/etc/caddy" && !mount.RW)
    && mounts.some((mount) => mount.Type === "volume" && mount.Name === "outray-ops-preview-caddy-data" && mount.Destination === "/data")
    && mounts.some((mount) => mount.Type === "volume" && mount.Name === "outray-ops-preview-caddy-config" && mount.Destination === "/config");
}

export const previewRuntimeAudit = "const fs=require('node:fs');const m=JSON.parse(fs.readFileSync('/app/self-hosted-artifact-manifest.json'));const v=JSON.parse(fs.readFileSync('/app/apps/web/.output/server/node_modules/seroval/package.json')).version;const p=v.split('.').map(Number);if(m.iconMode!=='free'||m.deploymentMode!=='self-hosted'||m.targetNodeMajor!==22||process.versions.node.split('.')[0]!=='22'||fs.existsSync('/app/node_modules')||fs.existsSync('/app/packages')||!/^\\d+\\.\\d+\\.\\d+$/.test(v)||p[0]<1||(p[0]===1&&(p[1]<6||(p[1]===6&&p[2]<3))))process.exit(1)";

export async function runConsolePreview(argv = process.argv.slice(2)) {
  const options = consoleOptions(argv), info = lstatSync(options.file);
  const requiresWebEgress = options.enableGithub || options.enableTinybird;
  if (!info.isFile() || (info.mode & 0o077)) fail("Use the regular private fresh installation configuration.");
  const raw = parseEnv(readFileSync(options.file, "utf8")), config = configurationFrom(raw), definition = consoleDefinition(config, raw, options);
  const env = hostEnvironment();
  const context = spawnSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { env, encoding: "utf8", timeout: 10_000 });
  if (context.status !== 0) fail("Cannot inspect the local Docker context.");
  const endpoint = localDockerEndpoint(context.stdout.trim());
  const invoke = (args, values = {}) => spawnSync("docker", ["--host", endpoint, ...args], { env: { ...env, ...values }, encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000 });
  const required = (args, values) => { const result = invoke(args, values); if (result.status !== 0) fail("Console preview operation failed; credential-bearing diagnostics suppressed. Existing data is preserved."); return result.stdout.trim(); };
  const inspect = (kind, target) => {
    const result = invoke([kind, "inspect", "--format", "{{json .}}", target]);
    if (result.status !== 0) { if (missingResource(result.stderr, kind, target)) return null; fail("Cannot safely inspect a console preview resource."); }
    try { return JSON.parse(result.stdout); } catch { fail("Cannot safely parse console preview metadata."); }
  };
  const rehearsalLabels = labelsFor(config), network = inspect("network", project);
  if (!network || !ownedResource(network, rehearsalLabels) || !network.Internal || network.Driver !== "bridge") fail("The owned internal rehearsal network is required.");
  const infrastructure = [];
  for (const service of ["postgres", "redis"]) {
    const metadata = inspect("container", `${project}-${service}`);
    if (!metadata || !ownedResource({ Labels: metadata.Config?.Labels }, rehearsalLabels) || metadata.State?.Status !== "running" || metadata.State.Health?.Status !== "healthy"
      || metadata.HostConfig.NetworkMode !== project || metadata.HostConfig.Privileged || metadata.HostConfig.PublishAllPorts || Object.keys(metadata.HostConfig.PortBindings || {}).length
      || JSON.stringify(Object.keys(metadata.NetworkSettings.Networks).sort()) !== JSON.stringify([project])) fail("Healthy isolated owned rehearsal database and Redis are required.");
    infrastructure.push(metadata.Id);
  }
  const imageMetadata = inspect("image", options.image);
  if (!imageMetadata || imageMetadata.Config?.User !== "node" || imageMetadata.Config?.Labels?.[previewImageLabel] !== "true") fail("Use the audited standalone console-preview image.");
  const labels = consoleLabels(config, imageMetadata.Id, definition, options);
  const egressLabels = { ...rehearsalLabels, [previewImageLabel]: "true" }, egress = inspect("network", webEgressNetwork);
  if (egress && (!ownedResource(egress, egressLabels) || egress.Internal || egress.Driver !== "bridge" || Object.values(egress.Containers || {}).some((member) => member.Name !== publicWeb))) fail("Console web-only egress network is unlabelled, mismatched or shared; refusing to reuse it.");
  let existing = inspect("container", publicWeb);
  const exact = existing && safeConsoleContainer(existing, imageMetadata.Id, labels, definition.env, options);
  if (existing && !exact) {
    if (!options.replaceOwned) fail("Existing console preview differs; use explicit --replace-owned only after putting the owned gateway into maintenance.");
    const previousModes = consoleModesFromContainer(existing);
    const previousDefinition = consoleDefinition(config, containerEnvironment(existing), previousModes);
    const previousLabels = consoleLabels(config, existing.Image, previousDefinition, previousModes);
    const previousImage = inspect("image", existing.Image);
    if (!previousImage || previousImage.Config?.User !== "node" || previousImage.Config?.Labels?.[previewImageLabel] !== "true" || !safeConsoleContainer(existing, existing.Image, previousLabels, previousDefinition.env, previousModes)) fail("Previous console preview is unlabelled or unsafe; refusing to replace it.");
  }
  if ((existing && !exact) || (!existing && requiresWebEgress)) {
    const caddy = inspect("image", pinnedCaddyImage), maintenance = inspect("container", gateway);
    if (!caddy || !maintenance || !safeMaintenanceGateway(maintenance, caddy.Id, rehearsalLabels)) fail("A matching owned running maintenance gateway is required before changing the public console.");
  }
  // Check the new runtime before stopping any old console; no runtime credentials.
  required(["run", "--rm", "--name", `${publicWeb}-audit-${randomUUID()}`, "--network", "none", "--read-only", "--user", "node", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", options.image, "node", "-e", previewRuntimeAudit]);
  if (existing && !exact) {
    required(["stop", "--time", "10", existing.Id]);
    required(["rm", existing.Id]); // Exact owned container only, never --volumes.
    console.log("Replaced the exact owned console container; database, Redis, certificate volumes and other apps are retained.");
    existing = null;
  }
  if (requiresWebEgress && !egress) required(["network", "create", "--driver", "bridge", ...Object.entries(egressLabels).flatMap(([key, value]) => ["--label", `${key}=${value}`]), webEgressNetwork]);
  if (!existing) {
    const created = required(consoleContainerArguments(definition, options.image, labels), definition.env);
    if (requiresWebEgress) required(consoleEgressArguments(created));
    existing = inspect("container", publicWeb);
    if (!safeConsoleContainer(existing, imageMetadata.Id, labels, definition.env, options)) fail("Created console isolation is unexpected; it was not started.");
    required(["start", created]);
  } else if (existing.State.Status !== "running") {
    if (!["created", "exited"].includes(existing.State.Status)) fail("Existing console is not in a reusable state.");
    required(["start", existing.Id]);
  }
  let healthy = false;
  for (let attempt = 0; attempt < 20; attempt++) { if (invoke(["exec", publicWeb, "node", "-e", applicationHealthCommand(definition)]).status === 0) { healthy = true; break; } await delay(1000); }
  if (!healthy || !safeConsoleContainer(inspect("container", publicWeb), imageMetadata.Id, labels, definition.env, options)) fail("Private console deep health or isolation failed; do not enable public proxy mode.");
  for (const id of infrastructure) required(["update", "--restart", "unless-stopped", id]);
  console.log(`Private console passed PostgreSQL/Redis deep health. ${options.enableGithub ? "GitHub-only signup is restricted to exactly two approved verified emails." : "Signup and OAuth remain closed."} ${options.enableTinybird ? "Tinybird query configuration is enabled; READ-only permissions and live queries remain separate verifications." : "Tinybird remains disabled."} Telemetry ingestion, other integrations and public probes remain disabled; database ports remain private.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runConsolePreview(); } catch (error) { console.error(error?.code ? "Console preview failed; filesystem/credential details suppressed." : error.message); process.exitCode = 1; }
}
