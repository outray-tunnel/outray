import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import pg, { type Pool, type PoolClient } from "pg";
import {
  closeDatabasePool, databaseConnectionString, databasePool, databasePoolOptions, safeDatabaseError, withDatabaseTransaction,
} from "../src/database";
import { monitorLeaseSeconds, pollMonitors } from "../src/worker";
import { config } from "../src/config";

class FakeClient extends EventEmitter {
  queries: string[] = [];
  releases: Array<boolean | undefined> = [];
  run: (sql: string) => Promise<unknown> = async () => ({ rows: [] });
  async query(sql: string) {
    this.queries.push(sql);
    return this.run(sql);
  }
  release(discard?: boolean) { this.releases.push(discard); }
  asPg() { return this as unknown as PoolClient; }
}

function fakePool(client: FakeClient) {
  return { connect: async () => client.asPg() };
}

test("all pool connection/query/server deadlines are enabled and fit below the monitor lease", () => {
  assert.equal(databasePoolOptions.connectionTimeoutMillis, 5_000);
  assert.equal(databasePoolOptions.query_timeout, 10_000);
  assert.equal(databasePoolOptions.statement_timeout, 8_000);
  assert.equal(databasePoolOptions.lock_timeout, 3_000);
  assert.equal(databasePoolOptions.idle_in_transaction_session_timeout, 20_000);
  assert.equal(databasePoolOptions.keepAlive, true);
  assert.equal(monitorLeaseSeconds, 60);
  const maximumCheckMs = 2 * config.databaseConnectionTimeoutMs + 2 * config.databaseQueryTimeoutMs +
    10_000 + config.databaseTransactionTimeoutMs;
  assert.ok(monitorLeaseSeconds * 1_000 >= maximumCheckMs + 5_000);
  assert.ok(monitorLeaseSeconds < 180, "a lost lease is retried before the dashboard evidence goes stale");
});

test("DATABASE_URL cannot disable worker deadlines and retains SSL/unrelated parameters", () => {
  const input = "postgresql://fixture:fake-password@db.example.test/fixture?sslmode=disable&application_name=uptime&query_timeout=0&query_timeout=999999&statement_timeout=0&lock_timeout=0&idle_in_transaction_session_timeout=0&transaction_timeout=0&connect_timeout=0&connectionTimeoutMillis=0";
  const output = databaseConnectionString(input);
  assert.ok(output);
  const url = new URL(output);
  assert.deepEqual([...url.searchParams], [["sslmode", "disable"], ["application_name", "uptime"]]);
  assert.equal(url.hostname, "db.example.test");
  assert.equal(url.username, "fixture");
  assert.equal(url.password, "fake-password");
  const client = new pg.Client({ ...databasePoolOptions, connectionString: output });
  const actual = (client as unknown as { connectionParameters: Record<string, unknown> }).connectionParameters;
  assert.equal(actual.query_timeout, config.databaseQueryTimeoutMs);
  assert.equal(actual.statement_timeout, config.databaseStatementTimeoutMs);
  assert.equal(actual.lock_timeout, config.databaseLockTimeoutMs);
  assert.equal(actual.idle_in_transaction_session_timeout, config.databaseIdleTransactionTimeoutMs);
  assert.equal(actual.ssl, false);
});

test("successful transaction commits and returns a healthy client exactly once", async () => {
  const client = new FakeClient();
  const result = await withDatabaseTransaction(fakePool(client), async (connection) => {
    await connection.query("UPDATE test");
    return 123;
  });
  assert.equal(result, 123);
  assert.deepEqual(client.queries, ["BEGIN", "UPDATE test", "COMMIT"]);
  assert.deepEqual(client.releases, [false]);
  assert.equal(client.listenerCount("error"), 0);
});

test("acquisition timeout discards a late client and allows the next attempt to recover", async () => {
  let finishAcquire: (client: PoolClient) => void;
  const blockedPool = { connect: () => new Promise<PoolClient>((resolve) => { finishAcquire = resolve; }) };
  await assert.rejects(withDatabaseTransaction(blockedPool, async () => {}, { acquireTimeoutMs: 10 }),
    { code: "DB_ACQUIRE_TIMEOUT" });
  const lateClient = new FakeClient();
  finishAcquire!(lateClient.asPg());
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(lateClient.releases, [true]);
  const nextClient = new FakeClient();
  await withDatabaseTransaction(fakePool(nextClient), async () => {});
  assert.deepEqual(nextClient.releases, [false]);
});

test("a transaction deadline discards an in-flight client without rollback or commit", async () => {
  const client = new FakeClient();
  let finishQuery: (value: unknown) => void;
  client.run = (sql) => sql === "UPDATE test"
    ? new Promise((resolve) => { finishQuery = resolve; }) : Promise.resolve({ rows: [] });
  await assert.rejects(withDatabaseTransaction(fakePool(client), async (connection) => {
    await connection.query("UPDATE test");
  }, { transactionTimeoutMs: 10 }), { code: "DB_TRANSACTION_TIMEOUT" });
  assert.deepEqual(client.releases, [true]);
  finishQuery!({ rows: [] });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(client.queries, ["BEGIN", "UPDATE test"]);
  assert.equal(client.listenerCount("error"), 0);
});

test("the transaction deadline aborts external work before discarding its consent-lock client", async () => {
  const client = new FakeClient();
  let aborted = false;
  await assert.rejects(withDatabaseTransaction(fakePool(client), async (_connection, signal) => {
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        assert.deepEqual(client.releases, [], "abort is requested while the transaction still owns its lock");
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    });
  }, { transactionTimeoutMs: 10 }), { code: "DB_TRANSACTION_TIMEOUT" });
  assert.equal(aborted, true);
  assert.deepEqual(client.releases, [true]);
  assert.deepEqual(client.queries, ["BEGIN"]);
});

test("driver query read timeout does not enqueue rollback behind the still-running SQL", async () => {
  const client = new FakeClient();
  const failure = new Error("Query read timeout");
  client.run = async (sql) => {
    if (sql === "UPDATE test") throw failure;
    return { rows: [] };
  };
  await assert.rejects(withDatabaseTransaction(fakePool(client), async (connection) => {
    await connection.query("UPDATE test");
  }), (error) => error === failure);
  assert.deepEqual(client.queries, ["BEGIN", "UPDATE test"]);
  assert.deepEqual(client.releases, [true]);
});

test("failed rollback cannot mask the original error or leak exception details", async (context) => {
  const log = context.mock.method(console, "error", () => {});
  const client = new FakeClient();
  const failure = Object.assign(new Error("SQL parameter https://user:password@private.example?token=secret"), { code: "23505" });
  client.run = async (sql) => {
    if (sql === "UPDATE test") throw failure;
    if (sql === "ROLLBACK") throw Object.assign(new Error("Authorization: Bearer credential"), { code: "ECONNRESET" });
    return { rows: [] };
  };
  await assert.rejects(withDatabaseTransaction(fakePool(client), async (connection) => {
    await connection.query("UPDATE test");
  }), (error) => error === failure);
  assert.deepEqual(client.queries, ["BEGIN", "UPDATE test", "ROLLBACK"]);
  assert.deepEqual(client.releases, [true]);
  assert.deepEqual(log.mock.calls[0].arguments,
    ["[Uptime] Database rollback failed", { code: "ECONNRESET", category: "connection_error" }]);
  assert.doesNotMatch(JSON.stringify(log.mock.calls.map((call) => call.arguments)), /password|secret|Bearer|credential/);
});

test("even a hanging rollback preserves the original failure when the transaction deadline fires", async () => {
  const client = new FakeClient();
  const failure = Object.assign(new Error("private SQL data"), { code: "23503" });
  client.run = (sql) => {
    if (sql === "UPDATE test") return Promise.reject(failure);
    if (sql === "ROLLBACK") return new Promise(() => {});
    return Promise.resolve({ rows: [] });
  };
  await assert.rejects(withDatabaseTransaction(fakePool(client), async (connection) => {
    await connection.query("UPDATE test");
  }, { transactionTimeoutMs: 10 }), (error) => error === failure);
  assert.deepEqual(client.releases, [true]);
});

test("checked-out connection errors reject the transaction and discard its client", async () => {
  const client = new FakeClient();
  const failure = Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
  await assert.rejects(withDatabaseTransaction(fakePool(client), async () => {
    client.emit("error", failure);
    return new Promise(() => {});
  }), (error) => error === failure);
  assert.deepEqual(client.releases, [true]);
  assert.equal(client.listenerCount("error"), 0);
});

test("diagnostics preserve SQLSTATE and classify known driver messages without logging source text", () => {
  assert.deepEqual(safeDatabaseError({ code: "57014", message: "SQL credentials" }),
    { code: "57014", category: "statement_timeout" });
  assert.deepEqual(safeDatabaseError(new Error("Query read timeout")),
    { code: "internal_error", category: "query_timeout" });
  assert.deepEqual(safeDatabaseError(new Error("timeout exceeded when trying to connect")),
    { code: "internal_error", category: "connection_timeout" });
  const diagnostics = safeDatabaseError({ code: "https://credential@private.example", message: "Bearer secret", detail: "SQL value" });
  assert.deepEqual(diagnostics, { code: "internal_error", category: "database_error" });
  assert.doesNotMatch(JSON.stringify(diagnostics), /https|credential|Bearer|secret|SQL value/);
});

test("idle pool errors are safely handled, and a failed monitor poll does not latch subsequent polls", async (context) => {
  const log = context.mock.method(console, "error", () => {});
  databasePool.emit("error", Object.assign(new Error("private host"), { code: "ECONNRESET" }));
  let attempts = 0;
  context.mock.method(databasePool, "query", async (sql: string, values: unknown[]) => {
    attempts += 1;
    if (attempts === 1) throw new Error("Query read timeout");
    assert.match(sql, /lease_until = NOW\(\) \+ \(\$3 \* INTERVAL '1 second'\)/);
    assert.equal(values[2], monitorLeaseSeconds);
    return { rows: [] };
  });
  await pollMonitors();
  await pollMonitors();
  assert.equal(attempts, 2);
  assert.deepEqual(log.mock.calls.map((call) => call.arguments), [
    ["[Uptime] Idle database connection failed", { code: "ECONNRESET", category: "connection_error" }],
    ["[Uptime] Monitor poll failed", { code: "internal_error", category: "query_timeout" }],
  ]);
});

test("shutdown is bounded even with a checked-out connection that never returns", async () => {
  const hangingPool = { end: () => new Promise<void>(() => {}) } as unknown as Pick<Pool, "end">;
  assert.equal(await closeDatabasePool(hangingPool, 10), "timed_out");
  const closedPool = { end: async () => {} } as unknown as Pick<Pool, "end">;
  assert.equal(await closeDatabasePool(closedPool, 10), "closed");
});
