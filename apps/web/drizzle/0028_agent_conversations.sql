CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_messages_role_check" CHECK ("agent_messages"."role" IN ('user', 'assistant')),
	CONSTRAINT "agent_messages_status_check" CHECK ("agent_messages"."status" IN ('pending', 'complete', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"client_message_id" uuid NOT NULL,
	"assistant_message_id" uuid NOT NULL,
	"status" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"max_tokens" integer NOT NULL,
	"max_steps" integer NOT NULL,
	"error" text,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" IN ('running', 'complete', 'failed', 'cancelled')),
	CONSTRAINT "agent_runs_tokens_check" CHECK ("agent_runs"."input_tokens" >= 0 AND "agent_runs"."output_tokens" >= 0 AND "agent_runs"."max_tokens" > 0),
	CONSTRAINT "agent_runs_steps_check" CHECK ("agent_runs"."max_steps" > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"source_request_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_client_message_id_agent_messages_id_fk" FOREIGN KEY ("client_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_assistant_message_id_agent_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_messages_thread_created_idx" ON "agent_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_client_message_unique" ON "agent_runs" USING btree ("client_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_assistant_message_unique" ON "agent_runs" USING btree ("assistant_message_id");--> statement-breakpoint
CREATE INDEX "agent_runs_thread_started_idx" ON "agent_runs" USING btree ("thread_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_running_idx" ON "agent_runs" USING btree ("updated_at") WHERE "agent_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "agent_threads_owner_updated_idx" ON "agent_threads" USING btree ("organization_id","created_by","updated_at");--> statement-breakpoint
CREATE INDEX "agent_threads_creator_idx" ON "agent_threads" USING btree ("created_by");