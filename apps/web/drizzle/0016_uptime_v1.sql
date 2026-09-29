CREATE TABLE "uptime_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"monitor_id" text NOT NULL,
	"checked_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"error_kind" text,
	CONSTRAINT "uptime_checks_latency_check" CHECK ("uptime_checks"."latency_ms" IS NULL OR "uptime_checks"."latency_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "uptime_component_monitors" (
	"organization_id" text NOT NULL,
	"component_id" text NOT NULL,
	"monitor_id" text NOT NULL,
	CONSTRAINT "uptime_component_monitors_component_id_monitor_id_pk" PRIMARY KEY("component_id","monitor_id")
);
--> statement-breakpoint
CREATE TABLE "uptime_incident_components" (
	"organization_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"component_id" text NOT NULL,
	CONSTRAINT "uptime_incident_components_incident_id_component_id_pk" PRIMARY KEY("incident_id","component_id")
);
--> statement-breakpoint
CREATE TABLE "uptime_incident_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"created_by" text,
	"note" text NOT NULL,
	"status" text NOT NULL,
	"component_states" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uptime_incident_updates_status_check" CHECK ("uptime_incident_updates"."status" IN ('investigating', 'identified', 'monitoring', 'resolved')),
	CONSTRAINT "uptime_incident_updates_note_check" CHECK (length(trim("uptime_incident_updates"."note")) > 0)
);
--> statement-breakpoint
CREATE TABLE "uptime_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"webhook_ciphertext" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uptime_integrations_provider_check" CHECK ("uptime_integrations"."provider" IN ('slack', 'discord'))
);
--> statement-breakpoint
CREATE TABLE "uptime_monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"method" text DEFAULT 'GET' NOT NULL,
	"headers_ciphertext" jsonb,
	"expected_status" integer,
	"response_text" text,
	"notification_emails" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"state" text DEFAULT 'unknown' NOT NULL,
	"failure_streak" integer DEFAULT 0 NOT NULL,
	"success_streak" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp (3) with time zone,
	"last_state_changed_at" timestamp (3) with time zone,
	"next_check_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uptime_monitors_method_check" CHECK ("uptime_monitors"."method" IN ('GET', 'HEAD')),
	CONSTRAINT "uptime_monitors_state_check" CHECK ("uptime_monitors"."state" IN ('unknown', 'up', 'down')),
	CONSTRAINT "uptime_monitors_expected_status_check" CHECK ("uptime_monitors"."expected_status" IS NULL OR "uptime_monitors"."expected_status" BETWEEN 100 AND 599),
	CONSTRAINT "uptime_monitors_streaks_check" CHECK ("uptime_monitors"."failure_streak" >= 0 AND "uptime_monitors"."success_streak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "uptime_status_components" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"page_id" text NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"manual_state" text DEFAULT 'unknown' NOT NULL,
	"manual_updated_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uptime_status_components_manual_state_check" CHECK ("uptime_status_components"."manual_state" IN ('unknown', 'operational', 'degraded', 'outage'))
);
--> statement-breakpoint
CREATE TABLE "uptime_status_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"page_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uptime_status_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_url" text,
	"accent_color" text DEFAULT '#8367c7' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"domain_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uptime_status_pages_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "uptime_status_pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "uptime_status_pages_domain_id_unique" UNIQUE("domain_id"),
	CONSTRAINT "uptime_status_pages_slug_check" CHECK ("uptime_status_pages"."slug" ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')
);
--> statement-breakpoint
CREATE TABLE "uptime_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"page_id" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp (3) with time zone,
	"confirmed_at" timestamp (3) with time zone,
	"unsubscribed_at" timestamp (3) with time zone,
	"last_sent_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uptime_subscribers_status_check" CHECK ("uptime_subscribers"."status" IN ('pending', 'confirmed', 'unsubscribed'))
);
--> statement-breakpoint
CREATE TABLE "uptime_subscription_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"ip_hash" text NOT NULL,
	"email_hash" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "purpose" text DEFAULT 'tunnel' NOT NULL;--> statement-breakpoint
ALTER TABLE "uptime_checks" ADD CONSTRAINT "uptime_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_checks" ADD CONSTRAINT "uptime_checks_monitor_id_uptime_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."uptime_monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_component_monitors" ADD CONSTRAINT "uptime_component_monitors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_component_monitors" ADD CONSTRAINT "uptime_component_monitors_component_id_uptime_status_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."uptime_status_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_component_monitors" ADD CONSTRAINT "uptime_component_monitors_monitor_id_uptime_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."uptime_monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_incident_components" ADD CONSTRAINT "uptime_incident_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_incident_components" ADD CONSTRAINT "uptime_incident_components_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_incident_components" ADD CONSTRAINT "uptime_incident_components_component_id_uptime_status_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."uptime_status_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_incident_updates" ADD CONSTRAINT "uptime_incident_updates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_incident_updates" ADD CONSTRAINT "uptime_incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_incident_updates" ADD CONSTRAINT "uptime_incident_updates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_integrations" ADD CONSTRAINT "uptime_integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_status_components" ADD CONSTRAINT "uptime_status_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_status_components" ADD CONSTRAINT "uptime_status_components_page_id_uptime_status_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."uptime_status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_status_components" ADD CONSTRAINT "uptime_status_components_group_id_uptime_status_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."uptime_status_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_status_groups" ADD CONSTRAINT "uptime_status_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_status_groups" ADD CONSTRAINT "uptime_status_groups_page_id_uptime_status_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."uptime_status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_status_pages" ADD CONSTRAINT "uptime_status_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_status_pages" ADD CONSTRAINT "uptime_status_pages_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_subscribers" ADD CONSTRAINT "uptime_subscribers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_subscribers" ADD CONSTRAINT "uptime_subscribers_page_id_uptime_status_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."uptime_status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_subscription_attempts" ADD CONSTRAINT "uptime_subscription_attempts_page_id_uptime_status_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."uptime_status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uptime_checks_monitor_time_idx" ON "uptime_checks" USING btree ("monitor_id","checked_at");--> statement-breakpoint
CREATE INDEX "uptime_checks_org_time_idx" ON "uptime_checks" USING btree ("organization_id","checked_at");--> statement-breakpoint
CREATE INDEX "uptime_component_monitors_monitor_idx" ON "uptime_component_monitors" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "uptime_incident_updates_incident_idx" ON "uptime_incident_updates" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uptime_integrations_org_provider_idx" ON "uptime_integrations" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "uptime_monitors_org_idx" ON "uptime_monitors" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "uptime_monitors_due_idx" ON "uptime_monitors" USING btree ("next_check_at","lease_until") WHERE "uptime_monitors"."enabled" = true AND "uptime_monitors"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "uptime_status_components_group_order_idx" ON "uptime_status_components" USING btree ("group_id","sort_order");--> statement-breakpoint
CREATE INDEX "uptime_status_groups_page_order_idx" ON "uptime_status_groups" USING btree ("page_id","sort_order");--> statement-breakpoint
CREATE INDEX "uptime_status_pages_org_idx" ON "uptime_status_pages" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uptime_subscribers_page_email_idx" ON "uptime_subscribers" USING btree ("page_id","email");--> statement-breakpoint
CREATE INDEX "uptime_subscribers_status_idx" ON "uptime_subscribers" USING btree ("page_id","status");--> statement-breakpoint
CREATE INDEX "uptime_subscription_attempts_ip_idx" ON "uptime_subscription_attempts" USING btree ("page_id","ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "uptime_subscription_attempts_email_idx" ON "uptime_subscription_attempts" USING btree ("page_id","email_hash","created_at");