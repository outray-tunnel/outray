import { adminProductPages, type AdminProductColumn, type AdminProductMetric, type AdminProductParams, type AdminProductRecord, type AdminProductResponse, type AdminProductValue } from "./admin-products";
import { adminProducts, type AdminProduct, type AdminUsageRange } from "./admin-usage";
import type { AdminUsageDatabase } from "./admin-usage.server";

const pageSize = 25;
const ranges: Record<AdminUsageRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
type Row = Record<string, unknown>;
type Metric = Omit<AdminProductMetric, "value">;
type Breakdown = { key: string; title: string; description: string; format?: "number" | "bytes"; items: Array<{ key: string; label: string; tone?: "neutral" | "green" | "amber" | "red" | "purple" | "blue" }> };
type View = { description: string; nameLabel: string; columns: AdminProductColumn[]; details?: AdminProductColumn[]; statuses: string[]; sql: string };
type ProductDefinition = { metrics: Metric[]; breakdowns: Breakdown[]; stats: string; trend: { title: string; description: string; monthly?: boolean; series: Array<{ key: string; label: string; format?: "number" | "bytes" }>; sql: string }; views: Record<string, View>; notes: string[] };
export class AdminProductInputError extends Error {}

const column = (key: string, label: string, format: AdminProductColumn["format"] = "text"): AdminProductColumn => ({ key, label, format });
const metric = (key: string, label: string, description: string, format: Metric["format"] = "number"): Metric => ({ key, label, description, format });
const item = (key: string, label: string, tone?: Breakdown["items"][number]["tone"]) => ({ key, label, tone });
const bounds = `bounds AS (SELECT $1::timestamptz AS from_at, $2::timestamptz AS to_at, $3::date AS month, $4::date AS previous_month)`;
const orgFields = `o.id AS organization_id, o.name AS organization_name, o.slug AS organization_slug`;
const shareState = `CASE WHEN l.revoked_at IS NOT NULL THEN 'revoked' WHEN l.expires_at <= b.to_at THEN 'expired' WHEN l.views >= l.max_views THEN 'exhausted' ELSE 'active' END`;
const liveVaults = `live_vaults AS (SELECT p.id, p.organization_id, p.name, p.slug, p.created_at FROM secret_projects p WHERE p.deleted_at IS NULL),
live_envs AS (SELECT e.id, e.project_id, e.organization_id, e.is_production FROM secret_environments e JOIN live_vaults p ON p.id = e.project_id AND p.organization_id = e.organization_id WHERE e.deleted_at IS NULL),
live_entries AS (SELECT e.id, e.project_id, e.organization_id FROM secret_entries e JOIN live_envs v ON v.id = e.environment_id AND v.project_id = e.project_id AND v.organization_id = e.organization_id WHERE e.deleted_at IS NULL)`;
const ownedShares = `owned_shares AS (SELECT l.id, so.organization_id, l.created_at, l.expires_at, l.last_revealed_at, l.views, l.max_views, ${shareState} AS status FROM secret_share_links l JOIN secret_share_ownership so ON so.share_id = l.id CROSS JOIN bounds b)`;
const uptimeIncidents = `status_incidents AS (SELECT i.id, i.organization_id, i.source_type, i.status, i.uptime_publication_state, i.uptime_published_at, i.public_title, i.started_at, i.resolved_at FROM incidents i WHERE i.source_type IN ('uptime_monitor', 'uptime_manual') OR (i.source_type = 'observability_alert' AND i.uptime_publication_state IS NOT NULL))`;
const agentCohort = `run_cohort AS (SELECT r.id, t.organization_id, r.status, r.input_tokens, r.output_tokens, r.started_at, r.updated_at, r.completed_at,
CASE WHEN r.status IN ('complete', 'failed', 'cancelled') AND r.completed_at >= r.started_at THEN extract(epoch FROM (r.completed_at - r.started_at)) * 1000 END AS duration_ms
FROM agent_runs r JOIN agent_threads t ON t.id = r.thread_id CROSS JOIN bounds b WHERE r.started_at >= b.from_at AND r.started_at <= b.to_at)`;

const definitions: Record<AdminProduct, ProductDefinition> = {
  tunnels: {
    metrics: [metric("domains", "Custom domains", "Custom domains connected to tunnels"), metric("active_domains", "Connected domains", "Verified and ready for tunnel traffic"), metric("subdomains", "Reserved subdomains", "Reserved addresses across workspaces"), metric("tunnels", "Registered tunnels", "Current retained registrations"), metric("seen_tunnels", "Last seen in period", "Last seen during the selected period")],
    breakdowns: [{ key: "domain_health", title: "Domain verification", description: "Current state of custom tunnel domains.", items: [item("active_domains", "Connected", "green"), item("pending_domains", "Pending", "amber"), item("failed_domains", "Failed", "red")] }, { key: "protocols", title: "Registered protocols", description: "Retained tunnel registrations by protocol, not traffic volume.", items: [item("http_tunnels", "HTTP / HTTPS", "blue"), item("tcp_tunnels", "TCP", "purple"), item("udp_tunnels", "UDP", "amber")] }],
    stats: `SELECT
(SELECT count(*)::text FROM domains WHERE purpose = 'tunnel') AS domains,
(SELECT count(*)::text FROM domains WHERE purpose = 'tunnel' AND status = 'active') AS active_domains,
(SELECT count(*)::text FROM domains WHERE purpose = 'tunnel' AND status = 'pending') AS pending_domains,
(SELECT count(*)::text FROM domains WHERE purpose = 'tunnel' AND status = 'failed') AS failed_domains,
(SELECT count(*)::text FROM subdomains) AS subdomains,
count(*)::text AS tunnels,
count(*) FILTER (WHERE last_seen_at >= (b.from_at AT TIME ZONE 'UTC') AND last_seen_at <= (b.to_at AT TIME ZONE 'UTC'))::text AS seen_tunnels,
count(*) FILTER (WHERE protocol = 'http')::text AS http_tunnels,
count(*) FILTER (WHERE protocol = 'tcp')::text AS tcp_tunnels,
count(*) FILTER (WHERE protocol = 'udp')::text AS udp_tunnels
FROM tunnels CROSS JOIN bounds b`,
    trend: { title: "New tunnel resources", description: "New registrations by day · UTC", series: [{ key: "tunnels", label: "Tunnels" }, { key: "domains", label: "Custom domains" }, { key: "subdomains", label: "Reserved subdomains" }], sql: `SELECT to_char(day, 'YYYY-MM-DD') AS date, sum(tunnels)::text AS tunnels, sum(domains)::text AS domains, sum(subdomains)::text AS subdomains FROM (
SELECT t.created_at::date AS day, count(*) AS tunnels, 0::bigint AS domains, 0::bigint AS subdomains FROM tunnels t CROSS JOIN bounds b WHERE t.created_at >= (b.from_at AT TIME ZONE 'UTC') AND t.created_at <= (b.to_at AT TIME ZONE 'UTC') GROUP BY 1
UNION ALL SELECT d.created_at::date, 0, count(*), 0 FROM domains d CROSS JOIN bounds b WHERE d.purpose = 'tunnel' AND d.created_at >= (b.from_at AT TIME ZONE 'UTC') AND d.created_at <= (b.to_at AT TIME ZONE 'UTC') GROUP BY 1
UNION ALL SELECT s.created_at::date, 0, 0, count(*) FROM subdomains s CROSS JOIN bounds b WHERE s.created_at >= (b.from_at AT TIME ZONE 'UTC') AND s.created_at <= (b.to_at AT TIME ZONE 'UTC') GROUP BY 1
) events GROUP BY day ORDER BY day` },
    views: {
      domains: { nameLabel: "Domain", description: "Custom tunnel domains and their current verification state.", columns: [column("status", "Verification", "status"), column("created", "Added", "date")], details: [column("updated", "Last updated", "date")], statuses: ["active", "pending", "failed"], sql: `SELECT d.id, d.domain AS name, ${orgFields}, d.status, d.created_at AT TIME ZONE 'UTC' AS sort_at,
jsonb_build_object('status', d.status, 'created', d.created_at AT TIME ZONE 'UTC') AS values,
jsonb_build_object('updated', d.updated_at AT TIME ZONE 'UTC') AS details FROM domains d JOIN organizations o ON o.id = d.organization_id WHERE d.purpose = 'tunnel'` },
      subdomains: { nameLabel: "Subdomain", description: "Reserved tunnel addresses across workspaces.", columns: [column("created", "Reserved", "date")], statuses: [], sql: `SELECT s.id, s.subdomain AS name, ${orgFields}, 'reserved'::text AS status, s.created_at AT TIME ZONE 'UTC' AS sort_at, jsonb_build_object('created', s.created_at AT TIME ZONE 'UTC') AS values, '{}'::jsonb AS details FROM subdomains s JOIN organizations o ON o.id = s.organization_id` },
    },
    notes: ["Live connection state is available in Live connections. Last-seen snapshots cannot reconstruct every connection or historical concurrency.", "Custom-domain hostnames are public addresses; credential-bearing tunnel target URLs are never selected."],
  },
  observability: {
    metrics: [metric("month_bytes", "Accepted this month", "Accepted telemetry · current UTC month", "bytes"), metric("previous_bytes", "Previous month", "Accepted telemetry · previous UTC month", "bytes"), metric("receiving_workspaces", "Receiving workspaces", "With accepted telemetry this UTC month"), metric("enabled_alerts", "Enabled alerts", "Current enabled configurations"), metric("firing_alerts", "Firing alerts", "Enabled and unmuted · current state"), metric("evaluation_errors", "Evaluation errors", "Failed evaluations · selected period")],
    breakdowns: [{ key: "alerts", title: "Alert health", description: "Current state, including paused and muted alerts.", items: [item("healthy", "Healthy", "green"), item("firing", "Firing", "red"), item("pending", "Pending", "amber"), item("no_data", "No data", "neutral"), item("error", "Error", "red"), item("paused", "Paused", "neutral"), item("muted", "Muted", "purple")] }, { key: "evaluations", title: "Evaluation results", description: "Retained evaluations recorded within the selected UTC period.", items: [item("evaluation_success", "Success", "green"), item("evaluation_no_data", "No data", "amber"), item("evaluation_errors", "Error", "red")] }],
    stats: `, alert_states AS (SELECT CASE WHEN NOT a.enabled THEN 'paused' WHEN a.muted_until > b.to_at THEN 'muted' ELSE a.underlying_state END AS state FROM observability_alerts a CROSS JOIN bounds b WHERE a.deleted_at IS NULL), evaluations AS (SELECT e.status FROM observability_alert_evaluations e CROSS JOIN bounds b WHERE e.evaluated_at >= b.from_at AND e.evaluated_at <= b.to_at)
SELECT
(SELECT coalesce(sum(u.used), 0)::text FROM organization_monthly_usage u CROSS JOIN bounds b WHERE u.metric = 'telemetry_bytes' AND u.month = b.month) AS month_bytes,
(SELECT coalesce(sum(u.used), 0)::text FROM organization_monthly_usage u CROSS JOIN bounds b WHERE u.metric = 'telemetry_bytes' AND u.month = b.previous_month) AS previous_bytes,
(SELECT count(*)::text FROM organization_monthly_usage u CROSS JOIN bounds b WHERE u.metric = 'telemetry_bytes' AND u.month = b.month AND u.used > 0) AS receiving_workspaces,
(SELECT count(*)::text FROM observability_alerts WHERE deleted_at IS NULL AND enabled) AS enabled_alerts,
(SELECT count(*)::text FROM alert_states WHERE state = 'firing') AS firing_alerts,
(SELECT count(*)::text FROM evaluations WHERE status = 'success') AS evaluation_success,
(SELECT count(*)::text FROM evaluations WHERE status = 'no_data') AS evaluation_no_data,
(SELECT count(*)::text FROM evaluations WHERE status = 'error') AS evaluation_errors,
count(*) FILTER (WHERE state = 'healthy')::text AS healthy, count(*) FILTER (WHERE state = 'firing')::text AS firing,
count(*) FILTER (WHERE state = 'pending')::text AS pending, count(*) FILTER (WHERE state = 'no_data')::text AS no_data,
count(*) FILTER (WHERE state = 'error')::text AS error, count(*) FILTER (WHERE state = 'paused')::text AS paused, count(*) FILTER (WHERE state = 'muted')::text AS muted FROM alert_states`,
    trend: { title: "Alert evaluation activity", description: "Alert checks and evaluation errors by day · UTC", series: [{ key: "evaluations", label: "Evaluations" }, { key: "errors", label: "Evaluation errors" }], sql: `SELECT to_char(e.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*)::text AS evaluations, count(*) FILTER (WHERE e.status = 'error')::text AS errors FROM observability_alert_evaluations e CROSS JOIN bounds b WHERE e.evaluated_at >= b.from_at AND e.evaluated_at <= b.to_at GROUP BY 1 ORDER BY 1` },
    views: {
      workspaces: { nameLabel: "Workspace", description: "Telemetry totals for the current and previous UTC calendar months.", columns: [column("status", "Ingestion", "status"), column("month_bytes", "This month", "bytes"), column("previous_bytes", "Previous month", "bytes"), column("alerts", "Alerts", "number")], details: [column("last_ingest", "Latest positive accounting update", "date"), column("enabled_alerts", "Enabled alerts", "number")], statuses: ["receiving", "inactive"], sql: `WITH telemetry AS (SELECT u.organization_id, coalesce(sum(u.used) FILTER (WHERE u.month = b.month), 0) AS month_bytes, coalesce(sum(u.used) FILTER (WHERE u.month = b.previous_month), 0) AS previous_bytes, bool_or(u.used > 0) AS history, max(u.updated_at) FILTER (WHERE u.used > 0) AS last_ingest FROM organization_monthly_usage u CROSS JOIN bounds b WHERE u.metric = 'telemetry_bytes' AND u.month <= b.month GROUP BY u.organization_id), alerts AS (SELECT organization_id, count(*) AS alerts, count(*) FILTER (WHERE enabled) AS enabled_alerts FROM observability_alerts WHERE deleted_at IS NULL GROUP BY organization_id)
SELECT o.id, o.name, ${orgFields}, CASE WHEN coalesce(t.month_bytes, 0) > 0 THEN 'receiving' ELSE 'inactive' END AS status, t.last_ingest AS sort_at,
jsonb_build_object('status', CASE WHEN coalesce(t.month_bytes, 0) > 0 THEN 'receiving' ELSE 'inactive' END, 'month_bytes', coalesce(t.month_bytes, 0)::text, 'previous_bytes', coalesce(t.previous_bytes, 0)::text, 'alerts', coalesce(a.alerts, 0)::text) AS values,
jsonb_build_object('last_ingest', t.last_ingest, 'enabled_alerts', coalesce(a.enabled_alerts, 0)::text) AS details
FROM organizations o LEFT JOIN telemetry t ON t.organization_id = o.id LEFT JOIN alerts a ON a.organization_id = o.id WHERE coalesce(t.history, false) OR coalesce(a.alerts, 0) > 0` },
      alerts: { nameLabel: "Alert", description: "Alert state, service, and evaluation history across workspaces.", columns: [column("status", "State", "status"), column("signal", "Signal"), column("last_evaluated", "Last evaluated", "date")], details: [column("service", "Service"), column("environment", "Environment"), column("underlying", "Underlying state", "status"), column("muted_until", "Muted until", "date"), column("created", "Created", "date")], statuses: ["healthy", "pending", "firing", "no_data", "error", "paused", "muted"], sql: `SELECT a.id, a.name, ${orgFields}, CASE WHEN NOT a.enabled THEN 'paused' WHEN a.muted_until > b.to_at THEN 'muted' ELSE a.underlying_state END AS status, a.created_at AS sort_at,
jsonb_build_object('status', CASE WHEN NOT a.enabled THEN 'paused' WHEN a.muted_until > b.to_at THEN 'muted' ELSE a.underlying_state END, 'signal', a.signal, 'last_evaluated', a.last_evaluated_at) AS values,
jsonb_build_object('service', a.service, 'environment', a.environment, 'underlying', a.underlying_state, 'muted_until', a.muted_until, 'created', a.created_at) AS details FROM observability_alerts a JOIN organizations o ON o.id = a.organization_id CROSS JOIN bounds b WHERE a.deleted_at IS NULL` },
    },
    notes: ["Accepted bytes measure ingestion admission, not SDK request count, retained storage size, or query traffic. Accounting is not backfilled for ingestion before it was enabled.", "No telemetry bodies, log queries, notification destinations, webhook secrets, or raw evaluation errors are selected."],
  },
  secrets: {
    metrics: [metric("vaults", "Live vaults", "Current vaults across workspaces"), metric("secrets", "Stored secrets", "Across live vaults and environments"), metric("machine_tokens", "Active machine tokens", "Unexpired and not revoked"), metric("active_shares", "Usable share links", "Unexpired, unrevoked, with views remaining"), metric("operations", "Successful operations", "User and machine activity · selected period"), metric("denied", "Denied operations", "Access denials · selected period")],
    breakdowns: [{ key: "environments", title: "Environment coverage", description: "Live environments beneath undeleted vaults.", items: [item("production_envs", "Production", "amber"), item("other_envs", "Other environments", "purple")] }, { key: "shares", title: "Share lifecycle", description: "Current state of workspace-owned share links.", items: [item("active_shares", "Usable", "green"), item("expired_shares", "Expired", "neutral"), item("exhausted_shares", "View limit reached", "amber"), item("revoked_shares", "Revoked", "red")] }],
    stats: `, ${liveVaults}, ${ownedShares}, audit AS (SELECT a.result FROM secret_audit_events a CROSS JOIN bounds b WHERE a.actor_type IN ('user', 'machine') AND a.created_at >= b.from_at AND a.created_at <= b.to_at)
SELECT (SELECT count(*)::text FROM live_vaults) AS vaults, (SELECT count(*)::text FROM live_entries) AS secrets,
(SELECT count(*)::text FROM live_envs WHERE is_production) AS production_envs, (SELECT count(*)::text FROM live_envs WHERE NOT is_production) AS other_envs,
(SELECT count(*)::text FROM secrets_machine_tokens t CROSS JOIN bounds b WHERE t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > b.to_at)) AS machine_tokens,
(SELECT count(*)::text FROM audit WHERE result = 'success') AS operations, (SELECT count(*)::text FROM audit WHERE result = 'denied') AS denied,
count(*) FILTER (WHERE status = 'active')::text AS active_shares, count(*) FILTER (WHERE status = 'expired')::text AS expired_shares,
count(*) FILTER (WHERE status = 'exhausted')::text AS exhausted_shares, count(*) FILTER (WHERE status = 'revoked')::text AS revoked_shares FROM owned_shares`,
    trend: { title: "Secrets access activity", description: "User and machine operations by day · UTC", series: [{ key: "operations", label: "Successful" }, { key: "denied", label: "Denied" }, { key: "failed", label: "Failed" }], sql: `SELECT to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
count(*) FILTER (WHERE a.result = 'success')::text AS operations, count(*) FILTER (WHERE a.result = 'denied')::text AS denied, count(*) FILTER (WHERE a.result = 'failure')::text AS failed
FROM secret_audit_events a CROSS JOIN bounds b WHERE a.actor_type IN ('user', 'machine') AND a.created_at >= b.from_at AND a.created_at <= b.to_at GROUP BY 1 ORDER BY 1` },
    views: {
      vaults: { nameLabel: "Vault", description: "Live vaults, environments, secret counts, and scoped machine access.", columns: [column("status", "Inventory", "status"), column("environments", "Environments", "number"), column("secrets", "Secrets", "number"), column("machine_tokens", "Scoped tokens", "number")], details: [column("production_envs", "Production environments", "number"), column("operations", "Successful operations in period", "number"), column("last_operation", "Latest successful operation in period", "date"), column("created", "Created", "date")], statuses: ["populated", "empty"], sql: `WITH ${liveVaults}, envs AS (SELECT project_id, count(*) AS environments, count(*) FILTER (WHERE is_production) AS production_envs FROM live_envs GROUP BY project_id), entries AS (SELECT project_id, count(*) AS secrets FROM live_entries GROUP BY project_id), tokens AS (SELECT p.id AS project_id, count(t.id) AS machine_tokens FROM live_vaults p JOIN secrets_machine_tokens t ON t.organization_id = p.organization_id CROSS JOIN bounds b WHERE t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > b.to_at) AND (t.project_id IS NULL OR t.project_id = p.id) AND (t.environment_id IS NULL OR EXISTS (SELECT 1 FROM live_envs e WHERE e.id = t.environment_id AND e.project_id = p.id)) GROUP BY p.id), audit AS (SELECT a.project_id, a.organization_id, count(*) AS operations, max(a.created_at) AS last_operation FROM secret_audit_events a CROSS JOIN bounds b WHERE a.result = 'success' AND a.actor_type IN ('user', 'machine') AND a.created_at >= b.from_at AND a.created_at <= b.to_at GROUP BY a.project_id, a.organization_id)
SELECT p.id, p.name, ${orgFields}, CASE WHEN coalesce(s.secrets, 0) > 0 THEN 'populated' ELSE 'empty' END AS status, p.created_at AS sort_at,
jsonb_build_object('status', CASE WHEN coalesce(s.secrets, 0) > 0 THEN 'populated' ELSE 'empty' END, 'environments', coalesce(e.environments, 0)::text, 'secrets', coalesce(s.secrets, 0)::text, 'machine_tokens', coalesce(t.machine_tokens, 0)::text) AS values,
jsonb_build_object('production_envs', coalesce(e.production_envs, 0)::text, 'operations', coalesce(a.operations, 0)::text, 'last_operation', a.last_operation, 'created', p.created_at) AS details
FROM live_vaults p JOIN organizations o ON o.id = p.organization_id LEFT JOIN envs e ON e.project_id = p.id LEFT JOIN entries s ON s.project_id = p.id LEFT JOIN tokens t ON t.project_id = p.id LEFT JOIN audit a ON a.project_id = p.id AND a.organization_id = p.organization_id` },
      shares: { nameLabel: "Share link", description: "Workspace-owned shares with expiry, lifetime views, and remaining access.", columns: [column("status", "Status", "status"), column("views", "Views used", "number"), column("max_views", "View limit", "number"), column("expires", "Expires", "date")], details: [column("created", "Created", "date"), column("last_revealed", "Last revealed", "date")], statuses: ["active", "expired", "exhausted", "revoked"], sql: `WITH ${ownedShares} SELECT l.id, 'Share ' || left(l.id, 8) AS name, ${orgFields}, l.status, l.created_at AS sort_at,
jsonb_build_object('status', l.status, 'views', l.views::text, 'max_views', l.max_views::text, 'expires', l.expires_at) AS values,
jsonb_build_object('created', l.created_at, 'last_revealed', l.last_revealed_at) AS details FROM owned_shares l JOIN organizations o ON o.id = l.organization_id` },
      activity: { nameLabel: "Operation", description: "User and machine operations during the selected period.", columns: [column("status", "Result", "status"), column("actor", "Actor type"), column("target", "Resource type"), column("created", "Recorded", "date")], details: [column("credential", "Credential type")], statuses: ["success", "failure", "denied"], sql: `SELECT a.id, a.action AS name, ${orgFields}, a.result AS status, a.created_at AS sort_at,
jsonb_build_object('status', a.result, 'actor', a.actor_type, 'target', a.target_type, 'created', a.created_at) AS values,
jsonb_build_object('credential', a.actor_credential) AS details FROM secret_audit_events a JOIN organizations o ON o.id = a.organization_id CROSS JOIN bounds b WHERE a.actor_type IN ('user', 'machine') AND a.created_at >= b.from_at AND a.created_at <= b.to_at` },
    },
    notes: ["Vault inventory is current. Audit trends retain activity from subsequently deleted resources until audit retention removes it.", "Only organization-owned share links can be attributed. Secret values, entry names, share keys, machine-token material, and audit metadata are never selected."],
  },
  uptime: {
    metrics: [metric("monitors", "Monitors", "Current monitors, including paused"), metric("down", "Down monitors", "Enabled monitors reporting down"), metric("overdue", "Overdue checks", "Next check is over 2 minutes late"), metric("published_pages", "Published pages", "Public status pages"), metric("confirmed_subscribers", "Confirmed subscribers", "Confirmed status-page subscriptions"), metric("open_incidents", "Open incidents", "Status-related incidents awaiting resolution")],
    breakdowns: [{ key: "monitor_health", title: "Monitor health", description: "Current stored state of enabled monitors; paused monitors are separate.", items: [item("up", "Up", "green"), item("down", "Down", "red"), item("unknown", "Unknown", "amber"), item("paused", "Paused", "neutral")] }, { key: "publication", title: "Incident publication", description: "Publication state of retained status incidents.", items: [item("detected", "Detected", "amber"), item("published_incidents", "Published", "purple"), item("ignored", "Ignored", "neutral")] }],
    stats: `, ${uptimeIncidents} SELECT count(*)::text AS monitors,
count(*) FILTER (WHERE m.enabled AND m.state = 'up')::text AS up, count(*) FILTER (WHERE m.enabled AND m.state = 'down')::text AS down,
count(*) FILTER (WHERE m.enabled AND m.state = 'unknown')::text AS unknown, count(*) FILTER (WHERE NOT m.enabled)::text AS paused,
count(*) FILTER (WHERE m.enabled AND m.next_check_at < b.to_at - interval '2 minutes')::text AS overdue,
(SELECT count(*)::text FROM uptime_status_pages WHERE published) AS published_pages,
(SELECT count(*)::text FROM uptime_subscribers s JOIN uptime_status_pages p ON p.id = s.page_id AND p.organization_id = s.organization_id WHERE s.status = 'confirmed') AS confirmed_subscribers,
(SELECT count(*)::text FROM status_incidents WHERE status = 'open') AS open_incidents,
(SELECT count(*)::text FROM status_incidents WHERE uptime_publication_state = 'detected') AS detected,
(SELECT count(*)::text FROM status_incidents WHERE uptime_publication_state = 'published') AS published_incidents,
(SELECT count(*)::text FROM status_incidents WHERE uptime_publication_state = 'ignored') AS ignored
FROM uptime_monitors m CROSS JOIN bounds b WHERE m.deleted_at IS NULL`,
    trend: { title: "Probe execution", description: "Completed checks and failures by day · UTC", series: [{ key: "checks", label: "Checks" }, { key: "failed", label: "Failed checks" }], sql: `SELECT to_char(c.day, 'YYYY-MM-DD') AS date, sum(c.checks::bigint)::text AS checks, sum(c.checks::bigint - c.successes::bigint)::text AS failed FROM uptime_daily_checks c CROSS JOIN bounds b WHERE c.day >= (b.from_at AT TIME ZONE 'UTC')::date AND c.day <= (b.to_at AT TIME ZONE 'UTC')::date GROUP BY c.day ORDER BY c.day` },
    views: {
      monitors: { nameLabel: "Monitor", description: "Current health and scheduling. Overdue checks are more than 2 minutes late.", columns: [column("status", "State", "status"), column("schedule", "Schedule", "status"), column("last_checked", "Last checked", "date"), column("failure_streak", "Failure streak", "number")], details: [column("host", "Target host"), column("method", "Method"), column("next_check", "Next check", "date"), column("created", "Created", "date")], statuses: ["up", "down", "unknown", "paused"], sql: `SELECT m.id, m.name, ${orgFields}, CASE WHEN NOT m.enabled THEN 'paused' ELSE m.state END AS status, m.created_at AS sort_at,
jsonb_build_object('status', CASE WHEN NOT m.enabled THEN 'paused' ELSE m.state END, 'schedule', CASE WHEN NOT m.enabled THEN 'paused' WHEN m.next_check_at < b.to_at - interval '2 minutes' THEN 'overdue' ELSE 'scheduled' END, 'last_checked', m.last_checked_at, 'failure_streak', m.failure_streak::text) AS values,
jsonb_build_object('host', (regexp_match(m.url, '^https?://(?:[^/@?#]*@)?([^/@?#]+)(?:[/?#]|$)', 'i'))[1], 'method', m.method, 'next_check', m.next_check_at, 'created', m.created_at) AS details FROM uptime_monitors m JOIN organizations o ON o.id = m.organization_id CROSS JOIN bounds b WHERE m.deleted_at IS NULL` },
      pages: { nameLabel: "Status page", description: "Publication, custom domains, provisioning, and confirmed subscribers.", columns: [column("status", "Publication", "status"), column("domain", "Custom domain"), column("domain_status", "Domain state", "status"), column("subscribers", "Confirmed subscribers", "number")], details: [column("slug", "Page slug"), column("page_provisioning", "Page provisioning", "status"), column("domain_provisioning", "Custom domain provisioning", "status"), column("subscriptions", "Subscriptions enabled"), column("created", "Created", "date")], statuses: ["published", "draft"], sql: `WITH subscribers AS (SELECT s.page_id, s.organization_id, count(*) AS subscribers FROM uptime_subscribers s JOIN uptime_status_pages p ON p.id = s.page_id AND p.organization_id = s.organization_id WHERE s.status = 'confirmed' GROUP BY s.page_id, s.organization_id) SELECT p.id, p.name, ${orgFields}, CASE WHEN p.published THEN 'published' ELSE 'draft' END AS status, p.created_at AS sort_at,
jsonb_build_object('status', CASE WHEN p.published THEN 'published' ELSE 'draft' END, 'domain', d.domain, 'domain_status', d.status, 'subscribers', coalesce(s.subscribers, 0)::text) AS values,
jsonb_build_object('slug', p.slug, 'page_provisioning', p.provider_status, 'domain_provisioning', d.provider_status, 'subscriptions', p.subscriptions_enabled, 'created', p.created_at) AS details FROM uptime_status_pages p JOIN organizations o ON o.id = p.organization_id LEFT JOIN domains d ON d.id = p.domain_id AND d.organization_id = p.organization_id LEFT JOIN subscribers s ON s.page_id = p.id AND s.organization_id = p.organization_id` },
      incidents: { nameLabel: "Incident", description: "Incidents started in this period, plus older incidents still open.", columns: [column("status", "Lifecycle", "status"), column("publication", "Publication", "status"), column("source", "Source"), column("started", "Started", "date")], details: [column("resolved", "Resolved", "date"), column("published", "Published", "date")], statuses: ["open", "resolved"], sql: `WITH ${uptimeIncidents} SELECT i.id, CASE WHEN i.uptime_publication_state = 'published' AND i.public_title IS NOT NULL THEN i.public_title ELSE 'Incident ' || left(i.id, 8) END AS name, ${orgFields}, i.status, i.started_at AS sort_at,
jsonb_build_object('status', i.status, 'publication', coalesce(i.uptime_publication_state, 'private'), 'source', i.source_type, 'started', i.started_at) AS values,
jsonb_build_object('resolved', i.resolved_at, 'published', i.uptime_published_at) AS details FROM status_incidents i JOIN organizations o ON o.id = i.organization_id CROSS JOIN bounds b WHERE i.started_at <= b.to_at AND (i.started_at >= b.from_at OR i.status = 'open')` },
    },
    notes: ["Monitor and alert states are current snapshots, not historical availability. Unknown and overdue are not assumed to be outages.", "Probe aggregates have a 90-day retention window. Status page visits are not measured here; subscriber counts are current configuration.", "Monitor URLs, headers, response matching text, subscriber addresses/tokens, and private incident investigation content are never selected."],
  },
  agent: {
    metrics: [metric("runs", "Runs started", "Started during the selected period"), metric("completion_rate", "Completion rate", "Completed / finished attempts · selected period", "percent"), metric("failed", "Failed attempts", "Failed runs · selected period"), metric("input_tokens", "Input tokens", "Recorded input usage · selected period"), metric("output_tokens", "Output tokens", "Recorded output usage · selected period"), metric("mean_duration", "Mean completed duration", "Average elapsed time for completed runs", "duration")],
    breakdowns: [{ key: "states", title: "Run reliability", description: "Outcomes for runs started during the selected period.", items: [item("complete", "Complete", "green"), item("failed", "Failed", "red"), item("cancelled", "Cancelled", "neutral"), item("running", "Running", "purple")] }, { key: "tokens", title: "Recorded token mix", description: "Input and output usage across all run outcomes.", items: [item("input_tokens", "Input tokens", "blue"), item("output_tokens", "Output tokens", "purple")] }],
    stats: `, ${agentCohort} SELECT count(*)::text AS runs, count(*) FILTER (WHERE status = 'complete')::text AS complete,
count(*) FILTER (WHERE status = 'failed')::text AS failed, count(*) FILTER (WHERE status = 'cancelled')::text AS cancelled, count(*) FILTER (WHERE status = 'running')::text AS running,
coalesce(sum(input_tokens::bigint), 0)::text AS input_tokens, coalesce(sum(output_tokens::bigint), 0)::text AS output_tokens,
(100.0 * count(*) FILTER (WHERE status = 'complete') / nullif(count(*) FILTER (WHERE status IN ('complete', 'failed', 'cancelled')), 0))::text AS completion_rate,
avg(duration_ms) FILTER (WHERE status = 'complete')::text AS mean_duration FROM run_cohort`,
    trend: { title: "Agent run activity", description: "Run starts and failed outcomes by day · UTC", series: [{ key: "runs", label: "Runs started" }, { key: "failed", label: "Failed attempts" }], sql: `, ${agentCohort} SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*)::text AS runs, count(*) FILTER (WHERE status = 'failed')::text AS failed FROM run_cohort GROUP BY 1 ORDER BY 1` },
    views: {
      runs: { nameLabel: "Run", description: "Run outcomes, token usage, and execution time for the selected period.", columns: [column("status", "Status", "status"), column("tokens", "Tokens", "number"), column("duration", "Duration", "duration"), column("started", "Started", "date")], details: [column("input_tokens", "Input tokens", "number"), column("output_tokens", "Output tokens", "number"), column("updated", "Stored state updated", "date"), column("completed", "Completed", "date")], statuses: ["running", "complete", "failed", "cancelled"], sql: `WITH ${agentCohort} SELECT r.id::text, 'Run ' || left(r.id::text, 8) AS name, ${orgFields}, r.status, r.started_at AS sort_at,
jsonb_build_object('status', r.status, 'tokens', (r.input_tokens::bigint + r.output_tokens::bigint)::text, 'duration', r.duration_ms::text, 'started', r.started_at) AS values,
jsonb_build_object('input_tokens', r.input_tokens::text, 'output_tokens', r.output_tokens::text, 'updated', r.updated_at, 'completed', r.completed_at) AS details FROM run_cohort r JOIN organizations o ON o.id = r.organization_id` },
      workspaces: { nameLabel: "Workspace", description: "Agent activity and reliability by workspace during the selected period.", columns: [column("status", "Period activity", "status"), column("runs", "Runs", "number"), column("tokens", "Tokens", "number"), column("completion_rate", "Completion", "percent")], details: [column("input_tokens", "Input tokens", "number"), column("output_tokens", "Output tokens", "number"), column("failed", "Failed attempts", "number"), column("mean_duration", "Mean completed duration", "duration"), column("last_run", "Last retained run start", "date")], statuses: ["active", "inactive"], sql: `WITH ${agentCohort}, cohort AS (SELECT organization_id, count(*) AS runs, count(*) FILTER (WHERE status = 'failed') AS failed, sum(input_tokens::bigint) AS input_tokens, sum(output_tokens::bigint) AS output_tokens, (100.0 * count(*) FILTER (WHERE status = 'complete') / nullif(count(*) FILTER (WHERE status IN ('complete', 'failed', 'cancelled')), 0)) AS completion_rate, avg(duration_ms) FILTER (WHERE status = 'complete') AS mean_duration FROM run_cohort GROUP BY organization_id), history AS (SELECT t.organization_id, max(r.started_at) AS last_run FROM agent_runs r JOIN agent_threads t ON t.id = r.thread_id CROSS JOIN bounds b WHERE r.started_at <= b.to_at GROUP BY t.organization_id)
SELECT o.id, o.name, ${orgFields}, CASE WHEN coalesce(c.runs, 0) > 0 THEN 'active' ELSE 'inactive' END AS status, h.last_run AS sort_at,
jsonb_build_object('status', CASE WHEN coalesce(c.runs, 0) > 0 THEN 'active' ELSE 'inactive' END, 'runs', coalesce(c.runs, 0)::text, 'tokens', (coalesce(c.input_tokens, 0) + coalesce(c.output_tokens, 0))::text, 'completion_rate', c.completion_rate::text) AS values,
jsonb_build_object('input_tokens', coalesce(c.input_tokens, 0)::text, 'output_tokens', coalesce(c.output_tokens, 0)::text, 'failed', coalesce(c.failed, 0)::text, 'mean_duration', c.mean_duration::text, 'last_run', h.last_run) AS details FROM organizations o JOIN history h ON h.organization_id = o.id LEFT JOIN cohort c ON c.organization_id = o.id` },
    },
    notes: ["Tokens are persisted run accounting, not a price estimate, an invoice, or a monthly Redis balance. No model-cost assumption is applied.", "Durations use valid terminal timestamps only; running attempts have no terminal duration. Counts reflect stored states until reconciliation.", "Agent conversations remain private. Only operational IDs, workspace attribution, timestamps, state, and numeric usage are selected."],
  },
};

function object(value: unknown): Row {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid admin product result");
  return value as Row;
}
function number(value: unknown, decimal = false): number {
  if (typeof value !== "number" && (typeof value !== "string" || !(decimal ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(value))) throw new Error("Invalid admin product aggregate");
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER || (!decimal && !Number.isSafeInteger(parsed))) throw new Error("Unsafe admin product aggregate");
  return parsed;
}
function value(raw: unknown, format?: AdminProductColumn["format"]): AdminProductValue {
  if (raw === null || raw === undefined) return null;
  if (format === "number" || format === "bytes") return number(raw);
  if (format === "duration" || format === "percent") return number(raw, true);
  if (format === "date") {
    const date = new Date(String(raw));
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid admin product date");
    return date.toISOString();
  }
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string" && typeof raw !== "number") throw new Error("Invalid admin product value");
  return String(raw);
}

export function parseAdminProductParams(product: string, query: URLSearchParams): { product: AdminProduct; params: Required<AdminProductParams> } {
  if (!adminProducts.includes(product as AdminProduct)) throw new AdminProductInputError("Unknown product");
  const selected = product as AdminProduct;
  for (const key of ["view", "range", "page", "search", "status"]) if (query.getAll(key).length > 1) throw new AdminProductInputError(`Duplicate ${key}`);
  const view = query.get("view") ?? adminProductPages[selected].views[0].id;
  if (!Object.hasOwn(definitions[selected].views, view)) throw new AdminProductInputError("Invalid view");
  const range = query.get("range") ?? "30d";
  if (!Object.hasOwn(ranges, range)) throw new AdminProductInputError("Invalid range");
  const rawPage = query.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(rawPage) || Number(rawPage) > 100000) throw new AdminProductInputError("Invalid page");
  const search = query.get("search")?.trim() ?? "";
  if (search.length > 150 || [...search].some(character => character.charCodeAt(0) < 32)) throw new AdminProductInputError("Invalid search");
  const status = query.get("status") ?? "";
  if (status && !definitions[selected].views[view].statuses.includes(status)) throw new AdminProductInputError("Invalid status");
  return { product: selected, params: { view, range: range as AdminUsageRange, page: Number(rawPage), search, status } };
}

function withBounds(sql: string) { return sql.startsWith(",") ? `WITH ${bounds}${sql}` : `WITH ${bounds} ${sql}`; }

/** SQL parameters are fixed: bounds, search, status, requested page, page size. */
export function adminProductResourceSql(product: AdminProduct, view: string): string {
  const definition = definitions[product]?.views[view];
  if (!definition) throw new AdminProductInputError("Invalid view");
  // A view's own CTEs are nested beneath the outer bounds CTE, never interpolated user input.
  return `WITH ${bounds}, filters AS (SELECT $5::text AS search, $6::text AS status, $7::integer AS requested_page, $8::integer AS page_size),
base AS MATERIALIZED (${definition.sql}), filtered AS MATERIALIZED (
SELECT r.* FROM base r CROSS JOIN filters f WHERE (f.search IS NULL OR position(lower(f.search) in lower(r.name || ' ' || r.organization_name || ' ' || r.organization_slug)) > 0) AND (f.status IS NULL OR r.status = f.status)
), totals AS (SELECT count(*) AS total FROM filtered), paging AS (
SELECT t.total, least(f.requested_page, greatest(1, ceil(t.total::numeric / f.page_size)::integer)) AS page, f.page_size FROM totals t CROSS JOIN filters f
)
SELECT total::text, page::text, coalesce((SELECT jsonb_agg(v) FROM (SELECT id, name, organization_id, organization_name, organization_slug, values, details FROM filtered ORDER BY sort_at DESC NULLS LAST, id ASC LIMIT (SELECT page_size FROM paging) OFFSET (SELECT (page - 1) * page_size FROM paging)) v), '[]'::jsonb) AS rows FROM paging`;
}

export function adminProductStatsSql(product: AdminProduct): string { return withBounds(definitions[product].stats); }
export function adminProductTrendSql(product: AdminProduct): string { return withBounds(definitions[product].trend.sql); }

export async function loadAdminProduct(product: AdminProduct, input: AdminProductParams = {}, options: { now?: Date; database?: AdminUsageDatabase } = {}): Promise<AdminProductResponse> {
  const query = new URLSearchParams();
  for (const [key, entry] of Object.entries(input)) if (entry !== undefined) query.set(key, String(entry));
  const { params } = parseAdminProductParams(product, query);
  const definition = definitions[product];
  const view = definition.views[params.view];
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new AdminProductInputError("Invalid date");
  const to = now.toISOString();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ranges[params.range] + 1)).toISOString();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const common = [from, to, month, previousMonth];
  const database = options.database ?? (await import("../db")).pool;
  const connection = await database.connect();
  let open = false;
  try {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    open = true;
    await connection.query("SET LOCAL statement_timeout = '10s'");
    await connection.query("SET LOCAL TIME ZONE 'UTC'");
    const statsResult = await connection.query(adminProductStatsSql(product), common);
    const trendResult = await connection.query(adminProductTrendSql(product), common);
    const resourceResult = await connection.query(adminProductResourceSql(product, params.view), [...common, params.search || null, params.status || null, params.page, pageSize]);
    const stats = object(statsResult.rows[0]);
    const resources = object(resourceResult.rows[0]);
    const total = number(resources.total);
    const page = number(resources.page);
    if (!Array.isArray(resources.rows)) throw new Error("Invalid admin product resources");
    const rows: AdminProductRecord[] = resources.rows.map(raw => {
      const row = object(raw);
      const values = object(row.values);
      const details = object(row.details);
      return { id: String(row.id), name: String(row.name), organization: { id: String(row.organization_id), name: String(row.organization_name), slug: String(row.organization_slug) }, values: Object.fromEntries(view.columns.map(column => [column.key, value(values[column.key], column.format)])), details: view.details?.map(column => ({ label: column.label, value: value(details[column.key], column.format), format: column.format })) };
    });
    const trendMap = new Map(trendResult.rows.map(row => [String(row.date), row]));
    const count = definition.trend.monthly ? 6 : ranges[params.range];
    const points = Array.from({ length: count }, (_, index) => {
      const date = definition.trend.monthly ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1)).toISOString().slice(0, 10) : new Date(new Date(from).getTime() + index * 86_400_000).toISOString().slice(0, 10);
      const row = trendMap.get(date);
      return { date, values: Object.fromEntries(definition.trend.series.map(series => [series.key, row ? number(row[series.key]) : 0])) };
    });
    const response: AdminProductResponse = {
      product, generatedAt: to, period: { range: params.range, from, to },
      metrics: definition.metrics.map(metric => ({ ...metric, value: stats[metric.key] === null ? null : number(stats[metric.key], metric.format === "duration" || metric.format === "percent") })),
      breakdowns: definition.breakdowns.map(breakdown => ({ ...breakdown, items: breakdown.items.map(item => ({ label: item.label, value: number(stats[item.key]), tone: item.tone })) })),
      trend: { title: definition.trend.title, description: definition.trend.description, interval: definition.trend.monthly ? "month" : "day", series: definition.trend.series, points },
      resources: { view: params.view, description: view.description, nameLabel: view.nameLabel, columns: view.columns, rows, statusOptions: view.statuses.map(status => ({ value: status, label: status.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") })), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } },
      notes: ["Metrics, breakdowns, and trends are platform-wide. Table view, search, status, and pagination only affect resource rows. Current inventory and UTC-month accounting do not change with the selected day range.", "Reports are aggregate/read-only snapshots. Deletion, retention, and the start of accounting can reduce historical evidence; zero does not prove a product was never used.", ...definition.notes],
    };
    await connection.query("COMMIT");
    open = false;
    return response;
  } catch (error) {
    if (open) await connection.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}
