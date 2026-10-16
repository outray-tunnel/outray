import pg, { type Pool, type PoolClient, type PoolConfig } from "pg";
import { config } from "./config";
import { postgresSsl } from "../../../shared/postgres-ssl";

export function databaseConnectionString(value: string): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  // pg lets URL query parameters override explicit client options. Preserve all
  // other URL settings (including SSL), but keep worker deadlines authoritative.
  for (const name of ["connect_timeout", "connectionTimeoutMillis", "query_timeout", "statement_timeout",
    "lock_timeout", "idle_in_transaction_session_timeout", "transaction_timeout"]) {
    url.searchParams.delete(name);
  }
  return url.toString();
}

export const databasePoolOptions: PoolConfig = {
  connectionString: databaseConnectionString(config.databaseUrl),
  ssl: config.databaseUrl ? postgresSsl(config.databaseUrl, config.sslRejectUnauthorized) : false,
  max: Math.max(3, config.concurrency + 2),
  // pg-pool applies this to both connection establishment and pool checkout.
  connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
  query_timeout: config.databaseQueryTimeoutMs,
  statement_timeout: config.databaseStatementTimeoutMs,
  lock_timeout: config.databaseLockTimeoutMs,
  idle_in_transaction_session_timeout: config.databaseIdleTransactionTimeoutMs,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
};

export const databasePool = new pg.Pool(databasePoolOptions);
databasePool.on("error", (error) => {
  // pg-pool already removes the failed idle connection before emitting this.
  console.error("[Uptime] Idle database connection failed", safeDatabaseError(error));
});

class DatabaseTimeoutError extends Error {
  constructor(readonly code: "DB_ACQUIRE_TIMEOUT" | "DB_TRANSACTION_TIMEOUT") {
    super(code);
  }
}

/** No exception text or arbitrary error fields may cross this logging boundary. */
export function safeDatabaseError(error: unknown): { code: string; category: string } {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const systemCodes = new Set([
    "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN",
    "DB_ACQUIRE_TIMEOUT", "DB_TRANSACTION_TIMEOUT",
  ]);
  const code = typeof candidate.code === "string" &&
    (/^[0-9A-Z]{5}$/.test(candidate.code) || systemCodes.has(candidate.code))
    ? candidate.code : "internal_error";
  const categories: Record<string, string> = {
    DB_ACQUIRE_TIMEOUT: "connection_timeout", DB_TRANSACTION_TIMEOUT: "transaction_timeout",
    "57014": "statement_timeout", "55P03": "lock_timeout", "25P03": "idle_transaction_timeout",
    "40P01": "deadlock", "40001": "serialization_failure", "23505": "unique_violation",
    "23503": "foreign_key_violation", "23502": "not_null_violation", "23514": "check_violation",
  };
  if (categories[code]) return { code, category: categories[code] };
  if (systemCodes.has(code) || code.startsWith("08")) return { code, category: "connection_error" };
  // Classify only known driver messages, emitting a fixed label, never the text.
  const message = typeof candidate.message === "string" ? candidate.message : "";
  if (/^Query read timeout$/.test(message)) return { code, category: "query_timeout" };
  if (/^(?:timeout exceeded when trying to connect|Connection terminated due to connection timeout)$/.test(message)) {
    return { code, category: "connection_timeout" };
  }
  if (/^(?:Connection terminated unexpectedly|Connection terminated|Client has encountered a connection error and is not queryable|Client was closed and is not queryable)$/.test(message)) {
    return { code, category: "connection_error" };
  }
  return { code, category: "database_error" };
}

type ConnectionPool = { connect(): Promise<PoolClient> };

async function acquireClient(pool: ConnectionPool, timeoutMs: number): Promise<PoolClient> {
  // Also protect callers against a non-settling pool implementation. The native
  // connection timeout above is still required to destroy connecting sockets.
  let expired = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      expired = true;
      reject(new DatabaseTimeoutError("DB_ACQUIRE_TIMEOUT"));
    }, timeoutMs);
    pool.connect().then((client) => {
      clearTimeout(timer);
      if (expired) client.release(true); // Never leak a checkout arriving after its caller gave up.
      else resolve(client);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function withDatabaseTransaction<T>(
  pool: ConnectionPool,
  work: (client: PoolClient, signal: AbortSignal) => Promise<T>,
  options: { acquireTimeoutMs?: number; transactionTimeoutMs?: number } = {},
): Promise<T> {
  const client = await acquireClient(pool, options.acquireTimeoutMs ?? config.databaseConnectionTimeoutMs);
  let closed = false;
  let discard = false;
  let hasFailure = false;
  let originalFailure: unknown;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let connectionFailed: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    const abort = (error: unknown) => {
      closed = true;
      discard = true;
      reject(hasFailure ? originalFailure : error);
      controller.abort(error);
    };
    timer = setTimeout(() => abort(new DatabaseTimeoutError("DB_TRANSACTION_TIMEOUT")),
      options.transactionTimeoutMs ?? config.databaseTransactionTimeoutMs);
    connectionFailed = (error) => abort(error);
    client.on("error", connectionFailed);
  });
  const transaction = (async () => {
    try {
      await client.query("BEGIN");
      const value = await work(client, controller.signal);
      if (closed) throw new DatabaseTimeoutError("DB_TRANSACTION_TIMEOUT");
      await client.query("COMMIT");
      return value;
    } catch (error) {
      hasFailure = true;
      originalFailure = error;
      discard = true;
      // A pg query read timeout does not cancel the underlying SQL. Destroy
      // that socket instead of queuing rollback behind an in-flight query.
      const category = safeDatabaseError(error).category;
      if (!closed && category !== "query_timeout" && category !== "connection_error") {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("[Uptime] Database rollback failed", safeDatabaseError(rollbackError));
        }
      }
      throw error;
    }
  })();
  try {
    return await Promise.race([transaction, deadline]);
  } catch (error) {
    discard = true;
    throw hasFailure ? originalFailure : error;
  } finally {
    closed = true;
    clearTimeout(timer!);
    client.removeListener("error", connectionFailed!);
    // release(true) removes the client and force-closes active queries in pg.
    // Failed transactions are never returned to the pool, even after rollback.
    client.release(discard);
  }
}

export async function closeDatabasePool(
  pool: Pick<Pool, "end">,
  timeoutMs = config.databaseShutdownTimeoutMs,
): Promise<"closed" | "timed_out" | "failed"> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<"timed_out">((resolve) => {
    timer = setTimeout(() => resolve("timed_out"), timeoutMs);
  });
  try {
    return await Promise.race([pool.end().then(() => "closed" as const), deadline]);
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer!);
  }
}

// The web workspace uses ESM while this worker builds CommonJS.
export default { safeDatabaseError, withDatabaseTransaction };
