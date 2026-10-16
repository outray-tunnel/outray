import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const credentialPath = process.argv[2];
if (!credentialPath || process.argv.length !== 3) {
  throw new Error("Usage: node scripts/deploy.mjs <env-file>");
}

let uploadToken;
try {
  // Select exactly one value. Database, OAuth, and other dashboard credentials
  // are never exported to Wrangler or uploaded to the Worker.
  uploadToken = parseEnv(readFileSync(resolve(credentialPath), "utf8")).DELIVERY_UPLOAD_TOKEN;
} catch {
  throw new Error("Could not read delivery upload configuration.");
}
if (!uploadToken || uploadToken.length < 32 || uploadToken.length > 256 || !/^[\x21-\x7e]+$/.test(uploadToken)) {
  throw new Error("DELIVERY_UPLOAD_TOKEN must contain 32–256 non-whitespace ASCII characters.");
}

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const wrangler = resolve(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");

function redactOutput(value) {
  let output = value || "";
  for (const secret of [uploadToken, process.env.CLOUDFLARE_API_TOKEN]) {
    if (secret) output = output.replaceAll(secret, "[redacted]");
  }
  return output;
}

function runWrangler(args, input) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: appRoot,
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(redactOutput(result.stdout));
  if (result.stderr) process.stderr.write(redactOutput(result.stderr));
  if (result.error || result.status !== 0) {
    // Child-process errors may retain stdin; do not print their objects.
    throw new Error("Cloudflare delivery deployment command failed.");
  }
}

// Send the single upload credential as JSON stdin, never as a command argument
// or a temporary file. Wrangler obtains its own Cloudflare login separately.
runWrangler(["secret", "bulk"], JSON.stringify({ DELIVERY_UPLOAD_TOKEN: uploadToken }));
runWrangler(["deploy"]);
uploadToken = undefined;

async function healthy(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(6_000),
      });
      if (response.status === 200 && (await response.json()).ok === true) return true;
    } catch {
      // A missing DNS record or unavailable Worker is reported without request
      // details or account settings. Health responses never expose bindings.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

const workerHealthy = await healthy("https://outray-delivery.akinkunmioye42.workers.dev/health");
const domainHealthy = await healthy("https://delivery.outray.co/health");
if (!workerHealthy && !domainHealthy) {
  throw new Error("Delivery Worker health checks failed. Do not activate console uploads yet.");
}
console.log(`Delivery Worker health: ${workerHealthy ? "passed" : "not reachable"}.`);
if (domainHealthy) {
  console.log("delivery.outray.co health check passed.");
} else {
  console.warn("Worker is healthy, but delivery.outray.co is not ready yet. Wait for DNS/TLS and verify /health before activating console uploads.");
}
