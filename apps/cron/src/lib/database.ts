import pg from "pg";
import { config } from "../config";
import { postgresSsl } from "../../../../shared/postgres-ssl";

const { Pool } = pg;

export const databasePool = new Pool({
  connectionString: config.databaseUrl,
  ssl: databaseSsl(config.databaseUrl),
  max: 10,
});

function databaseSsl(connectionString: string) {
  return postgresSsl(connectionString, config.databaseSslRejectUnauthorized);
}
