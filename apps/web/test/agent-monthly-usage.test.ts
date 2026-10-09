import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import Redis from "ioredis";
import {
  AGENT_MONTHLY_USAGE_LUA, AGENT_MONTHLY_USAGE_READ_LUA, createAgentMonthlyUsage, getAgentMonthlyUsageKey, getAgentUsageMonth,
  type AgentMonthlyUsageClient, type AgentUsageSnapshot,
} from "../src/lib/agent/monthly-usage";

const month = "2026-10";
const runId = "44444444-4444-4444-8444-444444444444";
const startedAt = new Date("2026-10-08T10:00:00Z");
function snapshot(overrides: Partial<AgentUsageSnapshot> = {}): AgentUsageSnapshot {
  return { organizationId: "org-a", runId, startedAt, inputTokens: 10, outputTokens: 5, status: "running", ...overrides };
}
function totals(organizationId: string, inputTokens: number, outputTokens: number, usageMonth = month) {
  return { organizationId, month: usageMonth, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}
function clientStub(overrides: Partial<AgentMonthlyUsageClient> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const client: AgentMonthlyUsageClient = {
    async eval(...args) {
      calls.push({ method: "eval", args });
      return args[0] === AGENT_MONTHLY_USAGE_READ_LUA ? ["0", "0", "0"] : 1;
    },
    ...overrides,
  };
  return { client, calls, usage: createAgentMonthlyUsage(client) };
}

test("UTC month and escaped tenant keys remain stable across month/year boundaries", () => {
  assert.equal(getAgentUsageMonth(new Date("2026-11-01T00:30:00+01:00")), "2026-10");
  assert.equal(getAgentUsageMonth(new Date("2027-01-01T00:10:00+01:00")), "2026-12");
  assert.equal(getAgentUsageMonth(new Date("2027-01-01T00:00:00Z")), "2027-01");
  assert.equal(getAgentUsageMonth(new Date("0000-01-01T00:00:00Z")), "0000-01");
  assert.equal(getAgentMonthlyUsageKey("org:{a}/é", month), "agent:usage:{org%3A%7Ba%7D%2F%C3%A9}:2026-10");
  assert.notEqual(getAgentMonthlyUsageKey("org:a", month), getAgentMonthlyUsageKey("org%3Aa", month));
});

test("strict snapshot/key validation rejects invalid inputs before contacting Redis", async () => {
  const f = clientStub();
  const invalid: Partial<AgentUsageSnapshot>[] = [
    ...["", "   ", "x".repeat(257), "\ud800", null].map((organizationId) => ({ organizationId: organizationId as string })),
    ...["bad", "44444444-4444-4444-7444-444444444444", null].map((value) => ({ runId: value as string })),
    { startedAt: new Date("invalid") }, { startedAt: new Date("+010000-01-01T00:00:00Z") },
    { startedAt: "2026-10-08" as unknown as Date },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null].flatMap((value) => [
      { inputTokens: value as number }, { outputTokens: value as number },
    ]),
    { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 },
    { status: "pending" as AgentUsageSnapshot["status"] },
  ];
  for (const input of invalid) await assert.rejects(f.usage.record(snapshot(input)), /Invalid agent usage/);
  for (const invalidMonth of ["2026-00", "2026-13", "2026-1", "26-10", "2026-10-01", "2026-10\n", null]) {
    await assert.rejects(f.usage.get("org-a", invalidMonth as string), /Invalid agent usage month/);
  }
  for (const organizationId of ["", "   ", "x".repeat(257), "\ud800"]) {
    await assert.rejects(f.usage.get(organizationId, month), /Invalid agent usage organization/);
  }
  assert.equal(f.calls.length, 0);
});

test("the injected recorder sends only counters/identity, normalizes UUIDs, and never expires billing history", async () => {
  const f = clientStub();
  await f.usage.record(snapshot({ runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase() }));
  assert.equal(f.calls.length, 1);
  const call = f.calls[0];
  assert.equal(call.method, "eval");
  assert.deepEqual(call.args.slice(1), [1, getAgentMonthlyUsageKey("org-a", month),
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "10", "5", "0"]);
  assert.equal(call.args[0], AGENT_MONTHLY_USAGE_LUA);
  assert.equal((AGENT_MONTHLY_USAGE_LUA.match(/redis\.call\("HSET"/g) ?? []).length, 1);
  assert.doesNotMatch(AGENT_MONTHLY_USAGE_LUA, /\b(EXPIRE|PEXPIRE|SETEX|PSETEX|DEL|HINCRBY)\b/i);
});

test("reads distinguish an unused month/zero from malformed persisted aggregates", async () => {
  const missing = clientStub();
  assert.deepEqual(await missing.usage.get("org-a", month), totals("org-a", 0, 0));
  assert.deepEqual(missing.calls, [{ method: "eval", args: [AGENT_MONTHLY_USAGE_READ_LUA, 1, getAgentMonthlyUsageKey("org-a", month)] }]);
  assert.doesNotMatch(AGENT_MONTHLY_USAGE_READ_LUA, /redis\.call\("(?:HSET|HINCRBY|SET|DEL|EXPIRE|PEXPIRE|SETEX|PSETEX)"/i);
  const zero = clientStub({ async eval() { return ["0", "0", "0"]; } });
  assert.deepEqual(await zero.usage.get("org-a", month), totals("org-a", 0, 0));
  const valid = clientStub({ async eval() { return ["15", "5", "20"]; } });
  assert.deepEqual(await valid.usage.get("org-a", month), totals("org-a", 15, 5));
  for (const values of [
    [null, null, null], [null, "0", "0"], ["0", null, "0"], ["0", "0", null], ["1", "2", "2"],
    ["-1", "0", "-1"], ["1.0", "0", "1"], ["01", "0", "1"], ["1e1", "0", "10"],
    ["NaN", "0", "0"], ["Infinity", "0", "0"], [" 1", "0", "1"],
    ["9007199254740992", "0", "9007199254740992"],
    [String(Number.MAX_SAFE_INTEGER), "1", String(Number.MAX_SAFE_INTEGER)], [], [null, null],
  ]) {
    const f = clientStub({ async eval() { return values; } });
    await assert.rejects(f.usage.get("org-a", month), /Invalid persisted agent monthly usage/);
  }
});

test("Redis failures propagate for recording and reading instead of fabricating zero usage", async () => {
  const outage = new Error("Redis unavailable");
  const f = clientStub({ async eval() { throw outage; } });
  await assert.rejects(f.usage.record(snapshot()), (error) => error === outage);
  await assert.rejects(f.usage.get("org-a", month), (error) => error === outage);
});

async function isolatedRedis() {
  // No URL, environment file, TCP port, or application Redis singleton is used.
  const directory = await mkdtemp("/tmp/outray-agent-usage-");
  const socket = join(directory, "redis.sock");
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700",
    "--save", "", "--appendonly", "no", "--dir", directory, "--loglevel", "warning"], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let spawnError: Error | undefined;
  server.on("error", (error) => { spawnError = error; });
  server.stdout.on("data", (data: Buffer) => { output += data.toString(); });
  server.stderr.on("data", (data: Buffer) => { output += data.toString(); });
  let redis: Redis | undefined;
  async function close() {
    redis?.disconnect();
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
  try {
    const deadline = Date.now() + 5_000;
    for (;;) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null) throw new Error(`Isolated Redis exited: ${output}`);
      try { await stat(socket); break; }
      catch {
        if (Date.now() > deadline) throw new Error(`Isolated Redis did not start: ${output}`);
        await delay(20);
      }
    }
    redis = new Redis(socket, { lazyConnect: true, retryStrategy: () => null, maxRetriesPerRequest: 1, connectTimeout: 1_000 });
    redis.on("error", () => { /* Startup/command failures are asserted through promises. */ });
    await redis.connect();
    return { redis, usage: createAgentMonthlyUsage(redis), close };
  } catch (error) {
    await close();
    throw error;
  }
}

const redisAvailable = spawnSync("redis-server", ["--version"], { encoding: "utf8" }).status === 0;
test("actual Lua accounting on an isolated ephemeral Redis", {
  skip: redisAvailable ? false : "redis-server is unavailable; actual Lua integration coverage cannot run",
}, async (t) => {
  const f = await isolatedRedis();
  t.after(f.close);

  await t.test("concurrent duplicate/out-of-order snapshots count each run's positive deltas once", async () => {
    const organizationId = "concurrent";
    const updates: AgentUsageSnapshot[] = [];
    for (let index = 0; index < 24; index++) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      for (const [inputTokens, outputTokens] of [[70, 9], [20, 3], [100, 20], [100, 20], [40, 8]]) {
        updates.push(snapshot({ organizationId, runId: id, inputTokens, outputTokens }));
      }
    }
    await Promise.all(updates.map(f.usage.record));
    assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, 2_400, 480));
    const key = getAgentMonthlyUsageKey(organizationId, month);
    assert.equal(await f.redis.hlen(key), 3 + 24 * 3);
    assert.equal(await f.redis.ttl(key), -1);
    assert.equal((await f.redis.keys(`agent:usage:{${organizationId}}:*`)).length, 1);
    assert.equal(await f.redis.hget(key, "run:00000000-0000-4000-8000-000000000000:settled"), "0");
  });

  await t.test("per-counter high-water marks handle independently out-of-order cumulative counts", async () => {
    const organizationId = "independent";
    await f.usage.record(snapshot({ organizationId, inputTokens: 10, outputTokens: 40 }));
    await f.usage.record(snapshot({ organizationId, inputTokens: 20, outputTokens: 30 }));
    await f.usage.record(snapshot({ organizationId, inputTokens: 9, outputTokens: 8 }));
    assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, 20, 40));
  });

  await t.test("each first terminal status reconciles exact totals and ignores retries/late callbacks", async () => {
    for (const status of ["complete", "failed", "cancelled"] as const) {
      const organizationId = `terminal-${status}`;
      await f.usage.record(snapshot({ organizationId, inputTokens: 100, outputTokens: 40 }));
      const secondRun = snapshot({ organizationId, runId: "55555555-5555-4555-8555-555555555555", inputTokens: 2, outputTokens: 3 });
      await f.usage.record(secondRun);
      await f.usage.record(snapshot({ organizationId, inputTokens: 7, outputTokens: 9, status }));
      await Promise.all([
        f.usage.record(snapshot({ organizationId, inputTokens: 500, outputTokens: 500 })),
        f.usage.record(snapshot({ organizationId, inputTokens: 700, outputTokens: 700, status: "complete" })),
        f.usage.record(snapshot({ organizationId, inputTokens: 0, outputTokens: 0, status: "failed" })),
      ]);
      assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, 9, 12));
      const stored = await f.redis.hgetall(getAgentMonthlyUsageKey(organizationId, month));
      assert.equal(stored[`run:${runId}:input_tokens`], "7");
      assert.equal(stored[`run:${runId}:output_tokens`], "9");
      assert.equal(stored[`run:${runId}:settled`], "1");
      await f.usage.record({ ...secondRun, status: "cancelled", inputTokens: 5, outputTokens: 8 });
      assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, 12, 17));
    }
  });

  await t.test("direct terminal/zero records initialize counters and completed runs stay in their start month", async () => {
    const organizationId = "zero-boundary";
    assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, 0, 0));
    assert.equal(await f.redis.exists(getAgentMonthlyUsageKey(organizationId, month)), 0);
    await f.usage.record(snapshot({ organizationId, inputTokens: 0, outputTokens: 0 }));
    assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, 0, 0));
    await f.usage.record(snapshot({ organizationId, inputTokens: 0, outputTokens: 0, status: "cancelled" }));
    assert.equal(await f.redis.hget(getAgentMonthlyUsageKey(organizationId, month), `run:${runId}:settled`), "1");
    const december = snapshot({ organizationId, startedAt: new Date("2027-01-01T00:10:00+01:00"), status: "complete" });
    await f.usage.record(december);
    assert.deepEqual(await f.usage.get(organizationId, "2026-12"), totals(organizationId, 10, 5, "2026-12"));
    assert.deepEqual(await f.usage.get(organizationId, "2027-01"), totals(organizationId, 0, 0, "2027-01"));
  });

  await t.test("identical run IDs in separate encoded tenants and months never share accounting", async () => {
    for (const organizationId of ["org:{a}", "org:%7Ba%7D", "org-b"]) {
      await f.usage.record(snapshot({ organizationId, inputTokens: 20, outputTokens: 4, status: "complete" }));
      assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, 20, 4));
      await f.usage.record(snapshot({ organizationId, startedAt: new Date("2026-11-01T00:00:00Z"), inputTokens: 3, outputTokens: 1 }));
      assert.deepEqual(await f.usage.get(organizationId, "2026-11"), totals(organizationId, 3, 1, "2026-11"));
    }
  });

  await t.test("malformed aggregate/watermark data rejects without partially mutating the hash", async () => {
    const valid: Record<string, string> = { input_tokens: "10", output_tokens: "5", total_tokens: "15",
      [`run:${runId}:input_tokens`]: "10", [`run:${runId}:output_tokens`]: "5", [`run:${runId}:settled`]: "0" };
    const invalid: Record<string, string>[] = [];
    for (const field of ["input_tokens", "output_tokens", "total_tokens", `run:${runId}:input_tokens`, `run:${runId}:output_tokens`]) {
      for (const value of ["-1", "1.5", "01", "1e1", "NaN", "Infinity", "9007199254740992", ""]) {
        invalid.push({ ...valid, [field]: value });
      }
      const missing = { ...valid };
      delete missing[field];
      invalid.push(missing);
    }
    invalid.push({ ...valid, [`run:${runId}:settled`]: "2" });
    invalid.push({ ...valid, total_tokens: "14" });
    invalid.push({ ...valid, input_tokens: "9", total_tokens: "14" });
    invalid.push({ ...valid, output_tokens: "4", total_tokens: "14" });
    const missingSettled = { ...valid };
    delete missingSettled[`run:${runId}:settled`];
    invalid.push(missingSettled);
    invalid.push({ [`run:${runId}:input_tokens`]: "0" });
    for (const [index, data] of invalid.entries()) {
      const organizationId = `malformed-${index}`;
      const key = getAgentMonthlyUsageKey(organizationId, month);
      await f.redis.hset(key, data);
      const before = await f.redis.hgetall(key);
      await assert.rejects(f.usage.record(snapshot({ organizationId, inputTokens: 20, outputTokens: 10 })), /Invalid persisted agent monthly usage/);
      assert.deepEqual(await f.redis.hgetall(key), before);
      assert.equal(await f.redis.ttl(key), -1);
    }
    const settledCorrupt = "settled-corrupt";
    await f.usage.record(snapshot({ organizationId: settledCorrupt, status: "complete" }));
    await f.redis.hset(getAgentMonthlyUsageKey(settledCorrupt, month), "total_tokens", "broken");
    await assert.rejects(f.usage.record(snapshot({ organizationId: settledCorrupt })), /Invalid persisted agent monthly usage/);
  });

  await t.test("reads reject partial, watermark-only, and unrelated-field hashes without mutation", async () => {
    const invalid = [
      { input_tokens: "0", output_tokens: "0" },
      { input_tokens: "0", total_tokens: "0" },
      { output_tokens: "0", total_tokens: "0" },
      { [`run:${runId}:input_tokens`]: "0", [`run:${runId}:output_tokens`]: "0", [`run:${runId}:settled`]: "1" },
      { garbage: "unrelated" },
    ];
    for (const [index, data] of invalid.entries()) {
      const organizationId = `malformed-read-${index}`;
      const key = getAgentMonthlyUsageKey(organizationId, month);
      await f.redis.hset(key, data);
      const before = await f.redis.hgetall(key);
      await assert.rejects(f.usage.get(organizationId, month), /Invalid persisted agent monthly usage/);
      assert.deepEqual(await f.redis.hgetall(key), before);
      assert.equal(await f.redis.ttl(key), -1);
    }
  });

  await t.test("wrong Redis key type is rejected before writing and read errors propagate", async () => {
    const organizationId = "wrong-type";
    const key = getAgentMonthlyUsageKey(organizationId, month);
    await f.redis.set(key, "not-a-hash");
    await assert.rejects(f.usage.record(snapshot({ organizationId })), /Invalid persisted agent monthly usage/);
    await assert.rejects(f.usage.get(organizationId, month), /Invalid persisted agent monthly usage/);
    assert.equal(await f.redis.get(key), "not-a-hash");
  });

  await t.test("safe integer boundary stays exact and aggregate overflow never partially writes", async () => {
    const organizationId = "safe-boundary";
    const key = getAgentMonthlyUsageKey(organizationId, month);
    await f.usage.record(snapshot({ organizationId, inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0 }));
    assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, Number.MAX_SAFE_INTEGER, 0));
    assert.equal(await f.redis.hget(key, "input_tokens"), "9007199254740991");
    const before = await f.redis.hgetall(key);
    for (const [inputTokens, outputTokens] of [[1, 0], [0, 1]]) {
      await assert.rejects(f.usage.record(snapshot({ organizationId, runId: "55555555-5555-4555-8555-555555555555", inputTokens, outputTokens })), /Invalid persisted agent monthly usage/);
      assert.deepEqual(await f.redis.hgetall(key), before);
    }
    await f.usage.record(snapshot({ organizationId, status: "complete", inputTokens: Number.MAX_SAFE_INTEGER - 1, outputTokens: 0 }));
    assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, Number.MAX_SAFE_INTEGER - 1, 0));
    await f.usage.record(snapshot({ organizationId, runId: "55555555-5555-4555-8555-555555555555", inputTokens: 0, outputTokens: 1 }));
    assert.deepEqual(await f.usage.get(organizationId, month), totals(organizationId, Number.MAX_SAFE_INTEGER - 1, 1));
    const combinedOverflow = "combined-overflow";
    await f.redis.hset(getAgentMonthlyUsageKey(combinedOverflow, month), {
      input_tokens: String(Number.MAX_SAFE_INTEGER), output_tokens: "1", total_tokens: String(Number.MAX_SAFE_INTEGER),
    });
    await assert.rejects(f.usage.record(snapshot({ organizationId: combinedOverflow, inputTokens: 0, outputTokens: 0 })), /Invalid persisted agent monthly usage/);
    await assert.rejects(f.usage.get(combinedOverflow, month), /Invalid persisted agent monthly usage/);
  });

  await t.test("Lua validates malformed arguments before creating a key", async () => {
    const key = getAgentMonthlyUsageKey("invalid-arguments", month);
    for (const args of [[runId, "-1", "0", "0"], [runId, "0", "0", "2"],
      [runId, "9007199254740991", "1", "1"], [runId, "0", "0"]]) {
      await assert.rejects(f.redis.eval(AGENT_MONTHLY_USAGE_LUA, 1, key, ...args), /Invalid persisted agent monthly usage/);
      assert.equal(await f.redis.exists(key), 0);
    }
  });
});
