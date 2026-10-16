ALTER TABLE "domains" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "uptime_status_pages" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "uptime_status_pages" ADD COLUMN "provider_status" text;