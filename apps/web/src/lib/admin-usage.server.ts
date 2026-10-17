import { adminProducts, type AdminProduct, type AdminProductUsage, type AdminUsageParams, type AdminUsageRange, type AdminUsageResponse, type AdminWorkspaceUsage } from "./admin-usage";

export const ADMIN_USAGE_PAGE_SIZE = 25;
const dayMs = 86_400_000;
const rangeDays: Record<AdminUsageRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

export class AdminUsageInputError extends Error {}

type UsageParams = Required<Pick<AdminUsageParams, "range" | "page">> & Omit<AdminUsageParams, "range" | "page">;
type Row = Record<string, unknown>;
export interface AdminUsageConnection {
  query(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
  release(): void;
}
export interface AdminUsageDatabase { connect(): Promise<AdminUsageConnection> }

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/** Bound every user-controlled query dimension before any aggregate is run. */
export function parseAdminUsageParams(query: URLSearchParams): UsageParams {
  for (const key of ["range", "page", "search", "product", "organizationId"]) {
    if (query.getAll(key).length > 1) throw new AdminUsageInputError(`Duplicate ${key}`);
  }
  const rawPage = query.get("page");
  if (rawPage !== null && !/^[1-9]\d{0,5}$/.test(rawPage)) throw new AdminUsageInputError("Invalid page");
  const range = query.get("range") ?? "30d";
  if (!Object.hasOwn(rangeDays, range)) throw new AdminUsageInputError("Invalid range");
  const search = query.get("search")?.trim() || undefined;
  if (search && (search.length > 150 || hasControlCharacter(search))) throw new AdminUsageInputError("Invalid search");
  const product = query.get("product") || undefined;
  if (product && !adminProducts.includes(product as AdminProduct)) throw new AdminUsageInputError("Invalid product");
  const organizationId = query.get("organizationId") || undefined;
  if (organizationId && (organizationId.length > 128 || hasControlCharacter(organizationId))) {
    throw new AdminUsageInputError("Invalid organizationId");
  }
  return { range: range as AdminUsageRange, page: rawPage ? Number(rawPage) : 1, search, product: product as AdminProduct | undefined, organizationId };
}

function safeNumber(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) {
    throw new Error("Invalid aggregate in admin usage");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Unsafe aggregate in admin usage");
  return parsed;
}

function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid admin usage result");
  return value as Row;
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error("Invalid admin usage rows");
  return value.map(object);
}

function dateValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid admin usage date");
  return date.toISOString();
}

/* Each source is reduced to one row per organization before it is joined.
 * No secret names/values, request payloads, chat messages or credentials are read.
 * $1/$2 = UTC period bounds; $3 = optional organization scope; $4/$5 = matrix
 * search/product only; $6/$7 = bounded page size and offset; $8 = UTC month. */
export const adminUsageSnapshotSql = `WITH
scoped_orgs AS MATERIALIZED (
  SELECT id, name, slug FROM organizations WHERE ($3::text IS NULL OR id = $3)
),
tunnel_usage AS (
  SELECT t.organization_id, count(*) AS tunnels,
    count(*) FILTER (WHERE t.last_seen_at >= ($1::timestamptz AT TIME ZONE 'UTC') AND t.last_seen_at <= ($2::timestamptz AT TIME ZONE 'UTC')) AS seen_tunnels,
    max(t.last_seen_at AT TIME ZONE 'UTC') FILTER (WHERE t.last_seen_at <= ($2::timestamptz AT TIME ZONE 'UTC')) AS last_activity_at
  FROM tunnels t JOIN scoped_orgs o ON o.id = t.organization_id GROUP BY t.organization_id
),
subdomain_usage AS (
  SELECT s.organization_id, count(*) AS subdomains FROM subdomains s
  JOIN scoped_orgs o ON o.id = s.organization_id GROUP BY s.organization_id
),
domain_usage AS (
  SELECT d.organization_id, count(*) AS domains FROM domains d
  JOIN scoped_orgs o ON o.id = d.organization_id WHERE d.purpose = 'tunnel' GROUP BY d.organization_id
),
telemetry_usage AS (
  SELECT u.organization_id, bool_or(u.used > 0) AS has_history,
    coalesce(sum(u.used) FILTER (WHERE u.month = $8::date), 0) AS month_bytes,
    max(u.updated_at) FILTER (WHERE u.used > 0 AND u.updated_at <= $2::timestamptz) AS last_activity_at
  FROM organization_monthly_usage u JOIN scoped_orgs o ON o.id = u.organization_id
  WHERE u.metric = 'telemetry_bytes' AND u.month <= $8::date GROUP BY u.organization_id
),
alert_usage AS (
  SELECT a.organization_id, count(*) AS alerts, count(*) FILTER (WHERE a.enabled) AS enabled_alerts
  FROM observability_alerts a JOIN scoped_orgs o ON o.id = a.organization_id
  WHERE a.deleted_at IS NULL GROUP BY a.organization_id
),
vault_usage AS (
  SELECT p.organization_id, count(*) AS vaults FROM secret_projects p
  JOIN scoped_orgs o ON o.id = p.organization_id WHERE p.deleted_at IS NULL GROUP BY p.organization_id
),
environment_usage AS (
  SELECT e.organization_id, count(*) AS environments FROM secret_environments e
  JOIN secret_projects p ON p.id = e.project_id AND p.organization_id = e.organization_id AND p.deleted_at IS NULL
  JOIN scoped_orgs o ON o.id = e.organization_id WHERE e.deleted_at IS NULL GROUP BY e.organization_id
),
entry_usage AS (
  SELECT e.organization_id, count(*) AS secrets FROM secret_entries e
  JOIN secret_environments v ON v.id = e.environment_id AND v.organization_id = e.organization_id AND v.project_id = e.project_id AND v.deleted_at IS NULL
  JOIN secret_projects p ON p.id = e.project_id AND p.organization_id = e.organization_id AND p.deleted_at IS NULL
  JOIN scoped_orgs o ON o.id = e.organization_id WHERE e.deleted_at IS NULL GROUP BY e.organization_id
),
secret_activity AS (
  SELECT a.organization_id, count(*) AS operations, max(a.created_at) AS last_activity_at
  FROM secret_audit_events a JOIN scoped_orgs o ON o.id = a.organization_id
  WHERE a.result = 'success' AND a.actor_type IN ('user', 'machine')
    AND a.created_at >= $1::timestamptz AND a.created_at <= $2::timestamptz
  GROUP BY a.organization_id
),
monitor_usage AS (
  SELECT m.organization_id, count(*) FILTER (WHERE m.deleted_at IS NULL) AS monitors,
    count(*) FILTER (WHERE m.deleted_at IS NULL AND m.enabled) AS enabled_monitors,
    max(m.last_checked_at) FILTER (WHERE m.last_checked_at <= $2::timestamptz) AS last_activity_at
  FROM uptime_monitors m JOIN scoped_orgs o ON o.id = m.organization_id GROUP BY m.organization_id
),
check_usage AS (
  SELECT c.organization_id, sum(c.checks::bigint) AS checks, sum(c.successes::bigint) AS successes
  FROM uptime_daily_checks c JOIN scoped_orgs o ON o.id = c.organization_id
  WHERE c.day >= ($1::timestamptz AT TIME ZONE 'UTC')::date AND c.day <= ($2::timestamptz AT TIME ZONE 'UTC')::date
  GROUP BY c.organization_id
),
page_usage AS (
  SELECT p.organization_id, count(*) AS published_pages FROM uptime_status_pages p
  JOIN scoped_orgs o ON o.id = p.organization_id WHERE p.published GROUP BY p.organization_id
),
agent_usage AS (
  SELECT t.organization_id, count(*) AS all_runs,
    count(*) FILTER (WHERE r.started_at >= $1::timestamptz) AS runs,
    count(*) FILTER (WHERE r.started_at >= $1::timestamptz AND r.status = 'complete') AS completed_runs,
    count(*) FILTER (WHERE r.started_at >= $1::timestamptz AND r.status = 'failed') AS failed_runs,
    coalesce(sum(r.input_tokens::bigint + r.output_tokens::bigint) FILTER (WHERE r.started_at >= $1::timestamptz), 0) AS tokens,
    max(r.started_at) AS last_activity_at
  FROM agent_runs r JOIN agent_threads t ON t.id = r.thread_id JOIN scoped_orgs o ON o.id = t.organization_id
  WHERE r.started_at <= $2::timestamptz GROUP BY t.organization_id
),
workspace_usage AS MATERIALIZED (
  SELECT o.id, o.name, o.slug, coalesce(s.plan, 'free') AS plan,
    coalesce(t.tunnels, 0) AS tunnels, coalesce(t.seen_tunnels, 0) AS seen_tunnels,
    coalesce(sd.subdomains, 0) AS subdomains, coalesce(d.domains, 0) AS domains,
    coalesce(a.alerts, 0) AS alerts, coalesce(a.enabled_alerts, 0) AS enabled_alerts,
    coalesce(v.vaults, 0) AS vaults, coalesce(e.environments, 0) AS environments, coalesce(se.secrets, 0) AS secrets,
    coalesce(sa.operations, 0) AS secret_operations,
    coalesce(m.monitors, 0) AS monitors, coalesce(m.enabled_monitors, 0) AS enabled_monitors,
    coalesce(p.published_pages, 0) AS published_pages,
    coalesce(c.checks, 0) AS uptime_checks, coalesce(c.successes, 0) AS uptime_successes,
    coalesce(u.month_bytes, 0) AS month_bytes,
    coalesce(ag.runs, 0) AS agent_runs, coalesce(ag.tokens, 0) AS agent_tokens,
    coalesce(ag.failed_runs, 0) AS failed_runs, coalesce(ag.completed_runs, 0) AS completed_runs,
    array_remove(ARRAY[
      CASE WHEN coalesce(t.tunnels, 0) + coalesce(sd.subdomains, 0) + coalesce(d.domains, 0) > 0 THEN 'tunnels' END,
      CASE WHEN coalesce(u.has_history, false) OR coalesce(a.alerts, 0) > 0 THEN 'observability' END,
      CASE WHEN coalesce(v.vaults, 0) > 0 THEN 'secrets' END,
      CASE WHEN coalesce(m.monitors, 0) + coalesce(p.published_pages, 0) > 0 THEN 'uptime' END,
      CASE WHEN coalesce(ag.all_runs, 0) > 0 THEN 'agent' END
    ], NULL)::text[] AS products,
    greatest(t.last_activity_at, u.last_activity_at, sa.last_activity_at, m.last_activity_at, ag.last_activity_at) AS last_activity_at
  FROM scoped_orgs o
  LEFT JOIN subscriptions s ON s.organization_id = o.id
  LEFT JOIN tunnel_usage t ON t.organization_id = o.id
  LEFT JOIN subdomain_usage sd ON sd.organization_id = o.id
  LEFT JOIN domain_usage d ON d.organization_id = o.id
  LEFT JOIN telemetry_usage u ON u.organization_id = o.id
  LEFT JOIN alert_usage a ON a.organization_id = o.id
  LEFT JOIN vault_usage v ON v.organization_id = o.id
  LEFT JOIN environment_usage e ON e.organization_id = o.id
  LEFT JOIN entry_usage se ON se.organization_id = o.id
  LEFT JOIN secret_activity sa ON sa.organization_id = o.id
  LEFT JOIN monitor_usage m ON m.organization_id = o.id
  LEFT JOIN check_usage c ON c.organization_id = o.id
  LEFT JOIN page_usage p ON p.organization_id = o.id
  LEFT JOIN agent_usage ag ON ag.organization_id = o.id
),
filtered AS (
  SELECT * FROM workspace_usage w
  WHERE ($4::text IS NULL OR position(lower($4::text) in lower(w.name || ' ' || w.slug)) > 0)
    AND ($5::text IS NULL OR $5 = ANY(w.products))
)
SELECT
  (SELECT row_to_json(v) FROM (SELECT
    count(*)::text AS organizations,
    (SELECT count(*)::text FROM users u WHERE $3::text IS NULL OR EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id AND m.organization_id = $3)) AS users,
    count(*) FILTER (WHERE cardinality(products) > 0)::text AS adopted_organizations,
    count(*) FILTER (WHERE cardinality(products) > 1)::text AS multi_product_organizations,
    coalesce(sum(cardinality(products)), 0)::text AS product_configurations
  FROM workspace_usage) v) AS summary,
  (SELECT row_to_json(v) FROM (SELECT
    count(*) FILTER (WHERE 'tunnels' = ANY(products))::text AS tunnels_configured,
    count(*) FILTER (WHERE seen_tunnels > 0)::text AS tunnels_active,
    coalesce(sum(tunnels), 0)::text AS tunnels, coalesce(sum(seen_tunnels), 0)::text AS seen_tunnels,
    coalesce(sum(subdomains), 0)::text AS subdomains, coalesce(sum(domains), 0)::text AS domains,
    count(*) FILTER (WHERE 'observability' = ANY(products))::text AS observability_configured,
    count(*) FILTER (WHERE month_bytes > 0)::text AS observability_active,
    coalesce(sum(month_bytes), 0)::text AS month_bytes,
    coalesce(sum(alerts), 0)::text AS alerts, coalesce(sum(enabled_alerts), 0)::text AS enabled_alerts,
    count(*) FILTER (WHERE 'secrets' = ANY(products))::text AS secrets_configured,
    count(*) FILTER (WHERE secret_operations > 0)::text AS secrets_active,
    coalesce(sum(vaults), 0)::text AS vaults, coalesce(sum(environments), 0)::text AS environments,
    coalesce(sum(secrets), 0)::text AS secrets, coalesce(sum(secret_operations), 0)::text AS secret_operations,
    count(*) FILTER (WHERE 'uptime' = ANY(products))::text AS uptime_configured,
    count(*) FILTER (WHERE uptime_checks > 0)::text AS uptime_active,
    coalesce(sum(monitors), 0)::text AS monitors, coalesce(sum(enabled_monitors), 0)::text AS enabled_monitors,
    coalesce(sum(published_pages), 0)::text AS published_pages,
    coalesce(sum(uptime_checks), 0)::text AS uptime_checks, coalesce(sum(uptime_successes), 0)::text AS uptime_successes,
    count(*) FILTER (WHERE 'agent' = ANY(products))::text AS agent_configured,
    count(*) FILTER (WHERE agent_runs > 0)::text AS agent_active,
    coalesce(sum(agent_runs), 0)::text AS agent_runs, coalesce(sum(agent_tokens), 0)::text AS agent_tokens,
    coalesce(sum(failed_runs), 0)::text AS failed_runs, coalesce(sum(completed_runs), 0)::text AS completed_runs
  FROM workspace_usage) v) AS totals,
  (SELECT count(*)::text FROM filtered) AS total,
  coalesce((SELECT jsonb_agg(v) FROM (SELECT id, name, slug, plan, products, last_activity_at,
    tunnels::text, alerts::text, vaults::text, secrets::text, monitors::text, published_pages::text,
    month_bytes::text, secret_operations::text, uptime_checks::text, agent_runs::text, agent_tokens::text
    FROM filtered ORDER BY last_activity_at DESC NULLS LAST, id ASC LIMIT $6 OFFSET $7) v), '[]'::jsonb) AS organizations`;

export const adminUsageDailySql = `WITH scoped_orgs AS (
  SELECT id FROM organizations WHERE ($3::text IS NULL OR id = $3)
), events AS (
  SELECT (a.created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS secret_operations,
    0::bigint AS uptime_checks, 0::bigint AS agent_runs, 0::bigint AS agent_tokens, 0::bigint AS tunnels_created
  FROM secret_audit_events a JOIN scoped_orgs o ON o.id = a.organization_id
  WHERE a.result = 'success' AND a.actor_type IN ('user', 'machine') AND a.created_at >= $1::timestamptz AND a.created_at <= $2::timestamptz GROUP BY 1
  UNION ALL
  SELECT c.day, 0, sum(c.checks::bigint), 0, 0, 0 FROM uptime_daily_checks c
  JOIN scoped_orgs o ON o.id = c.organization_id
  WHERE c.day >= ($1::timestamptz AT TIME ZONE 'UTC')::date AND c.day <= ($2::timestamptz AT TIME ZONE 'UTC')::date GROUP BY 1
  UNION ALL
  SELECT (r.started_at AT TIME ZONE 'UTC')::date, 0, 0, count(*), sum(r.input_tokens::bigint + r.output_tokens::bigint), 0
  FROM agent_runs r JOIN agent_threads t ON t.id = r.thread_id JOIN scoped_orgs o ON o.id = t.organization_id
  WHERE r.started_at >= $1::timestamptz AND r.started_at <= $2::timestamptz GROUP BY 1
  UNION ALL
  SELECT t.created_at::date, 0, 0, 0, 0, count(*) FROM tunnels t JOIN scoped_orgs o ON o.id = t.organization_id
  WHERE t.created_at >= ($1::timestamptz AT TIME ZONE 'UTC') AND t.created_at <= ($2::timestamptz AT TIME ZONE 'UTC') GROUP BY 1
)
SELECT to_char(day, 'YYYY-MM-DD') AS date, sum(secret_operations)::text AS secret_operations,
  sum(uptime_checks)::text AS uptime_checks, sum(agent_runs)::text AS agent_runs,
  sum(agent_tokens)::text AS agent_tokens, sum(tunnels_created)::text AS tunnels_created
FROM events GROUP BY day ORDER BY day`;

export const adminUsageMonthlySql = `SELECT to_char(u.month, 'YYYY-MM') AS month,
  sum(u.used)::text AS bytes, count(DISTINCT u.organization_id) FILTER (WHERE u.used > 0)::text AS organizations
FROM organization_monthly_usage u JOIN organizations o ON o.id = u.organization_id
WHERE u.metric = 'telemetry_bytes' AND u.month >= $1::date AND u.month <= $2::date
  AND ($3::text IS NULL OR u.organization_id = $3)
GROUP BY u.month ORDER BY u.month`;

function productUsage(totals: Row): AdminProductUsage[] {
  const n = (key: string) => safeNumber(totals[key]);
  const metric = (key: string, label: string, window: "current" | "range" | "month", format: "number" | "bytes" | "percent" = "number") => ({ key, label, value: n(key), window, format });
  const base = (id: AdminProduct, name: string, activityWindow: "range" | "month", adoptionDefinition: string, activityDefinition: string) => ({
    id, name, configuredOrganizations: n(`${id}_configured`), activeOrganizations: n(`${id}_active`), activityWindow, adoptionDefinition, activityDefinition,
  });
  const checks = n("uptime_checks");
  return [
    { ...base("tunnels", "Tunnels", "range", "At least one registered tunnel, reserved subdomain, or tunnel domain.", "A retained tunnel was last seen during the selected period. This is not a live connection count."), metrics: [metric("tunnels", "Registered tunnels", "current"), metric("seen_tunnels", "Last seen in period", "range"), metric("subdomains", "Reserved subdomains", "current"), metric("domains", "Custom domains", "current")] },
    { ...base("observability", "Observability", "month", "Positive accepted telemetry history or at least one undeleted alert.", "Accepted normalized telemetry bytes in the current UTC calendar month, independently of the selected day range."), metrics: [metric("month_bytes", "Telemetry accepted this month", "month", "bytes"), metric("alerts", "Configured alerts", "current"), metric("enabled_alerts", "Enabled alerts", "current")] },
    { ...base("secrets", "Secrets", "range", "At least one undeleted vault.", "At least one successful audit-recorded operation by a user or machine in the selected period; system housekeeping is excluded."), metrics: [metric("vaults", "Vaults", "current"), metric("environments", "Environments", "current"), metric("secrets", "Stored secrets", "current"), metric("secret_operations", "Successful operations", "range")] },
    { ...base("uptime", "Uptime", "range", "At least one undeleted monitor or published status page.", "At least one check recorded in retained UTC daily probe aggregates during the selected period."), metrics: [metric("monitors", "Monitors", "current"), metric("enabled_monitors", "Enabled monitors", "current"), metric("published_pages", "Published status pages", "current"), metric("uptime_checks", "Probe checks", "range"), { key: "uptime_success_rate", label: "Successful checks", value: checks > 0 ? n("uptime_successes") / checks * 100 : null, format: "percent", window: "range" }] },
    { ...base("agent", "Agent", "range", "At least one retained agent run; empty threads are excluded.", "At least one run started in the selected period, including failed, cancelled, and currently running attempts."), metrics: [metric("agent_runs", "Runs started", "range"), metric("agent_tokens", "Recorded tokens", "range"), metric("completed_runs", "Completed runs", "range"), metric("failed_runs", "Failed runs", "range")] },
  ];
}

function workspace(row: Row): AdminWorkspaceUsage {
  if (!Array.isArray(row.products) || row.products.some(product => !adminProducts.includes(product as AdminProduct))) throw new Error("Invalid usage products");
  return {
    id: String(row.id), name: String(row.name), slug: String(row.slug), plan: String(row.plan), products: row.products as AdminProduct[],
    lastActivityAt: dateValue(row.last_activity_at), tunnels: safeNumber(row.tunnels), alerts: safeNumber(row.alerts),
    vaults: safeNumber(row.vaults), secrets: safeNumber(row.secrets), monitors: safeNumber(row.monitors),
    publishedStatusPages: safeNumber(row.published_pages), telemetryBytesMonth: safeNumber(row.month_bytes),
    secretOperations: safeNumber(row.secret_operations), uptimeChecks: safeNumber(row.uptime_checks), agentRuns: safeNumber(row.agent_runs), agentTokens: safeNumber(row.agent_tokens),
  };
}

/** Read-only, repeatable snapshot; injectable connection keeps tests off real databases. */
export async function loadAdminUsage(input: AdminUsageParams = {}, options: { now?: Date; database?: AdminUsageDatabase } = {}): Promise<AdminUsageResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined) query.set(key, String(value));
  const params = parseAdminUsageParams(query);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new AdminUsageInputError("Invalid date");
  const to = now.toISOString();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const from = new Date(today - (rangeDays[params.range] - 1) * dayMs).toISOString();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString().slice(0, 10);
  const database = options.database ?? (await import("../db")).pool;
  const connection = await database.connect();
  let transactionOpen = false;
  try {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    await connection.query("SET LOCAL statement_timeout = '10s'");
    await connection.query("SET LOCAL TIME ZONE 'UTC'");
    const snapshot = await connection.query(adminUsageSnapshotSql, [from, to, params.organizationId ?? null, params.search ?? null, params.product ?? null, ADMIN_USAGE_PAGE_SIZE, (params.page - 1) * ADMIN_USAGE_PAGE_SIZE, month]);
    const dailyResult = await connection.query(adminUsageDailySql, [from, to, params.organizationId ?? null]);
    const monthlyResult = await connection.query(adminUsageMonthlySql, [firstMonth, month, params.organizationId ?? null]);
    const result = object(snapshot.rows[0]);
    const summary = object(result.summary);
    const total = safeNumber(result.total);
    const dailyMap = new Map(dailyResult.rows.map(row => [String(row.date), row]));
    const monthlyMap = new Map(monthlyResult.rows.map(row => [String(row.month), row]));
    const daily = Array.from({ length: rangeDays[params.range] }, (_, index) => {
      const date = new Date(new Date(from).getTime() + index * dayMs).toISOString().slice(0, 10);
      const row = dailyMap.get(date);
      return { date, secretOperations: row ? safeNumber(row.secret_operations) : 0, uptimeChecks: row ? safeNumber(row.uptime_checks) : 0, agentRuns: row ? safeNumber(row.agent_runs) : 0, agentTokens: row ? safeNumber(row.agent_tokens) : 0, tunnelsCreated: row ? safeNumber(row.tunnels_created) : 0 };
    });
    const telemetryMonthly = Array.from({ length: 6 }, (_, index) => {
      const label = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1)).toISOString().slice(0, 7);
      const row = monthlyMap.get(label);
      return { month: label, bytes: row ? safeNumber(row.bytes) : 0, organizations: row ? safeNumber(row.organizations) : 0 };
    });
    const response: AdminUsageResponse = {
      generatedAt: to, period: { range: params.range, from, to, month: month.slice(0, 7) },
      summary: { organizations: safeNumber(summary.organizations), users: safeNumber(summary.users), adoptedOrganizations: safeNumber(summary.adopted_organizations), multiProductOrganizations: safeNumber(summary.multi_product_organizations), productConfigurations: safeNumber(summary.product_configurations) },
      products: productUsage(object(result.totals)), daily, telemetryMonthly,
      organizations: rows(result.organizations).map(workspace), pagination: { page: params.page, pageSize: ADMIN_USAGE_PAGE_SIZE, total, totalPages: Math.ceil(total / ADMIN_USAGE_PAGE_SIZE) },
      coverage: [
        "Configuration is a current snapshot, not historical adoption. Activity uses the definition shown for each product; there is no mixed-window global active count.",
        "Day ranges are UTC calendar days including today so far. Search and product filters affect the workspace table only; a workspace ID scopes the entire report.",
        "Observability bytes are accepted normalized telemetry, not compressed network traffic or HTTP request counts. Current-month activity and six calendar-month history are independent of the selected day range; earlier ingestion before accounting was enabled is not backfilled.",
        "Tunnel activity is each retained tunnel's last-seen snapshot, not every connection in the period. The daily tunnel series counts retained tunnel registrations, not HTTP requests or live connections.",
        "Secret counts exclude deleted vaults, environments, and entries, including children of deleted parents. Successful operations count retained user and machine audit events, including reads and writes, not unique secrets.",
        "Uptime activity counts retained daily probe checks, including checks from soft-deleted monitors. Published page and monitor totals describe current configuration, not public page views or human traffic.",
        "Agent tokens are persisted run usage attributed to the run start date, including failed attempts; running runs may not have final usage. Empty threads are not adoption, and these totals are not invoices or monthly Redis balances.",
        "Deleted organizations and hard-deleted resources are absent. Retention, deletion, and the start of accounting can reduce historical totals; a zero is no retained recorded evidence, not proof of no past use.",
        "Last activity is the latest observed retained tunnel sighting, positive telemetry counter update, monitor check, or agent run start, plus successful user/machine secret operations within the selected period—not a user's last login or complete all-time activity history.",
      ],
    };
    await connection.query("COMMIT");
    transactionOpen = false;
    return response;
  } catch (error) {
    if (transactionOpen) await connection.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}
