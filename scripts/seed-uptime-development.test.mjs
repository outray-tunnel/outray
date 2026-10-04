import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDevelopmentDatabase, buildUptimeFixtures, seed } from "./seed-uptime-development.mjs";

const organizationId = "development-uptime-fixture-org";
const now = Date.parse("2026-10-04T09:37:00.000Z");
const existingPage = {
  id: "d143a6af-9989-44e0-831a-0fd8b625f1c8",
  slug: "outray-tunnel",
  name: "OutRay Uptime",
  published: false,
  logo_url: "https://assets.example.test/existing-logo.svg",
  custom_domain: "status.example.test",
  accent_color: "#123456",
  description: "Existing page configuration",
};

function mockClient({ page = existingPage, collision, racingCollision, automaticCollision, missingPublishingSchema } = {}) {
  const calls = [];
  const writes = [];
  const fixtures = buildUptimeFixtures(organizationId, now);
  return {
    calls,
    writes,
    page,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("FROM information_schema.columns")) {
        return { rows: missingPublishingSchema ? [] : [
          ["uptime_monitors", "failure_threshold"], ["uptime_monitors", "incident_publishing"], ["uptime_monitors", "publish_after_minutes"],
          ["incidents", "uptime_publication_state"], ["incidents", "uptime_published_at"], ["uptime_incident_updates", "body_json"],
        ].map(([table_name, column_name]) => ({ table_name, column_name })) };
      }
      if (sql.includes("FROM organizations")) {
        return { rows: [{ id: organizationId, slug: "outray-tunnel", name: "OutRay" }] };
      }
      if (sql.includes("FROM uptime_status_pages WHERE organization_id")) {
        return { rows: page ? [page] : [] };
      }
      if (sql.includes("FROM uptime_status_pages WHERE slug")) return { rows: [] };
      if (sql.startsWith("INSERT INTO uptime_status_pages")) {
        return { rows: [{ id: values[0], slug: values[2], name: values[3], published: false }], rowCount: 1 };
      }
      if (sql.includes("AS existing_layout")) return { rows: [{ last_order: 6 }] };
      if (collision && sql.includes(`FROM ${collision.table} WHERE id`)) {
        const record = fixtures[collision.collection][0];
        return { rows: [{ ...record, page_id: page?.id, ...collision.override }] };
      }
      if (automaticCollision && sql.includes("AND status = 'open'")) {
        const incident = fixtures.incidents.find((row) => row.source_type === "uptime_monitor" && row.status === "open");
        return { rows: [{ id: "existing-user-incident", source_id: incident.source_id }] };
      }
      if (sql.startsWith("INSERT INTO")) {
        const records = JSON.parse(values[0]);
        writes.push({ sql, records });
        return { rows: [], rowCount: records.length - Number(Boolean(racingCollision)) };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

function plainText(node) {
  if (node.type === "text") return node.text;
  return (node.content || []).map(plainText).join(["doc", "bulletList", "listItem"].includes(node.type) ? "\n" : "");
}

test("development guard rejects production and misleading hostname substrings", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "postgres-dev.pilot.aeroplane.run", "database.development.example.test"]) {
    assert.doesNotThrow(() => assertDevelopmentDatabase(`postgresql://${host}/db`, "development"));
  }
  for (const host of ["postgres-11.pilot.aeroplane.run", "devil.example.test", "mydevelopmentserver.example.test", "127x0x0x1"]) {
    assert.throws(() => assertDevelopmentDatabase(`postgresql://${host}/db`, "development"), /Refusing to seed/);
  }
  assert.throws(() => assertDevelopmentDatabase("postgresql://localhost/db", "production"), /production mode/);
  assert.throws(() => assertDevelopmentDatabase("", "development"), /DATABASE_URL is required/);
});

test("fixtures cover safe paused monitors, grouped layout, and ninety days of history", () => {
  const fixtures = buildUptimeFixtures(organizationId, now);
  assert.equal(fixtures.monitors.length, 8);
  assert.equal(fixtures.groups.length, 3);
  assert.equal(fixtures.components.length, 10);
  assert.equal(fixtures.components.filter((component) => !component.group_id).length, 2);
  assert.equal(fixtures.componentMonitorLinks.length, 8);
  assert.equal(fixtures.checks.length, 3_464);
  assert.equal(fixtures.dailyHistory.length, 720);
  assert.equal(new Set(fixtures.dailyHistory.map((row) => row.day)).size, 90);
  assert.ok(fixtures.monitors.every((monitor) => !monitor.enabled && !monitor.notification_emails.length &&
    monitor.lease_owner === null && monitor.lease_until === null && Date.parse(monitor.next_check_at) > now + 365 * 86_400_000));
  assert.ok(fixtures.checks.every((check) => Date.parse(check.checked_at) >= now - 3 * 86_400_000 && Date.parse(check.checked_at) <= now));
  assert.ok(fixtures.checks.some((check) => check.success));
  assert.ok(fixtures.checks.some((check) => check.error_kind === "timeout" && check.status_code === null));
  assert.ok(fixtures.checks.some((check) => check.error_kind === "dns_error"));
  assert.ok(fixtures.dailyHistory.every((row) => row.successes >= 0 && row.successes <= row.checks));
  assert.ok(fixtures.dailyHistory.some((row) => row.checks === 0));
  assert.ok(fixtures.dailyHistory.some((row) => row.checks > 0 && row.successes === 0));
  const links = new Set(fixtures.componentMonitorLinks.map((link) => link.component_id));
  assert.equal(fixtures.components.filter((component) => !links.has(component.id)).length, 4);
});

test("fixture IDs are tenant scoped and reruns refresh stable sample slots", () => {
  const fixtures = buildUptimeFixtures(organizationId, now);
  const rerun = buildUptimeFixtures(organizationId, now + 600_000);
  const anotherOrg = buildUptimeFixtures("other-org", now);
  for (const key of ["monitors", "groups", "components", "checks", "incidents", "updates"]) {
    const ids = fixtures[key].map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(rerun[key].map((row) => row.id), ids);
    assert.ok(anotherOrg[key].every((row) => !ids.includes(row.id)));
    assert.ok(fixtures[key].every((row) => row.organization_id === organizationId));
  }
  assert.notEqual(fixtures.checks[0].checked_at, rerun.checks[0].checked_at);
  assert.throws(() => buildUptimeFixtures("", now), /Valid fixture/);
  assert.throws(() => buildUptimeFixtures(organizationId, NaN), /Valid fixture/);
});

test("incident fixtures include drafts, published and resolved manual reports, plus automatic recovery", () => {
  const fixtures = buildUptimeFixtures(organizationId, now);
  assert.equal(fixtures.incidents.length, 30);
  assert.equal(fixtures.updates.length, 38);
  const manual = fixtures.incidents.filter((incident) => incident.source_type === "uptime_manual");
  const drafts = manual.filter((incident) => fixtures.updates.filter((update) => update.incident_id === incident.id).every((update) => !update.published_at));
  assert.equal(drafts.length, 6);
  assert.equal(manual.filter((incident) => incident.status === "resolved").length, 6);
  assert.equal(manual.filter((incident) => incident.status === "open").length - drafts.length, 6);
  assert.ok(manual.every((incident) => incident.uptime_publication_state === null && incident.uptime_published_at === null));
  assert.ok(drafts.every((incident) => !/maintenance/i.test(incident.title)));
  const automatic = fixtures.incidents.filter((incident) => incident.source_type === "uptime_monitor");
  const open = automatic.filter((incident) => incident.status === "open");
  assert.equal(open.length, 4);
  assert.equal(new Set(open.map((incident) => incident.source_id)).size, 4);
  assert.equal(open.filter((incident) => incident.uptime_publication_state === "detected").length, 2);
  assert.equal(automatic.filter((incident) => incident.status === "resolved").length, 8);
  assert.ok(automatic.every((incident) => ["detected", "published"].includes(incident.uptime_publication_state) &&
    Boolean(incident.uptime_published_at) === (incident.uptime_publication_state === "published")));
  assert.ok(fixtures.incidents.every((incident) => ["open", "resolved"].includes(incident.status) &&
    (!incident.resolved_at || Date.parse(incident.resolved_at) >= Date.parse(incident.started_at)) &&
    incident.source_snapshot.affectedComponents.every((component) => component.id && component.name)));
  assert.equal(fixtures.updates.filter((update) => update.published_at && Date.parse(update.published_at) > now - 86_400_000).length, 14);
});

test("manual component states mirror latest published updates, while rich updates retain plain-text fallback", () => {
  const fixtures = buildUptimeFixtures(organizationId, now);
  const published = fixtures.updates.filter((update) => update.published_at)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  for (const component of fixtures.components) {
    const latest = published.find((update) => component.id in update.component_states);
    if (!latest) continue;
    assert.equal(component.manual_state, latest.component_states[component.id]);
    assert.equal(component.manual_updated_at, latest.published_at);
  }
  for (const [name, state] of [["Billing portal", "outage"], ["Email delivery", "degraded"], ["Support portal", "operational"], ["Documentation", "unknown"]]) {
    assert.equal(fixtures.components.find((component) => component.name === name).manual_state, state);
  }
  const rich = fixtures.updates.filter((update) => update.body_json);
  assert.equal(rich.length, 6);
  assert.ok(rich.every((update) => update.body_json.type === "doc" && plainText(update.body_json) === update.note));
  assert.ok(rich.every((update) => update.note.includes("no notification was sent")));
});

test("existing page configuration is preserved and fixture writes append with bounded batches", async (t) => {
  t.mock.method(console, "log", () => {});
  const client = mockClient();
  const before = structuredClone(client.page);
  await seed(client, "outray-tunnel");
  assert.deepEqual(client.page, before);
  const orgRead = client.calls.find((call) => call.sql.includes("FROM organizations"));
  assert.deepEqual(orgRead.values, ["outray-tunnel"]);
  assert.match(orgRead.sql, /WHERE slug = \$1 FOR UPDATE/);
  assert.ok(!client.calls.some((call) => /(?:INSERT INTO|UPDATE|DELETE FROM) uptime_status_pages/.test(call.sql)));
  assert.ok(!client.calls.some((call) => /\b(?:DELETE|TRUNCATE|DROP)\b/.test(call.sql)));
  assert.ok(!client.writes.some((write) => /notifications|subscribers|integrations/.test(write.sql)));
  assert.ok(client.writes.every((write) => write.records.length <= 500 &&
    write.records.every((row) => row.organization_id === organizationId) &&
    /WHERE true\s+ON CONFLICT/.test(write.sql) && /WHERE \w+\.organization_id = EXCLUDED\.organization_id/.test(write.sql) && /RETURNING 1/.test(write.sql)));
  const groups = client.writes.find((write) => write.sql.startsWith("INSERT INTO uptime_status_groups")).records;
  const components = client.writes.find((write) => write.sql.startsWith("INSERT INTO uptime_status_components")).records;
  assert.ok([...groups, ...components.filter((component) => !component.group_id)].every((row) => row.sort_order >= 7 && row.page_id === existingPage.id));
  assert.equal(client.writes.filter((write) => write.sql.startsWith("INSERT INTO uptime_checks ")).length, 7);
  assert.equal(client.writes.filter((write) => write.sql.startsWith("INSERT INTO uptime_daily_checks ")).length, 2);
  assert.equal(client.calls.at(-1).sql, "COMMIT");
});

test("a missing page is created unpublished, never upserted over existing configuration", async (t) => {
  t.mock.method(console, "log", () => {});
  const client = mockClient({ page: null });
  await seed(client, "outray-tunnel");
  const insert = client.calls.find((call) => call.sql.startsWith("INSERT INTO uptime_status_pages"));
  assert.match(insert.sql, /false\) ON CONFLICT DO NOTHING/);
  assert.equal(insert.values[2], "outray-tunnel");
  assert.ok(!client.calls.some((call) => /UPDATE uptime_status_pages/.test(call.sql)));
  assert.equal(client.calls.at(-1).sql, "COMMIT");
});

test("foreign owners, changed parents, and automatic-incident collisions roll back before fixture writes", async () => {
  const scenarios = [
    { collision: { table: "uptime_monitors", collection: "monitors", override: { organization_id: "other-org" } } },
    { collision: { table: "uptime_status_components", collection: "components", override: { page_id: "another-page" } } },
    { automaticCollision: true },
  ];
  for (const scenario of scenarios) {
    const client = mockClient(scenario);
    await assert.rejects(seed(client, "outray-tunnel"), /collision|refusing to replace/i);
    assert.equal(client.writes.length, 0);
    assert.equal(client.calls.at(-1).sql, "ROLLBACK");
  }
});

test("racing scoped upsert collisions roll back instead of crossing a tenant boundary", async () => {
  const client = mockClient({ racingCollision: true });
  await assert.rejects(seed(client, "outray-tunnel"), /Scoped upsert collision/);
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
});

test("missing publishing schema fails with a migration diagnostic before any data writes", async () => {
  const client = mockClient({ page: null, missingPublishingSchema: true });
  await assert.rejects(seed(client, "outray-tunnel"), /requires missing schema columns: uptime_monitors\.failure_threshold.*never applies migrations/);
  assert.ok(!client.calls.some((call) => /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\b/.test(call.sql)));
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
});
