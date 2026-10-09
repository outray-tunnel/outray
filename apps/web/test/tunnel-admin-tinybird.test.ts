import assert from "node:assert/strict";
import test from "node:test";
import { loadRouteHandlers } from "./helpers/load-route";

type GET = (context: { request: Request }) => Promise<Response>;
type Parameters = Record<string, string | number>;

async function fixture(authorized = true, rows: unknown[] = [], fail = false) {
  const calls: { endpoint: string; parameters: Parameters }[] = [];
  const { GET } = await loadRouteHandlers<{ GET: GET }>({
    path: new URL("../src/routes/api/admin/stats.ts", import.meta.url),
    modules: {
      "../../../lib/redis": { redis: { get: async () => authorized ? "exists" : null } },
      "../../../lib/hash": { hashToken: () => "synthetic-hash" },
      "../../../lib/tinybird": { queryTinybird: async (endpoint: string, parameters: Parameters) => {
        calls.push({ endpoint, parameters });
        if (fail) throw new Error("Unavailable");
        return rows;
      } },
    },
    logger: { log() {}, warn() {}, error() {} },
  });
  const request = (period = "24h", token = true) => new Request(`http://test.invalid/api/admin/stats?period=${period}`, {
    headers: token ? { Authorization: "Bearer synthetic-token" } : {},
  });
  return { GET, calls, request };
}

test("admin stats rejects absent/invalid authorization before Tinybird reads", async () => {
  const f = await fixture(false);
  assert.equal((await f.GET({ request: f.request("24h", false) })).status, 401);
  assert.equal((await f.GET({ request: f.request() })).status, 403);
  assert.equal(f.calls.length, 0);
});

for (const [period, interval, points] of [["1h", 1, 60], ["24h", 15, 96], ["7d", 60, 168], ["30d", 240, 180], ["bad", 15, 96]] as const) {
  test(`admin ${period} zero fills a bounded, deterministic UTC snapshot window`, async () => {
    const f = await fixture();
    const result = await f.GET({ request: f.request(period) });
    assert.equal(result.status, 200);
    const rows = await result.json() as { time: string; active_tunnels: number }[];
    assert.equal(rows.length, points + 1);
    assert.equal(f.calls[0].endpoint, "tunnel_admin_active_series");
    assert.equal(f.calls[0].parameters.interval_minutes, interval);
    assert.equal(Date.parse(rows[1].time) - Date.parse(rows[0].time), interval * 60_000);
    assert.ok(rows.every((row) => row.active_tunnels === 0 && row.time.endsWith("Z")));
  });
}

test("admin stats returns failed requests distinctly from empty history", async () => {
  const f = await fixture(true, [], true);
  assert.equal((await f.GET({ request: f.request() })).status, 500);
});
