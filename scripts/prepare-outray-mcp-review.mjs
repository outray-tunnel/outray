import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "apps/web/node_modules/.tmp", `mcp-review-${crypto.randomUUID()}.mjs`);
try {
  await mkdir(dirname(output), { recursive: true });
  await build({ entryPoints: [resolve(root, "apps/web/scripts/prepare-mcp-review.ts")], outfile: output,
    bundle: true, platform: "node", format: "esm", target: "node22", packages: "external", tsconfig: resolve(root, "apps/web/tsconfig.app.json"), logLevel: "silent" });
  const child = spawn(process.execPath, [output, ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
  process.exitCode = await new Promise((done) => { child.once("exit", (code) => done(code ?? 1)); child.once("error", () => done(1)); });
} finally { await rm(output, { force: true }); }
