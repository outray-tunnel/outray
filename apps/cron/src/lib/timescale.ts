import pg from "pg";
import { config } from "../config";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.tigerDataUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function execute(text: string, params?: unknown[]): Promise<void> {
  await pool.query(text, params);
}
