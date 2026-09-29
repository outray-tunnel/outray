import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import pg, { type PoolClient } from "pg";
import { config } from "./config";
import { decryptMonitorHeaders, type EncryptedPayload } from "./crypto";
import { probeHttp, type ProbeMethod, type ProbeResult } from "./probe";
import { transitionMonitor, type MonitorState } from "./state";
import { pollUptimeNotifications } from "./notifications";

const workerId = `uptime-probe-${randomUUID()}`;
const { Pool } = pg;

export const databasePool = new Pool({
  connectionString: config.databaseUrl || undefined,
  ssl: config.databaseUrl && !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(config.databaseUrl).hostname.toLowerCase(),
  ) ? { rejectUnauthorized: config.sslRejectUnauthorized } : false,
  max: Math.max(3, config.concurrency + 2),
});

type MonitorRow = {
  id: string;
  organization_id: string;
  organization_slug: string;
  name: string;
  url: string;
  method: ProbeMethod;
  headers_ciphertext: EncryptedPayload | null;
  expected_status: number | null;
  response_text: string | null;
  notification_emails: string[];
  state: MonitorState;
  failure_streak: number;
  success_streak: number;
  lease_owner: string;
};

let polling = false;
let retaining = false;

export async function startUptimeWorker(): Promise<void> {
  if (!config.enabled || (!config.probesEnabled && !config.notificationsEnabled)) {
    console.info("[Uptime] Worker disabled by feature flags");
    return;
  }
  assertWorkerStartupPolicy(config);
  if (!config.databaseUrl) throw new WorkerStartupError("DATABASE_URL is required for Uptime worker");
  if (config.notificationsEnabled) {
    // Delivery links must never fall back to localhost in production.
    if (!validDashboardUrl(config.dashboardUrl) ||
        !validDashboardUrl(config.statusPublicUrl) ||
        !config.unsubscribeSecret) {
      throw new WorkerStartupError("Uptime notification URLs and signing secret must be explicit");
    }
  }
  await databasePool.query("SELECT 1");
  console.info("[Uptime] Worker ready");
  void cleanupHistory();
  setInterval(() => void cleanupHistory(), config.retentionIntervalMs);
  if (config.probesEnabled) {
    void pollMonitors();
    setInterval(() => void pollMonitors(), config.pollIntervalMs);
  }
  if (config.notificationsEnabled) {
    void pollUptimeNotifications(databasePool);
    setInterval(() => void pollUptimeNotifications(databasePool), config.pollIntervalMs);
  }
}

export class WorkerStartupError extends Error {}

export function assertWorkerStartupPolicy(input: {
  production: boolean;
  probesEnabled: boolean;
  egressPolicyReady: boolean;
}): void {
  if (input.production && input.probesEnabled && !input.egressPolicyReady) {
    throw new WorkerStartupError("Production Uptime probes require a verified egress policy");
  }
}

export function validDashboardUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      !url.username && !url.password && !url.search && !url.hash && !url.port &&
      isIP(url.hostname.replace(/^\[|\]$/g, "")) === 0 &&
      /^[a-z0-9.-]+$/i.test(url.hostname) && url.hostname.includes(".") &&
      !/\.(?:local|localhost|internal|test|invalid|example)$/i.test(url.hostname) &&
      url.pathname === "/";
  } catch {
    return false;
  }
}

async function pollMonitors() {
  if (polling) return;
  polling = true;
  try {
    const monitors = await claimDueMonitors();
    await mapConcurrent(monitors, config.concurrency, checkMonitor);
  } catch (error) {
    console.error("[Uptime] Monitor poll failed", safeErrorCode(error));
  } finally {
    polling = false;
  }
}

async function claimDueMonitors(): Promise<MonitorRow[]> {
  const result = await databasePool.query<MonitorRow>(
    `WITH due AS (
       SELECT id FROM uptime_monitors
       WHERE enabled = true AND deleted_at IS NULL
         AND next_check_at <= NOW()
         AND (lease_until IS NULL OR lease_until < NOW())
       ORDER BY next_check_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE uptime_monitors AS monitor
     SET lease_owner = $2, lease_until = NOW() + INTERVAL '30 seconds',
         next_check_at = NOW() + INTERVAL '1 minute', updated_at = NOW()
     FROM due, organizations AS organization
     WHERE monitor.id = due.id AND organization.id = monitor.organization_id
     RETURNING monitor.*, organization.slug AS organization_slug`,
    [Math.min(config.batchSize, config.concurrency), workerId],
  );
  return result.rows;
}

async function checkMonitor(monitor: MonitorRow) {
  let headers: Record<string, string>;
  try {
    headers = await decryptMonitorHeaders(databasePool,
      monitor.organization_id, monitor.id, monitor.headers_ciphertext);
  } catch {
    // A key/configuration problem is not evidence that the target is Down.
    console.error(`[Uptime] Cannot decrypt monitor configuration ${monitor.id}`);
    await releaseLease(monitor.id);
    return;
  }

  const result = await probeHttp({
    url: monitor.url,
    method: monitor.method,
    headers,
    expectedStatus: monitor.expected_status,
    responseText: monitor.response_text,
  });
  try {
    await persistCheck(monitor, result);
  } catch (error) {
    // No URL, header, response body, or thrown network message is logged.
    console.error(`[Uptime] Could not persist check ${monitor.id}`, safeErrorCode(error));
  }
}

async function releaseLease(monitorId: string) {
  await databasePool.query(
    `UPDATE uptime_monitors SET lease_owner = NULL, lease_until = NULL
     WHERE id = $1 AND lease_owner = $2`,
    [monitorId, workerId],
  );
}

async function persistCheck(claimed: MonitorRow, result: ProbeResult) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query<MonitorRow>(
      `SELECT monitor.*, organization.slug AS organization_slug
       FROM uptime_monitors AS monitor
       JOIN organizations AS organization ON organization.id = monitor.organization_id
       WHERE monitor.id = $1 AND monitor.lease_owner = $2
         AND monitor.enabled = true AND monitor.deleted_at IS NULL
       FOR UPDATE OF monitor`,
      [claimed.id, workerId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return;
    }
    const checkedAt = new Date();
    const transition = transitionMonitor(
      current.state, current.failure_streak, current.success_streak, result.success,
    );
    await client.query(
      `INSERT INTO uptime_checks
        (id, organization_id, monitor_id, checked_at, success, status_code, latency_ms, error_kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), current.organization_id, current.id, checkedAt, result.success,
        result.statusCode, result.latencyMs, result.errorKind],
    );
    await client.query(
      `UPDATE uptime_monitors SET
         state = $3, failure_streak = $4, success_streak = $5,
         last_checked_at = $6,
         last_state_changed_at = CASE WHEN state <> $3 THEN $6 ELSE last_state_changed_at END,
         lease_owner = NULL, lease_until = NULL, updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [current.id, workerId, transition.state, transition.failureStreak,
        transition.successStreak, checkedAt],
    );

    if (transition.incidentAction === "open") {
      const incident = await openIncident(client, current, checkedAt);
      if (incident) await enqueueTeamNotifications(client, current, incident,
        "firing", result.statusCode);
    } else if (transition.incidentAction === "resolve") {
      const incident = await resolveIncident(client, current, checkedAt);
      if (incident) await enqueueTeamNotifications(client, current, incident,
        "resolved", result.statusCode);
    } else if (transition.state === "down") {
      // Components added while an outage is open should be reflected as affected.
      await attachCurrentComponentsToOpenIncident(client, current);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type Incident = { id: string; started_at: Date };

async function affectedComponents(client: PoolClient, monitor: MonitorRow) {
  const rows = await client.query<{ id: string; name: string }>(
    `SELECT component.id, component.name
     FROM uptime_component_monitors AS association
     JOIN uptime_status_components AS component ON component.id = association.component_id
     WHERE association.monitor_id = $1 AND association.organization_id = $2
       AND component.organization_id = $2`,
    [monitor.id, monitor.organization_id],
  );
  return rows.rows;
}

async function attachComponents(client: PoolClient, monitor: MonitorRow, incidentId: string) {
  const components = await affectedComponents(client, monitor);
  for (const component of components) {
    await client.query(
      `INSERT INTO uptime_incident_components (organization_id, incident_id, component_id)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [monitor.organization_id, incidentId, component.id],
    );
  }
  return components;
}

async function openIncident(client: PoolClient, monitor: MonitorRow, checkedAt: Date): Promise<Incident | null> {
  const components = await affectedComponents(client, monitor);
  const insert = await client.query<Incident>(
    `INSERT INTO incidents (id, organization_id, source_type, source_id, status,
       title, source_snapshot, started_at, created_at, updated_at)
     VALUES ($1,$2,'uptime_monitor',$3,'open',$4,$5,$6,NOW(),NOW())
     ON CONFLICT DO NOTHING RETURNING id, started_at`,
    [randomUUID(), monitor.organization_id, monitor.id,
      `${monitor.name} is down`,
      JSON.stringify({ monitorName: monitor.name, affectedComponents: components }),
      checkedAt],
  );
  let incident = insert.rows[0];
  if (!incident) {
    const existing = await client.query<Incident>(
      `SELECT id, started_at FROM incidents
       WHERE organization_id = $1 AND source_type = 'uptime_monitor'
         AND source_id = $2 AND status = 'open' LIMIT 1`,
      [monitor.organization_id, monitor.id],
    );
    incident = existing.rows[0];
  }
  if (incident) await attachComponents(client, monitor, incident.id);
  return insert.rows[0] ?? null; // Only the transition's successful insert notifies.
}

async function attachCurrentComponentsToOpenIncident(client: PoolClient, monitor: MonitorRow) {
  const existing = await client.query<Incident>(
    `SELECT id, started_at FROM incidents WHERE organization_id = $1
       AND source_type = 'uptime_monitor' AND source_id = $2 AND status = 'open' LIMIT 1`,
    [monitor.organization_id, monitor.id],
  );
  if (existing.rows[0]) await attachComponents(client, monitor, existing.rows[0].id);
}

async function resolveIncident(client: PoolClient, monitor: MonitorRow, checkedAt: Date): Promise<Incident | null> {
  const result = await client.query<Incident>(
    `UPDATE incidents SET status = 'resolved', resolved_at = $3, updated_at = NOW()
     WHERE organization_id = $1 AND source_type = 'uptime_monitor'
       AND source_id = $2 AND status = 'open' RETURNING id, started_at`,
    [monitor.organization_id, monitor.id, checkedAt],
  );
  return result.rows[0] ?? null;
}

async function enqueueTeamNotifications(
  client: PoolClient,
  monitor: MonitorRow,
  incident: Incident,
  event: "firing" | "resolved",
  statusCode: number | null,
) {
  const payload = {
    monitorId: monitor.id,
    monitorName: monitor.name,
    organizationSlug: monitor.organization_slug,
    state: event,
    statusCode,
    incidentStartedAt: incident.started_at.toISOString(),
  };
  const destinations: Array<{ channel: "email" | "slack" | "discord"; recipient: string; fingerprint?: string }> = [];
  const validRecipients = await client.query<{ email: string }>(
    `SELECT DISTINCT users.email
     FROM users JOIN members ON members.user_id = users.id
     WHERE members.organization_id = $1
       AND lower(users.email) = ANY($2::text[])`,
    [monitor.organization_id, monitor.notification_emails.map((email) => email.toLowerCase())],
  );
  for (const member of validRecipients.rows) destinations.push({ channel: "email", recipient: member.email });
  const integrations = await client.query<{ provider: "slack" | "discord"; webhook_ciphertext: EncryptedPayload }>(
    `SELECT provider, webhook_ciphertext FROM uptime_integrations
     WHERE organization_id = $1`,
    [monitor.organization_id],
  );
  for (const integration of integrations.rows) {
    destinations.push({ channel: integration.provider, recipient: integration.provider,
      fingerprint: integration.webhook_ciphertext.fingerprint });
  }
  for (const destination of destinations) {
    await client.query(
      `INSERT INTO notifications (id, organization_id, incident_id, source_type,
         source_id, event, channel, recipient, payload, idempotency_key,
         status, attempts, max_attempts, next_attempt_at, created_at, updated_at)
       VALUES ($1,$2,$3,'uptime_monitor',$4,$5,$6,$7,$8,$9,
         'pending',0,5,NOW(),NOW(),NOW())
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [randomUUID(), monitor.organization_id, incident.id, monitor.id, event,
        destination.channel, destination.recipient,
        JSON.stringify({ ...payload, webhookFingerprint: destination.fingerprint }),
        `${incident.id}:${event}:${destination.channel}:${destination.recipient.toLowerCase()}`],
    );
  }
}

async function cleanupHistory() {
  if (retaining) return;
  retaining = true;
  try {
    await deleteExpiredInBatches(
      `WITH expired AS (
         SELECT id FROM uptime_checks
         WHERE checked_at < NOW() - INTERVAL '30 days'
         ORDER BY checked_at ASC LIMIT 10000
       ) DELETE FROM uptime_checks AS checks USING expired
         WHERE checks.id = expired.id`,
      100,
    );
    await deleteExpiredInBatches(
      `WITH expired AS (
         SELECT id FROM uptime_subscription_attempts
         WHERE created_at < NOW() - INTERVAL '2 days'
         ORDER BY created_at ASC LIMIT 10000
       ) DELETE FROM uptime_subscription_attempts AS attempts USING expired
         WHERE attempts.id = expired.id`,
      10,
    );
  } catch (error) {
    console.error("[Uptime] Retention cleanup failed", safeErrorCode(error));
  } finally {
    retaining = false;
  }
}

async function deleteExpiredInBatches(sql: string, maxBatches: number) {
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await databasePool.query(sql);
    if ((result.rowCount ?? 0) < 10_000) break;
  }
}

function safeErrorCode(error: unknown) {
  // Never serialize DB/network exception messages: they may contain query/URL data.
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code : "internal_error";
}

async function mapConcurrent<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  }));
}
