// Allow self-signed certificates for Tiger Data cloud
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { redis } from "./lib/redis";
import { pool, execute } from "./lib/tigerdata";
import { chargePaystackSubscriptions } from "./lib/paystack";

async function connectRedis() {
  await redis.connect();
  console.log("Connected to Redis");
}

async function connectTimescaleDB() {
  try {
    const client = await pool.connect();
    // Verify connection with a simple query
    await client.query("SELECT 1");
    console.log("Connected to TimescaleDB");
    client.release();
  } catch (error) {
    console.error("Failed to connect to TimescaleDB", error);
    process.exit(1);
  }
}

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

    // Insert into TimescaleDB
    try {
      await execute(
        "INSERT INTO active_tunnel_snapshots (ts, active_tunnels) VALUES ($1, $2)",
        [ts, totalCount],
      );
      console.log(`Inserted snapshot into TimescaleDB: ${totalCount} tunnels`);
    } catch (error) {
      console.error("Failed to insert into TimescaleDB", error);
    }
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
  await connectRedis();
  await connectTimescaleDB();

  // Rebuild global index on startup to ensure consistency
  await rebuildGlobalOrgIndex();

  // Initial run
  await sampleActiveTunnels();
  await cleanupStaleTunnels();

  // Sample active tunnels every minute
  setInterval(sampleActiveTunnels, 60_000);

  // Cleanup stale tunnel entries every 5 minutes
  setInterval(cleanupStaleTunnels, 5 * 60_000);

  // Rebuild global index every hour to ensure consistency
  setInterval(rebuildGlobalOrgIndex, 60 * 60_000);

  // Charge due Paystack subscriptions daily at midnight (run immediately on startup too)
  await chargePaystackSubscriptions();
  setInterval(chargePaystackSubscriptions, 24 * 60 * 60_000); // Every 24 hours
}

start();
