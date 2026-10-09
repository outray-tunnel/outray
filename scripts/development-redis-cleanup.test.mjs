import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyRedisCleanup, backupRedis, planRedisCleanup } from "./development-redis-cleanup.mjs";

const string = (value) => ({ type: "string", value });
const set = (...value) => ({ type: "set", value });
const stream = (entries = [], pending = 0) => ({ type: "stream", value: entries, pending });
const online = (organizationId, dbTunnelId) => string(JSON.stringify({ organizationId, dbTunnelId, serverId: "seed" }));

class RedisMock {
  constructor(entries = {}) {
    this.data = new Map(Object.entries(entries));
    this.calls = [];
    this.activePipelines = 0;
    this.maxPipelines = 0;
    this.pipelineDelay = false;
  }
  pipeline() {
    const commands = [];
    const pipeline = {};
    for (const command of ["type", "dumpBuffer", "get", "smembers", "pttl", "xlen", "xinfo"]) {
      pipeline[command] = (...args) => { commands.push([command, ...args]); return pipeline; };
    }
    pipeline.exec = async () => {
      this.calls.push(["pipeline", commands]);
      this.activePipelines++;
      this.maxPipelines = Math.max(this.maxPipelines, this.activePipelines);
      try {
        if (this.pipelineDelay) await new Promise((resolve) => setTimeout(resolve, 1));
        const replies = [];
        for (const [command, ...args] of commands) {
          try { replies.push([null, await this[command](...args)]); }
          catch (error) { replies.push([error, null]); }
        }
        return replies;
      } finally { this.activePipelines--; }
    };
    return pipeline;
  }
  async scan(cursor) {
    this.calls.push(["scan", cursor]);
    const keys = [...this.data.keys()];
    const offset = Number(cursor);
    return [offset + 3 >= keys.length ? "0" : String(offset + 3), keys.slice(offset, offset + 3)];
  }
  async type(key) { return this.data.get(key)?.type ?? "none"; }
  async get(key) { return this.data.get(key)?.value ?? null; }
  async smembers(key) { return [...(this.data.get(key)?.value ?? [])]; }
  async pttl(key) { return this.data.has(key) ? -1 : -2; }
  async dumpBuffer(key) {
    const record = this.data.get(key);
    return record ? Buffer.from(JSON.stringify(record)) : null;
  }
  async xlen(key) { return this.data.get(key)?.value.length ?? 0; }
  async xinfo(command, key) {
    assert.equal(command, "GROUPS");
    return [["name", "tinybird-writers", "pending", this.data.get(key).pending ?? 0]];
  }
  async eval(script, keyCount, ...args) {
    this.calls.push(["eval", script, keyCount]);
    assert.match(script, /Validate everything before the first mutation/);
    const keys = args.slice(0, keyCount);
    const [deletionCount, streamCount, membersJson, ...dumps] = args.slice(keyCount);
    const count = Number(deletionCount);
    const globalKey = keys[count];
    // Model the Lua's validation-first atomic contract, without a server.
    for (let index = 0; index < count; index++) {
      const current = await this.dumpBuffer(keys[index]);
      if (current && !current.equals(dumps[index])) throw new Error("Redis cleanup plan changed");
    }
    const globalType = await this.type(globalKey);
    if (globalType !== "none" && globalType !== "set") throw new Error("Unexpected global online index type");
    for (const key of keys.slice(count + 1, count + 1 + Number(streamCount))) {
      const record = this.data.get(key);
      if (record && (record.type !== "stream" || record.value.length || record.pending)) throw new Error("Shared Redis stream changed");
    }
    let deleted = 0;
    for (const key of keys.slice(0, count)) deleted += Number(this.data.delete(key));
    let removed = 0;
    const global = this.data.get(globalKey);
    if (global) for (const member of JSON.parse(membersJson)) {
      const index = global.value.indexOf(member);
      if (index !== -1) { global.value.splice(index, 1); removed++; }
    }
    return [deleted, removed];
  }
}

function fixtures() {
  return new RedisMock({
    "org:acme:online_tunnels": set("acme-tunnel"),
    "org:removed:online_tunnels": set("removed-tunnel"),
    "org:orphan:online_tunnels": set("orphan-tunnel"),
    "bw:acme:2026-10": string("99"),
    "bw:removed:2026-09": string("10"),
    "bw:orphan:2026-10": string("20"),
    "otel:rate:acme:123": string("1"),
    "otel:rate:removed:123": string("2"),
    "tunnel:online:acme.example.test": online("acme", "acme-tunnel"),
    "tunnel:online:removed.example.test": online("removed", "removed-tunnel"),
    "tunnel:online:orphan.example.test": online("orphan", "orphan-tunnel"),
    "tunnel:last_seen:acme-tunnel": string("123"),
    "tunnel:last_seen:removed-tunnel": string("123"),
    "tunnel:last_seen:orphan-tunnel": string("123"),
    "tunnel:last_seen:unknown-tunnel": string("123"),
    "dashboard:ws:acme-token": string(JSON.stringify({ orgId: "acme", userId: "shared-user" })),
    "dashboard:ws:removed-token": string(JSON.stringify({ orgId: "removed", userId: "shared-user" })),
    "global:orgs_with_online_tunnels": set("acme", "removed", "orphan", "stale"),
    "outray:otel:traces": stream(),
    "outray:otel:logs": stream(),
    "outray:otel:metrics": stream(),
    "admin:token:shared-token": string("1"),
    "ratelimit:general:shared-client-ip": set("request-id"),
    "user:shared-user": string("preserve"),
    "unknown:cache:acme": string("preserve"),
  });
}

test("plans exact non-Acme tenant keys including orphans without writes, then preserves shared/Acme data", async () => {
  const redis = fixtures();
  const original = structuredClone([...redis.data]);
  const plan = await planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]);
  assert.deepEqual([...redis.data], original, "planning never mutates data");
  assert.deepEqual(plan.removedOrgIds, ["orphan", "removed", "stale"]);
  assert.deepEqual(plan.globalMembersToRemove, ["orphan", "removed", "stale"]);
  assert.equal(plan.deleteKeys.length, 10);
  assert.ok(plan.deleteKeys.every((entry) => entry.dumpBase64 && entry.organizationId !== "acme"));
  assert.ok(plan.streamKeys.includes("outray:otel:traces:dead-letter"));
  const result = await applyRedisCleanup(redis, plan);
  assert.deepEqual(result, { deletedKeys: 10, removedGlobalMembers: 3 });
  assert.deepEqual(redis.data.get("global:orgs_with_online_tunnels").value, ["acme"]);
  for (const [key, record] of original) {
    if (plan.deleteKeys.some((entry) => entry.key === key) || key.startsWith("global:")) continue;
    assert.deepEqual(redis.data.get(key), record, `${key} must be unchanged`);
  }
  assert.equal(redis.calls.filter(([name]) => name === "eval").length, 1);
});

test("discovers empty overridden streams and keeps their groups unchanged", async () => {
  const redis = new RedisMock({ "custom-otel-queue": stream() });
  const plan = await planRedisCleanup(redis, "acme", [], []);
  assert.ok(plan.streamKeys.includes("custom-otel-queue"));
  assert.deepEqual(await applyRedisCleanup(redis, plan), { deletedKeys: 0, removedGlobalMembers: 0 });
  assert.deepEqual(redis.data.get("custom-otel-queue"), stream());
});

test("pipelines bracketed snapshots and runs independent reads concurrently with an eight-pipeline bound", async () => {
  const redis = fixtures();
  redis.pipelineDelay = true;
  const plan = await planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]);
  assert.ok(redis.maxPipelines > 1);
  assert.ok(redis.maxPipelines <= 8);
  const pipelines = redis.calls.filter(([name]) => name === "pipeline").map(([, commands]) => commands);
  assert.ok(pipelines.some((commands) => commands.length > 1 && commands.every(([name]) => name === "type")), "inventory TYPE calls are batched");
  const metadata = pipelines.find((commands) => commands[0][1] === "tunnel:online:removed.example.test");
  assert.deepEqual(metadata.map(([name]) => name), ["dumpBuffer", "type", "get", "pttl", "dumpBuffer"]);
  assert.deepEqual(await applyRedisCleanup(redis, plan), { deletedKeys: 10, removedGlobalMembers: 3 });
});

test("non-pipeline clients retain snapshot and cleanup behavior", async () => {
  const redis = fixtures();
  redis.pipeline = undefined;
  const plan = await planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]);
  assert.deepEqual(await applyRedisCleanup(redis, plan), { deletedKeys: 10, removedGlobalMembers: 3 });
});

test("refuses malformed or unattributed metadata and wrong known key types without mutations", async () => {
  for (const value of ["not json", "null", "[]", "{}", JSON.stringify({ organizationId: "" })]) {
    const redis = new RedisMock({ "tunnel:online:unknown": string(value) });
    await assert.rejects(planRedisCleanup(redis, "acme", [], []), /metadata/);
    assert.equal(redis.calls.some(([name]) => name === "eval"), false);
    assert.equal(redis.data.size, 1);
  }
  const redis = new RedisMock({ "org:removed:online_tunnels": string("bad") });
  await assert.rejects(planRedisCleanup(redis, "acme", ["removed"], []), /Unexpected Redis type/);
});

test("refuses removal of Acme and conflicting database tunnel IDs", async () => {
  await assert.rejects(planRedisCleanup(fixtures(), "acme", ["acme"], []), /cannot be removed/);
  await assert.rejects(planRedisCleanup(fixtures(), "acme", [], ["acme-tunnel"]), /Conflicting tunnel ownership/);
  const redis = new RedisMock({
    "tunnel:online:keep": online("acme", "same-tunnel"),
    "tunnel:online:remove": online("removed", "same-tunnel"),
  });
  await assert.rejects(planRedisCleanup(redis, "acme", ["removed"], []), /Conflicting tunnel ownership/);
});

test("refuses nonempty queues including mixed or malformed payloads, and empty queues with pending entries", async () => {
  for (const entries of [
    [{ payload: JSON.stringify([{ organization_id: "acme" }, { organization_id: "removed" }]) }],
    [{ payload: "not json" }],
    [{ payload: JSON.stringify([{ organization_id: "removed" }]) }],
  ]) {
    const redis = new RedisMock({ "outray:otel:logs": stream(entries) });
    await assert.rejects(planRedisCleanup(redis, "acme", ["removed"], []), /not empty/);
    assert.deepEqual(redis.data.get("outray:otel:logs").value, entries);
  }
  const redis = new RedisMock({ "outray:otel:traces": stream([], 1) });
  await assert.rejects(planRedisCleanup(redis, "acme", [], []), /pending entries/);
});

test("atomic apply rejects changed snapshots before deleting any key", async () => {
  const redis = fixtures();
  const plan = await planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]);
  redis.data.set("tunnel:online:removed.example.test", online("acme", "new-acme-tunnel"));
  const before = structuredClone([...redis.data]);
  await assert.rejects(applyRedisCleanup(redis, plan), /plan changed/);
  assert.deepEqual([...redis.data], before);
});

test("planning refuses ownership changes while reading metadata", async () => {
  const redis = fixtures();
  const originalGet = redis.get.bind(redis);
  redis.get = async (key) => {
    const value = await originalGet(key);
    if (key === "tunnel:online:removed.example.test") redis.data.set(key, online("acme", "acme-tunnel"));
    return value;
  };
  await assert.rejects(planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]), /changed during planning/);
  assert.equal(redis.calls.some(([name]) => name === "eval"), false);
});

test("global-index validation precedes all mutations and preserves newly added kept membership", async () => {
  const redis = fixtures();
  const plan = await planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]);
  redis.data.set("global:orgs_with_online_tunnels", string("wrong type"));
  const before = structuredClone([...redis.data]);
  await assert.rejects(applyRedisCleanup(redis, plan), /Unexpected global online index type/);
  assert.deepEqual([...redis.data], before);
  redis.data.set("global:orgs_with_online_tunnels", set("acme", "removed", "new-org"));
  await applyRedisCleanup(redis, plan);
  assert.deepEqual(redis.data.get("global:orgs_with_online_tunnels").value, ["acme", "new-org"]);
});

test("atomic apply refuses queues populated, pending or wrongly typed since planning, before any deletion", async () => {
  for (const record of [stream([{ payload: "late data" }]), stream([], 1), string("wrong type")]) {
    const redis = fixtures();
    const plan = await planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]);
    redis.data.set("outray:otel:logs:dead-letter", record);
    const before = structuredClone([...redis.data]);
    await assert.rejects(applyRedisCleanup(redis, plan), /Shared Redis stream changed/);
    assert.deepEqual([...redis.data], before);
  }
});

test("expired planned tenant keys are harmless and do not prevent remaining cleanup", async () => {
  const redis = fixtures();
  const plan = await planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]);
  redis.data.delete("otel:rate:removed:123");
  assert.deepEqual(await applyRedisCleanup(redis, plan), { deletedKeys: 9, removedGlobalMembers: 3 });
});

test("rejects tampered plan keys, kept membership and omitted default stream safeguards", async () => {
  const redis = fixtures();
  const plan = await planRedisCleanup(redis, "acme", ["removed"], ["removed-tunnel"]);
  const acme = { ...plan.deleteKeys[0], key: "org:acme:online_tunnels", organizationId: "acme" };
  const shared = { ...plan.deleteKeys[0], key: "admin:token:shared-token" };
  for (const badPlan of [
    { ...plan, deleteKeys: [acme] },
    { ...plan, deleteKeys: [shared] },
    { ...plan, globalMembersToRemove: ["acme"] },
    { ...plan, streamKeys: [] },
  ]) await assert.rejects(applyRedisCleanup(redis, badPlan), /Unsafe|Refusing|safeguards/);
  assert.equal(redis.calls.some(([name]) => name === "eval"), false);
});

test("backup is an exclusive 0600 DUMP snapshot and refuses overwriting or relative destinations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outray-redis-backup-test-"));
  const path = join(directory, "redis.json");
  try {
    const redis = fixtures();
    redis.pipelineDelay = true;
    assert.deepEqual(await backupRedis(redis, ["admin:token:shared-token", "missing"], path), { keys: 1, path });
    const contents = JSON.parse(await readFile(path, "utf8"));
    assert.equal(contents.snapshots.length, 1);
    assert.equal(contents.snapshots[0].ttlMs, -1);
    assert.equal(Buffer.from(contents.snapshots[0].dumpBase64, "base64").toString(), JSON.stringify(string("1")));
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.ok(redis.maxPipelines > 1 && redis.maxPipelines <= 8);
    const pipeline = redis.calls.find(([name]) => name === "pipeline")[1];
    assert.deepEqual(pipeline.map(([name]) => name), ["dumpBuffer", "pttl", "type", "dumpBuffer"]);
    await assert.rejects(backupRedis(redis, [], path), /EEXIST/);
    await assert.rejects(backupRedis(redis, [], "redis.json"), /absolute file path/);
  } finally { await rm(directory, { recursive: true }); }
});
