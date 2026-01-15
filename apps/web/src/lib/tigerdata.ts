import pg from "pg";

const { Pool } = pg;

if (!process.env.TIGER_DATA_URL) {
  throw new Error("TIGER_DATA_URL environment variable is required");
}
const connectionString = process.env.TIGER_DATA_URL;
export const tigerData = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  try {
    const result = await tigerData.query(text, params);
    return result.rows as T[];
  } catch (error) {
    console.error("TimescaleDB query error:", error);
    throw error;
  }
}

export async function execute(text: string, params?: unknown[]): Promise<void> {
  try {
    await tigerData.query(text, params);
  } catch (error) {
    console.error("TimescaleDB execute error:", error);
    throw error;
  }
}

// Test connection function
export async function testConnection(): Promise<boolean> {
  try {
    const client = await tigerData.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("✅ TimescaleDB connection successful");
    return true;
  } catch (error) {
    console.error("❌ TimescaleDB connection failed:", error);
    return false;
  }
}
