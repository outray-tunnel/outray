CREATE TABLE "uptime_component_alerts" (
	"organization_id" text NOT NULL,
	"component_id" text NOT NULL,
	"alert_id" text NOT NULL,
	CONSTRAINT "uptime_component_alerts_component_id_alert_id_pk" PRIMARY KEY("component_id","alert_id")
);
--> statement-breakpoint
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_uptime_publication_state_check";--> statement-breakpoint
DROP INDEX "incidents_uptime_publication_idx";--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "public_title" text;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "public_impact" text;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "recovery_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD COLUMN "status_page_public_title" text;--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD COLUMN "status_page_impact" text DEFAULT 'degraded' NOT NULL;--> statement-breakpoint
ALTER TABLE "uptime_component_alerts" ADD CONSTRAINT "uptime_component_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_component_alerts" ADD CONSTRAINT "uptime_component_alerts_component_id_uptime_status_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."uptime_status_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_component_alerts" ADD CONSTRAINT "uptime_component_alerts_alert_id_observability_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."observability_alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uptime_component_alerts_alert_idx" ON "uptime_component_alerts" USING btree ("organization_id","alert_id");--> statement-breakpoint
CREATE INDEX "incidents_uptime_publication_idx" ON "incidents" USING btree ("organization_id","uptime_publication_state","started_at") WHERE "incidents"."source_type" IN ('uptime_monitor', 'observability_alert');--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_public_impact_check" CHECK ("incidents"."public_impact" IS NULL OR "incidents"."public_impact" IN ('degraded', 'outage'));--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_public_title_check" CHECK ("incidents"."public_title" IS NULL OR length(trim("incidents"."public_title")) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_uptime_publication_state_check" CHECK (("incidents"."source_type" = 'uptime_monitor' AND "incidents"."uptime_publication_state" IN ('detected', 'published', 'ignored')) OR ("incidents"."source_type" = 'observability_alert' AND ("incidents"."uptime_publication_state" IS NULL OR "incidents"."uptime_publication_state" IN ('detected', 'published', 'ignored'))) OR ("incidents"."source_type" NOT IN ('uptime_monitor', 'observability_alert') AND "incidents"."uptime_publication_state" IS NULL));--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD CONSTRAINT "observability_alerts_status_page_impact_check" CHECK ("observability_alerts"."status_page_impact" IN ('degraded', 'outage'));--> statement-breakpoint
ALTER TABLE "observability_alerts" ADD CONSTRAINT "observability_alerts_status_page_title_check" CHECK ("observability_alerts"."status_page_public_title" IS NULL OR length(trim("observability_alerts"."status_page_public_title")) BETWEEN 1 AND 160);