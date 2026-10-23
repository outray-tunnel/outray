import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm, writeFile, readFile, symlink } from "node:fs/promises";
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
