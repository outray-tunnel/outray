import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import semver from "semver";
import { prepareNativePlugin, requiredOutrayBinding } from "./prepare-outray-native-plugin.mjs";
import { pluginRoot, validatePlugin } from "./outray-plugin.mjs";

// Synthetic IDs are only parser fixtures; no account plugin is created.
const fixtureBinding = { apps: { registered: { id: "asdk_app_synthetic_test", required: false } } };

test("native account mapping rejects plugin references, empty and ambiguous bindings", () => {
  for (const binding of [{}, { apps: {} }, { apps: { outray: { id: "plugin_asdk_app_synthetic_test" } } },
    { apps: { outray: { id: "https://outray.co/api/mcp/openai" } } },
    { apps: { first: { id: "asdk_app_one" }, second: { id: "asdk_app_two" } } }]) {
    assert.throws(() => requiredOutrayBinding(binding), /verified OutRay/);
  }
  assert.deepEqual(requiredOutrayBinding(fixtureBinding), { apps: { outray: { id: "asdk_app_synthetic_test", required: true } } });
});

test("native test installation has one required account and keeps public upload independent", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "outray-native-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, "marketplace");
  const original = await readFile(join(pluginRoot, "plugin.json"), "utf8");
  await prepareNativePlugin({ appManifest: fixtureBinding, outputDirectory: output });
  const generated = join(output, "plugins/outray");
  const json = async (path) => JSON.parse(await readFile(path, "utf8"));
  const manifest = await json(join(generated, "plugin.json"));
  const legacy = await json(join(generated, ".codex-plugin/plugin.json"));
  const publicVersion = JSON.parse(original).version;
  assert.equal(semver.clean(manifest.version), publicVersion, "local caching must preserve the public release version");
  assert.match(manifest.version, /\+codex\.\d+$/);
  assert.equal(manifest.extensions["com.openai"].apps, "./.app.json");
  assert.equal(legacy.apps, "./.app.json");
  assert.equal(legacy.version, manifest.version);
  assert.deepEqual(legacy.interface, manifest.extensions["com.openai"].interface);
  assert.deepEqual(await json(join(generated, ".app.json")), requiredOutrayBinding(fixtureBinding));
  assert.ok(!(await readdir(generated)).includes("mcp.json"), "no duplicate raw-MCP account login");
  const marketplace = await json(join(output, ".agents/plugins/marketplace.json"));
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");
  assert.equal(marketplace.plugins[0].source.path, "./plugins/outray");
  for (const skill of ["tunnels", "observability", "secrets", "administration"]) {
    assert.equal(await readFile(join(generated, "skills", skill, "SKILL.md"), "utf8"),
      await readFile(join(pluginRoot, "skills", skill, "SKILL.md"), "utf8"));
  }
  assert.equal(await readFile(join(pluginRoot, "plugin.json"), "utf8"), original);
  await validatePlugin();
  await assert.rejects(validatePlugin(generated), /prohibited binding/);
});

test("generation refuses to overwrite directories and cannot target public source", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "outray-native-preserve-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sentinel = join(root, "keep.txt");
  await writeFile(sentinel, "keep");
  await assert.rejects(prepareNativePlugin({ appManifest: fixtureBinding, outputDirectory: root }), /already exists/);
  assert.equal(await readFile(sentinel, "utf8"), "keep");
  await assert.rejects(prepareNativePlugin({ appManifest: fixtureBinding, outputDirectory: pluginRoot }), /outside the public/);
});
