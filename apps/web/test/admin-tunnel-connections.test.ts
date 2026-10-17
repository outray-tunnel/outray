import assert from "node:assert/strict";
import test from "node:test";
import { loadRouteHandlers } from "./helpers/load-route";

type Row = Record<string, string | number | null>;
type Predicate = (row: Row) => boolean;
type Selection = Record<string, string | { count: true }>;
type Handler = (context: { request: Request }) => Promise<Response>;
const records: Row[] = [
  { id: "online-db", name: "demo", url: "https://demo.test", protocol: "http", userName: "A", userEmail: "a@test.invalid", orgName: "Acme", orgSlug: "acme", lastSeenAt: "2026-10-17T12:00:00Z", createdAt: "2026-10-17T11:00:00Z", remotePort: null },
  { id: "offline-db", name: "other", url: "https://other.test", protocol: "http", userName: "B", userEmail: "b@test.invalid", orgName: "Acme", orgSlug: "acme", lastSeenAt: "2026-10-17T10:00:00Z", createdAt: "2026-10-17T09:00:00Z", remotePort: null },
  { id: "tcp-db", name: "database", url: null, protocol: "tcp", userName: "A", userEmail: "a@test.invalid", orgName: "Acme", orgSlug: "acme", lastSeenAt: "2026-10-17T08:00:00Z", createdAt: "2026-10-17T07:00:00Z", remotePort: 5432 },
];

async function fixture(options: {
  orgIds?: string[];
  onlineIds?: string[];
  redisFailure?: "index" | "command" | "null" | "malformed";
  unauthorized?: boolean;
} = {}) {
  const queries: Array<{ grouped: boolean; filtered: boolean; rows: number }> = [];
  const redisCalls: string[] = [];
  const pipelines: string[][] = [];
  const conjunction = (parts: Predicate[]): Predicate => (row) => parts.every((part) => part(row));
  const sql = Object.assign((strings: TemplateStringsArray, ...values: unknown[]): Predicate => {
    if (strings.join("").trim() === "false") return () => false;
    return conjunction(values.filter((value): value is Predicate => typeof value === "function"));
  }, { join: (parts: Predicate[]) => conjunction(parts) });
  const select = (selection: Selection) => {
    let predicate: Predicate | undefined;
    let grouped = false;
    let limit = Number.MAX_SAFE_INTEGER;
    let offset = 0;
    const builder = {
      from() { return builder; },
      where(next: Predicate) { predicate = next; return builder; },
      leftJoin() { return builder; },
      orderBy() { return builder; },
      groupBy() { grouped = true; return builder; },
      limit(next: number) { limit = next; return builder; },
      offset(next: number) { offset = next; return builder; },
      then(resolve: (rows: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
        const filtered = predicate ? records.filter(predicate) : records;
        queries.push({ grouped, filtered: !!predicate, rows: filtered.length });
        let result: unknown[];
        if (grouped) {
          result = [...new Set(filtered.map((row) => row.protocol))].map((protocol) => ({ protocol, count: filtered.filter((row) => row.protocol === protocol).length }));
        } else if (typeof selection.count === "object") {
          result = [{ count: filtered.length }];
        } else {
          result = filtered.slice(offset, offset + limit).map((row) => Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, typeof column === "string" ? row[column] : null])));
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };

  const { GET } = await loadRouteHandlers<{ GET: Handler }>({
    path: new URL("../src/routes/api/admin/tunnels.ts", import.meta.url),
    modules: {
      "../../../lib/admin-access.server": {
        requireAdminAccess: async () => options.unauthorized ? Response.json({ error: "Unauthorized" }, { status: 401 }) : null,
        adminJson: (data: unknown, init?: ResponseInit) => Response.json(data, { ...init, headers: { "Cache-Control": "private, no-store" } }),
      },
      "../../../db": { db: { select } },
      "../../../db/schema": {
        tunnels: Object.fromEntries(["id", "url", "name", "protocol", "remotePort", "lastSeenAt", "createdAt", "userId", "organizationId"].map((field) => [field, field])),
        users: { id: "userId", name: "userName", email: "userEmail" },
        organizations: { id: "organizationId", name: "orgName", slug: "orgSlug" },
      },
      "../../../lib/redis": { redis: {
        smembers: async (key: string) => {
          redisCalls.push(key);
          if (options.redisFailure === "index") throw new Error("Synthetic Redis outage");
          return options.orgIds ?? (options.onlineIds?.length || options.redisFailure ? ["acme"] : []);
        },
        pipeline: () => {
          const keys: string[] = [];
          pipelines.push(keys);
          const pipeline = {
            smembers: (key: string) => { keys.push(key); return pipeline; },
            exec: async () => options.redisFailure === "null" ? null : keys.map(() => options.redisFailure === "command" ? [new Error("Synthetic command error"), null] : options.redisFailure === "malformed" ? [null, "not-an-array"] : [null, options.onlineIds ?? []]),
          };
          return pipeline;
        },
      } },
      "drizzle-orm": {
        sql,
        count: () => ({ count: true }),
        desc: (value: unknown) => value,
        eq: (column: string, value: string): Predicate => (row) => row[column] === value,
        inArray: (column: string, values: string[]): Predicate => (row) => values.includes(String(row[column])),
        like: (column: string, value: string): Predicate => (row) => String(row[column] ?? "").includes(value.replaceAll("%", "")),
        or: (...parts: Predicate[]): Predicate => (row) => parts.some((part) => part(row)),
      },
    },
    logger: { error() {}, warn() {}, log() {} },
  });
  return { queries, redisCalls, pipelines, request: (query = "") => GET({ request: new Request(`https://console.test/api/admin/tunnels?${query}`) }) };
}

test("an empty active-connections filter preserves platform totals and protocol counts", async () => {
  const f = await fixture();
  const response = await f.request("active=true");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const data = await response.json();
  assert.deepEqual(data.tunnels, []);
  assert.equal(data.total, 0);
  assert.deepEqual(data.stats, { total: 3, active: 0, byProtocol: { http: 2, tcp: 1 } });
  assert.equal(f.queries.find((query) => query.grouped)?.filtered, false);
});

test("table search and protocol filters do not change global statistics or count orphan Redis IDs", async () => {
  const f = await fixture({ onlineIds: ["online-db", "redis-orphan"] });
  const response = await f.request("search=demo&protocol=http");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, 1);
  assert.deepEqual(data.tunnels.map((row: { id: string; isOnline: boolean }) => ({ id: row.id, isOnline: row.isOnline })), [{ id: "online-db", isOnline: true }]);
  assert.deepEqual(data.stats, { total: 3, active: 1, byProtocol: { http: 2, tcp: 1 } });
  assert.deepEqual(f.redisCalls, ["global:orgs_with_online_tunnels"]);
  assert.deepEqual(f.pipelines, [["org:acme:online_tunnels"]]);
  assert.ok(f.queries.some((query) => query.filtered && query.rows === 1));
  assert.ok(f.queries.some((query) => query.grouped && !query.filtered && query.rows === 3));
});

test("active-only records are joined to actual database tunnels before counting", async () => {
  const f = await fixture({ onlineIds: ["online-db", "redis-orphan"] });
  const data = await (await f.request("active=true")).json();
  assert.equal(data.total, 1);
  assert.equal(data.stats.active, 1);
  assert.equal(data.stats.total, 3);
  assert.equal(data.tunnels[0].id, "online-db");
  assert.equal(data.tunnels[0].isOnline, true);
});

for (const failure of ["index", "command", "null", "malformed"] as const) {
  test(`a Redis ${failure} failure returns unavailable instead of fabricated zero activity`, async () => {
    const f = await fixture({ redisFailure: failure });
    const response = await f.request("active=true");
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Failed to fetch tunnels" });
    assert.equal(f.queries.length, 0);
  });
}

test("online connection reads are pipelined in bounded batches rather than one request per workspace", async () => {
  const orgIds = Array.from({ length: 501 }, (_, index) => `org-${index}`);
  const f = await fixture({ orgIds });
  assert.equal((await f.request()).status, 200);
  assert.equal(f.redisCalls.length, 1);
  assert.deepEqual(f.pipelines.map((keys) => keys.length), [250, 250, 1]);
  assert.equal(f.pipelines.flat().length, orgIds.length);
  assert.equal(new Set(f.pipelines.flat()).size, orgIds.length);
});

test("the admin gate denies access before any database or Redis reads", async () => {
  const f = await fixture({ unauthorized: true });
  assert.equal((await f.request()).status, 401);
  assert.equal(f.redisCalls.length, 0);
  assert.equal(f.queries.length, 0);
});
