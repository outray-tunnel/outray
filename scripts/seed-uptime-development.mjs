import { createHash } from "node:crypto";
import pg from "pg";

const ORG_SLUG = "acme";
const DAY_MS = 86_400_000;
const databaseUrl = process.env.DATABASE_URL;

function id(name) {
  const hex = createHash("sha256").update(`outray-dev-uptime:${ORG_SLUG}:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function assertDevelopmentDatabase() {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const host = new URL(databaseUrl).hostname.toLowerCase();
  if (!/(^localhost$|^127\.0\.0\.1$|dev|development)/.test(host)) {
    throw new Error(`Refusing to seed non-development database host: ${host}`);
  }
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production mode");
}

const monitors = [
  { key: "api", name: "Public API", url: "https://api.acme.example/health", state: "up", latency: 148 },
  { key: "web", name: "Web app", url: "https://app.acme.example/", state: "up", latency: 223 },
  { key: "checkout", name: "Checkout API", url: "https://checkout.acme.example/health", state: "down", latency: 864 },
  { key: "database", name: "Database", url: "https://db-health.acme.example/", state: "up", latency: 91 },
];

const groups = [
  { key: "customer", name: "Customer-facing", order: 0 },
  { key: "platform", name: "Platform", order: 1 },
  { key: "operations", name: "Operations", order: 2 },
];

const components = [
  { key: "website", group: "customer", name: "Website", description: "The public Acme web experience", order: 0, monitors: ["web"] },
  { key: "checkout", group: "customer", name: "Checkout", description: "Checkout and order processing", order: 1, monitors: ["checkout"] },
  { key: "api", group: "platform", name: "Public API", description: "Developer API and integrations", order: 0, monitors: ["api"] },
  { key: "database", group: "platform", name: "Data store", description: "Primary application data", order: 1, monitors: ["database"] },
  { key: "email", group: "operations", name: "Email delivery", description: "Transactional messages", order: 0, monitors: [], manualState: "degraded" },
  { key: "support", group: "operations", name: "Support portal", description: "Help and account support", order: 1, monitors: [], manualState: "operational" },
];

async function seed(client) {
  await client.query("BEGIN");
  try {
    const orgResult = await client.query("SELECT id, name FROM organizations WHERE slug = $1 LIMIT 1", [ORG_SLUG]);
    const org = orgResult.rows[0];
    if (!org) throw new Error(`Organization ${ORG_SLUG} does not exist`);
    const pageId = id("page");
    const existing = await client.query("SELECT id FROM uptime_status_pages WHERE organization_id = $1", [org.id]);
    if (existing.rows.length && existing.rows[0].id !== pageId) {
      throw new Error("Acme already has a non-seeded status page; refusing to overwrite it");
    }
    await client.query(
      `INSERT INTO uptime_status_pages
         (id, organization_id, slug, name, description, accent_color, published)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         accent_color = EXCLUDED.accent_color, published = true, updated_at = NOW()`,
      [pageId, org.id, "acme", "Acme Status", "Live status and incident updates for Acme services.", "#8367c7"],
    );

    for (const monitor of monitors) {
      await client.query(
        `INSERT INTO uptime_monitors
           (id, organization_id, name, url, method, expected_status, enabled,
            state, failure_streak, success_streak, last_checked_at,
            last_state_changed_at, next_check_at)
         VALUES ($1,$2,$3,$4,'GET',200,true,$5,$6,$7,NOW() - INTERVAL '15 seconds',
                 NOW() - INTERVAL '45 minutes',NOW() + INTERVAL '1 minute')
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, url = EXCLUDED.url, enabled = true,
           state = EXCLUDED.state, failure_streak = EXCLUDED.failure_streak,
           success_streak = EXCLUDED.success_streak,
           last_checked_at = EXCLUDED.last_checked_at,
           last_state_changed_at = EXCLUDED.last_state_changed_at,
           next_check_at = EXCLUDED.next_check_at, updated_at = NOW()`,
        [id(`monitor:${monitor.key}`), org.id, monitor.name, monitor.url,
          monitor.state, monitor.state === "down" ? 2 : 0, monitor.state === "up" ? 2 : 0],
      );
    }

    for (const group of groups) {
      await client.query(
        `INSERT INTO uptime_status_groups
           (id, organization_id, page_id, name, sort_order, visible)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
           visible = true, updated_at = NOW()`,
        [id(`group:${group.key}`), org.id, pageId, group.name, group.order],
      );
    }

    for (const component of components) {
      await client.query(
        `INSERT INTO uptime_status_components
           (id, organization_id, page_id, group_id, name, description,
            sort_order, visible, manual_state, manual_updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           group_id = EXCLUDED.group_id, name = EXCLUDED.name,
           description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
           visible = true, manual_state = EXCLUDED.manual_state,
           manual_updated_at = EXCLUDED.manual_updated_at, updated_at = NOW()`,
        [id(`component:${component.key}`), org.id, pageId, id(`group:${component.group}`),
          component.name, component.description, component.order,
          component.manualState || "unknown", component.manualState ? new Date() : null],
      );
      for (const monitorKey of component.monitors) {
        await client.query(
          `INSERT INTO uptime_component_monitors (organization_id, component_id, monitor_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [org.id, id(`component:${component.key}`), id(`monitor:${monitorKey}`)],
        );
      }
    }

    const anchor = Math.floor(Date.now() / 600_000) * 600_000;
    const checks = [];
    for (const monitor of monitors) {
      for (let step = 0; step < 432; step += 1) {
        const checkedAt = new Date(anchor - (431 - step) * 600_000);
        const failed = monitor.key === "checkout"
          ? step > 426 || step % 93 === 0
          : monitor.key === "api" && step % 137 === 0;
        checks.push({
          id: id(`check:${monitor.key}:${checkedAt.toISOString()}`),
          organization_id: org.id,
          monitor_id: id(`monitor:${monitor.key}`),
          checked_at: checkedAt.toISOString(),
          success: !failed,
          status_code: failed ? 503 : 200,
          latency_ms: monitor.latency + (step % 9) * 7,
          error_kind: failed ? "unexpected_status" : null,
        });
      }
      checks.push({
        id: id(`check:${monitor.key}:latest:${anchor}`),
        organization_id: org.id,
        monitor_id: id(`monitor:${monitor.key}`),
        checked_at: new Date(Date.now() - 15_000).toISOString(),
        success: monitor.state === "up",
        status_code: monitor.state === "up" ? 200 : 503,
        latency_ms: monitor.latency,
        error_kind: monitor.state === "down" ? "unexpected_status" : null,
      });
    }
    await client.query(
      `INSERT INTO uptime_checks
         (id, organization_id, monitor_id, checked_at, success, status_code, latency_ms, error_kind)
       SELECT id, organization_id, monitor_id, checked_at, success,
              status_code, latency_ms, error_kind
       FROM jsonb_to_recordset($1::jsonb) AS row(
         id text, organization_id text, monitor_id text, checked_at timestamptz,
         success boolean, status_code integer, latency_ms integer, error_kind text)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(checks)],
    );

    const incidentSpecs = [
      { key: "checkout", sourceType: "uptime_monitor", sourceId: id("monitor:checkout"),
        title: "Checkout is unavailable", status: "open", startedHoursAgo: 0.7,
        affected: ["checkout"] },
      { key: "api-history", sourceType: "uptime_monitor", sourceId: id("monitor:api"),
        title: "Intermittent API errors", status: "resolved", startedHoursAgo: 29,
        resolvedHoursAgo: 28.2, affected: ["api"] },
      { key: "email", sourceType: "uptime_manual", title: "Email delivery is delayed",
        status: "open", startedHoursAgo: 0.35, affected: ["email"] },
      { key: "support-history", sourceType: "uptime_manual", title: "Support portal was slow",
        status: "resolved", startedHoursAgo: 53, resolvedHoursAgo: 51.8,
        affected: ["support"] },
    ];
    for (const incident of incidentSpecs) {
      const incidentId = id(`incident:${incident.key}`);
      const startedAt = new Date(Date.now() - incident.startedHoursAgo * 3_600_000);
      const resolvedAt = incident.resolvedHoursAgo
        ? new Date(Date.now() - incident.resolvedHoursAgo * 3_600_000)
        : null;
      await client.query(
        `INSERT INTO incidents
           (id, organization_id, source_type, source_id, status, title,
            source_snapshot, started_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status, title = EXCLUDED.title,
           started_at = EXCLUDED.started_at, resolved_at = EXCLUDED.resolved_at,
           updated_at = NOW()`,
        [incidentId, org.id, incident.sourceType,
          incident.sourceType === "uptime_manual" ? incidentId : incident.sourceId,
          incident.status, incident.title,
          JSON.stringify({ seeded: true, affectedComponents: incident.affected }),
          startedAt, resolvedAt],
      );
      for (const componentKey of incident.affected) {
        await client.query(
          `INSERT INTO uptime_incident_components (organization_id, incident_id, component_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [org.id, incidentId, id(`component:${componentKey}`)],
        );
      }
    }

    const updates = [
      { key: "email-investigating", incident: "email", note: "We are investigating delayed transactional emails. New messages are queued safely.",
        status: "investigating", minutesAgo: 20, states: { email: "degraded" } },
      { key: "email-identified", incident: "email", note: "We identified an upstream delivery delay and are working through the queue.",
        status: "identified", minutesAgo: 8, states: { email: "degraded" } },
      { key: "support-investigating", incident: "support-history", note: "The support portal is responding slowly for some visitors.",
        status: "investigating", minutesAgo: 53 * 60, states: { support: "degraded" } },
      { key: "support-resolved", incident: "support-history", note: "The support portal is responding normally again.",
        status: "resolved", minutesAgo: 51.8 * 60, states: { support: "operational" } },
    ];
    for (const update of updates) {
      const publishedAt = new Date(Date.now() - update.minutesAgo * 60_000);
      const states = Object.fromEntries(Object.entries(update.states).map(([key, state]) => [id(`component:${key}`), state]));
      await client.query(
        `INSERT INTO uptime_incident_updates
           (id, organization_id, incident_id, note, status, component_states,
            published_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)
         ON CONFLICT (id) DO UPDATE SET
           note = EXCLUDED.note, status = EXCLUDED.status,
           component_states = EXCLUDED.component_states,
           published_at = EXCLUDED.published_at`,
        [id(`update:${update.key}`), org.id, id(`incident:${update.incident}`),
          update.note, update.status, JSON.stringify(states), publishedAt],
      );
    }

    await client.query("COMMIT");
    console.log(`Seeded ${org.name}: ${monitors.length} monitors, ${checks.length} checks, ` +
      `${groups.length} groups, ${components.length} components, ${incidentSpecs.length} incidents.`);
    console.log("Preview: http://localhost:4323/acme");
    console.log("Monitor evidence becomes Unknown after 3 minutes without new checks; rerun this seed to refresh it.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

assertDevelopmentDatabase();
const parsed = new URL(databaseUrl);
const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: local ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
});
try {
  await client.connect();
  await seed(client);
} finally {
  await client.end();
}
