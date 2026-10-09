import { writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

const GLOBAL_ONLINE_KEY = "global:orgs_with_online_tunnels";
const DEFAULT_STREAM_KEYS = ["traces", "logs", "metrics"].flatMap((signal) => [
  `outray:otel:${signal}`,
  `outray:otel:${signal}:dead-letter`,
]);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_KEYS = 100_000;
const READ_CONCURRENCY = 8;

async function mapConcurrent(values, read) {
  const results = new Array(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await read(values[index]);
    }
  }));
  return results;
}

async function readPipeline(redis, commands) {
  if (typeof redis.pipeline !== "function") return null;
  const pipeline = redis.pipeline();
  for (const [command, ...args] of commands) pipeline[command](...args);
  const replies = await pipeline.exec();
  if (!Array.isArray(replies) || replies.length !== commands.length) throw new Error("Redis read pipeline failed");
  return replies;
}

function reply(replies, index, key) {
  const [error, value] = replies[index];
  if (error) throw new Error(`Redis planning read failed for ${key}`);
  return value;
}

function encodeDump(value) {
  return value === null ? null : Buffer.from(value).toString("base64");
}

async function keyTypes(redis, keys) {
  const batches = [];
  for (let start = 0; start < keys.length; start += 250) batches.push(keys.slice(start, start + 250));
  const results = await mapConcurrent(batches, async (batch) => {
    const replies = await readPipeline(redis, batch.map((key) => ["type", key]));
    return replies ? batch.map((key, index) => [key, reply(replies, index, key)])
      : mapConcurrent(batch, async (key) => [key, await redis.type(key)]);
  });
  return new Map(results.flat());
}

function assertId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}; refusing Redis cleanup`);
  }
  return value;
}

function idSet(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return new Set(values.map((value) => assertId(value, label)));
}

function directOwner(key) {
  return key.match(/^org:([A-Za-z0-9_-]{1,128}):online_tunnels$/)?.[1]
    ?? key.match(/^bw:([A-Za-z0-9_-]{1,128}):\d{4}-(?:0[1-9]|1[0-2])$/)?.[1]
    ?? key.match(/^otel:rate:([A-Za-z0-9_-]{1,128}):\d+$/)?.[1];
}

async function allKeys(redis) {
  const keys = new Set();
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "COUNT", 250);
    cursor = String(nextCursor);
    for (const key of batch) keys.add(key);
    if (keys.size > MAX_KEYS) throw new Error("Redis inventory exceeds safe development reset limit");
  } while (cursor !== "0");
  return [...keys].sort();
}

async function dump(redis, key) {
  return encodeDump(await redis.dumpBuffer(key));
}

async function stableRead(redis, key, expectedType) {
  const readCommand = expectedType === "set" ? "smembers" : "get";
  // Ordered pipeline commands bracket the value with snapshots while costing
  // one network round trip. Never run the two DUMPs concurrently: that could
  // miss an ownership change during GET/SMEMBERS.
  const replies = await readPipeline(redis, [
    ["dumpBuffer", key], ["type", key], [readCommand, key], ["pttl", key], ["dumpBuffer", key],
  ]);
  const before = replies ? encodeDump(reply(replies, 0, key)) : await dump(redis, key);
  if (before === null) return null;
  const type = replies ? reply(replies, 1, key) : await redis.type(key);
  if (type !== expectedType) {
    throw new Error(`Unexpected Redis type for ${key}; refusing cleanup`);
  }
  const value = replies ? reply(replies, 2, key) : await redis[readCommand](key);
  const ttlMs = replies ? reply(replies, 3, key) : await redis.pttl(key);
  const after = replies ? encodeDump(reply(replies, 4, key)) : await dump(redis, key);
  if (after !== before) {
    throw new Error(`Redis key changed during planning: ${key}; quiesce development writers and retry`);
  }
  return { key, type: expectedType, dumpBase64: before, ttlMs, value };
}

function metadataOwner(value, field, key) {
  let metadata;
  try { metadata = JSON.parse(value); } catch {
    throw new Error(`Malformed tenant metadata in ${key}; refusing cleanup`);
  }
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    throw new Error(`Malformed tenant metadata in ${key}; refusing cleanup`);
  }
  const organizationId = assertId(metadata[field], `tenant metadata in ${key}`);
  return { organizationId, metadata };
}

async function assertEmptyStream(redis, key) {
  const replies = await readPipeline(redis, [["type", key], ["xlen", key], ["xinfo", "GROUPS", key]]);
  const type = replies ? reply(replies, 0, key) : await redis.type(key);
  if (type === "none") return;
  if (type !== "stream") throw new Error(`Unexpected Redis type for shared stream ${key}`);
  const length = replies ? reply(replies, 1, key) : await redis.xlen(key);
  if (Number(length) !== 0) {
    throw new Error(`Shared Redis stream ${key} is not empty; preserve/filter its tenant payloads before resetting`);
  }
  const groups = replies ? reply(replies, 2, key) : await redis.xinfo("GROUPS", key);
  for (const fields of groups) {
    const group = Object.fromEntries(Array.from({ length: fields.length / 2 }, (_, index) => [fields[index * 2], fields[index * 2 + 1]]));
    if (Number(group.pending) !== 0) {
      throw new Error(`Shared Redis stream ${key} has pending entries; drain or inspect them before resetting`);
    }
  }
}

/**
 * Read-only plan for an already-verified development Redis target. This module
 * never creates a connection or reads environment variables. tunnelIds must
 * contain only the removed organizations' database tunnel IDs.
 *
 * Empty shared streams are preserved, including groups/last-delivered IDs.
 * Nonempty, mixed-tenant, malformed and pending queues fail closed; replaying
 * Acme entries would change ordering/delivery semantics. Quiesce all writers
 * before planning and keep them quiesced through the cross-store reset.
 * The returned DUMP snapshots may contain credentials: do not log this object.
 */
export async function planRedisCleanup(redis, keepOrgId, removedOrgIds, tunnelIds) {
  assertId(keepOrgId, "kept organization ID");
  const removed = idSet(removedOrgIds, "removed organization ID");
  const removedTunnels = idSet(tunnelIds, "removed tunnel ID");
  if (removed.has(keepOrgId)) throw new Error("Kept organization cannot be removed");
  const keys = await allKeys(redis);
  const types = await keyTypes(redis, keys);
  const streams = new Set(DEFAULT_STREAM_KEYS);
  const deletions = new Map();
  const keptTunnels = new Set();
  const globalMembersToRemove = new Set();

  function remove(snapshot, organizationId) {
    if (organizationId === keepOrgId) throw new Error("Refusing to remove kept organization data");
    removed.add(organizationId);
    const { value: _value, ...safeSnapshot } = snapshot;
    deletions.set(snapshot.key, { ...safeSnapshot, organizationId });
  }

  await mapConcurrent(keys, async (key) => {
    const type = types.get(key);
    if (type === "stream") { streams.add(key); return; }
    const owner = directOwner(key);
    if (owner) {
      const online = key.startsWith("org:");
      const snapshot = await stableRead(redis, key, online ? "set" : "string");
      if (!snapshot) return;
      if (online) {
        for (const tunnelId of snapshot.value) {
          assertId(tunnelId, `tunnel ID in ${key}`);
          (owner === keepOrgId ? keptTunnels : removedTunnels).add(tunnelId);
        }
      }
      if (owner !== keepOrgId) remove(snapshot, owner);
      return;
    }
    if (key.startsWith("tunnel:online:") || key.startsWith("dashboard:ws:")) {
      const snapshot = await stableRead(redis, key, "string");
      if (!snapshot) return;
      const tunnel = key.startsWith("tunnel:online:");
      const { organizationId, metadata } = metadataOwner(snapshot.value, tunnel ? "organizationId" : "orgId", key);
      if (tunnel && metadata.dbTunnelId !== undefined) {
        const tunnelId = assertId(metadata.dbTunnelId, `database tunnel ID in ${key}`);
        (organizationId === keepOrgId ? keptTunnels : removedTunnels).add(tunnelId);
      }
      if (organizationId !== keepOrgId) remove(snapshot, organizationId);
    }
  });

  // All ownership discoveries finish before last-seen keys are considered.
  for (const tunnelId of removedTunnels) {
    if (keptTunnels.has(tunnelId)) throw new Error("Conflicting tunnel ownership; refusing Redis cleanup");
  }
  await mapConcurrent([...removedTunnels], async (tunnelId) => {
    const key = `tunnel:last_seen:${tunnelId}`;
    const snapshot = await stableRead(redis, key, "string");
    if (snapshot) {
      const { value: _value, ...safeSnapshot } = snapshot;
      deletions.set(key, { ...safeSnapshot, organizationId: null });
    }
  });
  if (types.has(GLOBAL_ONLINE_KEY) && types.get(GLOBAL_ONLINE_KEY) !== "none") {
    const snapshot = await stableRead(redis, GLOBAL_ONLINE_KEY, "set");
    for (const member of snapshot?.value ?? []) {
      assertId(member, "global online organization ID");
      if (member !== keepOrgId) { globalMembersToRemove.add(member); removed.add(member); }
    }
  }
  // Orphan org IDs from known key schemas are in scope too. SREM is harmless
  // when the matching member was absent at planning time.
  for (const organizationId of removed) globalMembersToRemove.add(organizationId);
  await mapConcurrent([...streams], (key) => assertEmptyStream(redis, key));
  return {
    version: 1, keepOrgId, removedOrgIds: [...removed].sort(),
    removedTunnelIds: [...removedTunnels].sort(),
    inspectedKeys: keys,
    deleteKeys: [...deletions.values()].sort((a, b) => a.key.localeCompare(b.key)),
    globalMembersToRemove: [...globalMembersToRemove].sort(),
    streamKeys: [...streams].sort(),
    requiresQuiescedWriters: true,
  };
}

const APPLY_LUA = `
local count = tonumber(ARGV[1])
local streamCount = tonumber(ARGV[2])
local globalKey = KEYS[count + 1]
local members = cjson.decode(ARGV[3])
-- Validate everything before the first mutation. Expired planned keys are safe.
for index = 1, count do
  local current = redis.call('DUMP', KEYS[index])
  if current and current ~= ARGV[index + 3] then
    return redis.error_reply('Redis cleanup plan changed; re-plan before applying')
  end
end
local globalType = redis.call('TYPE', globalKey).ok
if globalType ~= 'none' and globalType ~= 'set' then
  return redis.error_reply('Unexpected global online index type')
end
for index = 1, streamCount do
  local key = KEYS[count + 1 + index]
  local kind = redis.call('TYPE', key).ok
  if kind ~= 'none' then
    if kind ~= 'stream' or redis.call('XLEN', key) ~= 0 then
      return redis.error_reply('Shared Redis stream changed; drain and re-plan')
    end
    local groups = redis.call('XINFO', 'GROUPS', key)
    for _, group in ipairs(groups) do
      for field = 1, #group, 2 do
        if group[field] == 'pending' and tonumber(group[field + 1]) ~= 0 then
          return redis.error_reply('Shared Redis stream has pending entries')
        end
      end
    end
  end
end
local deleted = 0
for index = 1, count do deleted = deleted + redis.call('DEL', KEYS[index]) end
local removedMembers = 0
for _, member in ipairs(members) do removedMembers = removedMembers + redis.call('SREM', globalKey, member) end
return {deleted, removedMembers}
`;

/** Atomically revalidates the snapshot, then applies exact-key mutations only. */
export async function applyRedisCleanup(redis, plan) {
  if (!plan || plan.version !== 1 || plan.requiresQuiescedWriters !== true) throw new Error("Invalid Redis cleanup plan");
  assertId(plan.keepOrgId, "kept organization ID");
  const removed = idSet(plan.removedOrgIds, "removed organization ID");
  const tunnels = idSet(plan.removedTunnelIds, "removed tunnel ID");
  const members = idSet(plan.globalMembersToRemove, "global online organization ID");
  if (removed.has(plan.keepOrgId) || members.has(plan.keepOrgId)) throw new Error("Refusing to remove kept organization data");
  if (!Array.isArray(plan.deleteKeys) || !Array.isArray(plan.streamKeys)) throw new Error("Invalid Redis cleanup plan");
  const seen = new Set();
  for (const snapshot of plan.deleteKeys) {
    if (!snapshot || typeof snapshot.key !== "string" || seen.has(snapshot.key) || typeof snapshot.dumpBase64 !== "string" || !snapshot.dumpBase64) throw new Error("Invalid Redis key snapshot");
    seen.add(snapshot.key);
    const owner = directOwner(snapshot.key);
    const tunnelId = snapshot.key.match(/^tunnel:last_seen:([A-Za-z0-9_-]{1,128})$/)?.[1];
    const metadataKey = snapshot.key.startsWith("tunnel:online:") || snapshot.key.startsWith("dashboard:ws:");
    if (owner ? owner !== snapshot.organizationId || owner === plan.keepOrgId || !removed.has(owner)
      : tunnelId ? !tunnels.has(tunnelId)
        : !metadataKey || snapshot.organizationId === plan.keepOrgId || !removed.has(snapshot.organizationId)) {
      throw new Error("Unsafe Redis key in cleanup plan");
    }
  }
  const streamKeys = [...new Set(plan.streamKeys)];
  if (DEFAULT_STREAM_KEYS.some((key) => !streamKeys.includes(key)) || streamKeys.some((key) => typeof key !== "string" || seen.has(key) || key === GLOBAL_ONLINE_KEY)) throw new Error("Invalid shared stream safeguards");
  const keys = [...plan.deleteKeys.map((snapshot) => snapshot.key), GLOBAL_ONLINE_KEY, ...streamKeys];
  const [deletedKeys, removedGlobalMembers] = await redis.eval(APPLY_LUA, keys.length, ...keys,
    String(plan.deleteKeys.length), String(streamKeys.length), JSON.stringify([...members]),
    ...plan.deleteKeys.map((snapshot) => Buffer.from(snapshot.dumpBase64, "base64")));
  return { deletedKeys: Number(deletedKeys), removedGlobalMembers: Number(removedGlobalMembers) };
}

/** DUMP backups include tokens; create a new private file, never overwrite one. */
export async function backupRedis(redis, keys, path) {
  if (!isAbsolute(path) || !Array.isArray(keys)) throw new Error("Redis backup requires an absolute file path and exact key list");
  const uniqueKeys = [...new Set(keys)].sort();
  for (const key of uniqueKeys) {
    if (typeof key !== "string" || !key) throw new Error("Invalid Redis backup key");
  }
  const snapshots = (await mapConcurrent(uniqueKeys, async (key) => {
    const replies = await readPipeline(redis, [["dumpBuffer", key], ["pttl", key], ["type", key], ["dumpBuffer", key]]);
    const dumpBase64 = replies ? encodeDump(reply(replies, 0, key)) : await dump(redis, key);
    if (dumpBase64 === null) return null;
    const ttlMs = replies ? reply(replies, 1, key) : await redis.pttl(key);
    const type = replies ? reply(replies, 2, key) : await redis.type(key);
    const after = replies ? encodeDump(reply(replies, 3, key)) : await dump(redis, key);
    if (after !== dumpBase64) throw new Error(`Redis key changed during backup: ${key}`);
    return { key, type, dumpBase64, ttlMs };
  })).filter(Boolean);
  await writeFile(path, JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), snapshots }), { flag: "wx", mode: 0o600 });
  return { keys: snapshots.length, path };
}
