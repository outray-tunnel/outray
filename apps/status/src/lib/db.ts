import pg from "pg";
import { getStatusConfig, requireProductionSecrets } from "./config";
import postgresConfig from "../../../../shared/postgres-ssl";
import { getStatusRuntime, statusEnvironment } from "./runtime";

const { Pool } = pg;
let pool: pg.Pool | undefined;
const workerPoolResource = Symbol("status-request-pool");

export function getPool(): pg.Pool {
  const runtime = getStatusRuntime();
  const requestPool = runtime?.resources.get(workerPoolResource) as pg.Pool | undefined;
  if (requestPool) return requestPool;
  if (!runtime && pool) return pool;
  const config = getStatusConfig();
  requireProductionSecrets(config);
  const nextPool = new Pool({
    connectionString: config.databaseUrl,
    max: runtime ? 2 : 8,
    idleTimeoutMillis: runtime ? 1_000 : 30_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    ssl: runtime?.env.HYPERDRIVE
      ? false
      : postgresConfig.postgresSsl(config.databaseUrl, statusEnvironment().DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"),
  });
  if (runtime) {
    runtime.resources.set(workerPoolResource, nextPool);
    runtime.onCleanup(() => nextPool.end());
  } else {
    pool = nextPool;
  }
  return nextPool;
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, [...values]);
  return result.rows;
}
