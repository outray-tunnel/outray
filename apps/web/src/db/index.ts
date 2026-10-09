import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { dashboardPoolOptions } from "../lib/dashboard-pool-options";
import { postgresSsl } from "../../../../shared/postgres-ssl";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const connectionString = process.env.DATABASE_URL;
export const pool = new Pool({
  ...dashboardPoolOptions,
  connectionString,
  ssl: databaseSsl(connectionString),
});

export const db = drizzle(pool, { schema });

function databaseSsl(value: string) {
  return postgresSsl(value, process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false");
}
