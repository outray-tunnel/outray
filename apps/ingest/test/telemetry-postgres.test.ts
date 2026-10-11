import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import test from "node:test";
import pg from "pg";
import {
  enqueueWithTelemetryQuota,
  TelemetryQuotaExceeded,
} from "../src/telemetry-usage.js";
import type { IngestAuthContext } from "../src/auth.js";

// Explicit opt-in only: never read .env or reuse the app's DATABASE_URL.
const testDatabaseUrl = process.env.TELEMETRY_TEST_DATABASE_URL;
test(
  "isolated PostgreSQL telemetry admission: concurrency, rollback, dedup and month boundary",
  {
    skip: !testDatabaseUrl,
  },
  async () => {
    const url = new URL(testDatabaseUrl!);
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      "quota integration test must use local PostgreSQL",
    );
    assert.match(
      url.pathname,
      /^\/telemetry_test(?:_[a-zA-Z0-9_]+)?$/,
      "use an explicitly named throwaway telemetry_test database",
    );
    const pool = new pg.Pool({
      connectionString: testDatabaseUrl,
      max: 10,
      connectionTimeoutMillis: 3000,
      query_timeout: 10_000,
    });
    const schema = `telemetry_quota_${randomUUID().replaceAll("-", "")}`;
    const auth: IngestAuthContext = {
      organizationId: "org_pg",
      tokenId: "token_pg",
      retentionDays: 30,
      telemetryBytesPerMonth: 1024 ** 3,
    };
    const row = (index: number) => ({
      organization_id: auth.organizationId,
      event_id: String(index).padStart(4, "0"),
      ingested_at: "2026-10-15T00:00:00.000Z",
      retention_days: 30,
      body: "local quota check 🔒",
    });
    const size = Buffer.byteLength(JSON.stringify(row(0)), "utf8");
    const october = new Date("2026-10-15T00:00:00Z");
    async function admit(
      context: IngestAuthContext,
      rows: ReturnType<typeof row>[],
      enqueue: (rows: ReturnType<typeof row>[]) => Promise<void>,
      time = october,
    ) {
      const client = await pool.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        await enqueueWithTelemetryQuota(
          client,
          context,
          "logs",
          rows,
          enqueue,
          time,
        );
      } finally {
        client.release();
      }
    }
    async function used() {
      const result = await pool.query<{ used: string }>(
        `SELECT COALESCE(SUM(used), 0)::text AS used FROM "${schema}".organization_monthly_usage`,
      );
      return Number(result.rows[0].used);
    }
    try {
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(`CREATE TABLE "${schema}".organization_monthly_usage (
      organization_id text NOT NULL, month date NOT NULL, metric text NOT NULL,
      used bigint NOT NULL DEFAULT 0 CHECK (used >= 0), updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, month, metric)
    )`);
      await pool.query(`CREATE TABLE "${schema}".organization_telemetry_receipts (
      organization_id text NOT NULL, receipt_key text NOT NULL, month date NOT NULL,
      bytes bigint NOT NULL CHECK (bytes >= 0), status text NOT NULL DEFAULT 'accepted',
      created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, receipt_key)
    )`);
      let queued = 0;
      const limited = { ...auth, telemetryBytesPerMonth: size * 3 };
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, index) =>
          admit(limited, [row(index)], async () => {
            queued++;
          }),
        ),
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        3,
      );
      assert.equal(
        results.filter(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof TelemetryQuotaExceeded,
        ).length,
        5,
      );
      assert.equal(queued, 3);
      assert.equal(await used(), size * 3);
      const receipts = await pool.query<{ receipt_key: string }>(
        `SELECT receipt_key FROM "${schema}".organization_telemetry_receipts`,
      );
      assert.equal(receipts.rows.length, 3);

      // A distinct org verifies queue failure rollback independently of quota.
      const failedOrg = { ...auth, organizationId: "org_failure" };
      const failedRow = {
        ...row(10),
        organization_id: failedOrg.organizationId,
      };
      await assert.rejects(
        admit(failedOrg, [failedRow], async () => {
          throw new Error("queue failed");
        }),
        /queue failed/,
      );
      assert.equal(await used(), size * 3);
      await admit(failedOrg, [failedRow], async () => {});
      const expected =
        size * 3 + Buffer.byteLength(JSON.stringify(failedRow), "utf8");
      assert.equal(await used(), expected);
      await admit(
        failedOrg,
        [{ ...failedRow, ingested_at: "2026-10-16T00:00:00.000Z" }],
        async () => {
          assert.fail("SDK retry must reuse receipt");
        },
      );
      assert.equal(await used(), expected);

      // Two monthly counter rows still share a scoped org admission lock/receipt.
      const boundaryOrg = { ...auth, organizationId: "org_month_boundary" };
      const boundaryRow = {
        ...row(20),
        organization_id: boundaryOrg.organizationId,
      };
      let boundaryQueued = 0;
      await Promise.all([
        admit(
          boundaryOrg,
          [boundaryRow],
          async () => {
            boundaryQueued++;
            await new Promise((resolve) => setTimeout(resolve, 20));
          },
          new Date("2026-10-31T23:59:59.999Z"),
        ),
        admit(
          boundaryOrg,
          [boundaryRow],
          async () => {
            boundaryQueued++;
          },
          new Date("2026-11-01T00:00:00.000Z"),
        ),
      ]);
      assert.equal(boundaryQueued, 1);
      assert.equal(
        await used(),
        expected + Buffer.byteLength(JSON.stringify(boundaryRow), "utf8"),
      );
    } finally {
      // Only the random schema created above is removed; no app tables are touched.
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
