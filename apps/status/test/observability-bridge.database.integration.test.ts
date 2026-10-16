import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import pg from "pg";
import ts from "typescript";
import type { PublicIncident, PublicStatusPage } from "../src/lib/status-data";

const enabled = process.env.OUTRAY_RUN_DB_INTEGRATION === "1";

test("real public status SQL gates observability publication and preserves confirmed incident impact", { skip: !enabled }, async (t) => {
  const connectionString = process.env.OUTRAY_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Set OUTRAY_TEST_DATABASE_URL to a migrated disposable database");
  // Never use DATABASE_URL: this test creates fixtures and must remain local.
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase())) {
    throw new Error("This mutating public status test requires a disposable loopback database");
  }
  const pool = new pg.Pool({ connectionString, ssl: false });
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const pageId = randomUUID();
  const componentId = randomUUID();
  const hiddenComponentId = randomUUID();
  const hiddenGroupId = randomUUID();
  const hiddenGroupComponentId = randomUUID();
  const startedAt = new Date(Date.now() - 1_800_000);
  t.after(async () => {
    try {
      await pool.query("DELETE FROM organizations WHERE id = ANY($1::text[])", [[organizationId, otherOrganizationId]]);
    } finally { await pool.end(); }
  });
  await pool.query("INSERT INTO organizations (id,name,slug,created_at) VALUES ($1,'Public reader fixture',$1,NOW()),($2,'Other reader fixture',$2,NOW())", [organizationId, otherOrganizationId]);
  await pool.query("INSERT INTO uptime_status_pages (id,organization_id,slug,name,published) VALUES ($1,$2,$1,'Public services',true)", [pageId, organizationId]);
  await pool.query("INSERT INTO uptime_status_groups (id,organization_id,page_id,name,visible) VALUES ($1,$2,$3,'PRIVATE hidden group',false)", [hiddenGroupId, organizationId, pageId]);
  await pool.query(`INSERT INTO uptime_status_components
    (id,organization_id,page_id,name,manual_state,manual_updated_at,visible,group_id)
    VALUES ($1,$2,$3,'Customer API','operational',$4,true,NULL),
           ($5,$2,$3,'PRIVATE hidden component','operational',$4,false,NULL),
           ($6,$2,$3,'PRIVATE grouped component','operational',$4,true,$7)`,
  [componentId, organizationId, pageId, startedAt, hiddenComponentId, hiddenGroupComponentId, hiddenGroupId]);

  const createIncident = async (options: {
    publication?: "detected" | "published" | "ignored";
    title?: string | null;
    impact?: "degraded" | "outage" | null;
    tenantId?: string;
    associationTenantId?: string;
    associatedComponent?: string | null;
  } = {}) => {
    const incidentId = randomUUID();
    const tenantId = options.tenantId || organizationId;
    await pool.query(`INSERT INTO incidents
      (id,organization_id,source_type,source_id,status,uptime_publication_state,title,
       public_title,public_impact,recovery_confirmed,source_snapshot,started_at)
      VALUES ($1,$2,'observability_alert',$3,'open',$4,'PRIVATE api-secret.internal alert name',
              $5,$6,false,$7,$8)`, [
      incidentId, tenantId, randomUUID(), options.publication || "published",
      options.title === undefined ? "API response delays" : options.title,
      options.impact === undefined ? "degraded" : options.impact,
      { internalHost: "PRIVATE api-secret.internal", threshold: 99, log: "PRIVATE log contents" }, startedAt,
    ]);
    const associatedComponent = options.associatedComponent === undefined ? componentId : options.associatedComponent;
    if (associatedComponent) await pool.query(
      "INSERT INTO uptime_incident_components (organization_id,incident_id,component_id) VALUES ($1,$2,$3)",
      [options.associationTenantId || tenantId, incidentId, associatedComponent],
    );
    return incidentId;
  };
  const degradedIncidentId = await createIncident();
  const outageIncidentId = await createIncident({ title: "API unavailable", impact: "outage" });
  const privateIncidentIds = await Promise.all([
    createIncident({ publication: "detected", title: "PRIVATE unapproved detection", impact: "outage" }),
    createIncident({ publication: "ignored", title: "PRIVATE ignored detection", impact: "outage" }),
    createIncident({ title: null, impact: "outage" }),
    createIncident({ impact: null }),
    createIncident({ associatedComponent: null }),
    createIncident({ associatedComponent: hiddenComponentId, title: "PRIVATE hidden association" }),
    createIncident({ associatedComponent: hiddenGroupComponentId, title: "PRIVATE hidden group association" }),
    createIncident({ tenantId: otherOrganizationId, title: "PRIVATE other tenant" }),
    createIncident({ associationTenantId: otherOrganizationId, title: "PRIVATE malformed cross-tenant association" }),
  ]);
  const publishedUpdateId = randomUUID();
  await pool.query(`INSERT INTO uptime_incident_updates
    (id,organization_id,incident_id,note,status,published_at,created_at)
    VALUES ($1,$2,$3,'We are investigating slower API responses.','investigating',$4,$4),
           ($5,$2,$3,'PRIVATE unpublished draft','monitoring',NULL,NOW()),
           ($6,$7,$3,'PRIVATE other tenant update','monitoring',NOW(),NOW())`,
  [publishedUpdateId, organizationId, degradedIncidentId, startedAt, randomUUID(), randomUUID(), otherOrganizationId]);

  const page = {
    id: pageId, organization_id: organizationId, slug: pageId, name: "Public services",
    description: null, logo_url: null, accent_color: "#8367c7", published: true,
  };
  const source = await readFile(new URL("../src/lib/status-data.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as {
    loadPublicPage: (value: typeof page) => Promise<PublicStatusPage>;
    loadPublicIncident: (value: typeof page, id: string) => Promise<PublicIncident | null>;
    publishedIncidentStage: (incident: PublicIncident) => string;
  } };
  runInNewContext(compiled, {
    module, exports: module.exports, URL, Date, Buffer, process: { env: {} },
    require(specifier: string) {
      if (specifier === "./runtime") return { statusEnvironment: () => ({}), isStatusProduction: () => false };
      if (specifier === "./config") return { statusPageUrl: () => new URL(`https://${pageId}.status.example.net/`) };
      if (specifier === "./db") return {
        async query(statement: string, parameters: readonly unknown[]) {
          return (await pool.query(statement, [...parameters])).rows;
        },
      };
      throw new Error(`Unexpected public status dependency: ${specifier}`);
    },
  });
  const reader = module.exports;
  const load = () => reader.loadPublicPage(page);
  const resolve = async (incidentId: string, confirmed: boolean, status = "resolved") => pool.query(
    "UPDATE incidents SET status=$3,recovery_confirmed=$4,resolved_at=NOW() WHERE id=$1 AND organization_id=$2",
    [incidentId, organizationId, status, confirmed],
  );

  await t.test("only approved visible same-tenant incidents enter list, detail and canonical history", async () => {
    const result = await load();
    assert.equal(result.standaloneComponents.length, 1);
    assert.equal(result.groups.length, 0);
    assert.equal(result.standaloneComponents[0]?.state, "outage");
    assert.deepEqual(new Set(result.incidents.map((incident) => incident.id)), new Set([degradedIncidentId, outageIncidentId]));
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|api-secret\.internal|threshold|log contents/);
    const degraded = result.incidents.find((incident) => incident.id === degradedIncidentId);
    assert.equal(degraded?.title, "API response delays");
    assert.equal(degraded?.latestNote, "We are investigating slower API responses.");
    assert.equal(degraded?.updates.length, 1);
    assert.equal(degraded?.updates[0]?.id, publishedUpdateId);
    assert.deepEqual(new Set(result.standaloneComponents[0]?.history.at(-1)?.incidents.map((incident) => incident.id)), new Set([degradedIncidentId, outageIncidentId]));
    const detail = await reader.loadPublicIncident(page, degradedIncidentId);
    assert.equal(detail?.id, degradedIncidentId);
    assert.equal(detail?.title, "API response delays");
    assert.equal(detail?.updates.length, 1);
    assert.equal(detail?.updates[0]?.id, publishedUpdateId);
    assert.doesNotMatch(JSON.stringify(detail), /PRIVATE|api-secret\.internal/);
    for (const incidentId of privateIncidentIds) assert.equal(await reader.loadPublicIncident(page, incidentId), null);
  });

  await t.test("unconfirmed canonical resolution and confirmed-but-open flags cannot restore impact", async () => {
    await resolve(outageIncidentId, false);
    let result = await load();
    assert.equal(result.standaloneComponents[0]?.state, "outage");
    let incident = result.incidents.find((incident) => incident.id === outageIncidentId);
    assert.equal(incident?.status, "open");
    assert.equal(incident?.resolvedAt, null);
    await resolve(outageIncidentId, true, "open");
    result = await load();
    assert.equal(result.standaloneComponents[0]?.state, "outage");
    incident = result.incidents.find((incident) => incident.id === outageIncidentId);
    assert.equal(incident?.status, "open");
    assert.equal(incident?.resolvedAt, null);
    const detail = await reader.loadPublicIncident(page, outageIncidentId);
    assert.equal(detail?.status, "open");
    assert.equal(detail?.resolvedAt, null);
  });

  await t.test("confirmed recovery releases only that incident and never overwrites manual health", async () => {
    await resolve(degradedIncidentId, true);
    assert.equal((await load()).standaloneComponents[0]?.state, "outage", "the other active outage wins");
    await resolve(outageIncidentId, true);
    let result = await load();
    assert.equal(result.standaloneComponents[0]?.state, "operational");
    assert.ok(result.incidents.every((incident) => incident.status === "resolved" && incident.resolvedAt));
    assert.equal(reader.publishedIncidentStage(result.incidents[0]!), "recovered");
    assert.equal((await pool.query("SELECT manual_state FROM uptime_status_components WHERE id=$1 AND organization_id=$2", [componentId, organizationId])).rows[0]?.manual_state, "operational");
    await pool.query("UPDATE uptime_status_components SET manual_state='outage' WHERE id=$1 AND organization_id=$2", [componentId, organizationId]);
    assert.equal((await load()).standaloneComponents[0]?.state, "outage");
    await pool.query("UPDATE uptime_status_components SET manual_state='unknown',manual_updated_at=NULL WHERE id=$1 AND organization_id=$2", [componentId, organizationId]);
    result = await load();
    assert.equal(result.standaloneComponents[0]?.state, "unknown", "missing monitoring evidence is not operational");
  });

  await t.test("status-only manual declarations without components are public but hidden links and drafts stay private", async () => {
    const createManualIncident = async (options: {
      component?: string;
      associationTenantId?: string;
      published?: boolean;
      tenantId?: string;
    } = {}) => {
      const incidentId = randomUUID();
      const tenantId = options.tenantId ?? organizationId;
      await pool.query(`INSERT INTO incidents
        (id,organization_id,source_type,source_id,status,title,source_snapshot,started_at)
        VALUES ($1,$2,'uptime_manual',$1,'open','Manual service issue','{}',$3)`,
      [incidentId, tenantId, startedAt]);
      if (options.component) await pool.query(
        "INSERT INTO uptime_incident_components (organization_id,incident_id,component_id) VALUES ($1,$2,$3)",
        [options.associationTenantId ?? tenantId, incidentId, options.component],
      );
      await pool.query(`INSERT INTO uptime_incident_updates
        (id,organization_id,incident_id,note,body_json,status,published_at,created_at)
        VALUES ($1,$2,$3,'',NULL,'investigating',$4,$5)`,
      [randomUUID(), tenantId, incidentId, options.published === false ? null : startedAt, startedAt]);
      return incidentId;
    };
    const publicManualId = await createManualIncident();
    const excludedIds = await Promise.all([
      createManualIncident({ published: false }),
      createManualIncident({ component: hiddenComponentId }),
      createManualIncident({ component: hiddenGroupComponentId }),
      createManualIncident({ component: componentId, associationTenantId: otherOrganizationId }),
      createManualIncident({ tenantId: otherOrganizationId }),
    ]);
    const result = await load();
    const incident = result.incidents.find((candidate) => candidate.id === publicManualId);
    assert.ok(incident, "published unlinked manual declaration remains visible");
    assert.equal(incident.sourceType, "uptime_manual");
    assert.deepEqual(Array.from(incident.components), []);
    assert.equal(incident.latestNote, "");
    assert.equal(incident.updates.length, 1);
    assert.equal(incident.updates[0]?.note, "");
    assert.equal(incident.updates[0]?.body, null);
    assert.equal(reader.publishedIncidentStage(incident), "investigating");
    const detail = await reader.loadPublicIncident(page, publicManualId);
    assert.equal(detail?.id, publicManualId);
    assert.deepEqual(Array.from(detail?.components ?? []), []);
    assert.equal(detail?.updates[0]?.status, "investigating");
    assert.equal(result.standaloneComponents[0]?.state, "unknown", "unlinked declaration does not invent component impact");
    assert.ok(result.standaloneComponents[0]?.history.every((day) => day.incidents.every((entry) => entry.id !== publicManualId)));
    for (const incidentId of excludedIds) {
      assert.ok(result.incidents.every((candidate) => candidate.id !== incidentId));
      assert.equal(await reader.loadPublicIncident(page, incidentId), null);
    }
  });
});
