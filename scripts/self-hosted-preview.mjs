import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { applicationHealthCommand, configurationFrom, hostEnvironment, labelsFor, localDockerEndpoint, missingResource, ownedResource, project } from "./self-hosted-rehearsal.mjs";
import { assertConsoleEnvironment, consoleDefinition, consoleLabels, safeConsoleContainer, webEgressNetwork, previewRuntimeAudit } from "./self-hosted-preview-web.mjs";

export const gateway = "outray-ops-preview-caddy";
export const publicWeb = "outray-ops-public-web";
export const egressNetwork = "outray-ops-preview-egress";
export const caddyImage = "caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f";
const dataVolume = "outray-ops-preview-caddy-data";
const configVolume = "outray-ops-preview-caddy-config";
const modeLabel = "com.outray.preview.mode";
const configLabel = "com.outray.preview.configuration";
const managedLabel = "com.outray.preview.managed";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configDirectory = resolve(root, "deploy/self-hosted/preview");
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (message) => { throw new Error(message); };

export function previewOptions(argv) {
  const result = { enableProxy: false, enableGithub: false, enableTinybird: false };
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === "--enable-proxy" && !result.enableProxy) { result.enableProxy = true; continue; }
    if (key === "--enable-github" && !result.enableGithub) { result.enableGithub = true; continue; }
    if (key === "--enable-tinybird" && !result.enableTinybird) { result.enableTinybird = true; continue; }
    const name = { "--file": "file", "--email": "email", "--image": "image" }[key];
    if (!name || result[name] || !argv[index + 1] || argv[index + 1].startsWith("--")) fail("Use --file PRIVATE_FRESH_CONFIG --email ACME_CONTACT; add --enable-proxy --image PATCHED_PREVIEW_IMAGE only after the private trial.");
    result[name] = argv[++index];
  }
  if (!result.file || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(result.email || "") || /[\r\n\0]/.test(result.file + (result.image || "")) || (result.enableProxy !== Boolean(result.image)) || ((result.enableGithub || result.enableTinybird) && !result.enableProxy)) fail("A private configuration, valid ACME email and explicit patched image for proxy mode are required; --enable-github and --enable-tinybird are independent explicit proxy-only opt-ins.");
  result.file = resolve(result.file);
  return result;
}

export function assertPreviewEnvironment(values, options) { return assertConsoleEnvironment(values, options); }

export function gatewayArguments(mode, labels, directory = configDirectory) {
  if (!["maintenance", "proxy"].includes(mode) || /[,\r\n\0]/.test(directory)) fail("Invalid preview gateway configuration.");
  const args = ["create", "--name", gateway, "--network", egressNetwork, "--restart", "unless-stopped", "--pull", "never", "--read-only",
    "--cap-drop", "ALL", "--cap-add", "NET_BIND_SERVICE", "--security-opt", "no-new-privileges:true", "--tmpfs", "/tmp:size=32m,mode=1777", "--memory", "256m",
    "--publish", "80:80/tcp", "--publish", "443:443/tcp", "--log-driver", "json-file", "--log-opt", "max-size=5m", "--log-opt", "max-file=2",
    "--mount", `type=bind,source=${directory},target=/etc/caddy,readonly`, "--mount", `type=volume,source=${dataVolume},target=/data`, "--mount", `type=volume,source=${configVolume},target=/config`, "-e", "CADDY_EMAIL"];
  for (const [key, value] of Object.entries(labels)) args.push("--label", `${key}=${value}`);
  return [...args, caddyImage, "caddy", "run", "--config", `/etc/caddy/${mode === "proxy" ? "Caddyfile.proxy" : "Caddyfile"}`, "--adapter", "caddyfile"];
}

export function safeWebContainer(metadata, expectedImage, labels, expectedEnvironment, options) { return safeConsoleContainer(metadata, expectedImage, labels, expectedEnvironment, options); }

export function safeGatewayContainer(metadata, expectedImage, labels, directory = configDirectory) {
  const host = metadata.HostConfig || {}, ports = host.PortBindings || {}, mounts = metadata.Mounts || [];
  const networks = Object.keys(metadata.NetworkSettings?.Networks || {}).sort();
  const expectedNetworks = [egressNetwork, project].sort();
  const allowedPorts = ["80/tcp", "443/tcp"];
  const mode = labels[modeLabel];
  const command = ["caddy", "run", "--config", `/etc/caddy/${mode === "proxy" ? "Caddyfile.proxy" : "Caddyfile"}`, "--adapter", "caddyfile"];
  return ownedResource({ Labels: metadata.Config?.Labels }, labels) && metadata.Image === expectedImage && host.ReadonlyRootfs && !host.Privileged && !host.PublishAllPorts
    && ["maintenance", "proxy"].includes(mode) && JSON.stringify(metadata.Config?.Cmd) === JSON.stringify(command)
    && host.CapDrop?.includes("ALL") && host.CapAdd?.length === 1 && ["NET_BIND_SERVICE", "CAP_NET_BIND_SERVICE"].includes(host.CapAdd[0]) && host.SecurityOpt?.includes("no-new-privileges:true")
    && host.NetworkMode === egressNetwork && JSON.stringify(networks) === JSON.stringify(expectedNetworks)
    && Object.keys(ports).length === 2 && allowedPorts.every((key) => ports[key]?.length >= 1 && ports[key].every((value) => value.HostPort === key.split("/")[0] && ["", "0.0.0.0", "::"].includes(value.HostIp)))
    && mounts.length === 3 && mounts.some((mount) => mount.Type === "bind" && mount.Source === directory && mount.Destination === "/etc/caddy" && !mount.RW)
    && mounts.some((mount) => mount.Type === "volume" && mount.Name === dataVolume && mount.Destination === "/data")
    && mounts.some((mount) => mount.Type === "volume" && mount.Name === configVolume && mount.Destination === "/config");
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
    console.log(`Patched free dashboard passed Node22/Seroval and PostgreSQL/Redis deep health. ${options.enableGithub ? "GitHub-only signup is restricted to two verified approved emails." : "Signup and OAuth remain closed."} ${options.enableTinybird ? "Tinybird query configuration is enabled; READ-only permissions and live queries remain separate verifications." : "Tinybird remains disabled."} Telemetry ingestion, other integrations and public probes remain disabled.`);
  }
  const mode = options.enableProxy ? "proxy" : "maintenance";
  const gatewayLabels = (selectedMode) => ({ ...labels, [modeLabel]: selectedMode, [configLabel]: fingerprint({ mode: selectedMode, image: caddyId, email: options.email, config: readFileSync(resolve(configDirectory, selectedMode === "proxy" ? "Caddyfile.proxy" : "Caddyfile"), "utf8") }) });
  // Syntax validation uses the exact pinned image, without network or credentials,
  // before any currently running gateway can be stopped.
  // The official binary has a NET_BIND_SERVICE file capability; retaining that
  // one capability is required even for its network-none adaptation command.
  await required(["run", "--rm", "--name", `${gateway}-validate-${randomUUID()}`, "--network", "none", "--read-only", "--cap-drop", "ALL", "--cap-add", "NET_BIND_SERVICE", "--security-opt", "no-new-privileges:true", "--mount", `type=bind,source=${configDirectory},target=/etc/caddy,readonly`, "-e", "CADDY_EMAIL", caddyImage, "caddy", "adapt", "--config", `/etc/caddy/${mode === "proxy" ? "Caddyfile.proxy" : "Caddyfile"}`, "--adapter", "caddyfile"], { CADDY_EMAIL: options.email });
  let existing = await inspect("container", gateway);
  if (existing) {
    const previousMode = existing.Config?.Labels?.[modeLabel];
    if (!["maintenance", "proxy"].includes(previousMode) || !safeGatewayContainer(existing, caddyId, gatewayLabels(previousMode)) || !existing.Config.Env?.includes(`CADDY_EMAIL=${options.email}`)) fail("Existing gateway is unlabelled, mismatched or unsafe; refusing to overwrite it.");
    if (previousMode !== mode) {
      await required(["stop", "--time", "10", existing.Id]);
      await required(["rm", existing.Id]); // No --volumes; exact owned gateway only.
      existing = null;
      console.log("Replaced the exact owned gateway container; certificate/config volumes and all application/database containers are retained.");
    }
  }
  if (!egress) await required(["network", "create", "--driver", "bridge", ...labelArgs, egressNetwork]);
  for (const name of [dataVolume, configVolume]) if (!(await inspect("volume", name))) await required(["volume", "create", ...labelArgs, name]);
  if (!existing) {
    const created = (await required(gatewayArguments(mode, gatewayLabels(mode)), { CADDY_EMAIL: options.email })).trim();
    await required(["network", "connect", project, created]);
    if (!safeGatewayContainer(await inspect("container", gateway), caddyId, gatewayLabels(mode))) fail("Created gateway isolation is unexpected; it was not started.");
    await required(["start", created]);
  } else if (existing.State?.Status !== "running") {
    if (!["created", "exited"].includes(existing.State?.Status)) fail("Existing gateway is not reusable.");
    await required(["start", existing.Id]);
  }
  console.log(`Dashboard-only ${mode} gateway started. Only TCP80/443 are published. Verify public TLS and unknown-host rejection separately; this is not a full public self-hosted acceptance.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runPreview(); } catch (error) { console.error(error?.code ? "Preview setup failed; filesystem/credential details suppressed." : error.message); process.exitCode = 1; }
}
