CREATE TABLE "product_email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_email_outbox_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "product_email_outbox_status_check" CHECK ("product_email_outbox"."status" IN ('pending', 'processing', 'sent', 'failed', 'suppressed')),
	CONSTRAINT "product_email_outbox_attempts_check" CHECK ("product_email_outbox"."attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
ALTER TABLE "product_email_outbox" ADD CONSTRAINT "product_email_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_email_outbox_due_idx" ON "product_email_outbox" USING btree ("status","next_attempt_at","lease_until");--> statement-breakpoint
CREATE INDEX "product_email_outbox_organization_idx" ON "product_email_outbox" USING btree ("organization_id");
