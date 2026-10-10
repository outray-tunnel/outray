import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const applicationOutputs = Object.freeze({
  web: "apps/web/.output", tunnel: "apps/tunnel/dist", "internal-check": "apps/internal-check/dist", ingest: "apps/ingest/dist",
  cron: "apps/cron/dist", status: "apps/status/dist", "secrets-share": "apps/secrets-share/dist", "uptime-probe": "apps/uptime-probe/dist",
});
export const dependencyOutputs = Object.freeze({ core: "packages/core/dist", "incident-content": "packages/incident-content/dist", "vite-plugin": "packages/vite-plugin/dist" });
const entrypoints = { web: "server/index.mjs", tunnel: "server.js", "internal-check": "index.js", ingest: "server.js", cron: "index.js", status: "server/entry.mjs", "secrets-share": "server/entry.mjs", "uptime-probe": "index.js" };
const sourceRoots = ["package.json", "package-lock.json", "turbo.json", ".npmrc", "apps", "packages", "shared", "scripts/self-hosted-share-role.mjs"];
const skippedSourceDirectories = new Set(["node_modules", "dist", ".output", ".astro", ".turbo", ".cache", ".source", ".tanstack", "test", "tests", "__tests__"]);
const originKeys = ["APP_PUBLIC_URL", "STATUS_PUBLIC_URL", "SHARE_PUBLIC_URL", "EDGE_PUBLIC_URL", "INGEST_PUBLIC_URL"];
const manifestName = "manifest.json";
const digest = (data) => createHash("sha256").update(data).digest("hex");
const slash = (path) => path.split(sep).join("/");
const inside = (root, path) => { const rel = relative(root, path); return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
const reject = (message) => { throw new Error(message); };

export function publicOrigins(values) {
  const result = {};
  for (const key of originKeys) {
    let value;
    try { value = new URL(values[key]); } catch { reject("All five expected public self-hosted origins are required."); }
    if (value.protocol !== (key === "EDGE_PUBLIC_URL" ? "wss:" : "https:") || value.username || value.password || value.pathname !== "/" || value.search || value.hash) reject("Expected public origins must be bare HTTPS origins (WSS for edge), without credentials or paths.");
    result[key] = value.origin;
  }
  if (new Set(Object.values(result)).size !== originKeys.length) reject("Expected public origins must be distinct.");
  return result;
}

export function nativeBinary(buffer) {
  const magic = buffer.subarray(0, 4).toString("hex");
  return ["7f454c46", "feedface", "cefaedfe", "feedfacf", "cffaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"].includes(magic) || buffer.subarray(0, 2).toString("ascii") === "MZ";
}

export function sourceManifest(root) {
  root = realpathSync(root);
  const files = [];
  const visit = (path) => {
    const name = basename(path);
    if (name.startsWith(".env") || ["routeTree.gen.ts", ".DS_Store"].includes(name) || /\.(?:pem|key)$/i.test(name) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name) || /^(?:README|CHANGELOG|VERIFICATION)(?:\..*)?$/i.test(name)) return;
    const info = lstatSync(path);
    if (info.isSymbolicLink()) reject("Source digest refuses symlinks; use a clean source checkout.");
    if (info.isDirectory()) {
      if (skippedSourceDirectories.has(name) || path === join(root, "packages/icons/generated")) return;
      for (const child of readdirSync(path).sort()) visit(join(path, child));
    } else if (info.isFile()) files.push({ path: slash(relative(root, path)), sha256: digest(readFileSync(path)) });
    else reject("Source digest refuses special files.");
  };
  for (const path of sourceRoots) {
    if (!existsSync(join(root, path))) reject("A complete source checkout is required for the source digest.");
    visit(join(root, path));
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { sha256: digest(JSON.stringify(files)), files };
}

export function auditOutputs(root) {
  root = realpathSync(root);
  const files = [], text = [];
  const outputs = { ...applicationOutputs, ...dependencyOutputs };
  for (const [name, path] of Object.entries(applicationOutputs)) if (!existsSync(join(root, path, entrypoints[name]))) reject("All eight application entrypoints must exist before artifacts can be staged.");
  for (const path of Object.values(dependencyOutputs)) if (!existsSync(join(root, path))) reject("The three dependency build outputs must exist before artifacts can be staged.");
  const traceRoot = join(root, applicationOutputs.web, "server/node_modules");
  const visit = (path) => {
    const rel = slash(relative(root, path)), name = basename(path);
    if (rel.includes("@hugeicons-pro") || name.startsWith(".env") || [".npmrc", ".git"].includes(name) || /\.(?:node|dylib|so(?:\.\d+)*|dll|exe|pem|key)$/i.test(name)) reject("Artifacts contain a forbidden private, native, platform-specific or configuration file.");
    if (rel.split("/").includes("node_modules") && !inside(traceRoot, path)) reject("Only Nitro's exact nested traced dependency tree may contain node_modules.");
    const info = lstatSync(path);
    if (info.isSymbolicLink()) {
      const target = readlinkSync(path);
      if (!inside(traceRoot, path) || isAbsolute(target) || !inside(traceRoot, realpathSync(path))) reject("Artifact symlinks must stay inside Nitro's traced dependency tree and remain relative.");
      files.push({ path: rel, link: target });
    } else if (info.isDirectory()) {
      for (const child of readdirSync(path).sort()) visit(join(path, child));
    } else if (info.isFile()) {
      const bytes = readFileSync(path);
      if (nativeBinary(bytes)) reject("Artifacts contain an ELF, Mach-O or Windows platform binary.");
      if (/\.(?:[cm]?js|json|map|html|css)$/i.test(name)) {
        const content = bytes.toString("utf8");
        if (content.includes("@hugeicons-pro")) reject("Artifacts contain a Pro icon dependency or import.");
        if (rel.startsWith(`${applicationOutputs.web}/public/`)) text.push(content);
      }
      files.push({ path: rel, bytes: info.size, sha256: digest(bytes) });
    } else reject("Artifacts contain a special file.");
  };
  for (const path of Object.values(outputs)) visit(join(root, path));
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { sha256: digest(JSON.stringify(files)), files, clientText: text.join("\n") };
}

export function assertOriginsInClient(clientText, origins) {
  for (const value of Object.values(origins)) if (!clientText.includes(value)) reject("A required expected public origin is absent from the built web client; do not stage stale or differently configured outputs.");
}

export function assertNoProDependencies(root) {
  const visit = (path) => {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      if (item.name === "@hugeicons-pro" && readdirSync(join(path, item.name)).length) reject("Free image dependency installation contains Pro packs.");
      if (item.isDirectory()) visit(join(path, item.name));
    }
  };
  if (existsSync(join(root, "node_modules"))) visit(join(root, "node_modules"));
  for (const group of ["apps", "packages"]) for (const item of readdirSync(join(root, group), { withFileTypes: true })) {
    const path = join(root, group, item.name, "node_modules");
    if (item.isDirectory() && existsSync(path)) visit(path);
  }
}

export function stageArtifacts(source, directory, expectedOrigins) {
  source = resolve(source); directory = resolve(directory);
  if (existsSync(directory)) reject("Artifact staging directory already exists; refusing to overwrite it.");
  if (directory === source || inside(directory, source)) reject("Artifact staging cannot replace or contain the source checkout.");
  const origins = publicOrigins(expectedOrigins);
  const mode = JSON.parse(readFileSync(join(source, "packages/icons/generated/mode.json"), "utf8"));
  if (mode.mode !== "free") reject("Only freshly built free-mode artifacts are accepted by this fallback.");
  assertNoProDependencies(source);
  const provenance = sourceManifest(source), audited = auditOutputs(source);
  assertOriginsInClient(audited.clientText, origins);
  const manifest = { version: 1, iconMode: "free", deploymentMode: "self-hosted", targetNodeMajor: 22, stagingNodeVersion: process.versions.node, origins, applicationOutputs, dependencyOutputs, source: provenance, artifacts: { sha256: audited.sha256, files: audited.files } };
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  for (const path of [...Object.values(applicationOutputs), ...Object.values(dependencyOutputs)]) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    cpSync(join(source, path), join(directory, path), { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false });
  }
  writeFileSync(join(directory, manifestName), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  return manifest;
}

export function verifyArtifacts(source, directory, expectedOrigins) {
  const manifest = JSON.parse(readFileSync(join(directory, manifestName), "utf8"));
  if (manifest.version !== 1 || manifest.iconMode !== "free" || manifest.deploymentMode !== "self-hosted" || manifest.targetNodeMajor !== 22 || !/^\d+\.\d+\.\d+$/.test(manifest.stagingNodeVersion || "") || JSON.stringify(manifest.applicationOutputs) !== JSON.stringify(applicationOutputs) || JSON.stringify(manifest.dependencyOutputs) !== JSON.stringify(dependencyOutputs)) reject("Artifact manifest format, fixed output set or free/self-hosted policy is invalid.");
  const origins = publicOrigins(expectedOrigins);
  if (JSON.stringify(manifest.origins) !== JSON.stringify(origins)) reject("Artifact public origins do not match the explicit image build origins.");
  const provenance = sourceManifest(source);
  if (JSON.stringify(provenance) !== JSON.stringify(manifest.source)) reject("Artifact source digest does not match this image's source checkout.");
  const audited = auditOutputs(directory);
  if (audited.sha256 !== manifest.artifacts?.sha256 || JSON.stringify(audited.files) !== JSON.stringify(manifest.artifacts?.files)) reject("Artifact contents changed after staging.");
  assertOriginsInClient(audited.clientText, origins);
  return manifest;
}

export function main(argv = process.argv.slice(2)) {
  const command = argv[0], options = {};
  const allowed = new Set(["--source", "--directory", "--app-url", "--status-url", "--share-url", "--edge-url", "--ingest-url"]);
  for (let index = 1; index < argv.length; index += 2) {
    if (!allowed.has(argv[index]) || !argv[index + 1] || argv[index + 1].startsWith("--") || options[argv[index]]) reject("Use stage or verify with explicit source, artifact directory and all five public origins.");
    options[argv[index]] = argv[index + 1];
  }
  const source = resolve(options["--source"] || process.cwd());
  if (command === "assert-free-deps") { assertNoProDependencies(source); console.log("Linux dependency tree has no Pro packs."); return; }
  if (!["stage", "verify"].includes(command)) reject("Use stage, verify or assert-free-deps.");
  if (command === "stage" && Number(process.versions.node.split(".")[0]) !== 22) reject("Stage the fresh artifacts with Node.js 22, matching the required build toolchain.");
  const directory = resolve(options["--directory"] || ".self-hosted-artifacts");
  const origins = Object.fromEntries(originKeys.map((key, index) => [key, options[["--app-url", "--status-url", "--share-url", "--edge-url", "--ingest-url"][index]] || process.env[key]]));
  const result = command === "stage" ? stageArtifacts(source, directory, origins) : verifyArtifacts(source, directory, origins);
  console.log(`Free prebuilt artifacts ${command === "stage" ? "staged" : "verified"}: eight apps, three dependencies, JS-only traced tree; source ${result.source.sha256.slice(0, 12)}. No environment or credential values printed.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error?.code ? "Artifact staging/verification failed; filesystem details suppressed." : error.message); process.exitCode = 1; }
}
