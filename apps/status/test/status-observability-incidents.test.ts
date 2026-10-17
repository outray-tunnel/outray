import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { PublicIncident, PublicStatusPage } from "../src/lib/status-data";

const page = {
  id: "page-1", organization_id: "organization-1", slug: "acme", name: "Acme status",
  description: null, logo_url: null, accent_color: "#8367c7", published: true,
};
const component = {
  id: "component-1", group_id: null, name: "API", description: null, sort_order: 0,
  manual_state: "operational", manual_updated_at: new Date(Date.now() - 3_600_000),
};
const source = readFileSync(new URL("../src/lib/status-data.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function publicReaderFixture(options: {
  published?: boolean;
  safeTitle?: string | null;
  impact?: string | null;
  sameOrganization?: boolean;
  visibleAssociation?: boolean;
  recoveryConfirmed?: boolean;
  canonicalStatus?: "open" | "resolved";
  baseState?: string;
  sourceType?: PublicIncident["sourceType"];
  noAssociations?: boolean;
  note?: string;
} = {}) {
  const incidentId = randomUUID();
  const approvedTitle = options.safeTitle === undefined ? "API response delays" : options.safeTitle;
  const impact = options.impact === undefined ? "degraded" : options.impact;
  const recoveryAt = new Date(Date.now() - 300_000);
  const confirmedRecovery = options.recoveryConfirmed && options.canonicalStatus !== "open";
  const sourceType = options.sourceType ?? "observability_alert";
  const hasVisibleAssociation = !options.noAssociations && options.visibleAssociation !== false;
  const eligible = options.published !== false && options.sameOrganization !== false &&
    (hasVisibleAssociation || (sourceType === "uptime_manual" && options.noAssociations)) &&
    (sourceType !== "observability_alert" || (Boolean(approvedTitle?.trim()) &&
      (impact === "degraded" || impact === "outage")));
  const startedAt = new Date(Date.now() - 600_000);
  const publicRow = {
    id: incidentId, title: approvedTitle, source_type: sourceType,
    // This fixture deliberately contains a canonical resolution without the
    // explicit confirmation marker: the reader must keep that impact active.
    status: confirmedRecovery ? "resolved" : "open", started_at: startedAt,
    resolved_at: confirmedRecovery ? recoveryAt : null, components: hasVisibleAssociation ? ["API"] : [],
    latest_note: options.note ?? "We are investigating slower API responses.", latest_note_at: startedAt,
  };
  let updateQueries = 0;
  const module = { exports: {} as {
    loadPublicPage: (page: typeof page) => Promise<PublicStatusPage>;
    loadPublicIncident: (page: typeof page, id: string) => Promise<PublicIncident | null>;
  } };
  runInNewContext(compiled, {
    module, exports: module.exports, URL, Date, Buffer,
    process: { env: {} },
    require(specifier: string) {
      if (specifier === "./runtime") return { statusEnvironment: () => ({}), isStatusProduction: () => false };
      if (specifier === "./config") return { statusPageUrl: () => new URL("https://acme.status.example.net/") };
      if (specifier === "./db") return {
        async query(statement: string, parameters: unknown[]) {
          assert.doesNotMatch(statement, /(?:UPDATE|INSERT|DELETE)\s/i);
          assert.doesNotMatch(statement, /observability_alerts|log_query|trigger_value|last_value/);
          assert.doesNotMatch(statement.split("FROM incidents i")[0], /source_snapshot/);
          if (statement.includes("FROM incidents i")) {
            const sql = statement.replace(/\s+/g, " ");
            assert.match(sql, /CASE WHEN i.source_type = 'observability_alert' THEN i.public_title ELSE i.title END AS title/);
            assert.match(sql, /i.source_type = 'observability_alert' AND i.uptime_publication_state = 'published' AND length\(trim\(i.public_title\)\) > 0 AND i.public_impact IN \('degraded', 'outage'\)/);
            assert.match(sql, /i.source_type = 'observability_alert' AND \(i.status <> 'resolved' OR NOT i.recovery_confirmed\) THEN NULL ELSE i.resolved_at END AS resolved_at/);
            assert.match(sql, /ic.organization_id = \$2/);
            assert.match(sql, /c.page_id = \$1 AND c.organization_id = \$2 AND c.visible = true|c.organization_id = \$2 AND c.page_id = \$1 AND c.visible = true/);
            assert.match(sql, /c.group_id IS NULL OR g.visible = true/);
            assert.deepEqual(Array.from(parameters).slice(0, 2), [page.id, page.organization_id]);
            if (!eligible) return [];
            if (statement.includes("WITH public_incidents AS")) return hasVisibleAssociation ? [{
              component_id: component.id, ...publicRow, public_impact: impact, updated_at: startedAt,
            }] : [];
            assert.match(sql, /i.source_type = 'uptime_manual' AND \(i.source_snapshot->>'statusPageId' = \$1 OR/);
            assert.match(sql, /AND NOT EXISTS \( SELECT 1 FROM uptime_incident_components ic WHERE ic.incident_id = i.id \)/);
            assert.match(sql, /i.source_type = 'observability_alert' AND \(i.status <> 'resolved' OR NOT i.recovery_confirmed\) THEN 'open' ELSE i.status END AS status/);
            if (statement.includes("WHERE i.id = $3") && parameters[2] !== incidentId) return [];
            return [publicRow];
          }
          if (statement.includes("FROM uptime_incident_updates")) {
            updateQueries++;
            assert.match(statement, /published_at IS NOT NULL/);
            assert.match(statement, /organization_id = \$[12]/);
            return [{
              id: "approved-update", incident_id: incidentId, note: publicRow.latest_note,
              body_json: null, status: "investigating", published_at: startedAt,
            }];
          }
          if (statement.includes("SELECT c.id, c.group_id")) return [{
            ...component, manual_state: options.baseState || component.manual_state,
            manual_updated_at: options.baseState === "unknown" ? null : component.manual_updated_at,
          }];
          return [];
        },
      };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });
  return { ...module.exports, incidentId, updateQueries: () => updateQueries };
}

test("published manual declarations can contain only name and status without linked components", async () => {
  const fixture = publicReaderFixture({ sourceType: "uptime_manual", noAssociations: true, note: "" });
  const result = await fixture.loadPublicPage(page);
  assert.equal(result.incidents.length, 1);
  const incident = result.incidents[0]!;
  assert.equal(incident.id, fixture.incidentId);
  assert.equal(incident.sourceType, "uptime_manual");
  assert.deepEqual(Array.from(incident.components), []);
  assert.equal(incident.latestNote, "");
  assert.equal(incident.updates[0]?.status, "investigating");
  assert.equal(incident.updates[0]?.note, "");
  assert.equal(incident.updates[0]?.body, null);
  assert.equal(result.standaloneComponents[0]?.state, "operational");
  assert.equal(result.standaloneComponents[0]?.history.at(-1)?.incidents.length, 0);
  const detail = await fixture.loadPublicIncident(page, fixture.incidentId);
  assert.equal(detail?.id, fixture.incidentId);
  assert.equal(detail?.updates[0]?.status, "investigating");
  assert.deepEqual(Array.from(detail?.components ?? []), []);
});

test("optional manual components do not expose drafts, hidden links or unlinked automated detections", async () => {
  for (const options of [
    { sourceType: "uptime_manual" as const, noAssociations: true, published: false },
    { sourceType: "uptime_manual" as const, noAssociations: true, sameOrganization: false },
    { sourceType: "uptime_manual" as const, visibleAssociation: false },
    { sourceType: "uptime_monitor" as const, noAssociations: true },
    { sourceType: "observability_alert" as const, noAssociations: true },
  ]) {
    const fixture = publicReaderFixture(options);
    const result = await fixture.loadPublicPage(page);
    assert.equal(result.incidents.length, 0);
    assert.equal(await fixture.loadPublicIncident(page, fixture.incidentId), null);
    assert.equal(fixture.updateQueries(), 0);
  }
});

test("public observability list, detail and history share the approved canonical incident", async () => {
  const fixture = publicReaderFixture();
  const result = await fixture.loadPublicPage(page);
  assert.equal(result.standaloneComponents[0]?.state, "degraded");
  assert.equal(result.incidents[0]?.id, fixture.incidentId);
  assert.equal(result.incidents[0]?.title, "API response delays");
  assert.equal(result.incidents[0]?.status, "open");
  assert.equal(result.incidents[0]?.resolvedAt, null);
  assert.equal(result.incidents[0]?.updates[0]?.id, "approved-update");
  assert.equal(result.standaloneComponents[0]?.history.at(-1)?.incidents[0]?.id, fixture.incidentId);
  const detail = await fixture.loadPublicIncident(page, fixture.incidentId);
  assert.equal(detail?.id, fixture.incidentId);
  assert.equal(detail?.title, result.incidents[0]?.title);
  assert.equal(detail?.updates[0]?.id, "approved-update");
  assert.equal(detail?.status, "open");
  assert.equal(detail?.resolvedAt, null);
  assert.equal(component.manual_state, "operational");
});

test("private, unsafe, cross-tenant and hidden observability incidents never affect public status", async () => {
  for (const options of [
    { published: false }, { safeTitle: null }, { safeTitle: "   " }, { impact: "operational" },
    { sameOrganization: false }, { visibleAssociation: false },
  ]) {
    const fixture = publicReaderFixture(options);
    const result = await fixture.loadPublicPage(page);
    assert.equal(result.standaloneComponents[0]?.state, "operational");
    assert.equal(result.incidents.length, 0);
    assert.equal(result.standaloneComponents[0]?.history.at(-1)?.incidents.length, 0);
    assert.equal(await fixture.loadPublicIncident(page, fixture.incidentId), null);
    assert.equal(fixture.updateQueries(), 0);
  }
});

test("approved impact survives missing evidence and only confirmed recovery releases it", async () => {
  const active = publicReaderFixture({ impact: "outage", baseState: "unknown" });
  const activePage = await active.loadPublicPage(page);
  assert.equal(activePage.standaloneComponents[0]?.state, "outage");
  assert.equal(activePage.incidents[0]?.status, "open");
  const recovered = publicReaderFixture({ impact: "outage", recoveryConfirmed: true, baseState: "unknown" });
  const recoveredPage = await recovered.loadPublicPage(page);
  assert.equal(recoveredPage.standaloneComponents[0]?.state, "unknown");
  assert.equal(recoveredPage.incidents[0]?.status, "resolved");
  assert.ok(recoveredPage.incidents[0]?.resolvedAt);
  const manualOutage = publicReaderFixture({ recoveryConfirmed: true, baseState: "outage" });
  assert.equal((await manualOutage.loadPublicPage(page)).standaloneComponents[0]?.state, "outage");
});

test("a confirmation flag alone cannot resolve an open public observability incident", async () => {
  const fixture = publicReaderFixture({ impact: "outage", recoveryConfirmed: true, canonicalStatus: "open" });
  const result = await fixture.loadPublicPage(page);
  assert.equal(result.standaloneComponents[0]?.state, "outage");
  assert.equal(result.incidents[0]?.status, "open");
  assert.equal(result.incidents[0]?.resolvedAt, null);
  const detail = await fixture.loadPublicIncident(page, fixture.incidentId);
  assert.equal(detail?.status, "open");
  assert.equal(detail?.resolvedAt, null);
});
