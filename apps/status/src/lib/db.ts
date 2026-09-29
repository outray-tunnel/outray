import pg from "pg";
import { getStatusConfig, requireProductionSecrets } from "./config";

const { Pool } = pg;
let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const config = getStatusConfig();
  requireProductionSecrets(config);
  const databaseHost = new URL(config.databaseUrl).hostname.toLowerCase();
  const localDatabase = databaseHost === "localhost" || databaseHost === "127.0.0.1" || databaseHost === "[::1]";
  pool = new Pool({
    connectionString: config.databaseUrl,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: localDatabase
      ? false
      : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  return pool;
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, [...values]);
  return result.rows;
}
