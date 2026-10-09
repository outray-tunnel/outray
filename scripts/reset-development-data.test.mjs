import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertDevelopmentTargets, databaseIdentity, tinybirdBackupProjection } from "./reset-development-data.mjs";
import { buildTinybirdRecords } from "./seed-development.mjs";

const environment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://demo:synthetic-only@postgres-dev.example.test/primary",
  TIMESCALE_URL: "postgresql://demo:synthetic-only@timescale-dev.example.test/analytics",
  SHARE_DATABASE_URL: "postgresql://demo:synthetic-only@shares-dev.example.test/shares",
  REDIS_URL: "redis://:synthetic-only@redis-dev.example.test/0",
  TINYBIRD_BRANCH: "development",
};

test("the archived reset CLI refuses every mode before opening any store", () => {
  const script = fileURLToPath(new URL("./reset-development-data.mjs", import.meta.url));
  for (const mode of ["inspect", "backup", "reset", "refresh-primary-reset", "seed", "seed-telemetry", "verify"]) {
    const result = spawnSync(process.execPath, [script, mode], {
      // Also fail closed if the archival guard were ever accidentally removed.
      env: { NODE_ENV: "production" }, encoding: "utf8", timeout: 5_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Legacy development reset is disabled after the tunnel Tinybird migration/);
    assert.match(result.stderr, /no stores were opened/);
    assert.equal(result.stdout, "");
  }
});

test("development target identities exclude credentials, canonicalize default ports and preserve database names", () => {
  assert.equal(databaseIdentity(environment.DATABASE_URL), "postgres-dev.example.test:5432/primary");
  assert.equal(databaseIdentity("postgres://different:password@POSTGRES-DEV.EXAMPLE.TEST:5432/primary"), databaseIdentity(environment.DATABASE_URL));
  assert.equal(databaseIdentity("postgresql://demo@postgres-dev.example.test:5433/a%20database"), "postgres-dev.example.test:5433/a database");
  assert.equal(databaseIdentity("redis://:password@redis-dev.example.test"), "redis-dev.example.test:6379/0");
  assert.equal(databaseIdentity("rediss://different:password@redis-dev.example.test:6379/0"), databaseIdentity(environment.REDIS_URL));
  assert.notEqual(databaseIdentity("postgres://postgres-dev.example.test/primary"), databaseIdentity("postgres://postgres-dev.example.test/other"));
});

test("equivalent local, trailing-dot and numeric Redis database aliases have the same identity", () => {
  const local = databaseIdentity("postgres://localhost/primary");
  assert.equal(databaseIdentity("postgres://127.0.0.1:5432/primary"), local);
  assert.equal(databaseIdentity("postgres://[::1]:5432/primary"), local);
  assert.equal(databaseIdentity("postgres://POSTGRES-DEV.EXAMPLE.TEST./primary"), databaseIdentity(environment.DATABASE_URL));
  assert.equal(databaseIdentity("redis://redis-dev.example.test/00"), databaseIdentity(environment.REDIS_URL));
  assert.equal(databaseIdentity("redis://redis-dev.example.test/001"), databaseIdentity("redis://redis-dev.example.test/1"));
});

test("the guard requires all four explicit development services and returns only safe identities", () => {
  const targets = assertDevelopmentTargets(environment);
  assert.deepEqual(targets, {
    DATABASE_URL: databaseIdentity(environment.DATABASE_URL),
    TIMESCALE_URL: databaseIdentity(environment.TIMESCALE_URL),
    SHARE_DATABASE_URL: databaseIdentity(environment.SHARE_DATABASE_URL),
    REDIS_URL: databaseIdentity(environment.REDIS_URL),
  });
  assert.doesNotMatch(JSON.stringify(targets), /synthetic-only|demo:|password/);
  for (const name of ["DATABASE_URL", "TIMESCALE_URL", "SHARE_DATABASE_URL", "REDIS_URL"]) {
    assert.throws(() => assertDevelopmentTargets({ ...environment, [name]: "" }), /required/);
  }
  assert.throws(() => assertDevelopmentTargets({ ...environment, NODE_ENV: "production" }), /Production mode/);
  assert.throws(() => assertDevelopmentTargets({ ...environment, TINYBIRD_BRANCH: "next" }), /development/);
  assert.throws(() => assertDevelopmentTargets({ ...environment, TINYBIRD_BRANCH: "main" }), /development/);
});

test("misleading development hostnames, wrong protocols and missing SQL databases fail closed", () => {
  for (const host of ["production.example.test", "devil.example.test", "mydevelopmentserver.example.test"]) {
    assert.throws(() => assertDevelopmentTargets({ ...environment, DATABASE_URL: `postgres://demo@${host}/primary` }), /development host/);
  }
  for (const name of ["DATABASE_URL", "TIMESCALE_URL", "SHARE_DATABASE_URL"]) {
    assert.throws(() => assertDevelopmentTargets({ ...environment, [name]: "https://postgres-dev.example.test/primary" }), /invalid protocol/);
    assert.throws(() => assertDevelopmentTargets({ ...environment, [name]: "postgres://postgres-dev.example.test" }), /explicit database/);
  }
  assert.throws(() => assertDevelopmentTargets({ ...environment, REDIS_URL: "postgres://redis-dev.example.test/0" }), /invalid protocol/);
});

test("routing overrides are rejected rather than allowing drivers to connect outside the compared target", () => {
  for (const key of ["host", "hostaddr", "port", "dbname", "database", "service", "servicefile", "options", "HOST", "Port"]) {
    for (const name of ["DATABASE_URL", "TIMESCALE_URL", "SHARE_DATABASE_URL", "REDIS_URL"]) {
      assert.throws(() => assertDevelopmentTargets({ ...environment, [name]: `${environment[name]}?${key}=untrusted` }), /routing overrides/);
    }
  }
  assert.throws(() => assertDevelopmentTargets({ ...environment, REDIS_URL: "redis://redis-dev.example.test?db=1" }), /routing overrides/);
  assert.throws(() => assertDevelopmentTargets({ ...environment, REDIS_URL: "redis://redis-dev.example.test/0?path=%2Ftmp%2Fredis.sock" }), /routing overrides/);
  for (const path of ["-1", "not-a-database", "1.5"]) {
    assert.throws(() => assertDevelopmentTargets({ ...environment, REDIS_URL: `redis://redis-dev.example.test/${path}` }), /database|identity|target/i);
  }
});

test("each development service is compared with every production URL, even with different credentials", () => {
  const names = ["DATABASE_URL", "TIMESCALE_URL", "SHARE_DATABASE_URL", "REDIS_URL"];
  for (const name of names) {
    for (const productionName of names) {
      const productionUrl = new URL(environment[name]);
      productionUrl.username = "another-user";
      productionUrl.password = "another-password";
      assert.throws(() => assertDevelopmentTargets(environment, { [productionName]: productionUrl.toString() }), /overlaps production/);
    }
  }
  assert.throws(() => assertDevelopmentTargets({ ...environment, DATABASE_URL: "postgres://demo@localhost/primary" }, { TIMESCALE_URL: "postgres://demo@127.0.0.1:5432/primary" }), /overlaps production/);
  assert.throws(() => assertDevelopmentTargets(environment, { REDIS_URL: "rediss://redis-dev.example.test:6379/00" }), /overlaps production/);
  assert.throws(() => assertDevelopmentTargets(environment, { DATABASE_URL: "postgres://postgres-dev.example.test./primary" }), /overlaps production/);
});

test("Tinybird backup aliases exactly cover the records accepted by each ingestion schema", () => {
  const records = buildTinybirdRecords("offline-fixture", { spanCount: 1, spanTotal: 1, metricPoints: 1, metricTotal: 1 });
  for (const [source, record] of [["otel_spans", records.spans[0]], ["otel_logs", records.logs[0]], ["otel_metrics", records.metrics[0]]]) {
    const projection = tinybirdBackupProjection(source);
    const aliases = [...projection.matchAll(/`[^`]+` AS `([^`]+)`/g)].map((match) => match[1]);
    assert.equal(new Set(aliases).size, aliases.length);
    assert.deepEqual(aliases.sort(), Object.keys(record).sort());
    assert.match(projection, /`OrganizationId` AS `organization_id`/);
    assert.match(projection, /`IngestedAt` AS `ingested_at`/);
    assert.doesNotMatch(projection, /\[:\]|SELECT|WHERE|FORMAT/);
  }
  const spans = tinybirdBackupProjection("otel_spans");
  assert.match(spans, /`Timestamp` AS `start_time`/);
  assert.match(spans, /`EndTimestamp` AS `end_time`/);
  const metrics = tinybirdBackupProjection("otel_metrics");
  for (const [column, property] of [["BucketCounts", "bucket_counts"], ["ExplicitBounds", "explicit_bounds"], ["PositiveBucketCounts", "positive_bucket_counts"], ["NegativeBucketCounts", "negative_bucket_counts"], ["Quantiles", "quantiles"], ["QuantileValues", "quantile_values"]]) {
    assert.ok(metrics.includes(`\`${column}\` AS \`${property}\``));
  }
});

test("backup source names are a fixed allowlist, not arbitrary SQL or filesystem input", () => {
  for (const source of ["organizations", "../.env", "otel_logs; DROP TABLE otel_logs", "otel_spans/../../.env", "", null]) {
    assert.throws(() => tinybirdBackupProjection(source), /Unexpected Tinybird source/);
  }
});
