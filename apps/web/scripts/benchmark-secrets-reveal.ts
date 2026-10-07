/** Local HTTP benchmark, using an existing development-owner session and one
 * seeded fake secret. Successful requests create normal development audit rows.
 * No credentials, response bodies, or revealed values are printed or saved.
 * Run from apps/web: npx tsx scripts/benchmark-secrets-reveal.ts */
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { serializeSignedCookie } from "better-call";
import pg from "pg";

const origin = "http://localhost:6767";
const orgSlug = "outray-tunnel";
const runId = `benchmark-reveal-${randomUUID()}`;
let stage = "validate local development server";
let requestNumber = 0;
type Timing = { ms: number; status: number; valid: boolean; noStore: boolean };

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const rounded = (value: number) => Number(value.toFixed(1));
  return { samples: sorted.length, minMs: rounded(sorted[0]),
    medianMs: rounded(sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2),
    meanMs: rounded(sorted.reduce((sum, item) => sum + item, 0) / sorted.length),
    p95Ms: rounded(sorted[Math.ceil(sorted.length * .95) - 1]), maxMs: rounded(sorted.at(-1)!) };
}

function developmentUrl(value: string | undefined) {
  const url = new URL(value ?? "");
  if (url.protocol !== "postgresql:" || url.hostname !== "postgres-dev.pilot.aeroplane.run" || url.port !== "38156" || !url.username || !url.password || url.pathname === "/" ||
    [...url.searchParams.keys()].some((key) => ["host", "hostaddr", "port", "dbname", "database", "options", "service", "servicefile"].includes(key.toLowerCase()))) {
    throw new Error("Not the allowlisted development database");
  }
  return url;
}

async function main() {
  const env = parse(await readFile(new URL("../../../.env", import.meta.url), "utf8"));
  const database = developmentUrl(env.DATABASE_URL);
  // Validate the actual running server, not just the file used by this script.
  // The process environment stays in memory; never print the ps result.
  const pid = execFileSync("lsof", ["-t", "-iTCP:6767", "-sTCP:LISTEN"], { encoding: "utf8" }).trim();
  if (!/^\d+$/.test(pid)) throw new Error("Expected one local dev server");
  const serverProcess = execFileSync("ps", ["eww", "-p", pid, "-o", "command="], { encoding: "utf8" });
  const runtimeDatabase = serverProcess.match(/(?:^|\s)DATABASE_URL=([^\s]+)/)?.[1];
  const runtimeSecret = serverProcess.match(/(?:^|\s)BETTER_AUTH_SECRET=([^\s]+)/)?.[1];
  if (!runtimeDatabase || developmentUrl(runtimeDatabase).toString() !== database.toString() || !runtimeSecret || runtimeSecret !== env.BETTER_AUTH_SECRET) {
    throw new Error("Running server and development configuration do not match");
  }

  const pool = new pg.Pool({ host: database.hostname, port: Number(database.port),
    user: decodeURIComponent(database.username), password: decodeURIComponent(database.password), database: decodeURIComponent(database.pathname.slice(1)),
    ssl: { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }, max: 1,
    options: "-c default_transaction_read_only=on -c statement_timeout=15000", connectionTimeoutMillis: 8000, query_timeout: 15000 });
  pool.on("error", () => {});
  try {
    stage = "connect to read-only development metadata";
    const connectStart = performance.now();
    const readOnly = await pool.query("SELECT current_setting('default_transaction_read_only') AS read_only");
    const databaseConnectionMs = performance.now() - connectStart;
    if (readOnly.rows[0]?.read_only !== "on") throw new Error("Read-only metadata connection not enforced");

    stage = "select existing owner session and seeded demo fixture";
    const scope = await pool.query<{ user_id: string; token: string; project_slug: string; environment_slug: string; entry_id: string }>(
      `SELECT s.user_id, s.token, p.slug AS project_slug, e.slug AS environment_slug, k.id AS entry_id
       FROM organizations o JOIN members m ON m.organization_id = o.id
       JOIN users u ON u.id = m.user_id JOIN sessions s ON s.user_id = u.id
       JOIN secret_projects p ON p.organization_id = o.id AND p.slug = 'vault' AND p.deleted_at IS NULL
       JOIN secret_environments e ON e.project_id = p.id AND e.organization_id = o.id AND e.slug = 'development' AND e.deleted_at IS NULL AND NOT e.is_production
       JOIN secret_entries k ON k.environment_id = e.id AND k.organization_id = o.id AND k.key = 'APP_NAME' AND k.deleted_at IS NULL
       WHERE o.slug = $1 AND m.role = 'owner' AND LOWER(u.name) LIKE 'akinkunmi%' AND s.expires_at > NOW()
         AND k.description = 'Demo fixture only — not a live credential.'
       ORDER BY s.updated_at DESC LIMIT 1`, [orgSlug]);
    const fixture = scope.rows[0];
    if (!fixture) throw new Error("No matching active owner session and development demo fixture");
    // Reuse the existing development session, without creating a token or login.
    const cookie = (await serializeSignedCookie("better-auth.session_token", fixture.token, runtimeSecret)).split(";")[0];
    const secureCookie = cookie.replace(/^better-auth/, "__Secure-better-auth");
    const headers = { Cookie: `${cookie}; ${secureCookie}`, Origin: origin, "Content-Type": "application/json", "User-Agent": "OutRay-Development-Reveal-Benchmark" };
    const path = `/api/${orgSlug}/secrets/projects/${encodeURIComponent(fixture.project_slug)}/environments/${encodeURIComponent(fixture.environment_slug)}/secrets/${encodeURIComponent(fixture.entry_id)}/reveal`;

    async function authCheck() {
      const start = performance.now();
      const response = await fetch(`${origin}/api/auth/get-session`, { headers, redirect: "error", signal: AbortSignal.timeout(30000) });
      const payload = await response.json();
      if (response.status !== 200 || payload?.user?.id !== fixture.user_id) throw new Error("Existing development session was not accepted");
      return performance.now() - start;
    }
    async function reveal(): Promise<Timing> {
      const start = performance.now();
      const response = await fetch(`${origin}${path}`, { method: "POST", headers: { ...headers, "X-Request-Id": `${runId}-${++requestNumber}` },
        body: JSON.stringify({ intent: "reveal" }), redirect: "error", signal: AbortSignal.timeout(30000) });
      const payload = await response.json();
      // Verify this is still the seeded fake value, without reporting its contents.
      const valid = response.status === 200 && payload?.secret?.value === "OutRay Demo" && payload?.expiresIn === 30;
      const noStore = Boolean(response.headers.get("cache-control")?.includes("no-store"));
      return { ms: performance.now() - start, status: response.status, valid, noStore };
    }
    function requireSuccess(timings: Timing[]) {
      if (timings.some((item) => !item.valid || !item.noStore)) throw new Error("Benchmark response failed validation");
    }

    const databasePings: number[] = [];
    for (let i = 0; i < 10; i++) { const start = performance.now(); await pool.query("SELECT 1"); databasePings.push(performance.now() - start); }
    stage = "validate authenticated local HTTP session";
    const firstAuthMs = await authCheck();
    stage = "measure first observed HTTP reveal";
    const first = await reveal(); requireSuccess([first]);
    console.log(JSON.stringify({ progress: "first successful development reveal", firstObservedMs: Number(first.ms.toFixed(1)), databaseRoundTrip: summary(databasePings), responseBodiesSuppressed: true }));

    stage = "warm reveal route";
    requireSuccess([await reveal(), await reveal()]);
    stage = "measure sequential reveals";
    const sequential: Timing[] = [];
    for (let i = 0; i < 15; i++) {
      const result = await reveal(); requireSuccess([result]); sequential.push(result);
      if ((i + 1) % 5 === 0) console.log(JSON.stringify({ progress: "sequential reveals", completed: i + 1, total: 15 }));
    }
    stage = "measure authenticated session baseline";
    const authTimings: number[] = [];
    for (let i = 0; i < 5; i++) authTimings.push(await authCheck());
    stage = "measure modest concurrent reveals";
    const concurrency: Array<{ simultaneousRequests: number; rounds: number; latency: ReturnType<typeof summary>; requestsPerSecond: number }> = [];
    for (const count of [2, 4]) {
      const results: Timing[] = [];
      let elapsed = 0;
      for (let round = 0; round < 2; round++) {
        const start = performance.now(); const batch = await Promise.all(Array.from({ length: count }, () => reveal()));
        elapsed += performance.now() - start; requireSuccess(batch); results.push(...batch);
      }
      concurrency.push({ simultaneousRequests: count, rounds: 2, latency: summary(results.map(({ ms }) => ms)), requestsPerSecond: Number((results.length / (elapsed / 1000)).toFixed(2)) });
    }

    console.log(JSON.stringify({ scope: "Local development HTTP endpoint, actual existing session auth and seeded APP_NAME fixture; no production access",
      endpoint: "POST /api/:org/secrets/projects/:vault/environments/:environment/secrets/:id/reveal",
      firstObservedRevealMs: Number(first.ms.toFixed(1)), excludedWarmups: 2, sequential: summary(sequential.map(({ ms }) => ms)), concurrency,
      authSession: { firstObservedMs: Number(firstAuthMs.toFixed(1)), warm: summary(authTimings) },
      database: { firstConnectionMs: Number(databaseConnectionMs.toFixed(1)), warmRoundTrip: summary(databasePings) },
      successfulReveals: requestNumber, developmentRevealAuditEntriesExpected: requestNumber, noStoreVerified: true,
      credentialsOrPlaintextLogged: false, caveats: "Development server includes Vite overhead; first observed is not a guaranteed cold start. Small samples, concurrent batches share one secret. Database SELECT 1 RTT is a separate warm connection; not an instrumented request breakdown." }));
  } finally { await pool.end(); }
}

main().catch(() => {
  console.error(`Secrets reveal benchmark stopped at: ${stage}. Credentials, response bodies, and raw errors suppressed.`);
  process.exitCode = 1;
});
