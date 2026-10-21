import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "outray-tunnel/outray";
const productionBranch = "next";
const ciContext = "ci/woodpecker/push/ci";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const healthUrl = "https://outray-status-worker.akinkunmioye42.workers.dev/health";

/** Only the trusted migration pipeline for this exact production commit gates release. */
export function releaseState(result, commit) {
  if (result.sha !== commit) return "superseded";
  const check = result.statuses?.find((status) => status.context === ciContext);
  if (!check) return "pending";
  try {
    const target = new URL(check.target_url);
    if (target.origin !== "https://ci.outray.dev" || target.username || target.password ||
        !/^\/repos\/1\/pipeline\/\d+\/\d+\/?$/.test(target.pathname)) return "invalid";
  } catch { return "invalid"; }
  return ["success", "pending", "failure", "error"].includes(check.state) ? check.state : "invalid";
}

export async function deployFromGit(env = process.env) {
  const commit = env.WORKERS_CI_COMMIT_SHA;
  if (env.WORKERS_CI_BRANCH !== productionBranch || !/^[a-f0-9]{40}$/i.test(commit || "")) {
    throw new Error("Production Status deployment requires a Cloudflare build of the next branch.");
  }

  // Builds run independently on Cloudflare. Publishing waits for the existing
  // migration/dependency pipeline; no production database or SSH key enters this build.
  const deadline = Date.now() + 20 * 60_000;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "OutRay-Status-Build" };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  let ready = false;
  while (Date.now() < deadline) {
    const response = await fetch(`https://api.github.com/repos/${repository}/commits/${productionBranch}/status`, {
      headers, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Cannot verify the production migration pipeline (${response.status}).`);
    const state = releaseState(await response.json(), commit);
    if (state === "success") { ready = true; break; }
    if (state !== "pending") throw new Error(`Status release stopped: production pipeline is ${state}.`);
    console.log("Waiting for the matching Woodpecker migration/dependency pipeline.");
    await new Promise((resume) => setTimeout(resume, 60_000));
  }
  if (!ready) throw new Error("Migration pipeline did not succeed within 20 minutes; current Worker remains live.");

  const require = createRequire(import.meta.url);
  const wrangler = resolve(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
  const deployed = spawnSync(process.execPath, [wrangler, "deploy"], { cwd: appRoot, stdio: "inherit", env });
  if (deployed.error || deployed.status !== 0) throw new Error("Status Worker deployment failed.");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(healthUrl, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
      if (response.ok && (await response.text()).trim() === "ok") {
        console.log("Status Worker deployed and healthy.");
        return;
      }
    } catch { /* Do not print requests, bindings, or database errors. */ }
    if (attempt < 2) await new Promise((resume) => setTimeout(resume, 1_000));
  }
  throw new Error("Status Worker failed its post-deployment health check.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deployFromGit().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
