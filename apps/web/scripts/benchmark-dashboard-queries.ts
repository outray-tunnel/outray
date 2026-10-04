/** Read-only development benchmark. Run from apps/web with:
 * ../../node_modules/.bin/tsx --tsconfig tsconfig.app.json scripts/benchmark-dashboard-queries.ts
 * Auth is a fixed synthetic organization context; this is not browser/API/auth latency. */
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { parse } from "dotenv";
import pg from "pg";
import Redis from "ioredis";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { tunnels } from "../src/db/app-schema";
import { mapOrgOverviewStats } from "../src/lib/org-overview-stats";
import { getTunnelEventIdentifiers } from "../src/lib/tunnel-event-identifiers";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../src/lib/tunnel-stats-range";
import { loadRouteHandlers } from "../test/helpers/load-route";

const { Pool } = pg;
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const samplesPerVersion = 7;
const allowed = {
  DATABASE_URL: { hostname: "postgres-dev.pilot.aeroplane.run", port: "38156", protocol: "postgresql:" },
  TIMESCALE_URL: { hostname: "timescale-dev.pilot.aeroplane.run", port: "41843", protocol: "postgresql:" },
  REDIS_URL: { hostname: "redis-dev.pilot.aeroplane.run", port: "24833", protocol: "redis:" },
} as const;
type Handler = (context: { request: Request; params: { orgSlug: string } }) => Promise<Response>;
type Payload = Record<string, unknown>;
let stage = "validate development configuration";

function requireDevelopmentUrl(env: Record<string, string>, key: keyof typeof allowed) {
  const url = new URL(env[key]);
  const expected = allowed[key];
  if (url.hostname !== expected.hostname || url.port !== expected.port || url.protocol !== expected.protocol) {
    throw new Error("Development endpoint allowlist mismatch");
  }
  if ((key !== "REDIS_URL" && !url.username) || !url.password || url.searchParams.has("options")) {
    throw new Error("Incomplete or overridden development connection settings");
  }
  return url;
}

function postgresPool(url: URL, idleTimeoutMillis: number, ssl: pg.PoolConfig["ssl"], max = 10) {
  // Explicit fields prevent inherited PG* env/URL options overriding read-only startup.
  return new Pool({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    options: "-c default_transaction_read_only=on -c statement_timeout=15000",
    ssl,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
  });
}

function summary(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  return {
    samples: ordered.length,
    medianMs: Number(median.toFixed(1)),
    p95Ms: Number(ordered[Math.ceil(ordered.length * 0.95) - 1].toFixed(1)),
  };
}

function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
      !["time", "timestamp", "windowStart", "windowEnd"].includes(key),
    ).map(([key, item]) => [key, comparable(item)]));
  }
  return value;
}

async function assertReadOnly(pool: pg.Pool) {
  const result = await pool.query("SELECT current_setting('default_transaction_read_only') AS read_only");
  if (result.rows[0]?.read_only !== "on") throw new Error("Read-only startup not enforced");
}

async function timedSelect(pool: pg.Pool) {
  const start = performance.now();
  await pool.query("SELECT 1");
  return performance.now() - start;
}

async function main() {
  // Never load .env.prod or merge inherited process.env into the target config.
  const env = parse(await readFile(new URL("../../../.env", import.meta.url), "utf8"));
  const databaseUrl = requireDevelopmentUrl(env, "DATABASE_URL");
  const timescaleUrl = requireDevelopmentUrl(env, "TIMESCALE_URL");
  const redisUrl = requireDevelopmentUrl(env, "REDIS_URL");
  if (!databaseUrl.pathname.slice(1) || !timescaleUrl.pathname.slice(1)) throw new Error("Database name missing");
  if (!["", "/", "/0"].includes(redisUrl.pathname)) throw new Error("Only development Redis database zero allowed");

  const databaseSsl = { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" };
  const timescaleSsl = timescaleUrl.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: false } : false;
  const mainPool = postgresPool(databaseUrl, 60_000, databaseSsl);
  const timescalePool = postgresPool(timescaleUrl, 60_000, timescaleSsl);
  const pools = [mainPool, timescalePool];
  const redis = new Redis({
    host: redisUrl.hostname,
    port: Number(redisUrl.port),
    username: decodeURIComponent(redisUrl.username),
    password: decodeURIComponent(redisUrl.password),
    db: 0,
    lazyConnect: true,
    enableReadyCheck: false,
    disableClientInfo: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    commandTimeout: 5_000,
    connectTimeout: 5_000,
  });
  // Never print raw connection/query errors, which may contain hostnames or data.
  for (const pool of pools) pool.on("error", () => {});
  redis.on("error", () => {});

  try {
    stage = "connect read-only development services";
    await Promise.all([assertReadOnly(mainPool), assertReadOnly(timescalePool), redis.connect()]);
    stage = "select development benchmark scope";
    const scope = await mainPool.query<{ id: string; slug: string; tunnel_id: string }>(
      `SELECT o.id, o.slug, t.id AS tunnel_id
       FROM organizations o JOIN tunnels t ON t.organization_id = o.id
       WHERE t.protocol = 'http' ORDER BY o.created_at DESC, t.created_at DESC LIMIT 1`,
    );
    const organization = scope.rows[0];
    if (!organization) throw new Error("No development organization with HTTP tunnel");
    const db = drizzle(mainPool);
    const [tunnel] = await db.select().from(tunnels).where(eq(tunnels.id, organization.tunnel_id));
    if (!tunnel || tunnel.organizationId !== organization.id) throw new Error("Development tunnel scope mismatch");
    const boundary = new Date();
    const window = tunnelStatsWindow("24h", boundary);
    const counts = await timescalePool.query(
      `SELECT
         (SELECT COUNT(*) FROM tunnel_events WHERE organization_id = $1 AND timestamp >= $2 AND timestamp < $3) AS organization_http_rows,
         (SELECT COUNT(*) FROM protocol_events WHERE organization_id = $1 AND timestamp >= $2 AND timestamp < $3) AS organization_protocol_rows,
         (SELECT COUNT(*) FROM tunnel_events WHERE organization_id = $1 AND tunnel_id = ANY($4::text[]) AND timestamp >= $2 AND timestamp < $3) AS selected_tunnel_http_rows`,
      [organization.id, window.start, window.end, getTunnelEventIdentifiers(tunnel)],
    );
    const rowCounts = Object.fromEntries(Object.entries(counts.rows[0]).map(([key, value]) => [key, Number(value)]));
    const modules = {
      "drizzle-orm": { eq },
      "../../../../db": { db },
      "../../../../db/app-schema": { tunnels },
      "../../../../lib/org": { requireOrgFromSlug: async () => ({ organization: { id: organization.id, slug: organization.slug } }) },
      "../../../../lib/timescale": { tigerData: timescalePool },
      "../../../../lib/redis": {
        redis: {
          scard: (key: string) => {
            if (key !== `org:${organization.id}:online_tunnels`) throw new Error("Redis scope mismatch");
            return redis.scard(key);
          },
        },
      },
      "../../../../lib/org-overview-stats": { mapOrgOverviewStats },
      "../../../../lib/tunnel-event-identifiers": { getTunnelEventIdentifiers },
      "../../../../lib/tunnel-stats-range": {
        parseTunnelStatsRange,
        tunnelStatsWindow: (range: "1h" | "24h" | "7d" | "30d") => tunnelStatsWindow(range, boundary),
      },
    };
    const routeLogger = { error: () => {}, log: () => {}, warn: () => {} };
    const measurements = [];
    for (const endpoint of ["overview", "tunnel"] as const) {
      stage = `benchmark ${endpoint} handlers`;
      const relativePath = `apps/web/src/routes/api/$orgSlug/stats/${endpoint}.ts`;
      const path = new URL(`../src/routes/api/$orgSlug/stats/${endpoint}.ts`, import.meta.url);
      const baselineSource = execFileSync("git", ["show", `HEAD:${relativePath}`], { cwd: repoRoot, encoding: "utf8" });
      const [before, after] = await Promise.all([
        loadRouteHandlers<{ GET: Handler }>({ path, source: baselineSource, modules, logger: routeLogger }),
        loadRouteHandlers<{ GET: Handler }>({ path, modules, logger: routeLogger }),
      ]);
      const call = async (handler: Handler): Promise<{ milliseconds: number; payload: Payload }> => {
        const start = performance.now();
        const response = await handler({
          request: new Request(`http://benchmark.invalid/api/${organization.slug}/stats/${endpoint}?range=24h&tunnelId=${encodeURIComponent(tunnel.id)}`),
          params: { orgSlug: organization.slug },
        });
        const payload = await response.json() as Payload;
        if (response.status !== 200) throw new Error("Benchmark handler failed");
        return { milliseconds: performance.now() - start, payload };
      };
      const warmBefore = await call(before.GET);
      const warmAfter = await call(after.GET);
      if (!isDeepStrictEqual(comparable(warmBefore.payload), comparable(warmAfter.payload))) throw new Error("Response semantics changed");
      const timings = { before: [] as number[], after: [] as number[] };
      for (let sample = 0; sample < samplesPerVersion; sample += 1) {
        const order = sample % 2 ? ["after", "before"] as const : ["before", "after"] as const;
        for (const version of order) {
          const result = await call(version === "before" ? before.GET : after.GET);
          timings[version].push(result.milliseconds);
          if (!isDeepStrictEqual(comparable(warmBefore.payload), comparable(result.payload))) throw new Error("Response semantics changed during sampling");
        }
      }
      const beforeStats = summary(timings.before);
      const afterStats = summary(timings.after);
      measurements.push({ endpoint, before: beforeStats, after: afterStats, medianReductionPercent: Number(((1 - afterStats.medianMs / beforeStats.medianMs) * 100).toFixed(1)), equivalentResponseValues: true });
    }

    stage = "benchmark idle connection retention";
    const idleCases = [
      { service: "main_database", idleMs: 10_000, pool: postgresPool(databaseUrl, 10_000, databaseSsl, 1) },
      { service: "main_database", idleMs: 60_000, pool: postgresPool(databaseUrl, 60_000, databaseSsl, 1) },
      { service: "timescale", idleMs: 10_000, pool: postgresPool(timescaleUrl, 10_000, timescaleSsl, 1) },
      { service: "timescale", idleMs: 60_000, pool: postgresPool(timescaleUrl, 60_000, timescaleSsl, 1) },
    ];
    for (const item of idleCases) { pools.push(item.pool); item.pool.on("error", () => {}); }
    await Promise.all(idleCases.map((item) => assertReadOnly(item.pool)));
    const warmIdleTimings = await Promise.all(idleCases.map((item) => timedSelect(item.pool)));
    console.log(JSON.stringify({ scope: "Development .env only; actual handler data-query phase, fixed synthetic organization authorization; excludes auth, browser and production", readOnlyPostgresStartup: true, range: "24h", rowCounts, warmPoolIdleMs: 60_000, measurements }));
    console.log("Measuring first SELECT after an 11-second idle pause; no data is written.");
    await pause(11_000);
    const connectionsAfterIdle = idleCases.map((item) => item.pool.totalCount);
    const resumeTimings = await Promise.all(idleCases.map((item) => timedSelect(item.pool)));
    console.log(JSON.stringify({ idleRetention: idleCases.map((item, index) => ({ service: item.service, idleMs: item.idleMs, pauseMs: 11_000, warmSelectMs: Number(warmIdleTimings[index].toFixed(1)), connectionsAfterIdle: connectionsAfterIdle[index], firstSelectAfterIdleMs: Number(resumeTimings[index].toFixed(1)), samples: 1 })), caveats: "Warm handler samples use the same pools to isolate serial-vs-parallel scheduling. Seven-sample p95 is the slowest sample. Idle-resume results are single observations. Sparse development rows do not establish production speedups." }));
  } finally {
    redis.disconnect();
    await Promise.all(pools.map((pool) => pool.end()));
  }
}

main().catch(() => {
  console.error(`Dashboard development benchmark failed at: ${stage}. Connection details and response data are suppressed.`);
  process.exitCode = 1;
});
