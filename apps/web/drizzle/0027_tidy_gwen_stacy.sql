ALTER TABLE "incidents" ADD COLUMN "uptime_publication_state" text;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "uptime_published_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD COLUMN "failure_threshold" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD COLUMN "incident_publishing" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD COLUMN "publish_after_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
CREATE INDEX "incidents_uptime_publication_idx" ON "incidents" USING btree ("organization_id","uptime_publication_state","started_at") WHERE "incidents"."source_type" = 'uptime_monitor';--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_uptime_publication_state_check" CHECK (("incidents"."source_type" = 'uptime_monitor' AND "incidents"."uptime_publication_state" IN ('detected', 'published', 'ignored')) OR ("incidents"."source_type" <> 'uptime_monitor' AND "incidents"."uptime_publication_state" IS NULL));--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_failure_threshold_check" CHECK ("uptime_monitors"."failure_threshold" BETWEEN 2 AND 5);--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_incident_publishing_check" CHECK ("uptime_monitors"."incident_publishing" IN ('manual', 'after_confirmation', 'automatic'));--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_publish_after_minutes_check" CHECK ("uptime_monitors"."publish_after_minutes" BETWEEN 1 AND 60);