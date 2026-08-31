CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trigger_value" double precision,
	"last_value" double precision,
	"resolved_value" double precision,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_status_check" CHECK ("incidents"."status" IN ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"incident_id" text,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"event" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp (3) with time zone,
	"last_error" text,
	"sent_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "notifications_event_check" CHECK ("notifications"."event" IN ('firing', 'resolved', 'test')),
	CONSTRAINT "notifications_channel_check" CHECK ("notifications"."channel" IN ('email', 'webhook', 'slack')),
	CONSTRAINT "notifications_status_check" CHECK ("notifications"."status" IN ('pending', 'processing', 'sent', 'failed', 'suppressed')),
	CONSTRAINT "notifications_attempts_check" CHECK ("notifications"."attempts" >= 0 AND "notifications"."max_attempts" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE "observability_alert_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alert_id" text NOT NULL,
	"evaluated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"window_started_at" timestamp (3) with time zone NOT NULL,
	"window_ended_at" timestamp (3) with time zone NOT NULL,
	"status" text NOT NULL,
	"value" double precision,
	"sample_count" bigint DEFAULT 0 NOT NULL,
	"breached" boolean,
	"previous_state" text NOT NULL,
	"resulting_state" text NOT NULL,
	"query_duration_ms" integer,
	"error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observability_alert_evaluations_status_check" CHECK ("observability_alert_evaluations"."status" IN ('success', 'no_data', 'error')),
	CONSTRAINT "observability_alert_evaluations_previous_state_check" CHECK ("observability_alert_evaluations"."previous_state" IN ('healthy', 'pending', 'firing', 'no_data', 'error')),
	CONSTRAINT "observability_alert_evaluations_resulting_state_check" CHECK ("observability_alert_evaluations"."resulting_state" IN ('healthy', 'pending', 'firing', 'no_data', 'error'))
);
--> statement-breakpoint
CREATE TABLE "observability_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text,
	"name" text NOT NULL,
	"description" text,
	"signal" text NOT NULL,
	"service" text NOT NULL,
	"environment" text,
	"metric_key" text,
	"metric_name" text,
	"metric_type" text,
	"metric_unit" text,
	"aggregation_temporality" text,
	"is_monotonic" boolean,
	"metric_aggregation" text,
	"log_level" text DEFAULT 'all' NOT NULL,
	"log_query" text,
	"operator" text NOT NULL,
	"threshold" double precision NOT NULL,
	"window_minutes" integer NOT NULL,
	"evaluation_interval_seconds" integer DEFAULT 60 NOT NULL,
	"consecutive_failures" integer DEFAULT 2 NOT NULL,
	"consecutive_recoveries" integer DEFAULT 2 NOT NULL,
	"minimum_samples" integer DEFAULT 1 NOT NULL,
	"no_data_state" text DEFAULT 'no_data' NOT NULL,
	"notification_email" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"underlying_state" text DEFAULT 'no_data' NOT NULL,
	"current_value" double precision,
	"sample_count" bigint DEFAULT 0 NOT NULL,
	"failure_streak" integer DEFAULT 0 NOT NULL,
	"recovery_streak" integer DEFAULT 0 NOT NULL,
	"last_evaluated_at" timestamp (3) with time zone,
	"last_state_changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"next_evaluation_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_evaluation_error" text,
	"lease_owner" text,
	"lease_until" timestamp (3) with time zone,
	"muted_until" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observability_alerts_signal_check" CHECK ("observability_alerts"."signal" IN ('request_error_rate', 'request_latency_p95', 'request_throughput', 'metric_value', 'log_count', 'no_telemetry')),
	CONSTRAINT "observability_alerts_operator_check" CHECK ("observability_alerts"."operator" IN ('gt', 'gte', 'lt', 'lte')),
	CONSTRAINT "observability_alerts_window_check" CHECK ("observability_alerts"."window_minutes" IN (1, 5, 10, 15, 30, 60)),
	CONSTRAINT "observability_alerts_interval_check" CHECK ("observability_alerts"."evaluation_interval_seconds" IN (30, 60, 300, 900)),
	CONSTRAINT "observability_alerts_failure_streak_check" CHECK ("observability_alerts"."consecutive_failures" BETWEEN 1 AND 10),
	CONSTRAINT "observability_alerts_recovery_streak_check" CHECK ("observability_alerts"."consecutive_recoveries" BETWEEN 1 AND 10),
	CONSTRAINT "observability_alerts_minimum_samples_check" CHECK ("observability_alerts"."minimum_samples" BETWEEN 1 AND 1000000),
	CONSTRAINT "observability_alerts_no_data_state_check" CHECK ("observability_alerts"."no_data_state" IN ('no_data', 'healthy', 'alerting')),
	CONSTRAINT "observability_alerts_underlying_state_check" CHECK ("observability_alerts"."underlying_state" IN ('healthy', 'pending', 'firing', 'no_data', 'error')),
	CONSTRAINT "observability_alerts_log_level_check" CHECK ("observability_alerts"."log_level" IN ('all', 'debug', 'info', 'warn', 'error')),
	CONSTRAINT "observability_alerts_metric_aggregation_check" CHECK ("observability_alerts"."metric_aggregation" IS NULL OR "observability_alerts"."metric_aggregation" IN ('latest', 'avg', 'max', 'min')),
	CONSTRAINT "observability_alerts_metric_type_check" CHECK ("observability_alerts"."metric_type" IS NULL OR "observability_alerts"."metric_type" = 'gauge'),
	CONSTRAINT "observability_alerts_temporality_check" CHECK ("observability_alerts"."aggregation_temporality" IS NULL OR "observability_alerts"."aggregation_temporality" IN ('unspecified', 'delta', 'cumulative')),
	CONSTRAINT "observability_alerts_no_telemetry_window_check" CHECK ("observability_alerts"."signal" <> 'no_telemetry' OR "observability_alerts"."window_minutes" >= 5),
	CONSTRAINT "observability_alerts_threshold_not_nan_check" CHECK ("observability_alerts"."threshold" <> 'NaN'::double precision)
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alert_evaluations" ADD CONSTRAINT "observability_alert_evaluations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alert_evaluations" ADD CONSTRAINT "observability_alert_evaluations_alert_id_observability_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."observability_alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD CONSTRAINT "observability_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD CONSTRAINT "observability_alerts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_organization_idx" ON "incidents" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "incidents_source_idx" ON "incidents" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_one_open_source_idx" ON "incidents" USING btree ("organization_id","source_type","source_id") WHERE "incidents"."status" = 'open';--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("status","next_attempt_at","lease_until");--> statement-breakpoint
CREATE INDEX "notifications_source_idx" ON "notifications" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "notifications_incident_idx" ON "notifications" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "observability_alert_evaluations_alert_idx" ON "observability_alert_evaluations" USING btree ("alert_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "observability_alert_evaluations_organization_idx" ON "observability_alert_evaluations" USING btree ("organization_id","evaluated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "observability_alert_evaluations_window_unique_idx" ON "observability_alert_evaluations" USING btree ("alert_id","window_ended_at") WHERE "observability_alert_evaluations"."status" IN ('success', 'no_data');--> statement-breakpoint
CREATE INDEX "observability_alerts_organization_idx" ON "observability_alerts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "observability_alerts_due_idx" ON "observability_alerts" USING btree ("next_evaluation_at") WHERE "observability_alerts"."enabled" = true AND "observability_alerts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "observability_alerts_lease_idx" ON "observability_alerts" USING btree ("lease_until");