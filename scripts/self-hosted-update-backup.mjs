import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const volumeNames = ["postgres-data", "redis-data", "status-page-logos", "caddy-data", "caddy-config"];
const containerId = /^[a-f0-9]{12,64}$/;
const volumeName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/;
const identifier = /^[a-z_][a-z0-9_]{0,62}$/;

function fail(message) { throw new Error(message); }

async function privateFile(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size <= 0) fail("Backup output is missing, empty, linked or not private; update aborted.");
    const hash = createHash("sha256");
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    return { name: path.slice(path.lastIndexOf("/") + 1), path, bytes: stat.size, sha256: hash.digest("hex") };
  } finally { await file.close(); }
}

async function copyConfiguration(source, destination) {
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  let contents;
  try {
    const stat = await input.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 1024 * 1024) fail("Installation configuration is missing or invalid; update aborted.");
    contents = await input.readFile();
    const output = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await output.writeFile(contents); await output.sync(); } finally { await output.close(); }
  } finally { contents?.fill(0); await input.close(); }
}

/**
 * Back up one already verified installation. The caller owns the update lock,
 * creates this empty directory mode 0700, and stops every application writer.
 * captureToFile(args, destination, { stdinFile }?) must stream binary Docker
 * stdout into an exclusive mode-0600 file, propagate failures/timeouts, and
 * never print stdout/stderr. No Docker-volume restore or removal happens here.
 *
 * Redis SAVE runs before beforeVolumeBackup(), which lets the caller pause
 * Redis and Caddy for consistent volume archives. The caller MUST unpause
 * them in finally, including when a backup command fails.
 */
export async function backupInstallation({ directory, envFile, postgresId, redisId, postgresUser, postgresDatabase, volumes, helperImage, docker, captureToFile, beforeVolumeBackup }) {
  if (!isAbsolute(directory || "") || !isAbsolute(envFile || "")) fail("Backup/configuration paths must be absolute; update aborted.");
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) fail("Backup directory must be private mode 0700; update aborted.");
  if (!containerId.test(postgresId || "") || !containerId.test(redisId || "") || postgresId === redisId) fail("Backup requires verified, distinct database container IDs.");
  if (!identifier.test(postgresUser || "") || !identifier.test(postgresDatabase || "")) fail("Backup requires valid PostgreSQL user/database identifiers.");
  if (!/^sha256:[a-f0-9]{64}$/.test(helperImage || "")) fail("Backup helper must use a verified immutable Docker image ID.");
  if (!volumes || typeof volumes !== "object" || Array.isArray(volumes) || Object.keys(volumes).length !== volumeNames.length || volumeNames.some((key) => !Object.hasOwn(volumes, key) || !volumeName.test(volumes[key])) || new Set(Object.values(volumes)).size !== volumeNames.length) fail("Backup requires five distinct, verified persistent volume names.");
  if (typeof docker !== "function" || typeof captureToFile !== "function" || (beforeVolumeBackup !== undefined && typeof beforeVolumeBackup !== "function")) fail("Backup command runners are not configured.");

  const files = [];
  const capture = async (args, name, options) => {
    const path = join(directory, name);
    const result = await captureToFile(args, path, options);
    if (result?.status !== undefined && result.status !== 0) fail("Backup command failed; existing data and private diagnostics are retained.");
    files.push(await privateFile(path));
    return path;
  };

  const configuration = join(directory, ".env.self-hosted");
  await copyConfiguration(envFile, configuration);
  files.push(await privateFile(configuration));
  const dump = await capture(["exec", postgresId, "pg_dump", "--format=custom", "--no-owner", "--no-privileges", "-U", postgresUser, "-d", postgresDatabase], "postgres.dump");
  const dumpFile = await open(dump, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const magic = Buffer.alloc(5);
    if ((await dumpFile.read(magic, 0, magic.length, 0)).bytesRead !== magic.length || magic.toString("ascii") !== "PGDMP") fail("PostgreSQL backup is not a custom-format archive; update aborted.");
  } finally { await dumpFile.close(); }
  await capture(["exec", "-i", postgresId, "pg_restore", "--list"], "postgres.list", { stdinFile: dump });

  const saved = await docker(["exec", redisId, "redis-cli", "SAVE"]);
  if (saved?.status !== 0 || String(saved.stdout).trim() !== "OK") fail("Redis could not flush its persistent snapshot; update aborted.");
  await beforeVolumeBackup?.();

  for (const name of volumeNames.filter((key) => key !== "postgres-data")) {
    // Read private UID-owned files (including mode-0600 logos) without granting
    // writes, networking, other capabilities or access outside this volume.
    await capture(["run", "--rm", "--network", "none", "--read-only", "--user", "0", "--cap-drop", "ALL", "--cap-add", "DAC_READ_SEARCH", "--security-opt", "no-new-privileges:true", "--mount", `type=volume,source=${volumes[name]},target=/source,readonly`, "--entrypoint", "tar", helperImage, "-C", "/source", "-cf", "-", "."], `${name}.tar`);
  }
  return { files };
}
