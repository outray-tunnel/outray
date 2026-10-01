CREATE TABLE "secret_share_links" (
  "id" text PRIMARY KEY NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "key_verifier" text NOT NULL,
  "content_format" text NOT NULL,
  "expires_at" timestamp(3) with time zone NOT NULL,
  "max_views" integer NOT NULL,
  "views" integer DEFAULT 0 NOT NULL,
  "revoked_at" timestamp(3) with time zone,
  "last_revealed_at" timestamp(3) with time zone,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "secret_share_links_max_views_check" CHECK ("max_views" BETWEEN 1 AND 100),
  CONSTRAINT "secret_share_links_views_check" CHECK ("views" >= 0 AND "views" <= "max_views"),
  CONSTRAINT "secret_share_links_format_check" CHECK ("content_format" IN ('text', 'bundle'))
);
--> statement-breakpoint
CREATE INDEX "secret_share_links_expiry_idx" ON "secret_share_links" USING btree ("expires_at");
--> statement-breakpoint

CREATE TABLE "secret_share_ownership" (
  "share_id" text PRIMARY KEY NOT NULL REFERENCES "secret_share_links"("id") ON DELETE cascade,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "project_id" text NOT NULL,
  "environment_id" text NOT NULL,
  "created_by_id" text REFERENCES "users"("id") ON DELETE set null,
  "key_names" jsonb NOT NULL,
  "source_secret_ids" jsonb NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "secret_share_ownership_organization_idx" ON "secret_share_ownership" USING btree ("organization_id", "created_at");
--> statement-breakpoint

CREATE TABLE "secret_share_rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "window_ends_at" timestamp(3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "secret_share_rate_limits_expiry_idx" ON "secret_share_rate_limits" USING btree ("window_ends_at");
--> statement-breakpoint
ALTER TABLE "secret_deletion_batches" DROP CONSTRAINT "secret_deletion_batches_root_type_check";
--> statement-breakpoint
ALTER TABLE "secret_deletion_batches" ADD CONSTRAINT "secret_deletion_batches_root_type_check" CHECK ("root_type" IN ('project', 'environment', 'secret', 'bulk'));
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'outray_share_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      public.secret_share_links,
      public.secret_share_rate_limits TO outray_share_app;
    GRANT SELECT ON TABLE public.secret_share_ownership TO outray_share_app;
  END IF;
END $$;
