import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { config } from "../config";
import { sendAlertEmail, type AlertEmailPayload } from "./alert-email";
import {
  alertEvaluationWindow,
  evaluateAlertRule,
  type AlertMeasurement,
  type AlertRule,
} from "./alert-evaluator";
import { transitionAlertState, type AlertState } from "./alert-state";
import { databasePool } from "./database";

interface ClaimedAlertRow {
  id: string;
  organization_id: string;
  name: string;
  signal: AlertRule["signal"];
  service: string;
  environment: string | null;
  metric_name: string | null;
  metric_type: string | null;
  metric_unit: string | null;
  aggregation_temporality: string | null;
  is_monotonic: boolean | null;
  metric_aggregation: AlertRule["metricAggregation"];
  log_level: AlertRule["logLevel"];
  log_query: string | null;
  operator: AlertRule["operator"];
  threshold: number;
  window_minutes: number;
  minimum_samples: number;
  consecutive_failures: number;
  consecutive_recoveries: number;
  no_data_state: AlertRule["noDataState"];
  underlying_state: AlertState;
  failure_streak: number;
  recovery_streak: number;
  notification_email: string | null;
  muted_until: Date | null;
  lease_owner: string;
}

interface NotificationRow {
  id: string;
  organization_id: string;
  source_id: string;
  destination: string;
  payload: AlertEmailPayload;
  attempts: number;
  lease_owner: string;
}

const workerId = `cron-alerts-${randomUUID()}`;
const notificationConcurrency = 3;
let alertsPolling = false;
let notificationsPolling = false;
let retentionPolling = false;

export function startAlertWorkers() {
  if (!config.tinybirdApiHost || !config.tinybirdQueryToken) {
    console.warn(
      "[Alerts] Tinybird credentials are missing; evaluator worker is disabled",
    );
  } else {
    void pollAlerts();
    setInterval(() => void pollAlerts(), config.alertPollIntervalMs);
  }

  if (!config.zeptoApiKey) {
    console.warn(
      "[Alerts] ZEPTO_API_KEY is missing; notification delivery is disabled",
    );
  } else {
    void pollNotifications();
    setInterval(() => void pollNotifications(), config.alertPollIntervalMs);
  }

  void cleanupExpiredEvaluations();
  setInterval(() => void cleanupExpiredEvaluations(), 60_000);
}

async function pollAlerts() {
  if (alertsPolling) return;
  alertsPolling = true;
  try {
    const alerts = await claimDueAlerts();
    await mapConcurrent(
      alerts,
      config.alertEvaluationConcurrency,
      evaluateClaimedAlert,
    );
  } catch (error) {
    console.error("[Alerts] Failed to poll due alerts", error);
  } finally {
    alertsPolling = false;
  }
}

async function claimDueAlerts(): Promise<AlertRule[]> {
  const result = await databasePool.query<ClaimedAlertRow>(
    `WITH due AS (
       SELECT id
       FROM observability_alerts
       WHERE enabled = true
         AND deleted_at IS NULL
         AND next_evaluation_at <= NOW()
         AND (lease_until IS NULL OR lease_until < NOW())
       ORDER BY next_evaluation_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE observability_alerts AS alert
     SET lease_owner = $2,
         lease_until = NOW() + ($3 * INTERVAL '1 second'),
         next_evaluation_at = NOW() + (alert.evaluation_interval_seconds * INTERVAL '1 second'),
         updated_at = NOW()
     FROM due
     WHERE alert.id = due.id
     RETURNING alert.*`,
    [
      Math.min(config.alertBatchSize, config.alertEvaluationConcurrency),
      workerId,
      config.alertLeaseSeconds,
    ],
  );
  return result.rows.map(mapAlertRow);
}

async function evaluateClaimedAlert(alert: AlertRule) {
  const startedAt = Date.now();
  const attemptedAt = new Date();
  const attemptedWindow = alertEvaluationWindow(alert, attemptedAt);
  try {
    const measurement = await evaluateAlertRule(alert, attemptedAt);
    await persistMeasurement(alert, measurement, Date.now() - startedAt);
  } catch (error) {
    const message = safeError(error);
    console.error(`[Alerts] Evaluation failed for ${alert.id}: ${message}`);
    await persistEvaluationError(
      alert,
      message,
      Date.now() - startedAt,
      attemptedWindow,
    ).catch(
      (persistError) =>
        console.error(
          `[Alerts] Failed to persist evaluation error for ${alert.id}`,
          persistError,
        ),
    );
  }
}

async function persistMeasurement(
  claimed: AlertRule,
  measurement: AlertMeasurement,
  queryDurationMs: number,
) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    const current = await lockClaimedAlert(client, claimed.id, claimed.leaseOwner);
    if (!current) {
      await client.query("ROLLBACK");
      return;
    }

    const completedWindow = await client.query(
      `SELECT 1
       FROM observability_alert_evaluations
       WHERE alert_id = $1 AND window_ended_at = $2
         AND status IN ('success', 'no_data')
       LIMIT 1`,
      [current.id, measurement.evaluationEnd],
    );
    if (completedWindow.rowCount) {
      await client.query(
        `UPDATE observability_alerts
         SET lease_owner = NULL, lease_until = NULL, updated_at = NOW()
         WHERE id = $1 AND lease_owner = $2`,
        [current.id, current.leaseOwner],
      );
      await client.query("COMMIT");
      return;
    }

    const transition = transitionAlertState({
      state: current.state,
      failureStreak: current.failureStreak,
      recoveryStreak: current.recoveryStreak,
      consecutiveFailures: current.consecutiveFailures,
      consecutiveRecoveries: current.consecutiveRecoveries,
      noDataState: current.noDataState,
      observation: measurement.observation,
    });
    const evaluatedAt = new Date();

    await client.query(
      `INSERT INTO observability_alert_evaluations (
         id, alert_id, organization_id, evaluated_at, window_started_at, window_ended_at,
         status, value, sample_count, breached, previous_state, resulting_state,
         query_duration_ms, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
      [
        randomUUID(),
        current.id,
        current.organizationId,
        evaluatedAt,
        measurement.windowStart,
        measurement.evaluationEnd,
        measurement.observation === "no_data" ? "no_data" : "success",
        measurement.value,
        measurement.sampleCount,
        measurement.breached,
        current.state,
        transition.state,
        queryDurationMs,
      ],
    );

    await client.query(
      `UPDATE observability_alerts
       SET underlying_state = $3,
           current_value = $4,
           sample_count = $5,
           failure_streak = $6,
           recovery_streak = $7,
           last_evaluated_at = $8,
           last_state_changed_at = CASE
             WHEN underlying_state <> $3 THEN $8 ELSE last_state_changed_at
           END,
           last_evaluation_error = NULL,
           lease_owner = NULL,
           lease_until = NULL,
           updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [
        current.id,
        current.leaseOwner,
        transition.state,
        measurement.value,
        measurement.sampleCount,
        transition.failureStreak,
        transition.recoveryStreak,
        evaluatedAt,
      ],
    );

    let incident: { id: string; startedAt: Date } | null = null;
    if (transition.incidentAction === "open") {
      incident = await openIncident(client, current, measurement, evaluatedAt);
    } else if (transition.incidentAction === "resolve") {
      incident = await resolveIncident(client, current, measurement, evaluatedAt);
    } else if (transition.state === "firing") {
      await client.query(
        `UPDATE incidents
         SET last_value = $3, updated_at = NOW()
         WHERE source_type = 'observability_alert' AND source_id = $1
           AND organization_id = $2 AND status = 'open'`,
        [current.id, current.organizationId, measurement.value],
      );
    }

    const muted = Boolean(
      current.mutedUntil && current.mutedUntil.getTime() > evaluatedAt.getTime(),
    );
    if (
      incident &&
      current.notificationEmail &&
      !muted &&
      transition.incidentAction
    ) {
      await enqueueEmail(
        client,
        current,
        incident,
        transition.incidentAction === "open" ? "firing" : "resolved",
        measurement.value,
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function persistEvaluationError(
  alert: AlertRule,
  message: string,
  queryDurationMs: number,
  attemptedWindow: {
    windowStart: Date;
    evaluationEnd: Date;
  },
) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    const current = await lockClaimedAlert(client, alert.id, alert.leaseOwner);
    if (!current) {
      await client.query("ROLLBACK");
      return;
    }
    const now = new Date();
    await client.query(
      `INSERT INTO observability_alert_evaluations (
         id, alert_id, organization_id, evaluated_at, window_started_at, window_ended_at,
         status, value, sample_count, breached, previous_state, resulting_state,
         error, query_duration_ms, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'error',NULL,0,NULL,$7,$7,$8,$9,NOW())`,
      [
        randomUUID(),
        current.id,
        current.organizationId,
        now,
        attemptedWindow.windowStart,
        attemptedWindow.evaluationEnd,
        current.state,
        message.slice(0, 1_000),
        queryDurationMs,
      ],
    );
    await client.query(
      `UPDATE observability_alerts
       SET last_evaluated_at = $3,
           last_evaluation_error = $4,
           lease_owner = NULL,
           lease_until = NULL,
           updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [current.id, current.leaseOwner, now, message.slice(0, 1_000)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function lockClaimedAlert(
  client: PoolClient,
  alertId: string,
  leaseOwner: string,
) {
  const result = await client.query<ClaimedAlertRow & { organization_slug: string }>(
    `SELECT alert.*, organization.slug AS organization_slug
     FROM observability_alerts AS alert
     INNER JOIN organizations AS organization ON organization.id = alert.organization_id
     WHERE alert.id = $1 AND alert.lease_owner = $2
       AND alert.enabled = true AND alert.deleted_at IS NULL
     FOR UPDATE`,
    [alertId, leaseOwner],
  );
  const row = result.rows[0];
  return row
    ? { ...mapAlertRow(row), organizationSlug: row.organization_slug }
    : null;
}

async function openIncident(
  client: PoolClient,
  alert: AlertRule & { organizationSlug?: string },
  measurement: AlertMeasurement,
  evaluatedAt: Date,
) {
  const id = randomUUID();
  const inserted = await client.query<{ id: string; started_at: Date }>(
    `INSERT INTO incidents (
       id, organization_id, source_type, source_id, status, title,
       source_snapshot, trigger_value, last_value, started_at, created_at, updated_at
     ) VALUES ($1,$2,'observability_alert',$3,'open',$4,$5,$6,$6,$7,NOW(),NOW())
     ON CONFLICT DO NOTHING
     RETURNING id, started_at`,
    [
      id,
      alert.organizationId,
      alert.id,
      alert.name,
      JSON.stringify({
        alertName: alert.name,
        signal: alert.signal,
        service: alert.service,
        threshold: alert.threshold,
      }),
      measurement.value,
      evaluatedAt,
    ],
  );
  if (inserted.rows[0]) {
    return {
      id: inserted.rows[0].id,
      startedAt: inserted.rows[0].started_at,
    };
  }
  const existing = await client.query<{ id: string; started_at: Date }>(
    `SELECT id, started_at FROM incidents
     WHERE source_type = 'observability_alert' AND source_id = $1
       AND organization_id = $2 AND status = 'open'
     LIMIT 1`,
    [alert.id, alert.organizationId],
  );
  return existing.rows[0]
    ? { id: existing.rows[0].id, startedAt: existing.rows[0].started_at }
    : null;
}

async function resolveIncident(
  client: PoolClient,
  alert: AlertRule,
  measurement: AlertMeasurement,
  evaluatedAt: Date,
) {
  const result = await client.query<{ id: string; started_at: Date }>(
    `UPDATE incidents
     SET status = 'resolved', resolved_at = $3, resolved_value = $4,
         last_value = $4, updated_at = NOW()
     WHERE source_type = 'observability_alert' AND source_id = $1
       AND organization_id = $2 AND status = 'open'
     RETURNING id, started_at`,
    [alert.id, alert.organizationId, evaluatedAt, measurement.value],
  );
  return result.rows[0]
    ? { id: result.rows[0].id, startedAt: result.rows[0].started_at }
    : null;
}

async function enqueueEmail(
  client: PoolClient,
  alert: AlertRule & { organizationSlug?: string },
  incident: { id: string; startedAt: Date },
  event: "firing" | "resolved",
  value: number | null,
) {
  const destination = alert.notificationEmail;
  if (!destination) return;
  const payload: AlertEmailPayload = {
    alertId: alert.id,
    alertName: alert.name,
    organizationSlug: alert.organizationSlug,
    service: alert.service,
    signal: alert.signal,
    state: event,
    value,
    threshold: alert.threshold,
    incidentStartedAt: incident.startedAt.toISOString(),
  };
  await client.query(
    `INSERT INTO notifications (
       id, organization_id, incident_id, source_type, source_id, event,
       channel, recipient, payload, idempotency_key, status, attempts,
       max_attempts, next_attempt_at, created_at, updated_at
     ) VALUES ($1,$2,$3,'observability_alert',$4,$5,'email',$6,$7,$8,'pending',0,5,NOW(),NOW(),NOW())
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      randomUUID(),
      alert.organizationId,
      incident.id,
      alert.id,
      event,
      destination,
      JSON.stringify(payload),
      `${incident.id}:${event}:email:${destination.toLowerCase()}`,
    ],
  );
}

async function pollNotifications() {
  if (notificationsPolling) return;
  notificationsPolling = true;
  try {
    const notifications = await claimNotifications();
    await mapConcurrent(
      notifications,
      notificationConcurrency,
      deliverNotification,
    );
  } catch (error) {
    console.error("[Alerts] Failed to poll notifications", error);
  } finally {
    notificationsPolling = false;
  }
}

async function claimNotifications(): Promise<NotificationRow[]> {
  await suppressMutedNotifications();
  const result = await databasePool.query<NotificationRow>(
    `WITH due AS (
       SELECT id
       FROM notifications
       WHERE channel = 'email'
         AND attempts < max_attempts
         AND next_attempt_at <= NOW()
         AND (
           status = 'pending'
           OR (status = 'processing' AND lease_until < NOW())
         )
       ORDER BY next_attempt_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE notifications AS notification
     SET status = 'processing', lease_owner = $2,
         lease_until = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW()
     FROM due
     WHERE notification.id = due.id
     RETURNING notification.id, notification.organization_id,
               notification.source_id,
               notification.recipient AS destination, notification.payload,
               notification.attempts, notification.lease_owner`,
    [
      Math.min(config.alertBatchSize, notificationConcurrency),
      workerId,
      config.alertLeaseSeconds,
    ],
  );
  return result.rows;
}

async function deliverNotification(notification: NotificationRow) {
  try {
    if (await alertSuppressesNotification(notification)) {
      await databasePool.query(
        `UPDATE notifications
         SET status = 'suppressed', lease_owner = NULL, lease_until = NULL,
             last_error = NULL, updated_at = NOW()
         WHERE id = $1 AND lease_owner = $2`,
        [notification.id, notification.lease_owner],
      );
      return;
    }
    await sendAlertEmail(notification.destination, notification.payload);
    await databasePool.query(
      `UPDATE notifications
       SET status = 'sent', sent_at = NOW(), attempts = attempts + 1,
           lease_owner = NULL, lease_until = NULL, last_error = NULL,
           updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [notification.id, notification.lease_owner],
    );
  } catch (error) {
    const message = safeError(error);
    const attempts = notification.attempts + 1;
    const permanent = isPermanentDeliveryError(error) || attempts >= 5;
    const delaySeconds = Math.min(3_600, 30 * 2 ** Math.max(0, attempts - 1));
    await databasePool.query(
      `UPDATE notifications
       SET status = $3, attempts = attempts + 1,
           next_attempt_at = NOW() + ($4 * INTERVAL '1 second'),
           lease_owner = NULL, lease_until = NULL, last_error = $5,
           updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`,
      [
        notification.id,
        notification.lease_owner,
        permanent ? "failed" : "pending",
        delaySeconds,
        message.slice(0, 1_000),
      ],
    );
    console.error(
      `[Alerts] Notification ${notification.id} delivery failed: ${message}`,
    );
  }
}

async function suppressMutedNotifications() {
  await databasePool.query(
    `UPDATE notifications AS notification
     SET status = 'suppressed', lease_owner = NULL, lease_until = NULL,
         last_error = NULL, updated_at = NOW()
     WHERE notification.source_type = 'observability_alert'
       AND notification.channel = 'email'
       AND (
         notification.status = 'pending'
         OR (
           notification.status = 'processing'
           AND notification.lease_until < NOW()
         )
       )
       AND EXISTS (
         SELECT 1
         FROM observability_alerts AS alert
         WHERE alert.id = notification.source_id
           AND alert.organization_id = notification.organization_id
           AND (alert.deleted_at IS NOT NULL OR alert.muted_until > NOW())
       )`,
  );
}

async function alertSuppressesNotification(notification: NotificationRow) {
  const result = await databasePool.query<{ suppressed: boolean }>(
    `SELECT (
       NOT EXISTS (
         SELECT 1
         FROM observability_alerts AS alert
         WHERE alert.id = $1
           AND alert.organization_id = $2
           AND alert.deleted_at IS NULL
           AND (alert.muted_until IS NULL OR alert.muted_until <= NOW())
           AND lower(alert.notification_email) = lower($3)
       )
       OR NOT EXISTS (
         SELECT 1
         FROM members AS member
         INNER JOIN users AS app_user ON app_user.id = member.user_id
         WHERE member.organization_id = $2
           AND lower(app_user.email) = lower($3)
       )
     ) AS suppressed`,
    [
      notification.source_id,
      notification.organization_id,
      notification.destination,
    ],
  );
  return result.rows[0]?.suppressed === true;
}

async function cleanupExpiredEvaluations() {
  if (retentionPolling) return;
  retentionPolling = true;
  try {
    const result = await databasePool.query(
      `WITH expired AS (
         SELECT id
         FROM observability_alert_evaluations
         WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
         ORDER BY created_at ASC
         LIMIT 10000
       )
       DELETE FROM observability_alert_evaluations AS evaluation
       USING expired
       WHERE evaluation.id = expired.id`,
      [config.alertEvaluationRetentionDays],
    );
    if (result.rowCount) {
      console.log(
        `[Alerts] Removed ${result.rowCount} evaluations beyond ${config.alertEvaluationRetentionDays}-day retention`,
      );
    }
  } catch (error) {
    console.error("[Alerts] Failed to clean up evaluation history", error);
  } finally {
    retentionPolling = false;
  }
}

function mapAlertRow(row: ClaimedAlertRow): AlertRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    signal: row.signal,
    service: row.service,
    environment: row.environment,
    metricName: row.metric_name,
    metricType: row.metric_type,
    metricUnit: row.metric_unit,
    metricAggregationTemporality: temporalityCode(row.aggregation_temporality),
    metricIsMonotonic: row.is_monotonic,
    metricAggregation: row.metric_aggregation,
    logLevel: row.log_level,
    logQuery: row.log_query,
    operator: row.operator,
    threshold: Number(row.threshold),
    windowMinutes: Number(row.window_minutes),
    minimumSamples: Number(row.minimum_samples),
    consecutiveFailures: Number(row.consecutive_failures),
    consecutiveRecoveries: Number(row.consecutive_recoveries),
    noDataState: row.no_data_state,
    state: row.underlying_state,
    failureStreak: Number(row.failure_streak),
    recoveryStreak: Number(row.recovery_streak),
    notificationEmail: row.notification_email,
    mutedUntil: row.muted_until,
    leaseOwner: row.lease_owner,
  };
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await callback(item);
      }
    },
  );
  await Promise.all(runners);
}

function isPermanentDeliveryError(error: unknown) {
  const status = (error as { status?: unknown })?.status;
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown alert worker error";
}

function temporalityCode(value: string | null) {
  if (value === "delta") return 1;
  if (value === "cumulative") return 2;
  return 0;
}
