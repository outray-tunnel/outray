import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
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
    const schema = `telemetry_quota_${randomUUID().replaceAll("-", "")}`;
    const pool = new pg.Pool({
      connectionString: testDatabaseUrl,
      max: 10,
      connectionTimeoutMillis: 3000,
      query_timeout: 10_000,
      options: `-c search_path=${schema}`,
    });
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
    const october = new Date(Date.now() - 3 * 86400000);
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
      await pool.query(`CREATE TABLE organizations(id text PRIMARY KEY);
        CREATE TABLE uptime_status_pages(id text PRIMARY KEY,organization_id text,published boolean);
        CREATE TABLE secret_audit_events(id text PRIMARY KEY,organization_id text,created_at timestamptz,action text,result text,metadata jsonb);
        CREATE TABLE tunnels(id text PRIMARY KEY,organization_id text,created_at timestamp,protocol text);
        CREATE TABLE uptime_checks(id text PRIMARY KEY,organization_id text,checked_at timestamptz,success boolean);
        CREATE TABLE observability_alert_evaluations(id text PRIMARY KEY,organization_id text,evaluated_at timestamptz,status text);
        CREATE TABLE agent_threads(id uuid PRIMARY KEY,organization_id text);
        CREATE TABLE agent_runs(id uuid PRIMARY KEY,thread_id uuid,started_at timestamptz,status text,input_tokens integer,output_tokens integer);
        INSERT INTO organizations VALUES('org_pg'),('org_failure'),('org_month_boundary');`);
      for (const name of ["0039_permanent_product_usage", "0040_permanent_usage_reconciliation", "0041_permanent_usage_read_reconciliation"]) {
        await pool.query(readFileSync(new URL(`../../web/drizzle/${name}.sql`, import.meta.url), "utf8").replaceAll('"public".', `"${schema}".`));
      }
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
      const boundary = new Date(); boundary.setUTCHours(0, 0, 0, 0); boundary.setUTCDate(1);
      await Promise.all([
        admit(
          boundaryOrg,
          [boundaryRow],
          async () => {
            boundaryQueued++;
            await new Promise((resolve) => setTimeout(resolve, 20));
          },
          new Date(boundary.getTime() - 1),
        ),
        admit(
          boundaryOrg,
          [boundaryRow],
          async () => {
            boundaryQueued++;
          },
          boundary,
        ),
      ]);
      assert.equal(boundaryQueued, 1);
      assert.equal(
        await used(),
        expected + Buffer.byteLength(JSON.stringify(boundaryRow), "utf8"),
      );
      const permanent = await pool.query("SELECT metric,sum(value)::text AS value FROM organization_product_usage_daily GROUP BY metric");
      assert.equal(permanent.rows.find(r => r.metric === "observability.logs")?.value, "5");
      assert.equal(permanent.rows.find(r => r.metric === "observability.telemetry_bytes")?.value, String(await used()));
    } finally {
      // Only the random schema created above is removed; no app tables are touched.
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
