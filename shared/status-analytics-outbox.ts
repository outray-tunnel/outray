import { randomUUID } from "node:crypto";
import productUsage, { type UsageDatabase } from "./product-usage";
const { recordProductUsage } = productUsage;

export interface StatusAnalyticsEvent {
  timestamp: string; event_id: string; organization_id: string; page_id: string;
  visitor_hash: string; path: string; referrer: string; country: string; retention_days: number;
}
export interface UsagePool extends UsageDatabase { connect(): Promise<UsageDatabase & { release(): void }> }

/** Admission and permanent usage commit before attempting the expiring export. */
export async function admitStatusAnalytics(pool: UsagePool, event: StatusAnalyticsEvent, now = new Date()): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`status-usage:${event.page_id}:${event.event_id}`]);
    await client.query("SELECT id FROM organizations WHERE id=$1 FOR KEY SHARE", [event.organization_id]);
    const page = await client.query("SELECT id FROM uptime_status_pages WHERE id=$1 AND organization_id=$2 AND published FOR SHARE", [event.page_id, event.organization_id]);
    if (!page.rows.length) { await client.query("COMMIT"); return false; }
    const id = `${event.page_id}:${event.event_id}`;
    const exists = await client.query("SELECT 1 FROM product_usage_receipts WHERE organization_id=$1 AND source='status-views' AND event_id=$2", [event.organization_id, id]);
    if (exists.rows.length) { await client.query("COMMIT"); return false; }
    const recorded = await recordProductUsage(client, { organizationId: event.organization_id, source: "status-views", id,
      timestamp: now.toISOString(), deltas: { "uptime.status_views": 1 } });
    if (recorded) await client.query(
      `INSERT INTO status_analytics_outbox(organization_id,page_id,event_id,event,created_at,expires_at)
       VALUES($1,$2,$3,$4::jsonb,$5,$6)`,
      [event.organization_id, event.page_id, event.event_id, JSON.stringify(event), now,
        new Date(now.getTime() + Math.min(90, Math.max(1, event.retention_days)) * 86400000)],
    );
    await client.query("COMMIT");
    return recorded;
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function deliverStatusAnalyticsOutbox(database: UsageDatabase, options: {
  environment: Readonly<Record<string, string | undefined>>; fetch?: typeof fetch; limit?: number;
  pageId?: string; eventId?: string; logger?: Pick<Console, "error">;
}): Promise<number> {
  const host = options.environment.TINYBIRD_API_HOST?.replace(/\/$/, "");
  const token = options.environment.TINYBIRD_INGEST_TOKEN;
  if (!host || !token) return 0;
  const url = new URL(host);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Invalid analytics delivery origin");
  const owner = randomUUID();
  const result = await database.query(
    `WITH due AS (
       SELECT page_id,event_id FROM status_analytics_outbox
       WHERE status='pending' AND next_attempt_at<=now() AND expires_at>now()
         AND (lease_until IS NULL OR lease_until<now())
         AND ($3::text IS NULL OR page_id=$3) AND ($4::text IS NULL OR event_id=$4)
       ORDER BY next_attempt_at,page_id,event_id LIMIT $2 FOR UPDATE SKIP LOCKED
     ) UPDATE status_analytics_outbox o SET lease_owner=$1,lease_until=now()+interval '90 seconds',attempts=attempts+1
       FROM due WHERE o.page_id=due.page_id AND o.event_id=due.event_id RETURNING o.*`,
    [owner, Math.min(50, Math.max(1, options.limit ?? 25)), options.pageId ?? null, options.eventId ?? null],
  );
  let delivered = 0;
  for (const row of result.rows) {
    try {
      const event = row.event as StatusAnalyticsEvent;
      if (event.organization_id !== row.organization_id || event.page_id !== row.page_id || event.event_id !== row.event_id) throw new Error("Invalid queued analytics identity");
      const response = await (options.fetch ?? fetch)(`${host}/v0/events?name=status_page_views&wait=true`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-ndjson" },
        body: JSON.stringify(event) + "\n", signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error("Analytics delivery rejected"); }
      const acknowledgement = await response.json() as { successful_rows?: number; quarantined_rows?: number };
      if (acknowledgement.successful_rows !== 1 || acknowledgement.quarantined_rows) throw new Error("Analytics delivery rejected");
      await database.query("DELETE FROM status_analytics_outbox WHERE page_id=$1 AND event_id=$2 AND lease_owner=$3", [row.page_id, row.event_id, owner]);
      delivered++;
    } catch {
      await database.query(
        `UPDATE status_analytics_outbox SET status=CASE WHEN attempts>=10 THEN 'failed' ELSE 'pending' END,
         next_attempt_at=now()+($4 * interval '1 second'),lease_owner=NULL,lease_until=NULL
         WHERE page_id=$1 AND event_id=$2 AND lease_owner=$3`,
        [row.page_id, row.event_id, owner, Math.min(3600, 30 * 2 ** Math.min(row.attempts - 1, 7))],
      );
      (options.logger ?? console).error("[Status analytics] Durable delivery will retry or requires attention; permanent totals were retained");
    }
  }
  return delivered;
}

/** Expire transport bookkeeping, never permanent aggregates. */
export async function cleanupProductUsage(database: UsageDatabase) {
  await database.query(`WITH expired AS (SELECT organization_id,source,event_id FROM product_usage_receipts WHERE created_at<now()-interval '120 days' ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED)
    DELETE FROM product_usage_receipts r USING expired e WHERE r.organization_id=e.organization_id AND r.source=e.source AND r.event_id=e.event_id`);
  const expired = await database.query(`WITH expired AS (SELECT page_id,event_id FROM status_analytics_outbox WHERE expires_at<=now() ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED)
    DELETE FROM status_analytics_outbox o USING expired e WHERE o.page_id=e.page_id AND o.event_id=e.event_id RETURNING o.status`);
  if (expired.rows.length) console.error("[Status analytics] Expired undelivered analytics records; permanent counts remain available");
}
export default { admitStatusAnalytics, deliverStatusAnalyticsOutbox, cleanupProductUsage };
