import { createClient } from "@clickhouse/client";
import Redis from "ioredis";
import dotenv from "dotenv";
import path from "path";

function getBandwidthKey(organizationId: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `bw:${organizationId}:${year}-${month}`;
}

// Load environment variables from apps/web/.env
dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env") });

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const redis = new Redis(redisUrl);

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
  database: process.env.CLICKHOUSE_DATABASE || "default",
});

async function recalculateBandwidth() {
  console.log("Starting bandwidth recalculation...");

  try {
    // Get current month's bandwidth usage per organization
    const query = `
      SELECT
        organization_id,
        sum(bytes_in + bytes_out) as total_bandwidth
      FROM tunnel_events
      WHERE toStartOfMonth(timestamp) = toStartOfMonth(now())
      GROUP BY organization_id
    `;

    const resultSet = await clickhouse.query({
      query,
      format: "JSONEachRow",
    });

    const rows = await resultSet.json<{
      organization_id: string;
      total_bandwidth: string;
    }>();

    console.log(`Found ${rows.length} organizations with activity this month.`);

    for (const row of rows) {
      const { organization_id, total_bandwidth } = row;

      if (!organization_id) continue;

      const key = getBandwidthKey(organization_id);
      const bandwidth = parseInt(total_bandwidth, 10);

      console.log(`Updating ${organization_id}: ${bandwidth} bytes`);

      // Set the value in Redis
      // We use set instead of incr because we are recalculating the total
      await redis.set(key, bandwidth);
    }

    console.log("Bandwidth recalculation complete.");
  } catch (error) {
    console.error("Error recalculating bandwidth:", error);
  } finally {
    await redis.quit();
    await clickhouse.close();
  }
}

recalculateBandwidth();
