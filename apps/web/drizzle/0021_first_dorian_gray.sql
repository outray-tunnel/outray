CREATE TABLE "uptime_daily_checks" (
	"organization_id" text NOT NULL,
	"monitor_id" text NOT NULL,
	"day" date NOT NULL,
	"checks" integer DEFAULT 0 NOT NULL,
	"successes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "uptime_daily_checks_monitor_id_day_pk" PRIMARY KEY("monitor_id","day"),
	CONSTRAINT "uptime_daily_checks_counts_check" CHECK ("uptime_daily_checks"."checks" >= 0 AND "uptime_daily_checks"."successes" >= 0 AND "uptime_daily_checks"."successes" <= "uptime_daily_checks"."checks")
);
--> statement-breakpoint
ALTER TABLE "uptime_daily_checks" ADD CONSTRAINT "uptime_daily_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_daily_checks" ADD CONSTRAINT "uptime_daily_checks_monitor_id_uptime_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."uptime_monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uptime_daily_checks_org_day_idx" ON "uptime_daily_checks" USING btree ("organization_id","day");--> statement-breakpoint
INSERT INTO "uptime_daily_checks" ("organization_id", "monitor_id", "day", "checks", "successes")
SELECT "organization_id", "monitor_id", ("checked_at" AT TIME ZONE 'UTC')::date,
       COUNT(*)::integer, COUNT(*) FILTER (WHERE "success")::integer
FROM "uptime_checks"
WHERE "checked_at" >= ((NOW() AT TIME ZONE 'UTC')::date - 89)::timestamp AT TIME ZONE 'UTC'
GROUP BY "organization_id", "monitor_id", ("checked_at" AT TIME ZONE 'UTC')::date
ON CONFLICT ("monitor_id", "day") DO NOTHING;
