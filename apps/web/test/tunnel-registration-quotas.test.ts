import assert from "node:assert/strict";
import test from "node:test";
import { getPlanLimits, installationPlan } from "../src/lib/subscription-plans";
import { loadRouteHandlers } from "./helpers/load-route";

type Tunnel = { id: string; url: string; organizationId: string; lastSeenAt?: Date };
async function harness(options: { existing?: Tunnel; online?: string[]; plan?: string; failWrite?: boolean } = {}) {
  const rows: Tunnel[] = options.existing ? [{ ...options.existing }] : [];
  const online = new Set(options.online ?? []);
  let sequence = 0;
  const tables = { tunnels: { name: "tunnels", url: "url", id: "id" }, subscriptions: { name: "subscriptions", organizationId: "organizationId" }, organizations: { name: "organizations", id: "id" } };
  const removals: string[] = [];
  const tx = {
    select() {
      let table: { name: string }, condition: { field: string; value: string };
      const query = {
        from(value: typeof table) { table = value; return query; },
        where(value: typeof condition) { condition = value; return query; },
        async for() {
          if (table.name === "organizations") return [{ id: "org-a" }];
          if (table.name === "subscriptions") return options.plan ? [{ plan: options.plan }] : [];
          return rows.filter(row => row[condition.field as keyof Tunnel] === condition.value);
        },
      };
      return query;
    },
    update() { return { set(values: Partial<Tunnel>) { return { async where(condition: { value: string }) {
      if (options.failWrite) throw new Error("Simulated write failure");
      Object.assign(rows.find(row => row.id === condition.value)!, values);
    } }; } }; },
    insert() { return { async values(row: Tunnel) {
      if (options.failWrite) throw new Error("Simulated write failure");
      rows.push(row);
    } }; },
  };
  let tail = Promise.resolve();
  const { POST } = await loadRouteHandlers<{ POST: (args: { request: Request }) => Promise<Response> }>({
    path: new URL("../src/routes/api/tunnel/register.ts", import.meta.url),
    logger: { log() {}, warn() {}, error() {} },
    modules: {
      "drizzle-orm": { eq: (field: string, value: string) => ({ field, value }) },
      crypto: { randomUUID: () => `new-${++sequence}` },
      "../../../db": { db: { transaction<T>(work: (value: typeof tx) => Promise<T>) {
        const result = tail.then(() => work(tx)); tail = result.then(() => {}, () => {}); return result;
      } } },
      "../../../db/app-schema": { tunnels: tables.tunnels },
      "../../../db/subscription-schema": { subscriptions: tables.subscriptions },
      "../../../db/auth-schema": { organizations: tables.organizations },
      "../../../lib/subscription-plans": { getPlanLimits, installationPlan, capacityDescription: () => "Capacity reached" },
      "../../../lib/redis": { redis: {
        async eval(script: string, _keys: number, key: string, id: string, limit: string) {
          assert.equal(key, "org:org-a:online_tunnels");
          assert.match(script, /return 2\s+-- Already online/);
          if (online.has(id)) return 2;
          if (Number(limit) !== -1 && online.size >= Number(limit)) return 0;
          online.add(id); return 1;
        },
        async srem(_key: string, id: string) { removals.push(id); online.delete(id); },
      } },
      "../../../lib/rate-limiter": { rateLimiters: { tunnelRegister: async () => ({ allowed: true }) }, getClientIdentifier: () => "client", createRateLimitResponse: () => { throw new Error("Unexpected rate limit"); } },
    },
  });
  return { rows, online, removals, register(url = "https://new.example.test") {
    return POST({ request: new Request("https://console.test/api/tunnel/register", { method: "POST", body: JSON.stringify({ organizationId: "org-a", url }) }) });
  } };
}

test("new and offline historical tunnels share the concurrent tunnel quota", async () => {
  for (const plan of ["free", "ray", "beam", "pulse"] as const) {
    const limit = getPlanLimits(plan).maxTunnels;
    const occupied = Array.from({ length: limit }, (_, index) => `online-${index}`);
    const fresh = await harness({ plan, online: occupied });
    assert.equal((await fresh.register()).status, 403);
    const reconnect = await harness({ plan, online: occupied, existing: { id: "old", organizationId: "org-a", url: "https://old.test" } });
    assert.equal((await reconnect.register("https://old.test")).status, 403);
    assert.equal(reconnect.online.size, limit);
    reconnect.online.delete(occupied[0]);
    assert.equal((await reconnect.register("https://old.test")).status, 200);
    assert.ok(reconnect.online.has("old"));
  }
});

test("already-online registration is idempotent, including after downgrade", async () => {
  const fixture = await harness({ online: ["old", "other", "over-cap"], existing: { id: "old", organizationId: "org-a", url: "https://old.test" } });
  assert.equal((await fixture.register("https://old.test")).status, 200);
  assert.equal(fixture.online.size, 3);
  assert.ok(fixture.rows[0].lastSeenAt);
});

test("another organization's address cannot be reconnected or consume capacity", async () => {
  const fixture = await harness({ existing: { id: "foreign", organizationId: "org-b", url: "https://taken.test" } });
  assert.equal((await fixture.register("https://taken.test")).status, 409);
  assert.equal(fixture.online.size, 0);
  assert.equal(fixture.rows[0].lastSeenAt, undefined);
});

test("concurrent registrations cannot both take the final slot", async () => {
  const fixture = await harness({ online: ["existing"] });
  const responses = await Promise.all([fixture.register("https://one.test"), fixture.register("https://two.test")]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 403]);
  assert.equal(fixture.online.size, 2);
});

test("database errors release only newly reserved online slots", async () => {
  const fresh = await harness({ failWrite: true });
  assert.equal((await fresh.register()).status, 500);
  assert.equal(fresh.online.size, 0);
  assert.deepEqual(fresh.removals, ["new-1"]);
  const reconnect = await harness({ failWrite: true, online: ["old"], existing: { id: "old", organizationId: "org-a", url: "https://old.test" } });
  assert.equal((await reconnect.register("https://old.test")).status, 500);
  assert.ok(reconnect.online.has("old"));
  assert.deepEqual(reconnect.removals, []);
});
