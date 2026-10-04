import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SEED_VERSION = 2;
const FUTURE_CHECK_AT = "2100-01-01T00:00:00.000Z";

function id(organizationId, name) {
  const hex = createHash("sha256").update(`outray-dev-uptime:v${SEED_VERSION}:${organizationId}:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function assertDevelopmentDatabase(databaseUrl, nodeEnv) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const host = new URL(databaseUrl).hostname.toLowerCase();
  if (!/(^localhost$|^127\.0\.0\.1$|^\[::1\]$|(^|[.-])(dev|development)([.-]|$))/.test(host)) {
    throw new Error(`Refusing to seed non-development database host: ${host}`);
  }
  if (nodeEnv === "production") throw new Error("Refusing to seed in production mode");
}

const monitorSpecs = [
  { key: "api", name: "Public API", state: "up", latency: 148, publishing: "manual" },
  { key: "web", name: "Web app", state: "up", latency: 223, publishing: "manual" },
  { key: "checkout", name: "Checkout API", state: "down", latency: 864, publishing: "after_confirmation" },
  { key: "database", name: "Database health", state: "up", latency: 91, publishing: "manual" },
  { key: "cdn", name: "Asset delivery", state: "unknown", latency: 37, method: "HEAD", publishing: "manual" },
  { key: "search", name: "Search service", state: "down", latency: 1450, publishing: "automatic" },
  { key: "webhooks", name: "Webhook delivery", state: "down", latency: 630, publishing: "automatic" },
  { key: "queue", name: "Background jobs", state: "down", latency: 980, method: "HEAD", publishing: "after_confirmation" },
];

const groupSpecs = [
  { key: "customer", name: "Customer-facing", order: 0 },
  { key: "platform", name: "Platform", order: 1 },
  { key: "operations", name: "Operations", order: 2 },
];

const componentSpecs = [
  { key: "website", group: "customer", name: "Website", description: "The public web experience", order: 0, monitors: ["web", "cdn"] },
  { key: "checkout", group: "customer", name: "Checkout", description: "Checkout and order processing", order: 1, monitors: ["checkout"] },
  { key: "billing", group: "customer", name: "Billing portal", description: "Invoices and payment settings", order: 2, monitors: [], manualState: "outage" },
  { key: "api", group: "platform", name: "Public API", description: "Developer API and integrations", order: 0, monitors: ["api"] },
  { key: "database", group: "platform", name: "Data store", description: "Primary application data", order: 1, monitors: ["database"] },
  { key: "search", group: "platform", name: "Search", description: "Product search and indexing", order: 2, monitors: ["search"] },
  { key: "webhooks", group: "operations", name: "Event processing", description: "Webhooks and background jobs", order: 0, monitors: ["webhooks", "queue"] },
  { key: "email", group: "operations", name: "Email delivery", description: "Transactional messages", order: 1, monitors: [], manualState: "degraded" },
  { key: "support", group: null, name: "Support portal", description: "Help and account support", order: 3, monitors: [], manualState: "operational" },
  { key: "docs", group: null, name: "Documentation", description: "Guides and API reference", order: 4, monitors: [], manualState: "unknown" },
];

/** Pure fixture generation is safe to import: database/environment work only runs in main. */
export function buildUptimeFixtures(organizationId, now = Date.now()) {
  if (!organizationId || !Number.isFinite(now)) throw new Error("Valid fixture organization and time are required");
  const iso = (milliseconds) => new Date(milliseconds).toISOString();
  const fixtureId = (name) => id(organizationId, name);
  const monitors = monitorSpecs.map((monitor, index) => ({
    id: fixtureId(`monitor:${monitor.key}`),
    organization_id: organizationId,
    name: monitor.name,
    url: `https://${monitor.key}.uptime-seed.example/health`,
    method: monitor.method || "GET",
    expected_status: 200,
    enabled: false,
    notification_emails: [],
    failure_threshold: 3,
    incident_publishing: monitor.publishing,
    publish_after_minutes: 5,
    state: monitor.state,
    failure_streak: monitor.state === "down" ? 3 : monitor.state === "unknown" ? 1 : 0,
    success_streak: monitor.state === "up" ? 4 : 0,
    last_checked_at: iso(now - 15_000),
    last_state_changed_at: iso(now - (monitor.state === "down" ? 45 * MINUTE_MS : DAY_MS)),
    next_check_at: FUTURE_CHECK_AT,
    lease_owner: null,
    lease_until: null,
    deleted_at: null,
    created_at: iso(now - (12 + index) * DAY_MS),
    updated_at: iso(now),
  }));
  const groups = groupSpecs.map((group) => ({
    id: fixtureId(`group:${group.key}`), organization_id: organizationId,
    name: group.name, sort_order: group.order, visible: true,
  }));
  const components = componentSpecs.map((component) => ({
    id: fixtureId(`component:${component.key}`), organization_id: organizationId,
    group_id: component.group ? fixtureId(`group:${component.group}`) : null,
    name: component.name, description: component.description,
    sort_order: component.order, visible: true,
    manual_state: component.manualState || "unknown",
    manual_updated_at: component.manualState ? iso(now) : null,
  }));
  const componentByKey = new Map(componentSpecs.map((spec, index) => [spec.key, components[index]]));
  const componentMonitorLinks = componentSpecs.flatMap((component) => component.monitors.map((monitorKey) => ({
    organization_id: organizationId,
    component_id: fixtureId(`component:${component.key}`),
    monitor_id: fixtureId(`monitor:${monitorKey}`),
  })));

  const anchor = Math.floor(now / (10 * MINUTE_MS)) * (10 * MINUTE_MS);
  const checks = [];
  for (const [monitorIndex, monitor] of monitorSpecs.entries()) {
    for (let step = 0; step < 432; step += 1) {
      const failed = (monitor.state === "down" && step >= 428) ||
        step % (89 + monitorIndex * 17) === 0 ||
        (monitor.state === "unknown" && step >= 424);
      const timeout = failed && monitor.key === "search";
      checks.push({
        // Stable slots refresh on rerun instead of accumulating repeated samples.
        id: fixtureId(`check:${monitor.key}:slot:${step}`),
        organization_id: organizationId,
        monitor_id: fixtureId(`monitor:${monitor.key}`),
        checked_at: iso(anchor - (431 - step) * 10 * MINUTE_MS),
        success: !failed,
        status_code: timeout ? null : failed ? 503 : 200,
        latency_ms: timeout ? null : monitor.latency + (step % 9) * 7,
        error_kind: timeout ? "timeout" : failed ? "unexpected_status" : null,
      });
    }
    checks.push({
      id: fixtureId(`check:${monitor.key}:latest`),
      organization_id: organizationId,
      monitor_id: fixtureId(`monitor:${monitor.key}`),
      checked_at: iso(now - 15_000),
      success: monitor.state === "up",
      status_code: monitor.state === "unknown" ? null : monitor.state === "up" ? 200 : 503,
      latency_ms: monitor.state === "unknown" ? null : monitor.latency,
      error_kind: monitor.state === "unknown" ? "dns_error" : monitor.state === "down" ? "unexpected_status" : null,
    });
  }

  const todayUtc = Math.floor(now / DAY_MS) * DAY_MS;
  const recentDaily = new Map();
  for (const check of checks) {
    const key = `${check.monitor_id}:${check.checked_at.slice(0, 10)}`;
    const day = recentDaily.get(key) || { checks: 0, successes: 0 };
    day.checks += 1;
    day.successes += Number(check.success);
    recentDaily.set(key, day);
  }
  const dailyHistory = monitors.flatMap((monitor, monitorIndex) =>
    Array.from({ length: 90 }, (_, daysAgo) => {
      const day = iso(todayUtc - daysAgo * DAY_MS).slice(0, 10);
      const recent = recentDaily.get(`${monitor.id}:${day}`);
      const missing = monitorSpecs[monitorIndex].key === "cdn" && daysAgo > 2 && daysAgo % 11 === 0;
      const outage = ["checkout", "search"].includes(monitorSpecs[monitorIndex].key) && [12, 47, 74].includes(daysAgo);
      const failures = outage ? 1440 : daysAgo % (13 + monitorIndex) === 0 ? 8 + monitorIndex * 3 : 0;
      const counts = daysAgo < 3 ? recent || { checks: 0, successes: 0 }
        : missing ? { checks: 0, successes: 0 } : { checks: 1440, successes: 1440 - failures };
      return { organization_id: organizationId, monitor_id: monitor.id, day, ...counts };
    }),
  );

  const incidents = [];
  const updates = [];
  const incidentComponentLinks = [];
  function addIncident(spec) {
    const incidentId = fixtureId(`incident:${spec.key}`);
    const affected = spec.affected.map((key) => componentByKey.get(key));
    const snapshots = affected.map((component) => ({ id: component.id, name: component.name }));
    if (spec.removedComponent) snapshots.push({ id: fixtureId("component:retired-edge"), name: "Retired edge gateway" });
    const automatic = Boolean(spec.monitorKey);
    incidents.push({
      id: incidentId, organization_id: organizationId,
      source_type: automatic ? "uptime_monitor" : "uptime_manual",
      source_id: automatic ? fixtureId(`monitor:${spec.monitorKey}`) : incidentId,
      status: spec.resolvedAt ? "resolved" : "open",
      uptime_publication_state: automatic ? spec.publication : null,
      uptime_published_at: automatic && spec.publication === "published" ? iso(spec.startedAt + MINUTE_MS) : null,
      title: spec.title,
      source_snapshot: {
        seeded: true, seedVersion: SEED_VERSION, affectedComponents: snapshots,
        ...(automatic ? { monitorName: monitorSpecs.find((monitor) => monitor.key === spec.monitorKey).name } : {}),
      },
      started_at: iso(spec.startedAt),
      resolved_at: spec.resolvedAt ? iso(spec.resolvedAt) : null,
      created_at: iso(spec.startedAt),
      updated_at: iso(spec.resolvedAt || spec.startedAt),
    });
    for (const component of affected) incidentComponentLinks.push({
      organization_id: organizationId, incident_id: incidentId, component_id: component.id,
    });
    for (const [index, update] of (spec.updates || []).entries()) {
      const serviceNames = affected.map((component) => component.name).join(", ");
      const fixtureNote = "Synthetic development fixture; no notification was sent.";
      const body = update.rich ? {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Service update" }] },
          { type: "paragraph", content: [{ type: "text", text: update.note, marks: [{ type: "bold" }] }] },
          { type: "bulletList", content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `Affected service: ${serviceNames}` }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: fixtureNote, marks: [{ type: "italic" }] }] }] },
          ] },
        ],
      } : null;
      updates.push({
        id: fixtureId(`update:${spec.key}:${index}`),
        organization_id: organizationId, incident_id: incidentId,
        note: body ? `Service update\n${update.note}\nAffected service: ${serviceNames}\n${fixtureNote}` : update.note,
        status: update.status, body_json: body,
        component_states: Object.fromEntries(affected.map((component) => [component.id,
          update.status === "resolved" ? "operational" : update.componentState || "degraded"])),
        published_at: update.draft ? null : iso(update.at),
        created_at: iso(update.at),
      });
    }
  }
  const manualKeys = ["email", "billing", "support", "docs", "api", "website"];
  for (let index = 0; index < 6; index += 1) {
    const componentKey = manualKeys[index];
    const name = componentByKey.get(componentKey).name;
    const draftStart = now - (2 + index) * HOUR_MS;
    addIncident({
      key: `manual-draft:${index}`, affected: [componentKey],
      title: `Draft: ${name} investigation`, startedAt: draftStart,
      updates: [{ status: "investigating", draft: true, rich: index === 0, at: draftStart,
        note: `Internal draft for ${name.toLowerCase()}. This update has not been published.` }],
    });
    const activeStart = now - (5 + index * 2) * HOUR_MS;
    const stage = ["investigating", "identified", "monitoring"][index % 3];
    const currentState = componentSpecs.find((component) => component.key === componentKey).manualState || "degraded";
    addIncident({
      key: `manual-active:${index}`, affected: [componentKey],
      title: `${name} performance is degraded`, startedAt: activeStart,
      updates: [
        { status: "investigating", componentState: currentState, at: activeStart + MINUTE_MS,
          note: `We are investigating intermittent delays affecting ${name.toLowerCase()}.` },
        { status: stage, componentState: currentState, rich: index % 2 === 0, at: activeStart + (45 + index * 10) * MINUTE_MS,
          note: stage === "monitoring" ? "A mitigation is in place. We are monitoring recovery."
            : stage === "identified" ? "We identified the cause and are preparing a mitigation."
            : "The investigation is continuing; the next update will follow shortly." },
      ],
    });
    const resolvedStart = now - (3 + index * 3) * DAY_MS;
    const resolvedAt = resolvedStart + (40 + index * 13) * MINUTE_MS;
    addIncident({
      key: `manual-resolved:${index}`, affected: [componentKey],
      title: `${name} interruption resolved`, startedAt: resolvedStart, resolvedAt,
      removedComponent: index === 5,
      updates: [
        { status: "investigating", at: resolvedStart + MINUTE_MS, note: `We investigated an interruption to ${name.toLowerCase()}.` },
        { status: "monitoring", at: resolvedStart + 20 * MINUTE_MS, note: "Service recovered after mitigation. We monitored the recovery." },
        { status: "resolved", rich: index % 3 === 0, at: resolvedAt, note: "Service is operating normally again. This incident is resolved." },
      ],
    });
  }
  const automaticKeys = ["checkout", "search", "webhooks", "queue"];
  for (const [index, monitorKey] of automaticKeys.entries()) {
    const startedAt = now - (20 + index * 10) * MINUTE_MS;
    const affected = monitorKey === "queue" ? "webhooks" : monitorKey;
    addIncident({
      key: `automatic-open:${monitorKey}`, monitorKey, affected: [affected],
      publication: index < 2 ? "published" : "detected",
      title: `${monitorSpecs.find((monitor) => monitor.key === monitorKey).name} is unavailable`,
      startedAt,
      updates: index < 2 ? [{ status: "identified", at: startedAt + 2 * MINUTE_MS,
        note: "Automated checks detected an interruption. The development fixture is under investigation." }] : [],
    });
  }
  for (let index = 0; index < 8; index += 1) {
    const monitorKey = monitorSpecs[index].key;
    const affected = { web: "website", cdn: "website", queue: "webhooks" }[monitorKey] || monitorKey;
    const startedAt = now - (2 + index * 9) * DAY_MS;
    addIncident({
      key: `automatic-recovered:${monitorKey}`, monitorKey, affected: [affected],
      publication: "published", title: `${monitorSpecs[index].name} recovered after an interruption`,
      startedAt, resolvedAt: startedAt + (10 + index * 17) * MINUTE_MS,
    });
  }
  // Direct fixture inserts do not run the publish API's state update. Mirror its
  // latest published component state, without allowing drafts to affect status.
  const publishedUpdates = updates.filter((update) => update.published_at)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  for (const component of components) {
    const latest = publishedUpdates.find((update) => component.id in update.component_states);
    if (latest) {
      component.manual_state = latest.component_states[component.id];
      component.manual_updated_at = latest.published_at;
    }
  }
  return { monitors, groups, components, componentMonitorLinks, checks, dailyHistory, incidents, incidentComponentLinks, updates };
}

const scopedTables = new Set([
  "uptime_monitors", "uptime_status_groups", "uptime_status_components",
  "uptime_checks", "incidents", "uptime_incident_updates",
]);

const requiredPublishingColumns = [
  "uptime_monitors.failure_threshold", "uptime_monitors.incident_publishing", "uptime_monitors.publish_after_minutes",
  "incidents.uptime_publication_state", "incidents.uptime_published_at", "uptime_incident_updates.body_json",
];

async function assertPublishingSchema(client) {
  const result = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [["uptime_monitors", "incidents", "uptime_incident_updates"]],
  );
  const columns = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = requiredPublishingColumns.filter((column) => !columns.has(column));
  if (missing.length) {
    throw new Error(`Uptime development seed requires missing schema columns: ${missing.join(", ")}. Review the uptime incident-publishing migrations separately; this seed never applies migrations.`);
  }
}

async function assertOwnedIds(client, table, records, organizationId, parents = []) {
  if (!scopedTables.has(table)) throw new Error("Unsupported seed table");
  if (!records.length) return;
  const expected = new Map(records.map((record) => [record.id, record]));
  const result = await client.query(
    `SELECT id, organization_id${parents.map((field) => `, ${field}`).join("")}
     FROM ${table} WHERE id = ANY($1::text[])`,
    [[...expected.keys()]],
  );
  for (const row of result.rows) {
    if (row.organization_id !== organizationId || parents.some((field) => row[field] !== expected.get(row.id)[field])) {
      throw new Error(`Seed fixture collision in ${table}; refusing to change another owner or parent`);
    }
  }
}

async function upsert(client, table, columns, records, keys, updated, scopeFields = []) {
  for (let start = 0; start < records.length; start += 500) {
    const batch = records.slice(start, start + 500);
    const names = columns.map(([name]) => name).join(", ");
    const result = await client.query(
      `INSERT INTO ${table} (${names})
       SELECT ${names} FROM jsonb_to_recordset($1::jsonb) AS row(${columns.map(([name, type]) => `${name} ${type}`).join(", ")})
       WHERE true
       ON CONFLICT (${keys.join(", ")}) DO UPDATE SET
         ${updated.map((name) => `${name} = EXCLUDED.${name}`).join(", ")}
       WHERE ${["organization_id", ...scopeFields].map((name) => `${table}.${name} = EXCLUDED.${name}`).join(" AND ")}
       RETURNING 1`,
      [JSON.stringify(batch)],
    );
    if (result.rowCount !== batch.length) throw new Error(`Scoped upsert collision in ${table}; rolling back`);
  }
}

export async function seed(client, orgSlug) {
  await client.query("BEGIN");
  try {
    await assertPublishingSchema(client);
    const orgResult = await client.query("SELECT id, slug, name FROM organizations WHERE slug = $1 FOR UPDATE", [orgSlug]);
    const org = orgResult.rows[0];
    if (!org) throw new Error(`Organization ${orgSlug} does not exist`);
    const existing = await client.query(
      "SELECT id, slug, name, published FROM uptime_status_pages WHERE organization_id = $1 FOR UPDATE", [org.id],
    );
    let page = existing.rows[0];
    if (!page) {
      const pageId = id(org.id, "page");
      const collision = await client.query(
        "SELECT id FROM uptime_status_pages WHERE slug = $1 OR id = $2", [org.slug, pageId],
      );
      if (collision.rows.length) throw new Error("Status-page slug/id collision; refusing to overwrite configuration");
      const inserted = await client.query(
        `INSERT INTO uptime_status_pages (id, organization_id, slug, name, description, published)
         VALUES ($1,$2,$3,$4,$5,false) ON CONFLICT DO NOTHING
         RETURNING id, slug, name, published`,
        [pageId, org.id, org.slug, `${org.name} Uptime`, "Development status fixtures and incident history."],
      );
      page = inserted.rows[0];
      if (!page) throw new Error("Status-page creation collided; rolling back");
    }
    // Existing page config (including publication, logo, domain and timestamps) is never updated.
    const fixtures = buildUptimeFixtures(org.id);
    const fixtureTopLevelIds = [...fixtures.groups, ...fixtures.components.filter((component) => !component.group_id)].map((row) => row.id);
    const ordering = await client.query(
      `SELECT COALESCE(MAX(sort_order), -1)::integer AS last_order FROM (
         SELECT sort_order FROM uptime_status_groups WHERE organization_id = $1 AND page_id = $2 AND NOT (id = ANY($3::text[]))
         UNION ALL SELECT sort_order FROM uptime_status_components
         WHERE organization_id = $1 AND page_id = $2 AND group_id IS NULL AND NOT (id = ANY($3::text[]))
       ) AS existing_layout`,
      [org.id, page.id, fixtureTopLevelIds],
    );
    const offset = ordering.rows[0].last_order + 1;
    for (const group of fixtures.groups) {
      group.page_id = page.id;
      group.sort_order += offset;
    }
    for (const component of fixtures.components) {
      component.page_id = page.id;
      if (!component.group_id) component.sort_order += offset;
    }

    // Check every primary ID before any fixture mutation; scoped upserts also reject racing collisions.
    await assertOwnedIds(client, "uptime_monitors", fixtures.monitors, org.id);
    await assertOwnedIds(client, "uptime_status_groups", fixtures.groups, org.id, ["page_id"]);
    await assertOwnedIds(client, "uptime_status_components", fixtures.components, org.id, ["page_id"]);
    await assertOwnedIds(client, "uptime_checks", fixtures.checks, org.id, ["monitor_id"]);
    await assertOwnedIds(client, "incidents", fixtures.incidents, org.id, ["source_type", "source_id"]);
    await assertOwnedIds(client, "uptime_incident_updates", fixtures.updates, org.id, ["incident_id"]);
    const expectedOpen = new Map(fixtures.incidents.filter((incident) => incident.source_type === "uptime_monitor" && incident.status === "open")
      .map((incident) => [incident.source_id, incident.id]));
    const openIncidents = await client.query(
      `SELECT id, source_id FROM incidents WHERE organization_id = $1 AND source_type = 'uptime_monitor'
       AND status = 'open' AND source_id = ANY($2::text[])`,
      [org.id, [...expectedOpen.keys()]],
    );
    if (openIncidents.rows.some((incident) => expectedOpen.get(incident.source_id) !== incident.id)) {
      throw new Error("An existing automatic incident owns a fixture monitor; refusing to replace it");
    }

    await upsert(client, "uptime_monitors", [
      ["id", "text"], ["organization_id", "text"], ["name", "text"], ["url", "text"], ["method", "text"],
      ["expected_status", "integer"], ["enabled", "boolean"], ["notification_emails", "text[]"],
      ["failure_threshold", "integer"], ["incident_publishing", "text"], ["publish_after_minutes", "integer"],
      ["state", "text"], ["failure_streak", "integer"], ["success_streak", "integer"],
      ["last_checked_at", "timestamptz"], ["last_state_changed_at", "timestamptz"], ["next_check_at", "timestamptz"],
      ["lease_owner", "text"], ["lease_until", "timestamptz"], ["deleted_at", "timestamptz"],
      ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], fixtures.monitors, ["id"], [
      "name", "url", "method", "expected_status", "enabled", "notification_emails", "failure_threshold",
      "incident_publishing", "publish_after_minutes", "state", "failure_streak", "success_streak",
      "last_checked_at", "last_state_changed_at", "next_check_at", "lease_owner", "lease_until", "deleted_at", "updated_at",
    ]);
    await upsert(client, "uptime_status_groups", [
      ["id", "text"], ["organization_id", "text"], ["page_id", "text"], ["name", "text"], ["sort_order", "integer"], ["visible", "boolean"],
    ], fixtures.groups, ["id"], ["name", "sort_order", "visible"], ["page_id"]);
    await upsert(client, "uptime_status_components", [
      ["id", "text"], ["organization_id", "text"], ["page_id", "text"], ["group_id", "text"],
      ["name", "text"], ["description", "text"], ["sort_order", "integer"], ["visible", "boolean"],
      ["manual_state", "text"], ["manual_updated_at", "timestamptz"],
    ], fixtures.components, ["id"], ["group_id", "name", "description", "sort_order", "visible", "manual_state", "manual_updated_at"], ["page_id"]);
    await upsert(client, "uptime_component_monitors", [
      ["organization_id", "text"], ["component_id", "text"], ["monitor_id", "text"],
    ], fixtures.componentMonitorLinks, ["component_id", "monitor_id"], ["organization_id"]);
    await upsert(client, "uptime_checks", [
      ["id", "text"], ["organization_id", "text"], ["monitor_id", "text"], ["checked_at", "timestamptz"],
      ["success", "boolean"], ["status_code", "integer"], ["latency_ms", "integer"], ["error_kind", "text"],
    ], fixtures.checks, ["id"], ["checked_at", "success", "status_code", "latency_ms", "error_kind"], ["monitor_id"]);
    await upsert(client, "uptime_daily_checks", [
      ["organization_id", "text"], ["monitor_id", "text"], ["day", "date"], ["checks", "integer"], ["successes", "integer"],
    ], fixtures.dailyHistory, ["monitor_id", "day"], ["checks", "successes"]);
    await upsert(client, "incidents", [
      ["id", "text"], ["organization_id", "text"], ["source_type", "text"], ["source_id", "text"], ["status", "text"],
      ["uptime_publication_state", "text"], ["uptime_published_at", "timestamptz"],
      ["title", "text"], ["source_snapshot", "jsonb"], ["started_at", "timestamptz"], ["resolved_at", "timestamptz"],
      ["created_at", "timestamptz"], ["updated_at", "timestamptz"],
    ], fixtures.incidents, ["id"], [
      "status", "uptime_publication_state", "uptime_published_at", "title", "source_snapshot",
      "started_at", "resolved_at", "created_at", "updated_at",
    ], ["source_type", "source_id"]);
    await upsert(client, "uptime_incident_components", [
      ["organization_id", "text"], ["incident_id", "text"], ["component_id", "text"],
    ], fixtures.incidentComponentLinks, ["incident_id", "component_id"], ["organization_id"]);
    await upsert(client, "uptime_incident_updates", [
      ["id", "text"], ["organization_id", "text"], ["incident_id", "text"], ["note", "text"], ["body_json", "jsonb"],
      ["status", "text"], ["component_states", "jsonb"], ["published_at", "timestamptz"], ["created_at", "timestamptz"],
    ], fixtures.updates, ["id"], ["note", "body_json", "status", "component_states", "published_at", "created_at"], ["incident_id"]);

    await client.query("COMMIT");
    console.log(`Seeded ${org.name} (${org.slug}): ${fixtures.monitors.length} disabled monitors, ${fixtures.checks.length} recent checks, ${fixtures.dailyHistory.length} daily-history rows, ${fixtures.groups.length} groups, ${fixtures.components.length} components, ${fixtures.incidents.length} incidents and ${fixtures.updates.length} updates.`);
    console.log(`Preserved status-page configuration: ${page.name} (${page.slug}), published=${page.published}.`);
    console.log("Fixtures do not queue deliveries or probes. Paused monitor evidence is Unknown; manual components retain their varied states.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const orgSlug = process.env.OUTRAY_SEED_ORG?.trim() || "acme";
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(orgSlug)) throw new Error("OUTRAY_SEED_ORG must be a valid organization slug");
  assertDevelopmentDatabase(databaseUrl, process.env.NODE_ENV);
  const { default: pg } = await import("pg");
  const parsed = new URL(databaseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: local ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  try {
    await client.connect();
    await seed(client, orgSlug);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
