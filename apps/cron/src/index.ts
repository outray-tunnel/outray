// Allow self-signed certificates for Tiger Data cloud
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { redis } from "./lib/redis";
import { pool, execute } from "./lib/tigerdata";

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

    // Use global counter for O(1) lookup instead of O(n) SCAN
    const countStr = await redis.get("tunnel:global:online_count");
    if (countStr !== null) {
      totalCount = parseInt(countStr, 10) || 0;
    } else {
      // Fallback: counter doesn't exist yet, use SCAN (only happens on first run)
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          "tunnel:online:*",
          "COUNT",
          1000,
        );
        cursor = nextCursor;
        totalCount += keys.length;
      } while (cursor !== "0");
      // Initialize the counter for future runs
      await redis.set("tunnel:global:online_count", totalCount.toString());
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

async function start() {
  await connectRedis();
  await connectTimescaleDB();

  // Initial run
  await sampleActiveTunnels();

  setInterval(sampleActiveTunnels, 60_000);
}

start();
