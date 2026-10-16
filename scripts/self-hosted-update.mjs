import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream, readFileSync } from "node:fs";
import { lstat, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { checkEnvironment } from "./self-hosted.mjs";
import { backupInstallation } from "./self-hosted-update-backup.mjs";
import { acquireInstallationLock } from "./self-hosted-operation-lock.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = "outray-self-hosted";
const applications = ["web", "internal-check", "tunnel", "ingest", "cron", "status", "secrets-share", "uptime-probe"];
const volumeServices = { "postgres-data": ["postgres", "/var/lib/postgresql/data"], "redis-data": ["redis", "/data"], "status-page-logos": ["web", "/var/lib/outray/status-page-logos"], "caddy-data": ["caddy", "/data"], "caddy-config": ["caddy", "/config"] };
const bootstrapStateSql = `SELECT json_build_object(
  'migrations', (SELECT COALESCE(json_agg(m ORDER BY id), '[]') FROM drizzle.__drizzle_migrations AS m),
  'share_role', (SELECT row_to_json(r) FROM (SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil, rolconfig FROM pg_roles WHERE rolname = 'outray_share_app') AS r),
  'memberships', (SELECT COALESCE(json_agg(r ORDER BY roleid, member), '[]') FROM (SELECT m.roleid, m.member, m.admin_option FROM pg_auth_members AS m JOIN pg_roles AS r ON r.oid = m.roleid OR r.oid = m.member WHERE r.rolname = 'outray_share_app') AS r),
  'database_acl', (SELECT datacl::text FROM pg_database WHERE datname = current_database())
)`;
const help = `Usage: npm run self-host:update -- [--file PATH] [--ref BRANCH_OR_TAG] [--remote NAME] [--dry-run] [--timeout SECONDS]
Updates an existing standard self-hosted Compose installation on this host.
Default target: OUTRAY_UPDATE_REF, otherwise the current branch's upstream.
Backups are retained in .self-hosted-state/. No volumes are deleted.`;
class UpdateError extends Error {}
const fail = (message) => { throw new UpdateError(message); };
const sha = (value) => createHash("sha256").update(value).digest("hex");
export const stableJson = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);

export function parseUpdateOptions(args, root = repository) {
  const options = { file: join(root, ".env.self-hosted"), dryRun: false, timeout: 240 };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (seen.has(key)) fail("Duplicate update option. " + help);
    seen.add(key);
    if (key === "--dry-run") { options.dryRun = true; continue; }
    if (key === "--help") { options.help = true; continue; }
    const field = { "--file": "file", "--ref": "ref", "--remote": "remote", "--timeout": "timeout" }[key];
    const value = args[++index];
    if (!field || !value || value.startsWith("-") || /[\r\n\0]/.test(value)) fail("Invalid update option. " + help);
    options[field] = value;
  }
  options.file = resolve(root, options.file);
  options.timeout = Number(options.timeout);
  if (!Number.isInteger(options.timeout) || options.timeout < 10 || options.timeout > 3600) fail("Health timeout must be 10–3600 seconds.");
  if (options.remote && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.remote)) fail("Use a configured Git remote name, not a URL.");
  if (options.ref && !validRef(options.ref)) fail("Use a branch, tag or full commit SHA as the update ref.");
  return options;
}

function validRef(value) {
  return typeof value === "string" && value.length <= 240 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.includes("..") && !value.includes("//") && !value.endsWith("/") && !value.endsWith(".") && !value.endsWith(".lock");
}

export function determineUpdateRef(options, env, upstream) {
  const ref = options.ref || env.OUTRAY_UPDATE_REF || upstream?.ref;
  const remote = options.remote || upstream?.remote || "origin";
  if (!validRef(ref) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) fail("Configure OUTRAY_UPDATE_REF or a branch upstream, or pass --ref and --remote explicitly.");
  return { ref, remote };
}

/** SQL dumps can contain a randomized psql safety token, not a schema change. */
export function schemaFingerprint(schema, ledger) {
  return sha(String(schema).replace(/^\\(?:un)?restrict [^\r\n]*\r?\n/gm, "") + "\n" + String(ledger).trim());
}

export const imageRollbackAllowed = (before, after) => typeof before === "string" && /^[a-f0-9]{64}$/.test(before) && before === after;

export function infrastructureDefinition(service, root, release) {
  const normalized = structuredClone(service);
  for (const mount of normalized?.volumes || []) {
    if (mount.type === "bind" && mount.target === "/etc/caddy/Caddyfile" && mount.source === join(release, "deploy/self-hosted/Caddyfile")) {
      mount.source = join(root, "deploy/self-hosted/Caddyfile");
    }
  }
  return normalized;
}

export async function execute(command, args, { cwd, env, timeout = 60_000, input, signal } = {}) {
  if (signal?.aborted) return { status: -1, stdout: "", stderr: "", interrupted: true };
  return new Promise((complete) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", finished = false, timedOut = false;
    const cancel = () => child.kill("SIGKILL");
    const finish = (status) => { if (!finished) { finished = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel); complete({ status, stdout, stderr, timedOut, interrupted: Boolean(signal?.aborted) }); } };
    const timer = setTimeout(() => { timedOut = true; cancel(); }, timeout);
    signal?.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 32 * 1024 * 1024) child.kill("SIGKILL"); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 2 * 1024 * 1024) child.kill("SIGKILL"); });
    child.on("error", () => finish(-1));
    child.on("close", (status) => finish(status));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) fail("Update state must be an owned private directory, not a symlink.");
}

async function privateWrite(path, value) {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(value); await file.sync(); } finally { await file.close(); }
}

async function captureDocker(endpoint, hostEnv, args, path, { stdinFile } = {}) {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  // Share FileHandle ownership so stream destruction cannot double-close its fd.
  const output = createWriteStream(path, { fd: file, autoClose: false });
  const child = spawn("docker", ["--host", endpoint, ...args], { env: hostEnv, stdio: ["pipe", "pipe", "pipe"] });
  let timedOut = false, stdinError, readError;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 45 * 60_000);
  child.stderr.resume();
  child.stdin.on("error", (error) => { stdinError = error; });
  const closed = new Promise((complete) => { child.once("error", () => complete(-1)); child.once("close", (status) => complete(status)); });
  try {
    const source = stdinFile ? createReadStream(stdinFile, { flags: constants.O_RDONLY | constants.O_NOFOLLOW }) : undefined;
    source?.on("error", (error) => { if (error !== stdinError) readError = error; });
    const input = source ? pipeline(source, child.stdin).catch((error) => {
      // pg_restore --list can finish after the TOC, before consuming the dump.
      // Accept that closed stdin only after its output and successful exit.
      if (readError || error !== stdinError || error.code !== "EPIPE") throw error;
    }) : Promise.resolve(child.stdin.end());
    const [, , status] = await Promise.all([pipeline(child.stdout, output), input, closed]);
    if (timedOut || status !== 0) fail("A backup command failed; private diagnostic output was suppressed.");
    await file.sync();
  } catch {
    child.kill("SIGKILL");
    await closed;
    fail("A backup could not be completed; existing data has not been replaced.");
  } finally { clearTimeout(timer); output.destroy(); await file.close(); }
}

export async function runUpdate(args = process.argv.slice(2), dependencies = {}) {
  const root = dependencies.root || repository;
  const options = parseUpdateOptions(args, root);
  if (options.help) { console.log(help); return; }
  const run = dependencies.execute || execute;
  const wait = dependencies.delay || delay;
  const now = dependencies.now || Date.now;
  const abort = new AbortController();
  let recovering = false;
  const hostEnv = Object.fromEntries(["PATH", "HOME", "SSH_AUTH_SOCK", "XDG_RUNTIME_DIR", "DOCKER_CONFIG"].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  const invoke = (command, argv, settings = {}) => run(command, argv, { cwd: root, env: hostEnv, signal: recovering ? undefined : abort.signal, ...settings });
  const required = async (command, argv, message, settings) => { const result = await invoke(command, argv, settings); if (result.status !== 0) fail(message); return String(result.stdout).trim(); };
  const git = (argv, message = "Git update operation failed; credentials and diagnostics were suppressed.") => required("git", argv, message);
  const configInfo = await lstat(options.file);
  if (!configInfo.isFile() || configInfo.isSymbolicLink() || (configInfo.mode & 0o077) !== 0 || configInfo.size > 1024 * 1024) fail("Use the installation's private configuration file (mode 0600), not a symlink or hosted environment.");
  const configBytes = await readFile(options.file);
  const env = parseEnv(configBytes.toString());
  const validation = checkEnvironment(env);
  if (validation.errors.length) fail("Self-hosted configuration is incomplete:\n" + validation.errors.join("\n"));
  if (resolve(await git(["rev-parse", "--show-toplevel"])) !== resolve(root)) fail("Run updates from the installation's Git checkout.");
  if (await git(["status", "--porcelain", "--untracked-files=normal"])) fail("The checkout has local changes. Commit/stash them; the updater never discards files.");
  if ((await invoke("git", ["ls-files", "--error-unmatch", "--", options.file])).status === 0) fail("The installation configuration must not be tracked in Git.");
  const branch = await git(["symbolic-ref", "--short", "HEAD"], "Use a tracked branch checkout, not detached HEAD.");
  const upstreamRemote = await invoke("git", ["config", "--get", `branch.${branch}.remote`]);
  const upstreamRef = await invoke("git", ["config", "--get", `branch.${branch}.merge`]);
  const target = determineUpdateRef(options, env, { remote: upstreamRemote.status === 0 ? String(upstreamRemote.stdout).trim() : undefined, ref: upstreamRef.status === 0 ? String(upstreamRef.stdout).trim() : undefined });
  if (!(await git(["remote"])).split("\n").includes(target.remote)) fail("The selected Git remote does not exist.");
  const current = await git(["rev-parse", "HEAD"]);
  if (options.dryRun) {
    console.log(`Plan: ${project}; branch ${branch}; remote ${target.remote}; target ${target.ref}.`);
    console.log("Validate existing local Compose installation → fetch/fast-forward → build immutable image → stop app writers → back up database/configuration/volumes → migrate → replace apps → verify health.");
    console.log("No fetch, build, backup, container mutation or recurring schedule was performed.");
    return { dryRun: true, ...target, current };
  }

  const state = join(root, ".self-hosted-state");
  await privateDirectory(state);
  const releaseLock = await acquireInstallationLock(root);
  const interrupted = () => abort.abort();
  process.on("SIGINT", interrupted);
  process.on("SIGTERM", interrupted);
  const id = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
  const record = { id, stage: "preflight", previousCommit: current, target: target.ref, remote: target.remote };
  const recordFile = join(state, `${id}.json`);
  const saveRecord = async () => { await writeFile(recordFile, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 }); };
  let stopped = false, migrationAttempted = false, migrationUncertain = false, beforeSchema, oldCompose, oldApps, backup, oldContainers;
  let docker, candidateCompose, waitForHealth, frozen = [];
  let previousProbeLifecycle, targetProbeLifecycle, probeSupervisorStopped = false;
  const resumeInfrastructure = async () => {
    for (const container of [...frozen].reverse()) {
      const result = await docker(["unpause", container]);
      if (result.status !== 0) fail("Could not unpause infrastructure; inspect the update record before retrying.");
      frozen = frozen.filter((value) => value !== container);
    }
  };
  try {
    if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix:///")) fail("Updates require a local Unix Docker daemon, not a remote Docker host.");
    const context = await required("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], "Cannot inspect the local Docker context.", { env: { ...hostEnv, ...(process.env.DOCKER_CONTEXT ? { DOCKER_CONTEXT: process.env.DOCKER_CONTEXT } : {}) } });
    if (!/^unix:\/\/\/[^\r\n\0]+$/.test(context)) fail("Updates require a local Unix Docker socket.");
    docker = (argv, settings = {}) => invoke("docker", ["--host", context, ...argv], settings);
    const mustDocker = async (argv, message, settings) => { const result = await docker(argv, settings); if (result.status !== 0) fail(message); return String(result.stdout).trim(); };
    const inspect = async (kind, names) => JSON.parse(await mustDocker([kind, "inspect", ...names], "Could not inspect installation metadata; no unsafe adoption is attempted."));
    const ids = (await mustDocker(["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`], "Could not inspect the Compose installation.")).split(/\s+/).filter(Boolean);
    if (!ids.length) fail("No standard self-hosted Compose installation exists. Migrate manual/preview installations first; refusing to create another stack.");
    const installed = await inspect("container", ids);
    oldContainers = new Map();
    for (const container of installed) {
      const role = container.Config?.Labels?.["com.docker.compose.service"];
      if (container.Config?.Labels?.["com.docker.compose.project"] !== project || ![...applications, "migrate", "postgres", "redis", "caddy"].includes(role)) fail("Unexpected container in the Compose project; refusing to update it.");
      if (role === "migrate" && container.State?.Running) fail("Another migration/bootstrap is running; wait for it to finish before updating.");
      if (role !== "migrate" && oldContainers.has(role)) fail("Scaled/duplicate services require a reviewed rolling update.");
      oldContainers.set(role, container);
    }
    for (const name of ["postgres", "redis", "caddy", "web"]) if (!oldContainers.get(name)?.State?.Running) fail(`The existing ${name} service must be running before an update.`);
    const database = Object.fromEntries(oldContainers.get("postgres").Config.Env.map((entry) => { const at = entry.indexOf("="); return [entry.slice(0, at), entry.slice(at + 1)]; }));
    for (const key of ["POSTGRES_USER", "POSTGRES_DB", "POSTGRES_PASSWORD"]) if (database[key] !== env[key]) fail("Configuration does not match the running database. No data will be adopted or replaced.");
    const runtimeEnv = (role) => Object.fromEntries((oldContainers.get(role)?.Config.Env || []).map((entry) => { const at = entry.indexOf("="); return [entry.slice(0, at), entry.slice(at + 1)]; }));
    const existingWeb = runtimeEnv("web");
    for (const key of ["BETTER_AUTH_SECRET", "INTERNAL_API_SECRET", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID", "OUTRAY_SECRETS_ACTIVE_MASTER_KEY"]) if (existingWeb[key] !== env[key]) fail("Signing/encryption keys differ from the running installation. Perform key rotation separately, not during an update.");
    try {
      if (stableJson(JSON.parse(existingWeb.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS || "{}")) !== stableJson(JSON.parse(env.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS || "{}"))) fail("Previous encryption keys differ from the running installation.");
      const share = new URL(runtimeEnv("secrets-share").SHARE_DATABASE_URL);
      if (share.username !== "outray_share_app" || share.password !== env.SHARE_DATABASE_PASSWORD) fail("Share database credentials differ from the running installation. Review credential rotation separately.");
    } catch (error) { if (error instanceof UpdateError) throw error; fail("Could not verify existing encryption/Share configuration."); }

    const composeArgs = (source, configuration = options.file) => {
      const files = [join(source, "deploy/self-hosted/compose.yaml")];
      if (env.OUTRAY_ICON_MODE !== "free" && env.HUGEICONS_LICENSE_KEY?.trim() && !/^(?:your_|replace_|CHANGE_ME)/i.test(env.HUGEICONS_LICENSE_KEY)) files.push(join(source, "deploy/self-hosted/compose.pro-icons.yaml"));
      return ["compose", "--project-name", project, "--env-file", configuration, ...files.flatMap((file) => ["--file", file]), ...((env.UPTIME_PROBES_ENABLED === "true" || env.UPTIME_NOTIFICATIONS_ENABLED === "true") ? ["--profile", "uptime-worker"] : [])];
    };
    const composeConfig = async (source) => JSON.parse(await mustDocker([...composeArgs(source), "config", "--format", "json"], "Compose configuration could not be validated.", { env: { ...hostEnv, ...env } }));
    const previousConfig = await composeConfig(root);
    const expectedApps = applications.filter((name) => name !== "uptime-probe" || env.UPTIME_PROBES_ENABLED === "true" || env.UPTIME_NOTIFICATIONS_ENABLED === "true");
    for (const name of expectedApps) if (!oldContainers.get(name)?.State?.Running) fail(`The existing ${name} service is absent/stopped. Reconcile the standard installation before updating.`);
    if (oldContainers.get("uptime-probe")?.State?.Running && !expectedApps.includes("uptime-probe")) fail("Worker flags differ from the running installation; reconcile configuration before updating.");
    oldApps = expectedApps;
    if (oldApps.includes("uptime-probe")) {
      previousProbeLifecycle = await import(pathToFileURL(join(root, "scripts/self-hosted-probe-lifecycle.mjs")).href);
      Object.assign(env, previousProbeLifecycle.probeComposeEnvironment(env, oldContainers.get("postgres").NetworkSettings?.Networks?.[`${project}_database`]?.IPAddress));
    }
    waitForHealth = async (expectedImages) => {
      const healthy = async () => {
        const result = await docker(["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`]);
        const names = String(result.stdout).trim().split(/\s+/).filter(Boolean);
        if (result.status !== 0 || !names.length) return false;
        const containers = await inspect("container", names);
        const active = new Map(containers.map((item) => [item.Config?.Labels?.["com.docker.compose.service"], item]));
        if (!oldApps.every((name) => active.get(name)?.Image === expectedImages[name] && active.get(name)?.State?.Running && active.get(name)?.State?.Health?.Status === "healthy")) return false;
        return (await docker(["exec", active.get("web").Id, "node", "-e", "fetch('http://127.0.0.1:6767/api/health?deep=true',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"])).status === 0;
      };
      const deadline = now() + options.timeout * 1000;
      while (!await healthy()) { if (abort.signal.aborted && !recovering) fail("Update interrupted during health verification."); if (now() >= deadline) return false; await wait(2000); }
      return true;
    };
    const beforeConfigHash = sha(configBytes);

    console.log(`Fetching ${target.remote}/${target.ref}; installed services remain running.`);
    await git(["fetch", "--no-tags", target.remote, target.ref]);
    const commit = await git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"]);
    if (!/^[a-f0-9]{40,64}$/.test(commit)) fail("Git returned an invalid commit.");
    if ((await invoke("git", ["merge-base", "--is-ancestor", current, commit])).status !== 0) fail("Update is not a fast-forward. No reset, downgrade or branch switch is performed.");
    record.commit = commit;
    const receipt = join(state, "current.json");
    let previousReceipt;
    try { const info = await lstat(receipt); if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o077)) fail("Update receipt is not private."); previousReceipt = JSON.parse(await readFile(receipt, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (previousReceipt?.commit === commit && previousReceipt.configHash === beforeConfigHash && oldApps.every((name) => oldContainers.get(name).Image === previousReceipt.imageId && oldContainers.get(name).State.Health?.Status === "healthy")) {
      console.log("Already up to date; no builds, migrations or restarts needed.");
      return { unchanged: true, commit };
    }
    await privateDirectory(join(state, "releases"));
    const release = join(state, "releases", id);
    await git(["worktree", "add", "--detach", release, commit]);
    record.release = release;
    const targetModule = await import(pathToFileURL(join(release, "scripts/self-hosted.mjs")).href);
    if (targetModule.checkEnvironment(env).errors.length) fail("The target release requires configuration changes. Review them before updating.");
    const nextConfig = await composeConfig(release);
    if (previousProbeLifecycle) targetProbeLifecycle = await import(pathToFileURL(join(release, "scripts/self-hosted-probe-lifecycle.mjs")).href);
    for (const role of ["postgres", "redis", "caddy"]) if (stableJson(previousConfig.services[role]) !== stableJson(infrastructureDefinition(nextConfig.services[role], root, release))) fail(`The release changes ${role} infrastructure; perform a reviewed infrastructure upgrade separately.`);
    if (!readFileSync(join(root, "deploy/self-hosted/Caddyfile")).equals(readFileSync(join(release, "deploy/self-hosted/Caddyfile")))) fail("The release changes gateway routing. Review that infrastructure change before updating.");
    const volumes = {};
    for (const [logical, [role, destination]] of Object.entries(volumeServices)) {
      const name = nextConfig.volumes[logical]?.name;
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/.test(name || "")) fail("The release has an invalid persistent-volume mapping.");
      const mount = oldContainers.get(role)?.Mounts?.find((item) => item.Destination === destination);
      if (mount && (mount.Type !== "volume" || mount.Name !== name || !mount.RW)) fail("Persistent-volume mappings differ from the running installation; refusing to attach replacement data.");
      if (!mount && logical !== "status-page-logos") fail("An existing persistent-volume mount is missing.");
      const users = (await mustDocker(["ps", "-aq", "--filter", `volume=${name}`], "Cannot verify volume ownership.")).split(/\s+/).filter(Boolean);
      if (users.some((user) => !ids.some((id) => user.startsWith(id) || id.startsWith(user)))) fail("A persistent volume is shared with another deployment; refusing concurrent access.");
      if (mount) await inspect("volume", [name]);
      volumes[logical] = name;
    }
    if (new Set(Object.values(volumes)).size !== 5) fail("Persistent volumes must be distinct.");
    const tag = `${project}:update-${commit.slice(0, 12)}-${id.slice(-8)}`;
    const candidateEnv = { ...hostEnv, ...env, OUTRAY_IMAGE: tag };
    candidateCompose = (argv) => docker([...composeArgs(release), ...argv], { env: candidateEnv, timeout: 60 * 60_000 });
    record.stage = "build";
    await saveRecord();
    console.log(`Building ${commit.slice(0, 12)} before interrupting applications.`);
    if ((await candidateCompose(["build", "web"])).status !== 0) fail("Image build failed. Running applications were not stopped; build diagnostics were suppressed to protect credentials.");
    const [image] = await inspect("image", [tag]);
    record.imageId = image.Id;
    candidateEnv.OUTRAY_IMAGE = image.Id;
    if (!oldContainers.get("web").Mounts.some((mount) => mount.Destination === volumeServices["status-page-logos"][1])) {
      const existing = await docker(["volume", "inspect", volumes["status-page-logos"]]);
      if (existing.status === 0) {
        const metadata = JSON.parse(existing.stdout)[0];
        if (metadata.Labels?.["com.docker.compose.project"] !== project) fail("The new logo volume name is already owned elsewhere.");
      } else await mustDocker(["volume", "create", "--label", `com.docker.compose.project=${project}`, "--label", "com.docker.compose.volume=status-page-logos", volumes["status-page-logos"]], "Could not create the new owned logo volume.");
    }
    backup = join(state, `backup-${id}`);
    await privateDirectory(backup);
    await privateWrite(join(backup, "compose.previous.yaml"), await readFile(join(root, "deploy/self-hosted/compose.yaml")));
    const previousFiles = ["--file", join(backup, "compose.previous.yaml")];
    if (composeArgs(root).includes(join(root, "deploy/self-hosted/compose.pro-icons.yaml"))) {
      await privateWrite(join(backup, "compose.pro.previous.yaml"), await readFile(join(root, "deploy/self-hosted/compose.pro-icons.yaml")));
      previousFiles.push("--file", join(backup, "compose.pro.previous.yaml"));
    }
    const rollbackImages = Object.fromEntries(oldApps.map((name) => [name, { image: oldContainers.get(name).Image }]));
    await privateWrite(join(backup, "images.previous.json"), JSON.stringify({ services: rollbackImages }));
    oldCompose = (argv) => docker(["compose", "--project-name", project, "--project-directory", join(root, "deploy/self-hosted"), "--env-file", join(backup, ".env.self-hosted"), ...previousFiles, "--file", join(backup, "images.previous.json"), ...(oldApps.includes("uptime-probe") ? ["--profile", "uptime-worker"] : []), ...argv], { env: { ...hostEnv, ...(previousProbeLifecycle ? previousProbeLifecycle.probeComposeEnvironment(env, env.OUTRAY_PROBE_DATABASE_HOST) : {}) } });
    const pgArgs = ["-U", env.POSTGRES_USER, "-d", env.POSTGRES_DB];
    const fingerprint = async () => {
      const schema = await mustDocker(["exec", oldContainers.get("postgres").Id, "pg_dump", "--schema-only", "--no-owner", ...pgArgs], "Cannot verify database schema; automatic image rollback is unsafe.");
      const ledger = await mustDocker(["exec", oldContainers.get("postgres").Id, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", ...pgArgs, "-c", bootstrapStateSql], "Cannot verify migration/bootstrap state; automatic image rollback is unsafe.");
      return schemaFingerprint(schema, ledger);
    };
    beforeSchema = await fingerprint();
    record.schemaBefore = beforeSchema;
    record.backup = backup;
    // Recheck concurrent operator edits before changing code or stopping apps.
    if (sha(await readFile(options.file)) !== beforeConfigHash || await git(["status", "--porcelain", "--untracked-files=normal"]) || await git(["rev-parse", "HEAD"]) !== current || await git(["symbolic-ref", "--short", "HEAD"]) !== branch) fail("Source/configuration changed during the build; update aborted before stopping apps.");
    const concurrentMigration = await mustDocker(["ps", "-q", "--filter", `label=com.docker.compose.project=${project}`, "--filter", "label=com.docker.compose.service=migrate"], "Cannot confirm that no other migration is running.");
    if (concurrentMigration) fail("Another migration started during the build; refusing concurrent schema changes.");
    await inspect("container", oldApps.map((name) => oldContainers.get(name).Id));
    await git(["merge", "--ff-only", "--no-edit", commit]);
    record.stage = "backup";
    await saveRecord();
    console.log("Stopping application writers for a consistent backup and migration; persistent services are retained.");
    stopped = true;
    if (previousProbeLifecycle) {
      await previousProbeLifecycle.manageProbeSupervisor("stop", { root, envFile: options.file });
      probeSupervisorStopped = true;
    }
    await mustDocker(["stop", "--time", "30", ...oldApps.map((name) => oldContainers.get(name).Id)], "Could not stop application writers safely.", { timeout: 5 * 60_000 });
    try {
      const backed = await (dependencies.backupInstallation || backupInstallation)({
        directory: backup, envFile: options.file, postgresId: oldContainers.get("postgres").Id, redisId: oldContainers.get("redis").Id,
        postgresUser: env.POSTGRES_USER, postgresDatabase: env.POSTGRES_DB, volumes, helperImage: oldContainers.get("postgres").Image, docker,
        captureToFile: dependencies.captureToFile || ((argv, path, settings) => captureDocker(context, hostEnv, argv, path, settings)),
        beforeVolumeBackup: async () => {
          for (const name of ["redis", "caddy"]) { const container = oldContainers.get(name).Id; await mustDocker(["pause", container], "Could not freeze persistent state for backup."); frozen.push(container); }
        },
      });
      record.backups = backed.files;
    } finally { await resumeInfrastructure(); }
    if (sha(await readFile(options.file)) !== beforeConfigHash) fail("Configuration changed during backup; migration was not started.");
    record.stage = "migrate";
    await saveRecord();
    migrationAttempted = true;
    console.log("Applying committed migrations to this installation only.");
    record.migrationContainer = `${project}-migrate-${id}`;
    await saveRecord();
    const migration = await candidateCompose(["run", "-T", "--name", record.migrationContainer, "--rm", "--no-deps", "migrate"]);
    migrationUncertain = Boolean(migration.timedOut || migration.interrupted || abort.signal.aborted);
    if (migration.status !== 0) fail("Migration/bootstrap failed. The database backup has been retained; recovery requires review.");
    record.schemaAfter = await fingerprint();
    record.stage = "replace";
    await saveRecord();
    if ((await candidateCompose(["up", "--detach", "--no-build", "--no-deps", "--pull", "never", ...oldApps])).status !== 0) fail("Application replacement failed.");
    if (targetProbeLifecycle) await targetProbeLifecycle.activateStandardProbe({ root, envFile: options.file, allowUpdateLock: true });
    record.stage = "health";
    await saveRecord();
    if (!await waitForHealth(Object.fromEntries(oldApps.map((name) => [name, image.Id])))) fail("Application health deadline expired.");
    if (targetProbeLifecycle) {
      await targetProbeLifecycle.manageProbeSupervisor("start", { root, envFile: options.file });
      probeSupervisorStopped = false;
    }
    stopped = false;
    record.stage = "complete";
    record.configHash = beforeConfigHash;
    await saveRecord();
    await writeFile(receipt, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
    console.log(`Updated to ${commit.slice(0, 12)}. Backup retained at ${backup}. Worker checks confirm process liveness, not completed jobs.`);
    return record;
  } catch (error) {
    recovering = true;
    record.failure = error instanceof UpdateError ? error.message : "An update step failed; private diagnostics were suppressed.";
    if (docker && frozen.length) { try { await resumeInfrastructure(); } catch { record.infrastructureNeedsReview = true; } }
    if (stopped && docker) {
      let safe = !migrationAttempted;
      if (migrationAttempted && record.migrationContainer) {
        // Killing the Docker CLI does not necessarily stop its migration container.
        try {
          const pending = await docker(["ps", "-aq", "--filter", `name=^/${record.migrationContainer}$`]);
          if (pending.status !== 0) migrationUncertain = true;
          const pendingIds = String(pending.stdout).trim().split(/\s+/).filter(Boolean);
          if (pendingIds.length) {
            const info = await docker(["container", "inspect", ...pendingIds]);
            const migrations = info.status === 0 ? JSON.parse(info.stdout) : [];
            if (migrations.length !== 1 || migrations[0].Name !== `/${record.migrationContainer}` || migrations[0].Config?.Labels?.["com.docker.compose.project"] !== project || migrations[0].Config?.Labels?.["com.docker.compose.service"] !== "migrate") migrationUncertain = true;
            else if ((await docker(["stop", "--time", "30", migrations[0].Id])).status !== 0) migrationUncertain = true;
            const remaining = await docker(["ps", "-q", "--filter", `name=^/${record.migrationContainer}$`]);
            if (remaining.status !== 0 || String(remaining.stdout).trim()) migrationUncertain = true;
          }
        } catch { migrationUncertain = true; }
      }
      if (migrationAttempted && beforeSchema && !migrationUncertain) {
        try {
          const pgArgs = ["-U", env.POSTGRES_USER, "-d", env.POSTGRES_DB];
          const schema = await docker(["exec", oldContainers.get("postgres").Id, "pg_dump", "--schema-only", "--no-owner", ...pgArgs]);
          const ledger = await docker(["exec", oldContainers.get("postgres").Id, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", ...pgArgs, "-c", bootstrapStateSql]);
          safe = schema.status === 0 && ledger.status === 0 && imageRollbackAllowed(beforeSchema, schemaFingerprint(schema.stdout, ledger.stdout));
        } catch { safe = false; }
      }
      if (!migrationAttempted) {
        const restart = await docker(["start", ...oldApps.map((name) => oldContainers.get(name).Id)]);
        record.rollback = restart.status === 0 ? "previous-containers-restarted" : "manual-recovery-required";
        if (restart.status === 0 && waitForHealth) {
          try {
            if (previousProbeLifecycle) await previousProbeLifecycle.activateStandardProbe({ root, envFile: options.file, allowUpdateLock: true });
            record.rollbackHealthy = await waitForHealth(Object.fromEntries(oldApps.map((name) => [name, oldContainers.get(name).Image])));
          }
          catch { record.rollbackHealthy = false; }
        }
      } else if (safe && oldCompose) {
        const result = await oldCompose(["up", "--detach", "--no-build", "--no-deps", "--pull", "never", ...oldApps]);
        record.rollback = result.status === 0 ? "previous-images-restored-check-health" : "manual-recovery-required";
        if (result.status === 0 && waitForHealth) {
          try {
            if (previousProbeLifecycle) await previousProbeLifecycle.activateStandardProbe({ root, envFile: options.file, allowUpdateLock: true });
            record.rollbackHealthy = await waitForHealth(Object.fromEntries(oldApps.map((name) => [name, oldContainers.get(name).Image])));
          }
          catch { record.rollbackHealthy = false; }
        }
      } else {
        if (candidateCompose) await candidateCompose(["stop", "--timeout", "30", ...oldApps]);
        record.rollback = "schema-changed-or-unknown-apps-stopped-review-backup";
      }
      if (record.rollbackHealthy && previousProbeLifecycle && probeSupervisorStopped) {
        try { await previousProbeLifecycle.manageProbeSupervisor("start", { root, envFile: options.file }); probeSupervisorStopped = false; }
        catch { record.rollbackHealthy = false; record.rollback = "previous-images-restored-probe-supervisor-needs-review"; }
      }
    }
    record.stage = "failed";
    await saveRecord();
    console.error(`Update stopped: ${record.failure}`);
    if (record.rollback) console.error(`Recovery: ${record.rollback}. No database was automatically restored.`);
    console.error(`Private update record: ${recordFile}`);
    throw new UpdateError("Self-hosted update did not complete.");
  } finally {
    process.removeListener("SIGINT", interrupted);
    process.removeListener("SIGTERM", interrupted);
    await releaseLock();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runUpdate().catch((error) => { console.error(error instanceof UpdateError ? error.message : "Self-hosted update failed; credential-bearing diagnostics were suppressed."); process.exitCode = 1; });
}
