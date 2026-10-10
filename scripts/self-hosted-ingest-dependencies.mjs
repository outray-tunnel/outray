// Build-only: copy the already installed pure-JS ingestion dependency closure.
// Never install packages, execute lifecycle scripts or copy other applications.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function copyIngestDependencies(modules, target) {
  modules = realpathSync(modules);
  target = resolve(target);
  if (existsSync(target)) throw new Error("Dependency output already exists");
  const selected = new Map();
  const packagePath = (name, from) => {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error("Invalid dependency name");
    const require = createRequire(join(from, "package.json"));
    let path;
    try { path = dirname(require.resolve(`${name}/package.json`)); }
    catch { path = dirname(require.resolve(name)); }
    while (path !== dirname(path)) {
      if (existsSync(join(path, "package.json")) && JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name === name) break;
      path = dirname(path);
    }
    path = realpathSync(path);
    const rel = relative(modules, path);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith("../") || !existsSync(join(path, "package.json"))) throw new Error("Dependency escaped installed modules");
    return path;
  };
  const visit = (name, from, optional = false) => {
    let path;
    try { path = packagePath(name, from); }
    catch (error) { if (optional && error.code === "MODULE_NOT_FOUND") return; throw error; }
    if (selected.has(name)) { if (selected.get(name) !== path) throw new Error("Multiple dependency versions require review"); return; }
    selected.set(name, path);
    const manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    for (const dependency of Object.keys(manifest.dependencies || {}).sort()) visit(dependency, path);
    for (const dependency of Object.keys(manifest.optionalDependencies || {}).sort()) visit(dependency, path, true);
  };
  for (const name of ["pg", "ioredis", "protobufjs"]) visit(name, dirname(modules));
  const inspect = (path) => {
    const info = lstatSync(path), name = path.split("/").at(-1);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || name.startsWith(".env") || name === ".npmrc" || /\.(?:node|so|dll|dylib|pem|key)$/i.test(name)) throw new Error("Non-JS or configuration dependency input");
    if (info.isDirectory()) for (const child of readdirSync(path)) inspect(join(path, child));
  };
  for (const path of selected.values()) inspect(path);
  mkdirSync(target, { mode: 0o755 });
  for (const [name, path] of selected) cpSync(path, join(target, name), { recursive: true, dereference: false, errorOnExist: true, force: false });
  return [...selected.keys()].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error("Use installed module path and new output directory");
  console.log(`Ingestion JS dependency closure: ${copyIngestDependencies(process.argv[2], process.argv[3]).join(", ")}`);
}
