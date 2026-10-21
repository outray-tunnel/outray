import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

// VPS releases contain built artifacts, not a workspace checkout. Even with
// --omit=dev, npm resolves devDependencies when constructing its ideal tree.
// Do not send build-only adapters or local file: dependencies to that runtime.
const source = JSON.parse(readFileSync(process.argv[2], "utf8"));
const root = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const runtime = {
  name: source.name,
  version: source.version,
  private: true,
  ...(source.type ? { type: source.type } : {}),
  engines: source.engines || { node: ">=22.19.0" },
  dependencies: source.dependencies || {},
  ...(source.optionalDependencies ? { optionalDependencies: source.optionalDependencies } : {}),
  overrides: { ...root.overrides, ...source.overrides },
};
for (const [name, version] of Object.entries({ ...runtime.dependencies, ...runtime.optionalDependencies })) {
  if (typeof version !== "string" || /^(?:file:|link:|workspace:|\.\.?\/)/.test(version)) {
    throw new Error(`Runtime dependency ${name} must be bundled or published before VPS deployment.`);
  }
}
if (source.name === "outray-status") {
  // Record the clean build's modules. SCP can leave old, unreferenced chunks
  // behind; they must not become part of this release's import validation.
  const app = dirname(resolve(process.argv[2]));
  const serverModules = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.[mc]?js$/.test(entry.name)) serverModules.push(relative(app, path).split(sep).join("/"));
    }
  }
  visit(join(app, "dist/server"));
  if (!serverModules.includes("dist/server/entry.mjs")) throw new Error("Build Status before packaging its runtime.");
  runtime.outrayRuntime = { serverModules: serverModules.sort() };
}
process.stdout.write(`${JSON.stringify(runtime, null, 2)}\n`);
