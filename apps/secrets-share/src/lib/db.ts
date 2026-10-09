import pg from "pg";
import postgresConfig from "../../../../shared/postgres-ssl";

const { Pool } = pg;
let pool: pg.Pool | undefined;

export function shareDb(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env.SHARE_DATABASE_URL;
    if (!databaseUrl) throw new Error("SHARE_DATABASE_URL is required");
    pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      connectionTimeoutMillis: 3_000,
      ssl: postgresConfig.postgresSsl(databaseUrl, process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"),
    });
  }
  return pool;
}
