import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { pluginRoot, validatePlugin } from "./outray-plugin.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = join(repository, "dist/plugins/outray-native-marketplace");

// The input must come from the registered OutRay app, not a guessed plugin ID.
export function requiredOutrayBinding(binding) {
  const entries = Object.values(binding?.apps ?? {});
  const id = entries.length === 1 ? entries[0]?.id : undefined;
  if (typeof id !== "string" || !/^(asdk_app_|connector_|templated_apps_)[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
    throw new Error("Supply the verified OutRay .app.json with exactly one registered app ID. A plugin_asdk_app ID or server URL is not an app ID.");
  }
  return { apps: { outray: { id, required: true } } };
}

export async function prepareNativePlugin({ appManifest, outputDirectory = defaultOutput }) {
  // Validate everything before touching an existing generated marketplace.
  const binding = requiredOutrayBinding(appManifest);
  const checked = await validatePlugin();
  const output = resolve(outputDirectory);
  if (output === pluginRoot || pluginRoot.startsWith(`${output}/`) || output.startsWith(`${pluginRoot}/`)) {
    throw new Error("Native test output must stay outside the public plugin source.");
  }
  try {
    await lstat(output);
    throw new Error("Output already exists. Choose a new --output directory or explicitly remove the old generated marketplace.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(output), { recursive: true });
  // Refuse to replace an existing directory: it may contain someone else's work.
  // Use a new output location or remove the generated marketplace explicitly.
  const staging = await mkdtemp(join(dirname(output), ".outray-native-"));
  try {
    const destination = join(staging, "plugins/outray");
    await cp(pluginRoot, destination, { recursive: true });
    const manifest = structuredClone(checked.manifest);
    manifest.version = `${manifest.version}-native.${Date.now()}`;
    manifest.extensions["com.openai"].apps = "./.app.json";
    await writeFile(join(destination, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(destination, ".app.json"), `${JSON.stringify(binding, null, 2)}\n`);
    // Codex should use the registered app's account lifecycle, with no second
    // raw-MCP connection asking the user to authenticate separately.
    await rm(join(destination, "mcp.json"));
    await mkdir(join(destination, ".codex-plugin"));
    await writeFile(join(destination, ".codex-plugin/plugin.json"), `${JSON.stringify({
      name: manifest.name, version: manifest.version, description: manifest.description,
      apps: "./.app.json", skills: "./skills", interface: manifest.extensions["com.openai"].interface,
    }, null, 2)}\n`);
    await mkdir(join(staging, ".agents/plugins"), { recursive: true });
    await writeFile(join(staging, ".agents/plugins/marketplace.json"), `${JSON.stringify({
      name: "outray-native-development", interface: { displayName: "OutRay native connection testing" },
      plugins: [{ name: "outray", source: { source: "local", path: "./plugins/outray" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Developer Tools" }],
    }, null, 2)}\n`);
    await rename(staging, output);
    return { output, version: manifest.version };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      "app-manifest": { type: "string" }, output: { type: "string" }, help: { type: "boolean" },
    } });
    if (values.help) {
      console.log("Usage: npm run plugin:prepare:native -- --app-manifest /path/to/verified-outray.app.json [--output /new/generated/directory]");
    } else {
      if (!values["app-manifest"]) throw new Error("Register OutRay's OAuth MCP app first, then supply its verified binding with --app-manifest. See docs/outray-mcp-release.md#native-installation-and-connect.");
      const appManifest = JSON.parse(await readFile(resolve(values["app-manifest"]), "utf8"));
      const result = await prepareNativePlugin({ appManifest, outputDirectory: values.output });
      console.log(`Prepared native test plugin ${result.version} at ${result.output}`);
      console.log(`codex plugin marketplace add '${result.output.replaceAll("'", "'\\''")}'`);
      console.log("Install OutRay from OutRay native connection testing in Codex to exercise browser sign-in. This generated marketplace is not the public upload archive.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Native plugin preparation failed");
    process.exitCode = 1;
  }
}
