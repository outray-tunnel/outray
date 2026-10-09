/** Local, read-only dashboard benchmark, including auth and Tinybird query time.
 * OUTRAY_BENCHMARK_COOKIE='...' OUTRAY_BENCHMARK_ORG=acme npx tsx scripts/benchmark-dashboard-queries.ts
 * Set OUTRAY_BENCHMARK_TUNNEL_ID to additionally measure a tunnel detail API.
 * Never pass cookies as CLI arguments, commit them, or paste them into chat.
 */
import { performance } from "node:perf_hooks";

const origin = new URL(process.env.OUTRAY_BENCHMARK_ORIGIN || "http://localhost:6767");
const cookie = process.env.OUTRAY_BENCHMARK_COOKIE;
const org = process.env.OUTRAY_BENCHMARK_ORG;
const tunnelId = process.env.OUTRAY_BENCHMARK_TUNNEL_ID;

function validate() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || origin.protocol !== "http:" ||
      origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("Only a local HTTP dashboard origin is allowed");
  }
  if (!cookie || !org || !/^[a-z0-9][a-z0-9-]*$/.test(org)) {
    throw new Error("Set OUTRAY_BENCHMARK_COOKIE and OUTRAY_BENCHMARK_ORG for your local session");
  }
}

async function measure(path: string) {
  const start = performance.now();
  const response = await fetch(new URL(path, origin), {
    headers: { Cookie: cookie! }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Local benchmark endpoint failed (${response.status}); verify your session and Tinybird deployment`);
  }
  // Consume the full response without logging sensitive request/capture data.
  await response.arrayBuffer();
  return performance.now() - start;
}

async function main() {
  validate();
  const paths = [
    ["overview", `/api/${org}/stats/overview?range=24h`],
    ["requests", `/api/${org}/requests?range=24h&limit=100`],
    ...(tunnelId ? [["tunnel", `/api/${org}/stats/tunnel?range=24h&tunnelId=${encodeURIComponent(tunnelId)}`]] : []),
  ];
  const results = [];
  for (const [endpoint, path] of paths) {
    const coldMs = await measure(path);
    const samples = [];
    for (let index = 0; index < 7; index++) samples.push(await measure(path));
    samples.sort((a, b) => a - b);
    results.push({ endpoint, coldMs: Math.round(coldMs), medianMs: Math.round(samples[3]), p95Ms: Math.round(samples[6]), samples: 7 });
  }
  console.log(JSON.stringify({ scope: "Local dashboard HTTP GETs; includes auth, response transfer, and warm application caches; no writes", results }, null, 2));
}

main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
