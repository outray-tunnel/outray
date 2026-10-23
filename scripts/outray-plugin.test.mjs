import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validatePlugin, pluginRoot } from "./outray-plugin.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "outray-plugin-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(pluginRoot, root, { recursive: true });
  return root;
}
test("the archive source contains one public endpoint, four skills and real branding", async () => {
  const result = await validatePlugin();
  assert.equal(result.files.length, 9);
  assert.equal(result.files.filter((file) => file.endsWith("SKILL.md")).length, 4);
});
test("private bindings and environment files are rejected", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, ".env"), "MUST_NOT_BE_UPLOADED=synthetic");
  await assert.rejects(validatePlugin(root), /prohibited/);
  await rm(join(root, ".env")); await writeFile(join(root, ".app.json"), "{}");
  await assert.rejects(validatePlugin(root), /prohibited/);
});
test("symlinks cannot smuggle external files into the public archive", async (t) => {
  const root = await fixture(t);
  await symlink(join(root, "plugin.json"), join(root, "hidden.json"));
  await assert.rejects(validatePlugin(root), /Symlinks/);
});
test("direct endpoints, private scopes and embedded authentication headers are rejected", async (t) => {
  const root = await fixture(t), path = join(root, "mcp.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  const server = config.mcpServers.outray;
  server.url = "https://outray.co/api/mcp"; await writeFile(path, JSON.stringify(config));
  await assert.rejects(validatePlugin(root), /restricted public/);
  server.url = "https://outray.co/api/mcp/openai"; server.headers = { authorization: "synthetic" };
  await writeFile(path, JSON.stringify(config)); await assert.rejects(validatePlugin(root), /headers/);
  delete server.headers; server.extensions["com.openai"].auth.defaultScopes.push("outray:secrets:values");
  await writeFile(path, JSON.stringify(config)); await assert.rejects(validatePlugin(root), /OAuth/);
});
test("release validation refuses missing publisher and real recording evidence", async (t) => {
  const root = await fixture(t), path = join(root, "plugin.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  delete manifest.extensions["com.openai"].interface.developerName;
  delete manifest.extensions["com.openai"].review.demo_recording_url;
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(validatePlugin(root, { release: true }), /Submission is not ready/);
});

test("required branding cannot disappear or point outside the packaged assets", async (t) => {
  const root = await fixture(t), path = join(root, "plugin.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  const presentation = manifest.extensions["com.openai"].interface;
  for (const key of ["logo", "composerIcon"]) {
    const original = presentation[key];
    for (const value of [undefined, "", "https://outray.co/logo.png", "../assets/logo.png", "assets/logo.png", "./missing.png"]) {
      presentation[key] = value;
      await writeFile(path, JSON.stringify(manifest));
      await assert.rejects(validatePlugin(root), /required|contained/);
    }
    presentation[key] = original;
  }
  await writeFile(path, JSON.stringify(manifest));
  await writeFile(join(root, "assets/logo.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  await assert.rejects(validatePlugin(root), /Invalid PNG/);
});

test("shadowed compatibility manifests cannot retain private bindings or direct MCP wiring", async (t) => {
  const root = await fixture(t);
  const portable = JSON.parse(await readFile(join(root, "plugin.json"), "utf8"));
  const compatibility = { name: portable.name, version: portable.version,
    interface: portable.extensions["com.openai"].interface, mcpServers: "./mcp.json" };
  await mkdir(join(root, ".codex-plugin"));
  const path = join(root, ".codex-plugin/plugin.json");
  const save = async (value) => writeFile(path, JSON.stringify(value));
  await save(compatibility);
  await validatePlugin(root);
  for (const binding of [{ apps: "./private.app.json" }, { extensions: { "com.openai": { apps: "./private.app.json" } } }]) {
    await save({ ...compatibility, ...binding });
    await assert.rejects(validatePlugin(root), /cannot declare app bindings/);
  }
  await save({ ...compatibility, mcpServers: { outray: { type: "streamable-http", url: "https://outray.co/api/mcp" } } });
  await assert.rejects(validatePlugin(root), /Compatibility MCP/);
  await save({ ...compatibility, interface: { ...compatibility.interface, logo: "./different.png" } });
  await assert.rejects(validatePlugin(root), /Compatibility presentation/);
  await save({ ...compatibility, version: "99.0.0" });
  await assert.rejects(validatePlugin(root), /Compatibility identity/);
});

test("public authentication requires all and only the intended public scopes", async (t) => {
  const root = await fixture(t), path = join(root, "mcp.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  const auth = config.mcpServers.outray.extensions["com.openai"].auth;
  const expected = [...auth.defaultScopes];
  for (const scopes of [[], expected.slice(0, -1), [...expected, "outray:admin"], [...expected, "outray:read"]]) {
    auth.defaultScopes = scopes;
    await writeFile(path, JSON.stringify(config));
    await assert.rejects(validatePlugin(root), /OAuth/);
  }
  auth.defaultScopes = expected.reverse();
  await writeFile(path, JSON.stringify(config));
  await validatePlugin(root);
});
