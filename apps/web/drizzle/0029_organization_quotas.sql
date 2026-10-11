CREATE TABLE "organization_monthly_usage" (
	"organization_id" text NOT NULL,
	"month" date NOT NULL,
	"metric" text DEFAULT 'telemetry_bytes' NOT NULL,
	"used" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_monthly_usage_organization_id_month_metric_pk" PRIMARY KEY("organization_id","month","metric"),
	CONSTRAINT "organization_monthly_usage_nonnegative" CHECK ("organization_monthly_usage"."used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_telemetry_receipts" (
	"organization_id" text NOT NULL,
	"receipt_key" text NOT NULL,
	"month" date NOT NULL,
	"bytes" bigint NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_telemetry_receipts_organization_id_receipt_key_pk" PRIMARY KEY("organization_id","receipt_key"),
	CONSTRAINT "organization_telemetry_receipts_nonnegative" CHECK ("organization_telemetry_receipts"."bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "organization_monthly_usage" ADD CONSTRAINT "organization_monthly_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_telemetry_receipts" ADD CONSTRAINT "organization_telemetry_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_telemetry_receipts_created_at_idx" ON "organization_telemetry_receipts" USING btree ("created_at");