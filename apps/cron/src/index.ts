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
