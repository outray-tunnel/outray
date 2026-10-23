import { readdir, readFile, lstat, mkdir } from "node:fs/promises";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import semver from "semver";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const pluginRoot = join(repository, "plugins", "outray");

export async function validatePlugin(root = pluginRoot, { release = false } = {}) {
  const files = [];
  async function visit(directory) {
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${path}`);
      if (info.isDirectory()) {
        if (["node_modules", ".git", ".agents"].includes(name)) throw new Error(`Unexpected packaged directory ${name}`);
        await visit(path);
      } else files.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  await visit(root);
  if (files.includes(".app.json") || files.some((path) => /(?:^|\/)\.env(?:\.|$)/.test(path))) throw new Error("Public package contains a prohibited binding or environment file");
  const manifest = JSON.parse(await readFile(join(root, "plugin.json"), "utf8"));
  const mcp = JSON.parse(await readFile(join(root, "mcp.json"), "utf8"));
  if (manifest.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" || manifest.name !== "outray" || !semver.valid(manifest.version)) throw new Error("Invalid portable plugin identity");
  if (mcp.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json") throw new Error("Invalid portable MCP schema");
  const metadata = manifest.extensions?.["com.openai"];
  const presentation = metadata?.interface;
  if (manifest.apps != null || metadata?.apps != null) throw new Error("Public packages cannot declare app bindings");
  if (presentation?.category !== "Developer Tools") throw new Error("Invalid category");
  for (const [key, max] of [["displayName", 30], ["shortDescription", 30], ["longDescription", 4000]]) {
    if (typeof presentation[key] !== "string" || !presentation[key].trim() || presentation[key].length > max) throw new Error(`Invalid ${key}`);
  }
  for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    const url = new URL(presentation[key]);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error(`Invalid ${key}`);
  }
  const prompts = Array.isArray(presentation.defaultPrompt) ? presentation.defaultPrompt : [presentation.defaultPrompt];
  if (!prompts.length || prompts.length > 3 || prompts.some((prompt) => typeof prompt !== "string" || !prompt.trim() || prompt.length > 128 || /[\r\n]/.test(prompt))) throw new Error("Invalid default prompts");
  for (const key of ["logo", "composerIcon", "logoDark", "composerIconDark"]) {
    if (!presentation[key]) continue;
    const path = presentation[key].replace(/^\.\//, "");
    if (!files.includes(path) || path.includes("..")) throw new Error(`Missing contained ${key}`);
    const bytes = await readFile(join(root, path));
    if (bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a" || bytes.length > 5 * 1024 * 1024) throw new Error(`Invalid PNG ${key}`);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width !== height || width < (key.startsWith("logo") ? 256 : 48) || width > 4096) throw new Error(`Invalid image dimensions for ${key}`);
  }
  const skills = files.filter((path) => /^skills\/[^/]+\/SKILL\.md$/.test(path));
  if (skills.length !== 4) throw new Error("Expected all four bundled skills");
  for (const skill of skills) {
    const source = await readFile(join(root, skill), "utf8");
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
    if (!match) throw new Error(`Missing frontmatter ${skill}`);
    const data = parseYaml(match[1]);
    if (data.name !== skill.split("/")[1] || typeof data.description !== "string" || !data.description.trim()) throw new Error(`Invalid skill ${skill}`);
  }
  const server = mcp.mcpServers?.outray;
  if (Object.keys(mcp.mcpServers ?? {}).length !== 1 || server?.type !== "streamable-http" || server.url !== "https://outray.co/api/mcp/openai") throw new Error("Plugin must connect only to the restricted public catalog");
  if (server.headers && Object.keys(server.headers).length) throw new Error("Public packages cannot embed server headers");
  const authentication = server.extensions?.["com.openai"]?.auth;
  if (authentication?.type !== "oauth" || authentication.resource !== server.url || authentication.defaultScopes?.includes("outray:secrets:values")) throw new Error("Invalid public OAuth configuration");
  const cases = metadata.review?.test_cases;
  if (metadata.review?.commerce !== false || !metadata.review?.commerce_description?.trim()) throw new Error("Describe the plugin's neutral billing links and lack of purchases");
  if (!Array.isArray(metadata.publication?.countries) || metadata.publication.countries.length !== 0) throw new Error("This release requires unrestricted country targeting");
  if (!metadata.publication?.release_notes?.trim()) throw new Error("Missing release notes");
  if (cases?.positive?.length !== 5 || cases?.negative?.length !== 3) throw new Error("Expected five positive and three negative review cases");
  for (const entry of [...cases.positive, ...cases.negative]) if (!entry.description?.trim() || !entry.prompt?.trim()) throw new Error("Incomplete review case");
  for (const entry of cases.positive) if (typeof entry.tools_triggered !== "string" || typeof entry.expected_behavior !== "string") throw new Error("Invalid positive review case fields");
  const releaseGaps = [];
  if (!presentation.developerName?.trim()) releaseGaps.push("Select and verify the publisher identity, then set developerName.");
  if (!metadata.review.demo_recording_url) releaseGaps.push("Record, host and verify the real demo, then set review.demo_recording_url.");
  else {
    const demo = new URL(metadata.review.demo_recording_url);
    if (demo.protocol !== "https:" || demo.username || demo.password) throw new Error("Invalid demo recording URL");
  }
  if (release && releaseGaps.length) throw new Error(`Submission is not ready:\n${releaseGaps.join("\n")}`);
  return { manifest, files: files.sort(), releaseGaps };
}

export async function packagePlugin({ release = false } = {}) {
  const checked = await validatePlugin(pluginRoot, { release });
  const outputDirectory = join(repository, "dist", "plugins");
  await mkdir(outputDirectory, { recursive: true });
  const output = join(outputDirectory, `outray-${checked.manifest.version}.zip`);
  const program = `import json,sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1]); output=sys.argv[2]; files=json.loads(sys.argv[3])
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
 for item in files: archive.write(root/item,item)
with zipfile.ZipFile(output) as archive:
 assert sorted(archive.namelist())==sorted(files)
 assert archive.testzip() is None
 assert json.loads(archive.read('plugin.json'))['name']=='outray'
 assert '.app.json' not in archive.namelist()
print(output)`;
  execFileSync("python3", ["-c", program, pluginRoot, output, JSON.stringify(checked.files)], { stdio: "inherit" });
  return { output, ...checked };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = process.argv.includes("--package") ? await packagePlugin({ release: process.argv.includes("--release") }) : await validatePlugin(pluginRoot, { release: process.argv.includes("--release") });
    console.log(`Validated ${result.files.length} plugin files.`);
    for (const gap of result.releaseGaps) console.log(`Release prerequisite: ${gap}`);
  } catch (error) { console.error(error instanceof Error ? error.message : "Plugin validation failed"); process.exitCode = 1; }
}
