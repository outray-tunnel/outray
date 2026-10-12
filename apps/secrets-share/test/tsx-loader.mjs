import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const appRequire = createRequire(new URL("../package.json", import.meta.url));

// Match Astro's React deduplication when dependencies are hoisted in the
// monorepo but React also has a standalone app-local installation.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "react" || specifier.startsWith("react/")) {
    return { url: pathToFileURL(appRequire.resolve(specifier)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

// Node server-render tests need Astro's automatic JSX runtime behavior.
export async function load(url, context, nextLoad) {
  const pathname = new URL(url).pathname;
  if (!pathname.endsWith(".tsx")) return nextLoad(url, context);
  const source = await readFile(new URL(url), "utf8");
  return {
    format: "module",
    shortCircuit: true,
    source: ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    } }).outputText,
  };
}
