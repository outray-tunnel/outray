CREATE TABLE "secrets_machine_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"environment_id" text,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" text,
	"expires_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_id" text,
	"last_used_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secrets_machine_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "secret_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"environment_id" text,
	"entry_id" text,
	"actor_type" text NOT NULL,
	"actor_credential" text NOT NULL,
	"actor_id" text,
	"actor_token_id" text,
	"action" text NOT NULL,
	"result" text NOT NULL,
	"request_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"target_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_audit_events_actor_type_check" CHECK ("secret_audit_events"."actor_type" IN ('user', 'machine', 'system')),
	CONSTRAINT "secret_audit_events_actor_credential_check" CHECK ("secret_audit_events"."actor_credential" IN ('session', 'cli', 'machine', 'system')),
	CONSTRAINT "secret_audit_events_result_check" CHECK ("secret_audit_events"."result" IN ('success', 'failure', 'denied'))
);
--> statement-breakpoint
CREATE TABLE "secret_deletion_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"root_type" text NOT NULL,
	"root_id" text NOT NULL,
	"root_name" text NOT NULL,
	"project_id" text,
	"environment_id" text,
	"item_count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_by_type" text NOT NULL,
	"deleted_by_id" text,
	"deleted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"restored_by_type" text,
	"restored_by_id" text,
	"restored_at" timestamp (3) with time zone,
	"purged_by_type" text,
	"purged_by_id" text,
	"purged_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_deletion_batches_root_type_check" CHECK ("secret_deletion_batches"."root_type" IN ('project', 'environment', 'secret')),
	CONSTRAINT "secret_deletion_batches_status_check" CHECK ("secret_deletion_batches"."status" IN ('active', 'restored', 'purged')),
	CONSTRAINT "secret_deletion_batches_actor_type_check" CHECK ("secret_deletion_batches"."deleted_by_type" IN ('user', 'machine', 'system'))
);
--> statement-breakpoint
CREATE TABLE "secret_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_by_id" text,
	"updated_by_id" text,
	"deletion_batch_id" text,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_entries_version_check" CHECK ("secret_entries"."current_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "secret_environments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_production" boolean DEFAULT false NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"deletion_batch_id" text,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_environments_revision_check" CHECK ("secret_environments"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "secret_organization_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"wrapped_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapping_key_id" text NOT NULL,
	"algorithm" text DEFAULT 'AES-256-GCM' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"rewrapped_at" timestamp (3) with time zone,
	CONSTRAINT "secret_organization_keys_algorithm_check" CHECK ("secret_organization_keys"."algorithm" = 'AES-256-GCM'),
	CONSTRAINT "secret_organization_keys_version_check" CHECK ("secret_organization_keys"."version" >= 1),
	CONSTRAINT "secret_organization_keys_status_check" CHECK ("secret_organization_keys"."status" IN ('active', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "secret_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_by_id" text,
	"deletion_batch_id" text,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"key_snapshot" text NOT NULL,
	"organization_key_version" integer NOT NULL,
	"version" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"algorithm" text DEFAULT 'AES-256-GCM' NOT NULL,
	"value_digest" text NOT NULL,
	"created_by_type" text NOT NULL,
	"created_by_id" text,
	"source" text DEFAULT 'write' NOT NULL,
	"source_version" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secret_versions_version_check" CHECK ("secret_versions"."version" >= 1),
	CONSTRAINT "secret_versions_organization_key_version_check" CHECK ("secret_versions"."organization_key_version" >= 1),
	CONSTRAINT "secret_versions_algorithm_check" CHECK ("secret_versions"."algorithm" = 'AES-256-GCM'),
	CONSTRAINT "secret_versions_actor_type_check" CHECK ("secret_versions"."created_by_type" IN ('user', 'machine', 'system')),
	CONSTRAINT "secret_versions_source_check" CHECK ("secret_versions"."source" IN ('create', 'write', 'import', 'rollback'))
);
--> statement-breakpoint
ALTER TABLE "tunnels" DROP CONSTRAINT "tunnels_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tunnels" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "secrets_machine_tokens" ADD CONSTRAINT "secrets_machine_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets_machine_tokens" ADD CONSTRAINT "secrets_machine_tokens_project_id_secret_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."secret_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets_machine_tokens" ADD CONSTRAINT "secrets_machine_tokens_environment_id_secret_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."secret_environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets_machine_tokens" ADD CONSTRAINT "secrets_machine_tokens_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets_machine_tokens" ADD CONSTRAINT "secrets_machine_tokens_revoked_by_id_users_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_audit_events" ADD CONSTRAINT "secret_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_deletion_batches" ADD CONSTRAINT "secret_deletion_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_entries" ADD CONSTRAINT "secret_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_entries" ADD CONSTRAINT "secret_entries_project_id_secret_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."secret_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_entries" ADD CONSTRAINT "secret_entries_environment_id_secret_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."secret_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_entries" ADD CONSTRAINT "secret_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_entries" ADD CONSTRAINT "secret_entries_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_environments" ADD CONSTRAINT "secret_environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_environments" ADD CONSTRAINT "secret_environments_project_id_secret_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."secret_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_environments" ADD CONSTRAINT "secret_environments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_organization_keys" ADD CONSTRAINT "secret_organization_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_projects" ADD CONSTRAINT "secret_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_projects" ADD CONSTRAINT "secret_projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_entry_id_secret_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."secret_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secrets_machine_tokens_organization_idx" ON "secrets_machine_tokens" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "secrets_machine_tokens_project_idx" ON "secrets_machine_tokens" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "secrets_machine_tokens_environment_idx" ON "secrets_machine_tokens" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "secrets_machine_tokens_prefix_idx" ON "secrets_machine_tokens" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "secret_audit_events_organization_idx" ON "secret_audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "secret_audit_events_project_idx" ON "secret_audit_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "secret_audit_events_entry_idx" ON "secret_audit_events" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "secret_audit_events_action_idx" ON "secret_audit_events" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "secret_audit_events_request_idx" ON "secret_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "secret_audit_events_actor_token_idx" ON "secret_audit_events" USING btree ("actor_token_id");--> statement-breakpoint
CREATE INDEX "secret_deletion_batches_organization_idx" ON "secret_deletion_batches" USING btree ("organization_id","status","deleted_at");--> statement-breakpoint
CREATE INDEX "secret_deletion_batches_expiry_idx" ON "secret_deletion_batches" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_entries_active_key_unique_idx" ON "secret_entries" USING btree ("environment_id","key") WHERE "secret_entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "secret_entries_organization_idx" ON "secret_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secret_entries_environment_idx" ON "secret_entries" USING btree ("environment_id","updated_at");--> statement-breakpoint
CREATE INDEX "secret_entries_project_idx" ON "secret_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "secret_entries_deletion_batch_idx" ON "secret_entries" USING btree ("deletion_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_environments_active_slug_unique_idx" ON "secret_environments" USING btree ("project_id","slug") WHERE "secret_environments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "secret_environments_organization_idx" ON "secret_environments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secret_environments_project_idx" ON "secret_environments" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "secret_environments_deletion_batch_idx" ON "secret_environments" USING btree ("deletion_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_organization_keys_org_version_unique_idx" ON "secret_organization_keys" USING btree ("organization_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_organization_keys_one_active_idx" ON "secret_organization_keys" USING btree ("organization_id") WHERE "secret_organization_keys"."status" = 'active';--> statement-breakpoint
CREATE INDEX "secret_organization_keys_wrapping_key_idx" ON "secret_organization_keys" USING btree ("wrapping_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_projects_active_slug_unique_idx" ON "secret_projects" USING btree ("organization_id","slug") WHERE "secret_projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "secret_projects_organization_idx" ON "secret_projects" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "secret_projects_deletion_batch_idx" ON "secret_projects" USING btree ("deletion_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_versions_entry_version_unique_idx" ON "secret_versions" USING btree ("entry_id","version");--> statement-breakpoint
CREATE INDEX "secret_versions_organization_idx" ON "secret_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secret_versions_organization_key_idx" ON "secret_versions" USING btree ("organization_id","organization_key_version");--> statement-breakpoint
CREATE INDEX "secret_versions_entry_idx" ON "secret_versions" USING btree ("entry_id","created_at");--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;