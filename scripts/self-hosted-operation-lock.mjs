import { constants } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const fail = (message) => { throw new Error(message); };
const sameFile = (first, second) => first.dev === second.dev && first.ino === second.ino;

async function noMaintenanceLock(state) {
  try { await lstat(join(state, "maintenance.lock")); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  fail("Installation maintenance is active; review maintenance.lock before retrying.");
}

/** Setup, reconciliation and updates share one lock; stale locks require review. */
export async function acquireInstallationLock(root) {
  const state = join(resolve(root), ".self-hosted-state"), path = join(state, "update.lock");
  try { await mkdir(state, { mode: 0o700 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const directory = await lstat(state);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o777) !== 0o700 || process.getuid && directory.uid !== process.getuid()) fail("Installation state must be an owned private mode-0700 directory, not a symlink.");
  await noMaintenanceLock(state);
  let file;
  try { file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch { fail("Another installation operation is running, or update.lock needs manual review after interruption."); }
  const owned = await file.stat();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      const current = await lstat(path);
      if (!current.isFile() || current.isSymbolicLink() || !sameFile(current, owned)) fail("Installation lock changed; refusing to remove another operation's lock.");
      await unlink(path);
    } finally { await file.close(); }
  };
  try {
    const current = await lstat(state);
    if (!sameFile(current, directory) || !current.isDirectory() || current.isSymbolicLink() || (current.mode & 0o777) !== 0o700 || process.getuid && current.uid !== process.getuid()) fail("Installation state changed while acquiring its lock.");
    if (!owned.isFile() || owned.nlink !== 1 || (owned.mode & 0o777) !== 0o600 || process.getuid && owned.uid !== process.getuid()) fail("Installation lock is not an owned private regular file.");
    await file.writeFile(String(process.pid));
    await file.sync();
    await noMaintenanceLock(state);
    return release;
  } catch (error) { await release(); throw error; }
}
