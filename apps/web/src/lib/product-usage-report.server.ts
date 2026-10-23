import productUsage, { type UsageAggregateReport, type UsageProduct } from "../../../../shared/product-usage";
const { usageProducts } = productUsage;
import type { AdminUsageDatabase } from "./admin-usage.server";

export class UsageAggregateInputError extends Error {}
export interface UsageAggregateParams { range: UsageAggregateReport["range"]; product?: UsageProduct; organizationId?: string }
export function parseUsageAggregateParams(search: URLSearchParams): UsageAggregateParams {
  for (const key of ["range", "product", "organizationId"]) if (search.getAll(key).length > 1) throw new UsageAggregateInputError(`Duplicate ${key}`);
  const range = search.get("range") ?? "30d";
  if (!["7d", "30d", "90d", "365d", "all"].includes(range)) throw new UsageAggregateInputError("Invalid range");
  const product = search.get("product") || undefined;
  if (product && !usageProducts.includes(product as UsageProduct)) throw new UsageAggregateInputError("Invalid product");
  const organizationId = search.get("organizationId") || undefined;
  if (organizationId && (organizationId.length > 128 || /[\u0000-\u001f\u007f]/.test(organizationId))) throw new UsageAggregateInputError("Invalid organizationId");
  return { range: range as UsageAggregateReport["range"], product: product as UsageProduct | undefined, organizationId };
}
function integer(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error("Invalid permanent usage aggregate");
  return value;
}
function timestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value as string);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid usage coverage timestamp");
  return date.toISOString();
}
const sources: Record<UsageProduct, string[]> = {
  tunnels: ["tunnel-opens", "tunnel-registrations", "tunnel-traffic"], secrets: ["secrets"],
  observability: ["telemetry", "alerts"], uptime: ["probe", "status-views"], agent: ["agent"],
};

export async function loadUsageAggregates(database: AdminUsageDatabase, params: UsageAggregateParams, now = new Date()): Promise<UsageAggregateReport> {
  const client = await database.connect();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = params.range === "all" ? null : new Date(day.getTime() - (Number(params.range.slice(0, -1)) - 1) * 86400000).toISOString().slice(0, 10);
  const org = params.organizationId ?? null;
  // Table selection is server-controlled; every value remains parameterized.
  const daily = org ? "organization_product_usage_daily" : "platform_product_usage_daily";
  const baseline = org ? "organization_product_usage_baselines" : "platform_product_usage_baselines";
  const scope = org ? "organization_id=$1" : "$1::text IS NULL";
  const values = [org, params.product ?? null, start];
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const totals = await client.query(`WITH daily AS (
      SELECT metric,sum(value) AS lifetime,coalesce(sum(value) FILTER(WHERE $3::date IS NULL OR day>=$3::date),0) AS period
      FROM ${daily} WHERE ${scope} GROUP BY metric
    ), baseline AS (SELECT metric,sum(value) AS amount FROM ${baseline} WHERE ${scope} GROUP BY metric)
    SELECT m.key,m.product,m.label,m.unit,(coalesce(d.lifetime,0)+coalesce(b.amount,0))::text AS lifetime,
      (coalesce(d.period,0)+CASE WHEN $3::date IS NULL THEN coalesce(b.amount,0) ELSE 0 END)::text AS period,
      coalesce(b.amount,0)::text AS baseline
    FROM product_usage_metrics m LEFT JOIN daily d ON d.metric=m.key LEFT JOIN baseline b ON b.metric=m.key
    WHERE $2::text IS NULL OR m.product=$2 ORDER BY m.product,m.key`, values);
    const dates = params.range === "all" ? "to_char(date_trunc('month',d.day),'YYYY-MM-01')" : "to_char(d.day,'YYYY-MM-DD')";
    // Verifiable calendar-month baselines belong in All time's monthly chart.
    // Unknown-day baselines cannot be assigned a point; bounded daily charts
    // never manufacture a daily allocation from a monthly total.
    const pointSource = params.range === "all" ? `(SELECT day,metric,value${org ? ",organization_id" : ""} FROM ${daily}
      UNION ALL SELECT period::date,metric,value${org ? ",organization_id" : ""} FROM ${baseline}
      WHERE period ~ '^[0-9]{4}-(0[1-9]|1[0-2])-01$')` : daily;
    const points = await client.query(`SELECT ${dates} AS date,d.metric,sum(d.value)::text AS value
      FROM ${pointSource} d JOIN product_usage_metrics m ON m.key=d.metric
      WHERE ${org ? "d.organization_id=$1" : "$1::text IS NULL"} AND ($2::text IS NULL OR m.product=$2)
      AND ($3::date IS NULL OR d.day>=$3::date) GROUP BY 1,d.metric ORDER BY 1,d.metric`, values);
    const coverage = await client.query(`SELECT c.*,
      CASE WHEN $2::text IS NULL THEN c.backfill_status WHEN b.status='complete' THEN 'partial'
        WHEN b.status IS NULL THEN 'not_started' ELSE b.status END AS backfill_status
      FROM product_usage_coverage c LEFT JOIN LATERAL (
        SELECT status FROM product_usage_backfill_checkpoints
        WHERE organization_id=$2 AND source=c.source ORDER BY updated_at DESC LIMIT 1
      ) b ON true WHERE $1::text[] IS NULL OR c.source=ANY($1::text[]) ORDER BY c.source`, [params.product ? sources[params.product] : null, org]);
    const pending = await client.query(`SELECT count(*) FILTER(WHERE status='pending')::text AS pending,
      count(*) FILTER(WHERE status='failed')::text AS failed,min(created_at) FILTER(WHERE status='pending') AS oldest
      FROM status_analytics_outbox WHERE $1::text IS NULL OR organization_id=$1`, [org]);
    const byDay = new Map<string, UsageAggregateReport["points"][number]>();
    for (const row of points.rows) {
      const date = String(row.date);
      const point = byDay.get(date) ?? { date, values: {} };
      point.values[row.metric as keyof typeof point.values] = integer(row.value);
      byDay.set(date, point);
    }
    await client.query("COMMIT");
    return {
      generatedAt: now.toISOString(), range: params.range, organizationId: org, interval: params.range === "all" ? "month" : "day",
      metrics: totals.rows.map(row => ({ key: row.key, product: row.product, label: row.label, unit: row.unit,
        lifetime: integer(row.lifetime), period: integer(row.period), historicalBaseline: integer(row.baseline) })) as UsageAggregateReport["metrics"],
      points: [...byDay.values()],
      coverage: coverage.rows.map(row => ({ source: String(row.source), collectionStartedAt: timestamp(row.collection_started_at), lastProcessedAt: timestamp(row.last_processed_at),
        backfill: String(row.backfill_status), earliestBackfillAt: timestamp(row.earliest_backfill_at), historicalComplete: false })),
      pending: { statusViews: integer(pending.rows[0]?.pending), failedStatusViews: integer(pending.rows[0]?.failed), oldestStatusViewAt: timestamp(pending.rows[0]?.oldest) },
    };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
