ALTER TABLE "observability_alerts" ADD COLUMN "notification_emails" text[] DEFAULT ARRAY[]::text[] NOT NULL;
UPDATE "observability_alerts"
SET "notification_emails" = ARRAY[lower("notification_email")]
WHERE "notification_email" IS NOT NULL;
