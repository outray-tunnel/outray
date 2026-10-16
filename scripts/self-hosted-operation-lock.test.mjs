import assert from "node:assert/strict";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { acquireInstallationLock } from "./self-hosted-operation-lock.mjs";

async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), "outray-operation-lock-test-"));
  try { await callback(root, join(root, ".self-hosted-state")); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("setup and update share an exclusive private lock with idempotent owned release", async () => {
  await fixture(async (root, state) => {
    const release = await acquireInstallationLock(root);
    assert.equal((await lstat(state)).mode & 0o777, 0o700);
    assert.equal((await lstat(join(state, "update.lock"))).mode & 0o777, 0o600);
    assert.equal(await readFile(join(state, "update.lock"), "utf8"), String(process.pid));
    await assert.rejects(acquireInstallationLock(root), /Another installation operation/);
    await release(); await release();
    await assert.rejects(lstat(join(state, "update.lock")), { code: "ENOENT" });
    await (await acquireInstallationLock(root))();
  });
});

test("unsafe state directories and existing symlink locks are never adopted", async () => {
  await fixture(async (root, state) => {
    await mkdir(state, { mode: 0o755 });
    await assert.rejects(acquireInstallationLock(root), /owned private mode-0700/);
    await rm(state, { recursive: true });
    const other = join(root, "other"); await mkdir(other, { mode: 0o700 });
    await symlink(other, state);
    await assert.rejects(acquireInstallationLock(root), /not a symlink/);
    await unlink(state); await mkdir(state, { mode: 0o700 });
    const target = join(root, "unrelated"); await writeFile(target, "keep");
    await symlink(target, join(state, "update.lock"));
    await assert.rejects(acquireInstallationLock(root), /Another installation operation/);
    assert.equal(await readFile(target, "utf8"), "keep");
  });
});

test("maintenance markers block acquisition before and after the atomic lock creation", async () => {
  await fixture(async (root, state) => {
    await mkdir(state, { mode: 0o700 });
    const maintenance = join(state, "maintenance.lock");
    await writeFile(maintenance, "operator review", { mode: 0o600 });
    await assert.rejects(acquireInstallationLock(root), /maintenance is active/);
    await assert.rejects(lstat(join(state, "update.lock")), { code: "ENOENT" });
    await unlink(maintenance);
    const source = (await readFile(new URL("./self-hosted-operation-lock.mjs", import.meta.url), "utf8")).replace(/^import .*\n/gm, "").replace("export async function", "async function");
    const acquireWithConcurrentMaintenance = runInNewContext(`${source}\nacquireInstallationLock`, {
      constants, lstat, mkdir, unlink, join, resolve, process,
      open: async (...args) => { const file = await open(...args); await writeFile(maintenance, "operator review", { mode: 0o600 }); return file; },
    });
    await assert.rejects(acquireWithConcurrentMaintenance(root), /maintenance is active/);
    await assert.rejects(lstat(join(state, "update.lock")), { code: "ENOENT" });
    assert.equal(await readFile(maintenance, "utf8"), "operator review");
  });
});

test("release refuses to unlink a replacement operation's lock", async () => {
  await fixture(async (root, state) => {
    const release = await acquireInstallationLock(root), path = join(state, "update.lock");
    await unlink(path); await writeFile(path, "replacement", { mode: 0o600 });
    await assert.rejects(release(), /refusing to remove another operation's lock/);
    assert.equal(await readFile(path, "utf8"), "replacement");
  });
});
