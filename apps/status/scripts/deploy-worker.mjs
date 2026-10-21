import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  "source-ssh": { type: "string" },
  "ssh-port": { type: "string", default: "22" },
  "ssh-key": { type: "string" },
  "health-url": { type: "string", default: "https://outray-status-worker.akinkunmioye42.workers.dev/health" },
} });
if (!values["source-ssh"] || !values["ssh-key"]) {
  throw new Error("Usage: deploy-worker.mjs --source-ssh user@host --ssh-port 22 --ssh-key /path/to/key");
}
if (!/^[\w.-]+@[\w.-]+$/.test(values["source-ssh"]) || !/^\d{1,5}$/.test(values["ssh-port"])) {
  throw new Error("Invalid SSH target");
}
let healthUrl;
try { healthUrl = new URL(values["health-url"]); } catch { throw new Error("Invalid Worker health URL"); }
if (healthUrl.protocol !== "https:" || healthUrl.username || healthUrl.password) {
  throw new Error("Worker health URL must be HTTPS without credentials");
}
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const wrangler = resolve(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: appRoot, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Read only these Status credentials from the running Node deployment. Neither
// DATABASE_URL nor unrelated dashboard/OAuth credentials leave it. Analytics
// uses the same scoped append token as the existing Tinybird pipeline.
const names = ["UPTIME_RATE_LIMIT_SECRET", "UPTIME_UNSUBSCRIBE_SECRET", "ZEPTO_API_KEY", "ZEPTO_FROM_EMAIL", "ZEPTO_FROM_NAME", "TINYBIRD_API_HOST", "TINYBIRD_INGEST_TOKEN"];
const remoteCode = `try{const {execFileSync}=require("node:child_process");const p=JSON.parse(execFileSync("pm2",["jlist"],{encoding:"utf8",stdio:["ignore","pipe","pipe"],maxBuffer:4194304})).find(p=>p.name==="outray-status");if(!p)throw Error("Status process not found");const names=${JSON.stringify(names)};const out={};for(const n of names)if(typeof p.pm2_env[n]==="string"&&p.pm2_env[n])out[n]=p.pm2_env[n];process.stdout.write(JSON.stringify(out));}catch{process.stderr.write("Cannot read Status configuration\\n");process.exitCode=1;}`;
let credentials;
try {
  const output = execFileSync("ssh", [
    "-i", resolve(values["ssh-key"]), "-p", values["ssh-port"],
    "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
    values["source-ssh"], `node -e '${remoteCode}'`,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 });
  credentials = JSON.parse(output);
} catch {
  // execFileSync errors carry stdout/stderr; never print the captured secrets.
  throw new Error("Could not read Status credentials over verified SSH");
}
for (const name of ["UPTIME_RATE_LIMIT_SECRET", "UPTIME_UNSUBSCRIBE_SECRET", "ZEPTO_API_KEY", "TINYBIRD_API_HOST", "TINYBIRD_INGEST_TOKEN"]) {
  if (!credentials[name]) throw new Error(`Status source is missing ${name}`);
}
run("npm", ["run", "build:worker"]);
run(process.execPath, [wrangler, "secret", "bulk"], {
  input: JSON.stringify(credentials), stdio: ["pipe", "inherit", "inherit"],
});
credentials = undefined;
run(process.execPath, [wrangler, "deploy"]);

let healthy = false;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const response = await fetch(healthUrl, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
    healthy = response.status === 200 && (await response.text()).trim() === "ok";
  } catch { /* An unhealthy deployment must fail CI without logging request details. */ }
  if (healthy) break;
  if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (!healthy) throw new Error("Worker health check failed; keep the existing origin/routing available");
console.log("Status Worker health check passed.");
