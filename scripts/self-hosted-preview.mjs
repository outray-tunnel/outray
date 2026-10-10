import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { applicationHealthCommand, configurationFrom, hostEnvironment, labelsFor, localDockerEndpoint, missingResource, ownedResource, project } from "./self-hosted-rehearsal.mjs";
import { assertConsoleEnvironment, consoleDefinition, consoleLabels, safeConsoleContainer, webEgressNetwork, previewRuntimeAudit, containerEnvironment, gatewayStatusLabel, gatewayIngestLabel, gatewayTemplate, gatewayConfigurationFingerprint } from "./self-hosted-preview-web.mjs";
import { ingestContainer, ingestDefinition, ingestLabels, safeIngestContainer, ingestHealthScript } from "./self-hosted-ingest.mjs";

export const gateway = "outray-ops-preview-caddy";
export const publicWeb = "outray-ops-public-web";
export const egressNetwork = "outray-ops-preview-egress";
export const publicStatus = "outray-ops-public-status";
export const statusCheck = "outray-ops-status-check";
export const statusPreviewLabel = "com.outray.status-preview";
export const caddyImage = "caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f";
const dataVolume = "outray-ops-preview-caddy-data";
const configVolume = "outray-ops-preview-caddy-config";
const modeLabel = "com.outray.preview.mode";
const configLabel = "com.outray.preview.configuration";
const managedLabel = "com.outray.preview.managed";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configDirectory = resolve(root, "deploy/self-hosted/preview");
const fail = (message) => { throw new Error(message); };

export function previewOptions(argv) {
  const result = { enableProxy: false, enableGithub: false, enableTinybird: false, enableStatus: false, enableIngest: false };
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === "--enable-proxy" && !result.enableProxy) { result.enableProxy = true; continue; }
    if (key === "--enable-github" && !result.enableGithub) { result.enableGithub = true; continue; }
    if (key === "--enable-tinybird" && !result.enableTinybird) { result.enableTinybird = true; continue; }
    if (key === "--enable-status" && !result.enableStatus) { result.enableStatus = true; continue; }
    if (key === "--enable-ingest" && !result.enableIngest) { result.enableIngest = true; continue; }
    const name = { "--file": "file", "--email": "email", "--image": "image" }[key];
    if (!name || result[name] || !argv[index + 1] || argv[index + 1].startsWith("--")) fail("Use --file PRIVATE_FRESH_CONFIG --email ACME_CONTACT; add --enable-proxy --image PATCHED_PREVIEW_IMAGE only after the private trial.");
    result[name] = argv[++index];
  }
  if (!result.file || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(result.email || "") || /[\r\n\0]/.test(result.file + (result.image || "")) || (result.enableProxy !== Boolean(result.image)) || ((result.enableGithub || result.enableTinybird) && !result.enableProxy)) fail("A private configuration, valid ACME email and explicit patched image for proxy mode are required; --enable-github and --enable-tinybird are independent explicit proxy-only opt-ins.");
  result.file = resolve(result.file);
  if (result.enableIngest && !result.enableStatus) fail("Retain --enable-status when explicitly enabling Ops ingestion.");
  return result;
}

export function assertPreviewEnvironment(values, options) { return assertConsoleEnvironment(values, options); }

export function gatewayArguments(mode, labels, directory = configDirectory) {
  if (!["maintenance", "proxy"].includes(mode) || /[,\r\n\0]/.test(directory)) fail("Invalid preview gateway configuration.");
  const args = ["create", "--name", gateway, "--network", egressNetwork, "--restart", "unless-stopped", "--pull", "never", "--read-only",
    "--cap-drop", "ALL", "--cap-add", "NET_BIND_SERVICE", "--security-opt", "no-new-privileges:true", "--tmpfs", "/tmp:size=32m,mode=1777", "--memory", "256m",
    "--publish", "80:80/tcp", "--publish", "443:443/tcp", "--log-driver", "json-file", "--log-opt", "max-size=5m", "--log-opt", "max-file=2",
    "--mount", `type=bind,source=${directory},target=/etc/caddy,readonly`, "--mount", `type=volume,source=${dataVolume},target=/data`, "--mount", `type=volume,source=${configVolume},target=/config`, "-e", "CADDY_EMAIL"];
  const enableStatus = labels[gatewayStatusLabel] === "true";
  const enableIngest = labels[gatewayIngestLabel] === "true";
  if (enableStatus) args.push("-e", "STATUS_EDGE_SECRET");
  for (const [key, value] of Object.entries(labels)) args.push("--label", `${key}=${value}`);
  return [...args, caddyImage, "caddy", "run", "--config", `/etc/caddy/${gatewayTemplate(mode, enableStatus, enableIngest)}`, "--adapter", "caddyfile"];
}

export function safeWebContainer(metadata, expectedImage, labels, expectedEnvironment, options) { return safeConsoleContainer(metadata, expectedImage, labels, expectedEnvironment, options); }

export function safeGatewayContainer(metadata, expectedImage, labels, directory = configDirectory) {
  const host = metadata.HostConfig || {}, ports = host.PortBindings || {}, mounts = metadata.Mounts || [];
  const networks = Object.keys(metadata.NetworkSettings?.Networks || {}).sort();
  const expectedNetworks = [egressNetwork, project].sort();
  const allowedPorts = ["80/tcp", "443/tcp"];
  const mode = labels[modeLabel];
  const enableStatus = labels[gatewayStatusLabel] === "true", values = containerEnvironment(metadata);
  const enableIngest = labels[gatewayIngestLabel] === "true";
  if (!["maintenance", "proxy"].includes(mode) || metadata.Config?.Labels?.[gatewayStatusLabel] !== (enableStatus ? "true" : undefined)) return false;
  if (metadata.Config?.Labels?.[gatewayIngestLabel] !== (enableIngest ? "true" : undefined) || (enableIngest && !enableStatus)) return false;
  if (enableStatus) {
    try { if (gatewayConfigurationFingerprint(mode, expectedImage, values.CADDY_EMAIL, true, values.STATUS_EDGE_SECRET, directory, enableIngest) !== labels[configLabel]) return false; } catch { return false; }
  }
  const command = ["caddy", "run", "--config", `/etc/caddy/${gatewayTemplate(mode, enableStatus, enableIngest)}`, "--adapter", "caddyfile"];
  return ownedResource({ Labels: metadata.Config?.Labels }, labels) && metadata.Image === expectedImage && host.ReadonlyRootfs && !host.Privileged && !host.PublishAllPorts
    && ["maintenance", "proxy"].includes(mode) && JSON.stringify(metadata.Config?.Cmd) === JSON.stringify(command)
    && host.CapDrop?.includes("ALL") && host.CapAdd?.length === 1 && ["NET_BIND_SERVICE", "CAP_NET_BIND_SERVICE"].includes(host.CapAdd[0]) && host.SecurityOpt?.includes("no-new-privileges:true")
    && host.NetworkMode === egressNetwork && JSON.stringify(networks) === JSON.stringify(expectedNetworks)
    && Object.keys(ports).length === 2 && allowedPorts.every((key) => ports[key]?.length >= 1 && ports[key].every((value) => value.HostPort === key.split("/")[0] && ["", "0.0.0.0", "::"].includes(value.HostIp)))
    && mounts.length === 3 && mounts.some((mount) => mount.Type === "bind" && mount.Source === directory && mount.Destination === "/etc/caddy" && !mount.RW)
    && mounts.some((mount) => mount.Type === "volume" && mount.Name === dataVolume && mount.Destination === "/data")
    && mounts.some((mount) => mount.Type === "volume" && mount.Name === configVolume && mount.Destination === "/config");
}

export function safePrivateStatusContainer(metadata, name, rehearsalLabels, edgeSecret) {
  const host = metadata?.HostConfig || {}, values = containerEnvironment(metadata);
  const definitions = {
    [publicStatus]: { command: ["node", "apps/status/dist/server/entry.mjs"], port: "4323" },
    [statusCheck]: { command: ["node", "apps/internal-check/dist/index.js"], port: "3344" },
  };
  const definition = definitions[name];
  return Boolean(definition && metadata?.Name === `/${name}` && /^[a-f0-9]{64}$/.test(edgeSecret || "")
    && metadata.State?.Status === "running" && metadata.State.Health?.Status === "healthy"
    && ownedResource({ Labels: metadata.Config?.Labels }, { ...rehearsalLabels, [statusPreviewLabel]: "true" })
    && metadata.Config?.User === "node" && JSON.stringify(metadata.Config?.Cmd) === JSON.stringify(definition.command)
    && values.STATUS_EDGE_SECRET === edgeSecret && (name === publicStatus ? values.PORT : values.INTERNAL_CHECK_PORT) === definition.port
    && host.ReadonlyRootfs && !host.Privileged && !host.PublishAllPorts && !Object.keys(host.PortBindings || {}).length
    && host.CapDrop?.includes("ALL") && !host.CapAdd?.length && host.SecurityOpt?.includes("no-new-privileges:true")
    && (metadata.Mounts || []).every((mount) => mount.Type === "tmpfs")
    && host.NetworkMode === project && JSON.stringify(Object.keys(metadata.NetworkSettings?.Networks || {}).sort()) === JSON.stringify([project]));
}

async function execute(args, env, timeoutMs = 60_000) {
  return await new Promise((complete) => {
    const child = spawn("docker", args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;
    const finish = (result) => { if (!settled) { settled = true; clearTimeout(timer); complete(result); } };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ status: -1, stdout: "", stderr: "" }); }, timeoutMs);
    child.stdout.on("data", (data) => { stdout += data; if (stdout.length > 1_000_000) child.kill("SIGKILL"); });
    child.stderr.on("data", (data) => { stderr += data; if (stderr.length > 1_000_000) child.kill("SIGKILL"); });
    child.on("error", () => finish({ status: -1, stdout: "", stderr: "" }));
    child.on("close", (status) => finish({ status, stdout, stderr }));
  });
}

export async function runPreview(argv = process.argv.slice(2)) {
  const options = previewOptions(argv), info = lstatSync(options.file);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || /(?:^|\/)\.env(?:\.|$)/.test(options.file)) fail("Use the dedicated regular private fresh configuration, not an existing production environment file.");
  const raw = parseEnv(readFileSync(options.file, "utf8")), config = configurationFrom(raw);
  if (config.OUTRAY_APP_HOST !== "ops.outray.dev") fail("This preview gateway is restricted to ops.outray.dev.");
  const hostEnv = hostEnvironment();
  const context = await execute(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], hostEnv);
  if (context.status !== 0) fail("Could not resolve the local Docker context.");
  const endpoint = localDockerEndpoint(context.stdout.trim());
  const docker = (args, env = {}, timeout) => execute(["--host", endpoint, ...args], { ...hostEnv, ...env }, timeout);
  const required = async (args, env = {}, timeout) => { const result = await docker(args, env, timeout); if (result.status !== 0) fail("Preview Docker operation failed; diagnostic output suppressed. All database and certificate volumes are preserved."); return result.stdout; };
  const inspect = async (kind, name) => {
    const result = await docker([kind, "inspect", "--format", "{{json .}}", name]);
    if (result.status !== 0) { if (missingResource(result.stderr, kind, name)) return null; fail("Cannot safely inspect a preview resource; no resources were replaced."); }
    try { return JSON.parse(result.stdout); } catch { fail("Cannot safely parse preview resource metadata."); }
  };
  const rehearsalLabels = labelsFor(config), labels = { ...rehearsalLabels, [managedLabel]: "true" };
  const internal = await inspect("network", project);
  if (!internal || !ownedResource(internal, rehearsalLabels) || !internal.Internal || internal.Driver !== "bridge") fail("The matching labelled internal rehearsal network must already exist.");
  const labelArgs = Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]);
  const egress = await inspect("network", egressNetwork);
  if (egress && (!ownedResource(egress, labels) || egress.Internal || egress.Driver !== "bridge" || Object.values(egress.Containers || {}).some((value) => value.Name !== gateway))) fail("Preview egress network is unlabelled, mismatched or shared; refusing to reuse it.");
  for (const name of [dataVolume, configVolume]) {
    const volume = await inspect("volume", name);
    if (volume && (!ownedResource(volume, labels) || volume.Driver !== "local")) fail("Preview certificate/config volume is unlabelled or mismatched; refusing to reuse it.");
  }
  const imageId = async (name) => (await required(["image", "inspect", "--format", "{{.Id}}", name])).trim();
  const caddyId = await imageId(caddyImage); // Deliberately never silently pulls a new image.
  const definition = consoleDefinition(config, raw, options);
  assertPreviewEnvironment(definition.env, options);
  if (options.enableStatus) {
    if (config.OUTRAY_STATUS_HOST !== "status.ops.outray.dev") fail("Public status preview is restricted to the authorized status namespace.");
    for (const name of [publicStatus, statusCheck]) {
      if (!safePrivateStatusContainer(await inspect("container", name), name, rehearsalLabels, config.STATUS_EDGE_SECRET)) fail("Status mode requires matching healthy owned private status renderer and status-only certificate checker; the gateway remains unchanged.");
    }
  }
  if (options.enableIngest) {
    const existingIngest = await inspect("container", ingestContainer);
    const ingest = ingestDefinition(config, raw);
    if (!existingIngest || existingIngest.State?.Status !== "running" || existingIngest.State.Health?.Status !== "healthy"
      || !safeIngestContainer(existingIngest, existingIngest.Image, ingestLabels(config, existingIngest.Image, ingest), ingest)) fail("Public ingestion requires the matching healthy owned private worker; gateway remains unchanged.");
    await required(["exec", ingestContainer, "node", "-e", ingestHealthScript]);
  }
  if (options.enableProxy) {
    const imageMetadata = await inspect("image", options.image);
    if (!imageMetadata || imageMetadata.Config?.User !== "node" || imageMetadata.Config?.Labels?.["com.outray.console-preview"] !== "true") fail("Use the audited standalone console-preview image.");
    const expectedImage = imageMetadata.Id;
    const webLabels = consoleLabels(config, expectedImage, definition, options);
    if (options.enableGithub || options.enableTinybird) {
      const webEgress = await inspect("network", webEgressNetwork);
      if (!webEgress || !ownedResource(webEgress, { ...rehearsalLabels, "com.outray.console-preview": "true" }) || webEgress.Internal || webEgress.Driver !== "bridge" || Object.values(webEgress.Containers || {}).some((member) => member.Name !== publicWeb)) fail("Explicit GitHub or Tinybird console mode requires the matching unshared web-only egress network.");
    }
    const existing = await inspect("container", publicWeb);
    if (!existing || existing.State?.Status !== "running" || !safeWebContainer(existing, expectedImage, webLabels, definition.env, options)) fail("Start the isolated patched dashboard with self-hosted-preview-web.mjs and matching explicit mode first; this gateway never starts or replaces application containers.");
    // The preview image must work without root dependency fallbacks and must not
    // publish the previously vulnerable traced parser. Do not print package data.
    await required(["exec", publicWeb, "node", "-e", previewRuntimeAudit]);
    let healthy = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await docker(["exec", publicWeb, "node", "-e", applicationHealthCommand(definition)], {}, 6_000)).status === 0) { healthy = true; break; }
      await delay(2_000);
    }
    if (!healthy) fail("Patched standalone dashboard failed private PostgreSQL/Redis deep health; gateway remains unchanged.");
    if (!safeWebContainer(await inspect("container", publicWeb), expectedImage, webLabels, definition.env, options)) fail("Patched dashboard isolation changed; gateway remains unchanged.");
    console.log(`Patched free dashboard passed Node22/Seroval and PostgreSQL/Redis deep health. ${options.enableGithub ? "GitHub-only signup is restricted to two verified approved emails." : "Signup and OAuth remain closed."} ${options.enableTinybird ? "Tinybird query configuration is enabled; READ-only permissions and live queries remain separate verifications." : "Tinybird remains disabled."} ${options.enableIngest ? "Independent ingestion dependency and consumer health passed." : "Telemetry ingestion is not enabled by this gateway."} Other integrations remain disabled; the independent uptime worker is managed separately.`);
  }
  const mode = options.enableProxy ? "proxy" : "maintenance";
  const gatewayLabels = (selectedMode, enableStatus = options.enableStatus, values = { CADDY_EMAIL: options.email, STATUS_EDGE_SECRET: config.STATUS_EDGE_SECRET }, enableIngest = options.enableIngest) => ({ ...labels,
    [modeLabel]: selectedMode, ...(enableStatus ? { [gatewayStatusLabel]: "true" } : {}), ...(enableIngest ? { [gatewayIngestLabel]: "true" } : {}),
    [configLabel]: gatewayConfigurationFingerprint(selectedMode, caddyId, values.CADDY_EMAIL, enableStatus, values.STATUS_EDGE_SECRET, configDirectory, enableIngest) });
  const gatewayEnvironment = { CADDY_EMAIL: options.email, ...(options.enableStatus ? { STATUS_EDGE_SECRET: config.STATUS_EDGE_SECRET } : {}) };
  // Syntax validation uses the exact pinned image, without network or credentials,
  // before any currently running gateway can be stopped.
  // The official binary has a NET_BIND_SERVICE file capability; retaining that
  // one capability is required even for its network-none adaptation command.
  await required(["run", "--rm", "--name", `${gateway}-validate-${randomUUID()}`, "--network", "none", "--read-only", "--cap-drop", "ALL", "--cap-add", "NET_BIND_SERVICE", "--security-opt", "no-new-privileges:true", "--mount", `type=bind,source=${configDirectory},target=/etc/caddy,readonly`, "-e", "CADDY_EMAIL", caddyImage, "caddy", "adapt", "--config", `/etc/caddy/${gatewayTemplate(mode, options.enableStatus, options.enableIngest)}`, "--adapter", "caddyfile"], { CADDY_EMAIL: options.email });
  let existing = await inspect("container", gateway);
  if (existing) {
    const previousMode = existing.Config?.Labels?.[modeLabel], previousStatus = existing.Config?.Labels?.[gatewayStatusLabel] === "true";
    const previousIngest = existing.Config?.Labels?.[gatewayIngestLabel] === "true";
    const previousValues = containerEnvironment(existing);
    if (previousStatus && !options.enableStatus) fail("The existing gateway also serves status pages. Retain --enable-status during console maintenance and upgrades; disabling public status requires a separate explicit rollback.");
    if (previousIngest && !options.enableIngest) fail("Retain --enable-ingest during console maintenance and upgrades; disabling active ingestion requires a separate explicit rollback.");
    if (!["maintenance", "proxy"].includes(previousMode) || !safeGatewayContainer(existing, caddyId, gatewayLabels(previousMode, previousStatus, previousValues, previousIngest))) fail("Existing gateway is unlabelled, mismatched or unsafe; refusing to overwrite it.");
    if (previousMode !== mode || previousStatus !== options.enableStatus || previousIngest !== options.enableIngest || existing.Config.Labels[configLabel] !== gatewayLabels(mode)[configLabel]) {
      await required(["stop", "--time", "10", existing.Id]);
      await required(["rm", existing.Id]); // No --volumes; exact owned gateway only.
      existing = null;
      console.log("Replaced the exact owned gateway container; certificate/config volumes and all application/database containers are retained.");
    }
  }
  if (!egress) await required(["network", "create", "--driver", "bridge", ...labelArgs, egressNetwork]);
  for (const name of [dataVolume, configVolume]) if (!(await inspect("volume", name))) await required(["volume", "create", ...labelArgs, name]);
  if (!existing) {
    const created = (await required(gatewayArguments(mode, gatewayLabels(mode)), gatewayEnvironment)).trim();
    await required(["network", "connect", project, created]);
    if (!safeGatewayContainer(await inspect("container", gateway), caddyId, gatewayLabels(mode))) fail("Created gateway isolation is unexpected; it was not started.");
    await required(["start", created]);
  } else if (existing.State?.Status !== "running") {
    if (!["created", "exited"].includes(existing.State?.Status)) fail("Existing gateway is not reusable.");
    await required(["start", existing.Id]);
  }
  console.log(`${options.enableIngest ? "Dashboard, status and ingestion" : options.enableStatus ? "Dashboard and status-only" : "Dashboard-only"} ${mode} gateway started. Only TCP80/443 are published. Verify public TLS and unknown-host rejection separately; this is not a full public self-hosted acceptance.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runPreview(); } catch (error) { console.error(error?.code ? "Preview setup failed; filesystem/credential details suppressed." : error.message); process.exitCode = 1; }
}
