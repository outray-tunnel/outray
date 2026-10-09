import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../..");
const require = createRequire(import.meta.url);
const modes = new Set(["auto", "free", "pro"]);

export function selectIconMode({ mode = "auto", licenseKey = "", proAvailable = false } = {}) {
  if (!modes.has(mode)) throw new Error("OUTRAY_ICON_MODE must be auto, free, or pro");
  if (mode === "pro" && !proAvailable) throw new Error("Pro icons were requested but are not installed. Install with your own HUGEICONS_LICENSE_KEY, or use OUTRAY_ICON_MODE=free.");
  return mode === "pro" || (mode === "auto" && licenseKey.trim() && proAvailable) ? "pro" : "free";
}

function sourceFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = join(path, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

export function collectIcons(source) {
  return [...new Set([...source.matchAll(/@outray\/icons\/(solid|stroke)\/([A-Za-z0-9]+Icon)/g)].map((match) => `${match[1]}/${match[2]}`))].sort();
}

export function prepareIcons(env = process.env) {
  const icons = collectIcons(sourceFiles(join(root, "apps/web/src")).map((file) => readFileSync(file, "utf8")).join("\n"));
  const canResolve = (specifier) => {
    try { require.resolve(specifier); return true; } catch { return false; }
  };
  const proAvailable = icons.every((icon) => {
    const [style, name] = icon.split("/");
    return canResolve(`@hugeicons-pro/core-${style}-rounded/${name}`);
  });
  const mode = selectIconMode({ mode: env.OUTRAY_ICON_MODE || "auto", licenseKey: env.HUGEICONS_LICENSE_KEY || "", proAvailable });
  if (env.OUTRAY_ICON_MODE !== "free" && env.HUGEICONS_LICENSE_KEY?.trim() && !proAvailable) {
    console.warn("Hugeicons Pro packs are unavailable; using the MIT-licensed free icons. Set OUTRAY_ICON_MODE=pro to require Pro instead.");
  }
  for (const icon of icons) {
    const [style, name] = icon.split("/");
    const freeSpecifier = `@hugeicons/core-free-icons/${name}`;
    if (!canResolve(freeSpecifier)) throw new Error(`Free icon ${name} is missing from @hugeicons/core-free-icons`);
    const specifier = mode === "pro" ? `@hugeicons-pro/core-${style}-rounded/${name}` : freeSpecifier;
    const target = join(directory, "generated", style);
    mkdirSync(target, { recursive: true });
    // Bare re-exports only: never copy proprietary SVG geometry into this repository.
    writeFileSync(join(target, `${name}.js`), `export { default } from ${JSON.stringify(specifier)};\n`);
    writeFileSync(join(target, `${name}.cjs`), `module.exports = require(${JSON.stringify(specifier)});\n`);
    // Both packs share the renderer's icon data shape. Types always use the public pack.
    writeFileSync(join(target, `${name}.d.ts`), `export { default } from ${JSON.stringify(freeSpecifier)};\n`);
  }
  // Turbo hashes this public selection before build lookup, preventing a cached
  // licensed artifact from being reused for a free build (or vice versa).
  writeFileSync(join(directory, "generated", "mode.json"), `${JSON.stringify({ mode })}\n`);
  console.log(`Prepared ${icons.length} icon imports in ${mode} mode${mode === "free" ? " (MIT-licensed Stroke Rounded)" : " (licensed Pro styles)"}.`);
  return { mode, count: icons.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { prepareIcons(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
