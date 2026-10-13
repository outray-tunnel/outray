import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import pg from "pg";
import ts from "typescript";
import * as alertState from "../src/lib/alert-state";

const enabled = process.env.OUTRAY_RUN_DB_INTEGRATION === "1";

test("the real evaluator snapshots one private incident and confirms recovery only from consecutive healthy evidence", { skip: !enabled }, async (t) => {
  const connectionString = process.env.OUTRAY_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Set OUTRAY_TEST_DATABASE_URL to a migrated disposable database");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("This mutating worker test requires a disposable loopback database");
  }
  const pool = new pg.Pool({ connectionString, ssl: false });
  const organizationId = randomUUID();
  const alertId = randomUUID();
  const componentId = randomUUID();
  const pageId = randomUUID();
  const leaseOwner = `bridge-test-${randomUUID()}`;
  t.after(async () => {
    try { await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId]); }
    finally { await pool.end(); }
  });
  await pool.query("INSERT INTO organizations (id,name,slug,created_at) VALUES ($1,'Bridge fixture',$1,NOW())", [organizationId]);
  await pool.query("INSERT INTO uptime_status_pages (id,organization_id,slug,name,published) VALUES ($1,$2,$1,'Public services',true)", [pageId, organizationId]);
  await pool.query("INSERT INTO uptime_status_components (id,organization_id,page_id,name,manual_state) VALUES ($1,$2,$3,'Customer API','operational')", [componentId, organizationId, pageId]);
  await pool.query(`INSERT INTO observability_alerts
    (id,organization_id,name,signal,service,operator,threshold,window_minutes,status_page_public_title,status_page_impact)
    VALUES ($1,$2,'PRIVATE api-secret.internal error query','request_error_rate','orders-api','gt',5,5,'API performance issue','degraded')`, [alertId, organizationId]);
  await pool.query("INSERT INTO uptime_component_alerts (organization_id,component_id,alert_id) VALUES ($1,$2,$3)", [organizationId, componentId, alertId]);

  const source = await readFile(new URL("../src/lib/alerts.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { persistMeasurement, persistEvaluationError };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, (...args: unknown[]) => Promise<void>> };
  runInNewContext(compiled, {
    module, exports: module.exports, Date, console, Set,
    require: (specifier: string) => {
      if (specifier === "node:crypto") return { randomUUID };
      if (specifier === "./alert-state") return alertState;
      if (specifier === "./database") return { databasePool: pool };
      if (specifier === "../config") return { config: {} };
      if (["./alert-evaluator", "./alert-email", "./alert-webhook", "./alert-webhook-crypto"].includes(specifier)) return {};
      throw new Error(`Unexpected worker dependency ${specifier}`);
    },
  });
  const claimed = { id: alertId, leaseOwner };
  let window = 0;
  const measure = async (observation: "breach" | "healthy" | "no_data") => {
    await pool.query("UPDATE observability_alerts SET lease_owner=$2 WHERE id=$1", [alertId, leaseOwner]);
    const evaluationEnd = new Date(Date.now() - 600_000 + ++window * 60_000);
    await module.exports.persistMeasurement(claimed, {
      observation, value: observation === "no_data" ? null : observation === "breach" ? 12 : 0,
      sampleCount: observation === "no_data" ? 0 : 100,
      breached: observation === "no_data" ? null : observation === "breach",
      evaluationEnd, windowStart: new Date(evaluationEnd.getTime() - 300_000),
    }, 2);
  };
  const incident = async () => (await pool.query("SELECT * FROM incidents WHERE organization_id=$1 AND source_id=$2", [organizationId, alertId])).rows;
  await measure("breach");
  assert.equal((await incident()).length, 0);
  await measure("breach");
  const [opened] = await incident();
  assert.ok(opened);
  assert.equal(opened.uptime_publication_state, "detected");
  assert.equal(opened.public_title, "API performance issue");
  assert.equal(opened.public_impact, "degraded");
  assert.equal(opened.recovery_confirmed, false);
  assert.match(opened.title, /PRIVATE/);
  assert.equal((await pool.query("SELECT component_id FROM uptime_incident_components WHERE incident_id=$1", [opened.id])).rows[0].component_id, componentId);
  assert.equal((await pool.query("SELECT manual_state FROM uptime_status_components WHERE id=$1", [componentId])).rows[0].manual_state, "operational");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM notifications WHERE incident_id=$1", [opened.id])).rows[0].count, 0);
  await measure("breach");
  assert.equal((await incident()).length, 1, "repeated firing reuses the canonical incident");
  for (const policy of ["no_data", "healthy", "alerting"]) {
    await pool.query("UPDATE observability_alerts SET no_data_state=$2 WHERE id=$1", [alertId, policy]);
    await measure("no_data");
    assert.equal((await incident())[0].status, "open", `${policy} cannot announce customer recovery`);
  }
  await measure("healthy");
  assert.equal((await incident())[0].status, "open");
  await pool.query("UPDATE observability_alerts SET lease_owner=$2 WHERE id=$1", [alertId, leaseOwner]);
  const evaluationEnd = new Date(Date.now() - 600_000 + ++window * 60_000);
  await module.exports.persistEvaluationError(claimed, "query unavailable", 2, {
    evaluationEnd, windowStart: new Date(evaluationEnd.getTime() - 300_000),
  });
  assert.equal((await pool.query("SELECT recovery_streak FROM observability_alerts WHERE id=$1", [alertId])).rows[0].recovery_streak, 0);
  await measure("healthy");
  assert.equal((await incident())[0].status, "open");
  await measure("healthy");
  const [recovered] = await incident();
  assert.equal(recovered.id, opened.id);
  assert.equal(recovered.status, "resolved");
  assert.equal(recovered.recovery_confirmed, true);
  assert.ok(recovered.resolved_at);
});
