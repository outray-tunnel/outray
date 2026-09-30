ALTER TABLE "uptime_status_components" DROP CONSTRAINT "uptime_status_components_group_id_uptime_status_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "uptime_status_components" ALTER COLUMN "group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uptime_status_components" ADD CONSTRAINT "uptime_status_components_group_id_uptime_status_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."uptime_status_groups"("id") ON DELETE set null ON UPDATE no action;