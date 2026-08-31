import pg from "pg";
import { config } from "../config";

const { Pool } = pg;

export const databasePool = new Pool({
  connectionString: config.databaseUrl,
  ssl: databaseSsl(config.databaseUrl),
  max: 10,
});

function databaseSsl(connectionString: string) {
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return false;
  return { rejectUnauthorized: config.databaseSslRejectUnauthorized };
}
