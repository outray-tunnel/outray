import { redis } from "./lib/redis";
import { activeTunnelSnapshot, createSnapshotLogger } from "./lib/tinybird-tunnels";
import { chargePaystackSubscriptions } from "./lib/paystack";
import { startAlertWorkers } from "./lib/alerts";
import { instanceConfig } from "../../../shared/instance-config";

async function connectRedis() {
  await redis.connect();
  console.log("Connected to Redis");
}

const { logger: snapshots, configured: tinybirdConfigured } = createSnapshotLogger();
const timers: NodeJS.Timeout[] = [];

let isSampling = false;
let isCleaning = false;

/**
 * Cleans up stale entries from org:*:online_tunnels sets.
 *
 * This handles cases where tunnels disconnect but their entries aren't properly
 * removed from Redis (e.g., server crash, network issues, or bugs where hostname
 * was used instead of dbTunnelId).
 *
 * A tunnel is considered stale if:
 * 1. Its `tunnel:last_seen:{id}` key has expired (doesn't exist), OR
 * 2. The ID is not a valid UUID (legacy bug - hostname was used instead of dbTunnelId)
 */
async function cleanupStaleTunnels() {
  if (isCleaning) {
    console.warn("Skipping cleanup: previous run still active");
    return;
  }
  isCleaning = true;

  try {
    console.log("Cleaning up stale tunnel entries...");
    let totalRemoved = 0;
    let totalChecked = 0;

    // UUID regex pattern
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Get all org IDs with online tunnels from global index (O(1) lookup)
    const orgIds = await redis.smembers("global:orgs_with_online_tunnels");

    for (const orgId of orgIds) {
      const setKey = `org:${orgId}:online_tunnels`;
      // Get all members of this set
      const members = await redis.smembers(setKey);

      for (const tunnelId of members) {
        totalChecked++;

        // Check if this is a valid UUID (dbTunnelId) or a hostname (legacy bug)
        if (!uuidPattern.test(tunnelId)) {
          // This is a hostname, not a UUID - it's a stale entry from the old bug
          await redis.srem(setKey, tunnelId);
          console.log(
            `Removed stale hostname entry: ${tunnelId} from ${setKey}`,
          );
          totalRemoved++;
          continue;
        }

        // Check if the tunnel:last_seen key exists (valid UUID entries)
        const lastSeenKey = `tunnel:last_seen:${tunnelId}`;
        const exists = await redis.exists(lastSeenKey);

        if (!exists) {
          // No last_seen key means the tunnel is offline but wasn't cleaned up
          await redis.srem(setKey, tunnelId);
          console.log(`Removed stale UUID entry: ${tunnelId} from ${setKey}`);
          totalRemoved++;
        }
      }

      // Remove org from global index if set is now empty
      const remaining = await redis.scard(setKey);
      if (remaining === 0) {
        await redis.srem("global:orgs_with_online_tunnels", orgId);
        console.log(`Removed empty org from global index: ${orgId}`);
      }
    }

    console.log(
      `Cleanup complete: checked ${totalChecked} entries, removed ${totalRemoved} stale entries`,
    );
  } catch (error) {
    console.error("Failed to cleanup stale tunnels:", error);
  } finally {
    isCleaning = false;
  }
}

async function sampleActiveTunnels() {
  if (isSampling) {
    console.warn("Skipping sample: previous run still active");
    return;
  }
  isSampling = true;

  try {
    console.log("Sampling active tunnels...");
    const now = new Date();
    now.setSeconds(0, 0);
    const ts = now;

    let totalCount = 0;

    // Use global index for O(1) lookup instead of SCAN
    const orgIds = await redis.smembers("global:orgs_with_online_tunnels");
    for (const orgId of orgIds) {
      const count = await redis.scard(`org:${orgId}:online_tunnels`);
      totalCount += count;
    }

    console.log("Active tunnels:", totalCount);

    snapshots.log(activeTunnelSnapshot(ts, totalCount));
    await snapshots.flush();
    console.log(`Queued active tunnel snapshot: ${totalCount} tunnels`);
  } catch {
    console.error("Could not durably queue the active tunnel snapshot; buffered snapshots will retry");
  } finally {
    isSampling = false;
  }
}

/**
 * Rebuilds the global:orgs_with_online_tunnels index by scanning all org:*:online_tunnels sets.
 * This ensures backwards compatibility and handles cases where the index becomes out of sync.
 * Uses SCAN which is O(n) but runs infrequently (on startup and periodically).
 */
async function rebuildGlobalOrgIndex() {
  console.log("Rebuilding global org index...");
  try {
    const orgIdsFound = new Set<string>();

    // Scan all org:*:online_tunnels sets
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        "org:*:online_tunnels",
        "COUNT",
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        // Extract org ID from key format: org:{orgId}:online_tunnels
        const match = key.match(/^org:(.+):online_tunnels$/);
        if (match) {
          const orgId = match[1];
          const count = await redis.scard(key);
          if (count > 0) {
            orgIdsFound.add(orgId);
          }
        }
      }
    } while (cursor !== "0");

    // Update global index
    if (orgIdsFound.size > 0) {
      await redis.sadd(
        "global:orgs_with_online_tunnels",
        ...Array.from(orgIdsFound),
      );
    }

    // Clean up orgs that no longer have online tunnels
    const currentIndex = await redis.smembers(
      "global:orgs_with_online_tunnels",
    );
    for (const orgId of currentIndex) {
      if (!orgIdsFound.has(orgId)) {
        await redis.srem("global:orgs_with_online_tunnels", orgId);
      }
    }

    console.log(
      `Global org index rebuilt: ${orgIdsFound.size} orgs with online tunnels`,
    );
  } catch (error) {
    console.error("Failed to rebuild global org index:", error);
  }
}

async function start() {
  const instance = instanceConfig();
  if (instance.products.includes("observability")) startAlertWorkers();

  if (instance.products.includes("tunnels")) {
    try {
      await connectRedis();
      snapshots.start(tinybirdConfigured);
      if (!tinybirdConfigured) console.error("Tinybird tunnel ingestion is not configured; snapshots will remain queued in Redis");
      await rebuildGlobalOrgIndex();
      await sampleActiveTunnels();
      await cleanupStaleTunnels();
      timers.push(setInterval(sampleActiveTunnels, 60_000));
      timers.push(setInterval(cleanupStaleTunnels, 5 * 60_000));
      timers.push(setInterval(rebuildGlobalOrgIndex, 60 * 60_000));
    } catch (error) {
      console.error(
        "Tunnel analytics jobs are disabled; alert evaluation will continue",
        error,
      );
    }
  }
  if (instance.billingEnabled) {
    try {
      await chargePaystackSubscriptions();
      timers.push(setInterval(chargePaystackSubscriptions, 24 * 60 * 60_000));
    } catch (error) {
      console.error("Paystack subscription job failed to start", error);
    }
  }
}

start();

async function shutdown() {
  timers.forEach(clearInterval);
  try { await snapshots.shutdown(); }
  catch { console.error("Could not persist buffered tunnel snapshots before shutdown"); }
  await redis.quit().catch(() => undefined);
  process.exit(0);
}

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
