ALTER TABLE "uptime_monitors" ADD COLUMN "failure_threshold" integer;
--> statement-breakpoint
UPDATE "uptime_monitors" SET "failure_threshold" = 2;
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ALTER COLUMN "failure_threshold" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ALTER COLUMN "failure_threshold" SET DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_failure_threshold_check" CHECK ("failure_threshold" BETWEEN 2 AND 5);
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD COLUMN "incident_publishing" text;
--> statement-breakpoint
UPDATE "uptime_monitors" SET "incident_publishing" = 'automatic';
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ALTER COLUMN "incident_publishing" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ALTER COLUMN "incident_publishing" SET DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_incident_publishing_check" CHECK ("incident_publishing" IN ('manual', 'after_confirmation', 'automatic'));
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD COLUMN "publish_after_minutes" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_publish_after_minutes_check" CHECK ("publish_after_minutes" BETWEEN 1 AND 60);
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "uptime_publication_state" text;
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "uptime_published_at" timestamp (3) with time zone;
--> statement-breakpoint
UPDATE "incidents" SET "uptime_publication_state" = 'published', "uptime_published_at" = "started_at" WHERE "source_type" = 'uptime_monitor';
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_uptime_publication_state_check" CHECK (
  ("source_type" = 'uptime_monitor' AND "uptime_publication_state" IN ('detected', 'published', 'ignored'))
  OR ("source_type" <> 'uptime_monitor' AND "uptime_publication_state" IS NULL)
);
--> statement-breakpoint
CREATE INDEX "incidents_uptime_publication_idx" ON "incidents" ("organization_id", "uptime_publication_state", "started_at") WHERE "source_type" = 'uptime_monitor';
