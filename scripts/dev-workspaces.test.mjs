import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

test("root development keeps shared environment and Tinybird setup while discovering runtime apps", () => {
  assert.match(manifest.scripts.dev, /^dotenv -e \.env -- node scripts\/with-tinybird\.mjs turbo run dev /);
  assert.match(manifest.scripts.dev, /--env-mode=loose/);
  assert.ok(manifest.scripts.dev.includes("--filter='./apps/*'"));
  assert.ok(manifest.scripts.dev.includes("--filter='!outray'"));
  assert.ok(manifest.scripts.dev.includes("--filter='!outray-website'"));
  assert.equal(manifest.scripts["dev:website"], "npm run dev:web");
});

test("Turbo schedules every runtime app and prerequisite builds without starting services", async () => {
  const apps = await Promise.all((await readdir(new URL("apps/", root))).map(async (directory) => {
    try {
      return JSON.parse(await readFile(new URL(`apps/${directory}/package.json`, root), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }));
  const expected = apps.filter((app) => app?.scripts?.dev && app.scripts.start).map((app) => app.name).sort();
  for (const name of ["outray-status", "outray-secrets-share", "outray-uptime-probe"]) {
    assert.ok(expected.includes(name), `${name} is a runtime app`);
  }

  // Run only Turbo's planning phase, bypassing dotenv and the Tinybird wrapper.
  // No app scripts, credential lookups, workers, or database calls execute.
  const command = manifest.scripts.dev.slice(manifest.scripts.dev.indexOf("turbo ") + "turbo ".length);
  const args = (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((argument) => argument.replace(/(['"])(.*?)\1/g, "$2"));
  const graph = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(new URL("node_modules/turbo/bin/turbo", root)), ...args, "--dry=json",
  ], {
    cwd: fileURLToPath(root), encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TURBO_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  }));
  const devTasks = graph.tasks.filter((task) => task.task === "dev");
  assert.deepEqual(devTasks.map((task) => task.package).sort(), expected);
  assert.ok(graph.tasks.some((task) => task.task === "build" && task.package === "@outray/core"));
  assert.ok(graph.tasks.some((task) => task.task === "build" && task.package === "@outray/incident-content"));
  for (const task of devTasks) {
    assert.equal(task.resolvedTaskDefinition.persistent, true);
    assert.equal(task.resolvedTaskDefinition.cache, false);
    assert.ok(task.resolvedTaskDefinition.dependsOn.includes("^build"));
  }
  assert.ok(devTasks.every((task) => task.directory.startsWith("apps/")));
  assert.ok(!devTasks.some((task) => ["outray", "outray-website"].includes(task.package)));
});
