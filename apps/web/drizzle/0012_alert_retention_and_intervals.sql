ALTER TABLE "observability_alerts" DROP CONSTRAINT "observability_alerts_interval_check";--> statement-breakpoint
CREATE INDEX "observability_alert_evaluations_created_at_idx" ON "observability_alert_evaluations" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD CONSTRAINT "observability_alerts_interval_check" CHECK ("observability_alerts"."evaluation_interval_seconds" IN (60, 300, 900));
