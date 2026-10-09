import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { mapOrgOverviewStats } from "../src/lib/org-overview-stats";
import { getTunnelEventIdentifiers } from "../src/lib/tunnel-event-identifiers";
import { parseTunnelStatsRange, tunnelStatsWindow } from "../src/lib/tunnel-stats-range";
import { fillTunnelBuckets, tunnelBucketSeconds, tunnelEventTime } from "../src/lib/tunnel-tinybird";
import { loadRouteHandlers } from "./helpers/load-route";

// Shared utilities are published as CommonJS outside the web workspace.
const { getBandwidthKey } = createRequire(import.meta.url)("../../../shared/utils.ts") as {
  getBandwidthKey: (organizationId: string) => string;
};

type RouteName = "overview" | "tunnel" | "protocol" | "bandwidth";
type Row = Record<string, unknown>;
type OrgResult = { organization: { id: string } } | { error: Response };
type Handler = (context: { request: Request; params: { orgSlug: string } }) => Promise<Response>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const ownTunnel = {
  id: "tunnel-a", organizationId: "org-a", protocol: "tcp",
  url: "https://test.outray.dev", name: "test",
};
const boundary = new Date("2026-10-04T12:34:56.789Z");
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function fixture(name: RouteName) {
  const auth = deferred<OrgResult>();
  const database = deferred<Row[]>();
  const sql = Array.from({ length: 3 }, () => deferred<Row[]>());
  const redis = deferred<number | string | null>();
  const calls: string[] = [];
  const queries: { endpoint: string; params: Record<string, string | number> }[] = [];
  let windows = 0;
  const readDatabase = () => { calls.push("database"); return database.promise; };
  const builder = {
    from: () => builder,
    where: (predicate: { value: unknown }) => {
      assert.equal(predicate.value, name === "bandwidth" ? "org-a" : "tunnel-a");
      return builder;
    },
    limit: readDatabase,
    then: (resolve: (rows: Row[]) => unknown, reject: (error: Error) => unknown) =>
      readDatabase().then(resolve, reject),
  };
  const db = { select: () => builder };
  const redisClient = {
    scard: (key: string) => { calls.push("redis"); assert.equal(key, "org:org-a:online_tunnels"); return redis.promise; },
    get: (key: string) => { calls.push("redis"); assert.equal(key, getBandwidthKey("org-a")); return redis.promise; },
  };
  const modules = {
    "drizzle-orm": { eq: (_column: unknown, value: unknown) => ({ value }) },
    "../../../../db": { db },
    "@/db": { db },
    "../../../../db/app-schema": { tunnels: { id: "tunnels.id" } },
    "@/db/subscription-schema": { subscriptions: { organizationId: "subscriptions.organizationId" } },
    "../../../../lib/org": { requireOrgFromSlug: () => auth.promise },
    "@/lib/org": { requireOrgFromSlug: () => auth.promise },
    "../../../../lib/redis": { redis: redisClient },
    "@/lib/redis": { redis: redisClient },
    "../../../../lib/tinybird": {
        queryTinybird: (endpoint: string, params: Record<string, string | number>) => {
          const index = queries.length;
          calls.push(`tinybird:${index}`);
          queries.push({ endpoint, params });
          return sql[index].promise;
        },
    },
    "../../../../lib/tunnel-tinybird": { fillTunnelBuckets, tunnelBucketSeconds, tunnelEventTime },
    "../../../../lib/org-overview-stats": { mapOrgOverviewStats },
    "../../../../lib/tunnel-event-identifiers": { getTunnelEventIdentifiers },
    "../../../../lib/tunnel-stats-range": {
      parseTunnelStatsRange,
      tunnelStatsWindow: (range: "1h" | "24h" | "7d" | "30d") => {
        windows += 1;
        return tunnelStatsWindow(range, boundary);
      },
    },
    "../../../../lib/dashboard-cache": {
      cachedDashboardRead: (_key: string, read: () => Promise<unknown>) => read(),
      dashboardCacheKey: (endpoint: string, parameters: Record<string, unknown>) =>
        `${endpoint}:${JSON.stringify(parameters)}`,
    },
    "../../../../lib/dashboard-redis-cache": {
      cachedDashboardRedisRead: (_key: string, read: () => Promise<unknown>) => read(),
    },
    "@/lib/dashboard-cache": {
      cachedDashboardRead: (_key: string, read: () => Promise<unknown>) => read(),
      dashboardCacheKey: (endpoint: string, parameters: Record<string, unknown>) =>
        `${endpoint}:${JSON.stringify(parameters)}`,
    },
    "@/lib/dashboard-redis-cache": {
      cachedDashboardRedisRead: (_key: string, read: () => Promise<unknown>) => read(),
    },
    "@/lib/subscription-plans": { installationPlan: (plan: string | null | undefined) => plan || "free", getPlanLimits: () => ({ bandwidthPerMonth: 100 }) },
    "../../../../../../../shared/utils": { getBandwidthKey },
  };
  const { GET } = await loadRouteHandlers<{ GET: Handler }>({
    path: new URL(`../src/routes/api/$orgSlug/stats/${name}.ts`, import.meta.url),
    modules,
  });
  const execute = () => GET({
    request: new Request(`https://app.test/api/org-a/stats/${name}?tunnelId=tunnel-a&range=24h`),
    params: { orgSlug: "org-a" },
  });
  return { auth, database, sql, redis, calls, queries, execute, windows: () => windows };
}

for (const name of ["overview", "tunnel", "protocol", "bandwidth"] as const) {
  test(`${name} stats authorize before starting database or Redis reads`, async () => {
    const f = await fixture(name);
    const response = f.execute();
    await tick();
    assert.deepEqual(f.calls, []);
    f.auth.resolve({ error: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    assert.equal((await response).status, 401);
    assert.deepEqual(f.calls, []);
  });
}

test("overview starts both Tinybird queries and Redis together and retains one boundary", async () => {
  const f = await fixture("overview");
  const response = f.execute();
  f.auth.resolve({ organization: { id: "org-a" } });
  await tick();
  assert.deepEqual(f.calls, ["tinybird:0", "tinybird:1", "redis"]);
  assert.equal(f.windows(), 1);
  const aggregate = f.queries[0].params;
  const chart = f.queries[1].params;
  assert.equal(aggregate.organization_id, "org-a");
  assert.equal(chart.organization_id, "org-a");
  assert.equal(aggregate.start, chart.start);
  assert.equal(aggregate.end, chart.end);
  assert.equal(chart.end, boundary.toISOString());
  assert.equal(chart.bucket_seconds, 3_600);
  assert.deepEqual(f.queries.map(({ endpoint }) => endpoint), ["tunnel_overview_stats", "tunnel_overview_chart"]);

  f.redis.resolve(3);
  const bucketTime = "2026-10-04T12:00:00.000Z";
  f.sql[1].resolve([{ time: "2026-10-04 12:00:00.000", http_requests: "2", protocol_events: "1", errors: "1", http_bytes: "10", protocol_bytes: "5" }]);
  f.sql[0].resolve([{ http_requests: "4", previous_http_requests: "2", protocol_events: "2", previous_protocol_events: "1", http_errors: "1", previous_http_errors: "0", http_bytes: "20", previous_http_bytes: "10", protocol_bytes: "10", previous_protocol_bytes: "5" }]);
  const data = await (await response).json();
  assert.equal(data.totalRequests, 6);
  assert.equal(data.activeTunnels, 3);
  assert.equal(data.totalDataTransfer, 30);
  assert.deepEqual(data.chartData.at(-1), { time: bucketTime, requests: 3, httpRequests: 2, protocolEvents: 1, errors: 1, errorRate: 50, bandwidth: 15 });
  assert.equal(data.chartData.length, 25);
  assert.equal(data.chartData[0].requests, 0);
  assert.equal(data.windowEnd, boundary.toISOString());
  assert.equal(data.timeRange, "24h");
});

for (const name of ["tunnel", "protocol"] as const) {
  test(`${name} stats wait for tunnel ownership, then start all three reads together`, async () => {
    const f = await fixture(name);
    const response = f.execute();
    f.auth.resolve({ organization: { id: "org-a" } });
    await tick();
    assert.deepEqual(f.calls, ["database"]);
    f.database.resolve([ownTunnel]);
    await tick();
    assert.deepEqual(f.calls, ["database", "tinybird:0", "tinybird:1", "tinybird:2"]);
    assert.equal(f.windows(), 1);
    for (const { params } of f.queries) {
      assert.equal(params.start, f.queries[0].params.start);
      assert.equal(params.end, boundary.toISOString());
      assert.equal(params.organization_id, "org-a");
      assert.deepEqual(JSON.parse(String(params.tunnel_ids)), ["tunnel-a", "test", "test.outray.dev"]);
    }
    f.sql[2].resolve([{ timestamp: boundary.toISOString(), method: "GET", path: "/a", status_code: "200", request_duration_ms: "10", size: "3", event_type: "connection", client_port: "54321", bytes_in: "10", bytes_out: "20", duration_ms: "42" }]);
    f.sql[1].resolve([{ time: "2026-10-04 12:00:00.000", requests: "4", duration: "10", bandwidth: "30", errors: "1", connections: "4", unique_connections: "3", unique_clients: "2", bytes_in: "10", bytes_out: "20" }]);
    f.sql[0].resolve([{ total_requests: "4", avg_duration: "10", total_bytes: "30", errors: "1", total_connections: "4", unique_connections: "3", unique_clients: "2", total_bytes_in: "10", total_bytes_out: "20" }]);
    const data = await (await response).json();
    assert.equal(data.timeRange, "24h");
    if (name === "tunnel") {
      assert.deepEqual(data.stats, { totalRequests: 4, avgDuration: 10, totalBandwidth: 30, errorRate: 25 });
      assert.equal(data.requests[0].path, "/a");
      assert.equal(data.requests[0].status, 200);
      assert.equal(data.requests[0].duration, 10);
      assert.equal(data.requests[0].size, 3);
      assert.equal(data.chartData.at(-1).errorRate, 25);
    } else {
      assert.equal(data.protocol, "tcp");
      assert.equal(data.stats.totalConnections, 4);
      assert.equal(data.chartData.at(-1).uniqueConnections, 3);
      assert.equal(data.recentEvents[0].event_type, "connection");
      assert.equal(data.recentEvents[0].client_port, 54321);
      assert.equal(data.recentEvents[0].bytes_in, 10);
      assert.equal(data.recentEvents[0].bytes_out, 20);
      assert.equal(data.recentEvents[0].duration_ms, 42);
    }
  });

  test(`${name} stats reject another tenant's tunnel before Tinybird reads`, async () => {
    const f = await fixture(name);
    const response = f.execute();
    f.auth.resolve({ organization: { id: "org-a" } });
    f.database.resolve([{ ...ownTunnel, organizationId: "org-b" }]);
    assert.equal((await response).status, 403);
    assert.deepEqual(f.calls, ["database"]);
    assert.equal(f.windows(), 0);
  });
}

test("bandwidth reads subscription and Redis concurrently with unchanged calculation", async () => {
  const f = await fixture("bandwidth");
  const response = f.execute();
  f.auth.resolve({ organization: { id: "org-a" } });
  await tick();
  assert.deepEqual(f.calls, ["redis", "database"]);
  f.database.resolve([]);
  f.redis.resolve("50");
  assert.deepEqual(await (await response).json(), { usage: 50, limit: 100, percentage: 50 });
});

for (const name of ["overview", "tunnel", "protocol"] as const) {
  test(`${name} preserves all-or-error behavior when one concurrent read fails`, async () => {
    const f = await fixture(name);
    const response = f.execute();
    f.auth.resolve({ organization: { id: "org-a" } });
    f.database.resolve([ownTunnel]);
    await tick();
    assert.equal(f.queries.length, name === "overview" ? 2 : 3);
    f.sql[1].reject(new Error("Tinybird unavailable"));
    assert.equal((await response).status, 500);
    f.sql[0].resolve([]);
    f.sql[2].resolve([]);
    f.redis.resolve(0);
  });
}

test("bandwidth preserves rejected-error behavior rather than returning partial usage", async () => {
  const f = await fixture("bandwidth");
  const response = f.execute();
  const assertion = assert.rejects(response, /Redis unavailable/);
  f.auth.resolve({ organization: { id: "org-a" } });
  await tick();
  f.redis.reject(new Error("Redis unavailable"));
  await assertion;
  f.database.resolve([]);
});
