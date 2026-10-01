import pg from "pg";

const { Pool } = pg;
let pool: pg.Pool | undefined;

export function shareDb(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env.SHARE_DATABASE_URL;
    if (!databaseUrl) throw new Error("SHARE_DATABASE_URL is required");
    const host = new URL(databaseUrl).hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      connectionTimeoutMillis: 3_000,
      ssl: local ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
    });
  }
  return pool;
}
