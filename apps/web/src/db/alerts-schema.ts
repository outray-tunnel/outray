import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth-schema";

const timestampWithTimezone = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3 });

export const observabilityAlerts = pgTable(
  "observability_alerts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    description: text("description"),
    signal: text("signal").notNull(),
    service: text("service").notNull(),
    environment: text("environment"),

    metricKey: text("metric_key"),
    metricName: text("metric_name"),
    metricType: text("metric_type"),
    metricUnit: text("metric_unit"),
    aggregationTemporality: text("aggregation_temporality"),
    isMonotonic: boolean("is_monotonic"),
    metricAggregation: text("metric_aggregation"),

    logLevel: text("log_level").notNull().default("all"),
    logQuery: text("log_query"),
    operator: text("operator").notNull(),
    threshold: doublePrecision("threshold").notNull(),
    windowMinutes: integer("window_minutes").notNull(),
    evaluationIntervalSeconds: integer("evaluation_interval_seconds")
      .notNull()
      .default(60),
    consecutiveFailures: integer("consecutive_failures").notNull().default(2),
    consecutiveRecoveries: integer("consecutive_recoveries")
      .notNull()
      .default(2),
    minimumSamples: integer("minimum_samples").notNull().default(1),
    noDataState: text("no_data_state").notNull().default("no_data"),
    notificationEmail: text("notification_email"),

    enabled: boolean("enabled").notNull().default(true),
    underlyingState: text("underlying_state").notNull().default("no_data"),
    currentValue: doublePrecision("current_value"),
    sampleCount: bigint("sample_count", { mode: "number" }).notNull().default(0),
    failureStreak: integer("failure_streak").notNull().default(0),
    recoveryStreak: integer("recovery_streak").notNull().default(0),
    lastEvaluatedAt: timestampWithTimezone("last_evaluated_at"),
    lastStateChangedAt: timestampWithTimezone("last_state_changed_at")
      .defaultNow()
      .notNull(),
    nextEvaluationAt: timestampWithTimezone("next_evaluation_at")
      .defaultNow()
      .notNull(),
    lastEvaluationError: text("last_evaluation_error"),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestampWithTimezone("lease_until"),
    mutedUntil: timestampWithTimezone("muted_until"),
    deletedAt: timestampWithTimezone("deleted_at"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
    updatedAt: timestampWithTimezone("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("observability_alerts_organization_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("observability_alerts_due_idx")
      .on(table.nextEvaluationAt)
      .where(
        sql`${table.enabled} = true AND ${table.deletedAt} IS NULL`,
      ),
    index("observability_alerts_lease_idx").on(table.leaseUntil),
    check(
      "observability_alerts_signal_check",
      sql`${table.signal} IN ('request_error_rate', 'request_latency_p95', 'request_throughput', 'metric_value', 'log_count', 'no_telemetry')`,
    ),
    check(
      "observability_alerts_operator_check",
      sql`${table.operator} IN ('gt', 'gte', 'lt', 'lte')`,
    ),
    check(
      "observability_alerts_window_check",
      sql`${table.windowMinutes} IN (1, 5, 10, 15, 30, 60)`,
    ),
    check(
      "observability_alerts_interval_check",
      sql`${table.evaluationIntervalSeconds} IN (60, 300, 900)`,
    ),
    check(
      "observability_alerts_failure_streak_check",
      sql`${table.consecutiveFailures} BETWEEN 1 AND 10`,
    ),
    check(
      "observability_alerts_recovery_streak_check",
      sql`${table.consecutiveRecoveries} BETWEEN 1 AND 10`,
    ),
    check(
      "observability_alerts_minimum_samples_check",
      sql`${table.minimumSamples} BETWEEN 1 AND 1000000`,
    ),
    check(
      "observability_alerts_no_data_state_check",
      sql`${table.noDataState} IN ('no_data', 'healthy', 'alerting')`,
    ),
    check(
      "observability_alerts_underlying_state_check",
      sql`${table.underlyingState} IN ('healthy', 'pending', 'firing', 'no_data', 'error')`,
    ),
    check(
      "observability_alerts_log_level_check",
      sql`${table.logLevel} IN ('all', 'debug', 'info', 'warn', 'error')`,
    ),
    check(
      "observability_alerts_metric_aggregation_check",
      sql`${table.metricAggregation} IS NULL OR ${table.metricAggregation} IN ('latest', 'avg', 'max', 'min')`,
    ),
    check(
      "observability_alerts_metric_type_check",
      sql`${table.metricType} IS NULL OR ${table.metricType} = 'gauge'`,
    ),
    check(
      "observability_alerts_temporality_check",
      sql`${table.aggregationTemporality} IS NULL OR ${table.aggregationTemporality} IN ('unspecified', 'delta', 'cumulative')`,
    ),
    check(
      "observability_alerts_no_telemetry_window_check",
      sql`${table.signal} <> 'no_telemetry' OR ${table.windowMinutes} >= 5`,
    ),
    check(
      "observability_alerts_threshold_not_nan_check",
      sql`${table.threshold} <> 'NaN'::double precision`,
    ),
  ],
);

export const observabilityAlertEvaluations = pgTable(
  "observability_alert_evaluations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    alertId: text("alert_id")
      .notNull()
      .references(() => observabilityAlerts.id, { onDelete: "cascade" }),
    evaluatedAt: timestampWithTimezone("evaluated_at").defaultNow().notNull(),
    windowStartedAt: timestampWithTimezone("window_started_at").notNull(),
    windowEndedAt: timestampWithTimezone("window_ended_at").notNull(),
    status: text("status").notNull(),
    value: doublePrecision("value"),
    sampleCount: bigint("sample_count", { mode: "number" }).notNull().default(0),
    breached: boolean("breached"),
    previousState: text("previous_state").notNull(),
    resultingState: text("resulting_state").notNull(),
    queryDurationMs: integer("query_duration_ms"),
    error: text("error"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("observability_alert_evaluations_alert_idx").on(
      table.alertId,
      table.evaluatedAt,
    ),
    index("observability_alert_evaluations_organization_idx").on(
      table.organizationId,
      table.evaluatedAt,
    ),
    index("observability_alert_evaluations_created_at_idx").on(
      table.createdAt,
    ),
    uniqueIndex("observability_alert_evaluations_window_unique_idx")
      .on(table.alertId, table.windowEndedAt)
      .where(sql`${table.status} IN ('success', 'no_data')`),
    check(
      "observability_alert_evaluations_status_check",
      sql`${table.status} IN ('success', 'no_data', 'error')`,
    ),
    check(
      "observability_alert_evaluations_previous_state_check",
      sql`${table.previousState} IN ('healthy', 'pending', 'firing', 'no_data', 'error')`,
    ),
    check(
      "observability_alert_evaluations_resulting_state_check",
      sql`${table.resultingState} IN ('healthy', 'pending', 'firing', 'no_data', 'error')`,
    ),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").notNull().default("open"),
    title: text("title").notNull(),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    triggerValue: doublePrecision("trigger_value"),
    lastValue: doublePrecision("last_value"),
    resolvedValue: doublePrecision("resolved_value"),
    startedAt: timestampWithTimezone("started_at").defaultNow().notNull(),
    resolvedAt: timestampWithTimezone("resolved_at"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
    updatedAt: timestampWithTimezone("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("incidents_organization_idx").on(
      table.organizationId,
      table.startedAt,
    ),
    index("incidents_source_idx").on(table.sourceType, table.sourceId),
    uniqueIndex("incidents_one_open_source_idx")
      .on(table.organizationId, table.sourceType, table.sourceId)
      .where(sql`${table.status} = 'open'`),
    check(
      "incidents_status_check",
      sql`${table.status} IN ('open', 'resolved')`,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    incidentId: text("incident_id").references(() => incidents.id, {
      onDelete: "set null",
    }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    event: text("event").notNull(),
    channel: text("channel").notNull().default("email"),
    recipient: text("recipient").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestampWithTimezone("next_attempt_at")
      .defaultNow()
      .notNull(),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestampWithTimezone("lease_until"),
    lastError: text("last_error"),
    sentAt: timestampWithTimezone("sent_at"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
    updatedAt: timestampWithTimezone("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("notifications_due_idx").on(
      table.status,
      table.nextAttemptAt,
      table.leaseUntil,
    ),
    index("notifications_source_idx").on(table.sourceType, table.sourceId),
    index("notifications_incident_idx").on(table.incidentId),
    check(
      "notifications_event_check",
      sql`${table.event} IN ('firing', 'resolved', 'test')`,
    ),
    check(
      "notifications_channel_check",
      sql`${table.channel} IN ('email', 'webhook', 'slack')`,
    ),
    check(
      "notifications_status_check",
      sql`${table.status} IN ('pending', 'processing', 'sent', 'failed', 'suppressed')`,
    ),
    check(
      "notifications_attempts_check",
      sql`${table.attempts} >= 0 AND ${table.maxAttempts} BETWEEN 1 AND 20`,
    ),
  ],
);

export const observabilityAlertsRelations = relations(
  observabilityAlerts,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [observabilityAlerts.organizationId],
      references: [organizations.id],
    }),
    creator: one(users, {
      fields: [observabilityAlerts.createdBy],
      references: [users.id],
    }),
    evaluations: many(observabilityAlertEvaluations),
  }),
);

export const observabilityAlertEvaluationsRelations = relations(
  observabilityAlertEvaluations,
  ({ one }) => ({
    alert: one(observabilityAlerts, {
      fields: [observabilityAlertEvaluations.alertId],
      references: [observabilityAlerts.id],
    }),
    organization: one(organizations, {
      fields: [observabilityAlertEvaluations.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [incidents.organizationId],
    references: [organizations.id],
  }),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations, {
    fields: [notifications.organizationId],
    references: [organizations.id],
  }),
  incident: one(incidents, {
    fields: [notifications.incidentId],
    references: [incidents.id],
  }),
}));
