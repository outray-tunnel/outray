import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    require.resolve("protobufjs-cli/bin/pbjs"),
    "--target",
    "static-module",
    "--wrap",
    "esm",
    "--dependency",
    "protobufjs/minimal.js",
    "--root",
    "outrayOtlp",
    "--no-verify",
    "--no-delimited",
    "--no-typeurl",
    "--no-service",
    "--dts",
    "--out",
    "src/proto/otlp.generated.js",
    "src/proto/otlp.proto",
  ],
  { cwd: appRoot, stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status === 0) {
  const header =
    "// Generated from src/proto/otlp.proto; do not edit by hand.\n" +
    "// Regenerate: npm run generate:protobuf --workspace=outray-ingest\n";
  for (const extension of ["js", "d.ts"]) {
    const output = new URL(
      `../src/proto/otlp.generated.${extension}`,
      import.meta.url,
    );
    writeFileSync(output, header + readFileSync(output, "utf8"));
  }
}
process.exitCode = result.status ?? 1;
