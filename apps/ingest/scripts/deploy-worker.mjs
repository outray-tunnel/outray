import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Read only the ingestion secret; do not upload a whole dashboard .env file.
// The secret travels through stdin, never command-line arguments or logs.
const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const credentialPath = process.argv[2];
if (!credentialPath)
  throw new Error("Usage: node scripts/deploy-worker.mjs <ingest-env-file>");
const env = parseEnv(readFileSync(resolve(credentialPath), "utf8"));
if (!env.TINYBIRD_INGEST_TOKEN)
  throw new Error("TINYBIRD_INGEST_TOKEN is required");
const wrangler = resolve(
  dirname(require.resolve("wrangler/package.json")),
  "bin/wrangler.js",
);
const secrets = spawnSync(process.execPath, [wrangler, "secret", "bulk"], {
  cwd: appRoot,
  input: JSON.stringify({ TINYBIRD_INGEST_TOKEN: env.TINYBIRD_INGEST_TOKEN }),
  stdio: ["pipe", "inherit", "inherit"],
});
if (secrets.error) throw secrets.error;
if (secrets.status !== 0) process.exit(secrets.status ?? 1);
const deployment = spawnSync(process.execPath, [wrangler, "deploy"], {
  cwd: appRoot,
  stdio: "inherit",
});
if (deployment.error) throw deployment.error;
process.exitCode = deployment.status ?? 1;
