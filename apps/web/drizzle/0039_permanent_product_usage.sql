CREATE TABLE "organization_product_usage_baselines" (
	"organization_id" text NOT NULL,
	"metric" text NOT NULL,
	"period" text NOT NULL,
	"value" bigint NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_product_usage_baselines_organization_id_metric_period_pk" PRIMARY KEY("organization_id","metric","period"),
	CONSTRAINT "organization_product_usage_baselines_value_check" CHECK ("organization_product_usage_baselines"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_product_usage_daily" (
	"organization_id" text NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"value" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_product_usage_daily_organization_id_day_metric_pk" PRIMARY KEY("organization_id","day","metric"),
	CONSTRAINT "organization_product_usage_daily_value_check" CHECK ("organization_product_usage_daily"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_product_usage_baselines" (
	"metric" text NOT NULL,
	"period" text NOT NULL,
	"shard" smallint NOT NULL,
	"value" bigint NOT NULL,
	CONSTRAINT "platform_product_usage_baselines_metric_period_shard_pk" PRIMARY KEY("metric","period","shard"),
	CONSTRAINT "platform_product_usage_baselines_shard_check" CHECK ("platform_product_usage_baselines"."shard" BETWEEN 0 AND 63),
	CONSTRAINT "platform_product_usage_baselines_value_check" CHECK ("platform_product_usage_baselines"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_product_usage_daily" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"shard" smallint NOT NULL,
	"value" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_product_usage_daily_metric_day_shard_pk" PRIMARY KEY("metric","day","shard"),
	CONSTRAINT "platform_product_usage_daily_shard_check" CHECK ("platform_product_usage_daily"."shard" BETWEEN 0 AND 63),
	CONSTRAINT "platform_product_usage_daily_value_check" CHECK ("platform_product_usage_daily"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_usage_agent_progress" (
	"organization_id" text NOT NULL,
	"run_id" text NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"started_recorded" integer DEFAULT 0 NOT NULL,
	"terminal_recorded" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_usage_agent_progress_organization_id_run_id_pk" PRIMARY KEY("organization_id","run_id")
);
--> statement-breakpoint
CREATE TABLE "product_usage_backfill_checkpoints" (
	"job_id" text NOT NULL,
	"source" text NOT NULL,
	"organization_id" text NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"cursor" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_usage_backfill_checkpoints_job_id_source_organization_id_pk" PRIMARY KEY("job_id","source","organization_id")
);
--> statement-breakpoint
CREATE TABLE "product_usage_coverage" (
	"source" text PRIMARY KEY NOT NULL,
	"collection_started_at" timestamp with time zone,
	"last_processed_at" timestamp with time zone,
	"backfill_status" text DEFAULT 'not_started' NOT NULL,
	"earliest_backfill_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_usage_metrics" (
	"key" text PRIMARY KEY NOT NULL,
	"product" text NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	CONSTRAINT "product_usage_metrics_unit_check" CHECK ("product_usage_metrics"."unit" IN ('count','bytes'))
);
--> statement-breakpoint
CREATE TABLE "product_usage_receipts" (
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"event_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_usage_receipts_organization_id_source_event_id_pk" PRIMARY KEY("organization_id","source","event_id")
);
--> statement-breakpoint
CREATE TABLE "status_analytics_outbox" (
	"organization_id" text NOT NULL,
	"page_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_owner" text,
	CONSTRAINT "status_analytics_outbox_page_id_event_id_pk" PRIMARY KEY("page_id","event_id"),
	CONSTRAINT "status_analytics_outbox_status_check" CHECK ("status_analytics_outbox"."status" IN ('pending','failed'))
);
--> statement-breakpoint
ALTER TABLE "organization_product_usage_baselines" ADD CONSTRAINT "organization_product_usage_baselines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_product_usage_baselines" ADD CONSTRAINT "organization_product_usage_baselines_metric_product_usage_metrics_key_fk" FOREIGN KEY ("metric") REFERENCES "public"."product_usage_metrics"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_product_usage_daily" ADD CONSTRAINT "organization_product_usage_daily_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_product_usage_daily" ADD CONSTRAINT "organization_product_usage_daily_metric_product_usage_metrics_key_fk" FOREIGN KEY ("metric") REFERENCES "public"."product_usage_metrics"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_product_usage_baselines" ADD CONSTRAINT "platform_product_usage_baselines_metric_product_usage_metrics_key_fk" FOREIGN KEY ("metric") REFERENCES "public"."product_usage_metrics"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_product_usage_daily" ADD CONSTRAINT "platform_product_usage_daily_metric_product_usage_metrics_key_fk" FOREIGN KEY ("metric") REFERENCES "public"."product_usage_metrics"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_usage_agent_progress" ADD CONSTRAINT "product_usage_agent_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_usage_backfill_checkpoints" ADD CONSTRAINT "product_usage_backfill_checkpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_usage_receipts" ADD CONSTRAINT "product_usage_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_analytics_outbox" ADD CONSTRAINT "status_analytics_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_analytics_outbox" ADD CONSTRAINT "status_analytics_outbox_page_id_uptime_status_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."uptime_status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_usage_daily_metric_day" ON "organization_product_usage_daily" USING btree ("metric","day");--> statement-breakpoint
CREATE INDEX "product_usage_receipts_created" ON "product_usage_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "status_analytics_outbox_due" ON "status_analytics_outbox" USING btree ("next_attempt_at") WHERE "status_analytics_outbox"."status" = 'pending';
--> statement-breakpoint
INSERT INTO product_usage_metrics VALUES
('tunnels.opens.http','tunnels','HTTP tunnel openings','count'),
('tunnels.opens.tcp','tunnels','TCP tunnel openings','count'),
('tunnels.opens.udp','tunnels','UDP tunnel openings','count'),
('tunnels.registrations.http','tunnels','HTTP registrations','count'),
('tunnels.registrations.tcp','tunnels','TCP registrations','count'),
('tunnels.registrations.udp','tunnels','UDP registrations','count'),
('tunnels.http_requests','tunnels','Recorded HTTP requests','count'),
('tunnels.tcp_connections','tunnels','TCP connections','count'),
('tunnels.udp_datagrams.in','tunnels','Inbound UDP datagrams','count'),
('tunnels.udp_datagrams.out','tunnels','Outbound UDP datagrams','count'),
('tunnels.bytes.http.in','tunnels','HTTP bytes in','bytes'),
('tunnels.bytes.http.out','tunnels','HTTP bytes out','bytes'),
('tunnels.bytes.tcp.in','tunnels','TCP bytes in','bytes'),
('tunnels.bytes.tcp.out','tunnels','TCP bytes out','bytes'),
('tunnels.bytes.udp.in','tunnels','UDP bytes in','bytes'),
('tunnels.bytes.udp.out','tunnels','UDP bytes out','bytes'),
('secrets.added','secrets','Secret entries added','count'),
('secrets.read_operations','secrets','Successful secret read operations','count'),
('secrets.values_read','secrets','Secret values read','count'),
('secrets.operations.success','secrets','Secrets operations: success','count'),
('secrets.operations.failure','secrets','Secrets operations: failure','count'),
('secrets.operations.denied','secrets','Secrets operations: denied','count'),
('observability.telemetry_bytes','observability','Accepted telemetry bytes','bytes'),
('observability.spans','observability','Accepted spans','count'),
('observability.logs','observability','Accepted logs','count'),
('observability.metric_points','observability','Accepted metric points','count'),
('observability.evaluations.success','observability','Alert evaluations: success','count'),
('observability.evaluations.no_data','observability','Alert evaluations: no_data','count'),
('observability.evaluations.error','observability','Alert evaluations: error','count'),
('uptime.checks.success','uptime','Uptime checks: success','count'),
('uptime.checks.failure','uptime','Uptime checks: failure','count'),
('uptime.status_views','uptime','Accepted status-page views','count'),
('agent.runs_started','agent','Agent runs started','count'),
('agent.runs.complete','agent','Agent runs: complete','count'),
('agent.runs.failed','agent','Agent runs: failed','count'),
('agent.runs.cancelled','agent','Agent runs: cancelled','count'),
('agent.input_tokens','agent','Agent input tokens','count'),
('agent.output_tokens','agent','Agent output tokens','count');

INSERT INTO product_usage_coverage(source,collection_started_at) VALUES ('secrets',now()),('tunnel-registrations',now()),('probe',now()),('alerts',now()),('agent',now()),('tunnel-traffic',NULL),('tunnel-opens',NULL),('telemetry',NULL),('status-views',NULL);
--> statement-breakpoint
CREATE FUNCTION record_product_usage(p_org text,p_source text,p_id text,p_at timestamptz,p_deltas jsonb,p_backfill boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE item record; receipt text; fingerprint text; bucket date; shard_id smallint;
BEGIN
  IF p_org IS NULL OR length(p_org)>128 OR p_id IS NULL OR length(p_id) NOT BETWEEN 1 AND 256
     OR p_source !~ '^[a-z][a-z0-9-]{0,63}$' OR p_at IS NULL OR NOT isfinite(p_at)
     OR jsonb_typeof(p_deltas) IS DISTINCT FROM 'object' OR octet_length(p_deltas::text)>8192 THEN
    RAISE EXCEPTION 'Invalid product usage event';
  END IF;
  IF NOT p_backfill AND (p_at < now()-interval '120 days' OR p_at>now()+interval '5 minutes') THEN
    RAISE EXCEPTION 'Product usage event outside replay window';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM product_usage_coverage WHERE source=p_source) THEN
    RAISE EXCEPTION 'Invalid product usage source';
  END IF;
  FOR item IN SELECT key,value FROM jsonb_each_text(p_deltas) ORDER BY key LOOP
    IF item.value !~ '^[0-9]+$' OR length(item.value)>19 OR item.value::numeric>9223372036854775807
       OR NOT EXISTS(SELECT 1 FROM product_usage_metrics WHERE key=item.key) THEN
      RAISE EXCEPTION 'Invalid product usage delta';
    END IF;
  END LOOP;
  PERFORM id FROM organizations WHERE id=p_org FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  fingerprint:=md5(extract(epoch FROM p_at)::text||':'||p_deltas::text);
  INSERT INTO product_usage_receipts(organization_id,source,event_id,fingerprint)
    VALUES(p_org,p_source,p_id,fingerprint) ON CONFLICT DO NOTHING RETURNING event_id INTO receipt;
  IF receipt IS NULL THEN
    IF (SELECT r.fingerprint FROM product_usage_receipts r WHERE organization_id=p_org AND source=p_source AND event_id=p_id)<>fingerprint THEN
      RAISE EXCEPTION 'Conflicting product usage event';
    END IF;
    RETURN false;
  END IF;
  bucket:=(p_at AT TIME ZONE 'UTC')::date;
  shard_id:=get_byte(decode(md5(p_org),'hex'),0)%64;
  FOR item IN SELECT key,value::bigint AS amount FROM jsonb_each_text(p_deltas) ORDER BY key LOOP
    IF item.amount=0 THEN CONTINUE; END IF;
    INSERT INTO organization_product_usage_daily(organization_id,day,metric,value)
      VALUES(p_org,bucket,item.key,item.amount)
      ON CONFLICT(organization_id,day,metric) DO UPDATE SET value=organization_product_usage_daily.value+EXCLUDED.value,updated_at=now();
    INSERT INTO platform_product_usage_daily(day,metric,shard,value)
      VALUES(bucket,item.key,shard_id,item.amount)
      ON CONFLICT(metric,day,shard) DO UPDATE SET value=platform_product_usage_daily.value+EXCLUDED.value,updated_at=now();
  END LOOP;
  UPDATE product_usage_coverage SET
    collection_started_at=CASE WHEN p_backfill THEN collection_started_at ELSE coalesce(collection_started_at,now()) END,
    last_processed_at=CASE WHEN p_backfill THEN last_processed_at ELSE now() END,
    earliest_backfill_at=CASE WHEN p_backfill THEN least(earliest_backfill_at,p_at) ELSE earliest_backfill_at END,
    updated_at=now() WHERE source=p_source;
  RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION secret_product_usage_deltas(p_action text,p_result text,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE changes jsonb; quantity bigint;
BEGIN
  IF p_result NOT IN ('success','failure','denied') THEN RETURN '{}'::jsonb; END IF;
  changes:=jsonb_build_object('secrets.operations.'||p_result,1);
  IF p_result<>'success' THEN RETURN changes; END IF;
  IF p_action='secret.created' THEN changes:=changes||'{"secrets.added":1}'::jsonb;
  ELSIF p_action='secrets.imported' THEN
    IF coalesce(p_metadata->>'created','') ~ '^[0-9]{1,10}$' THEN
      changes:=changes||jsonb_build_object('secrets.added',(p_metadata->>'created')::bigint);
    END IF;
  ELSIF p_action IN ('secret.revealed','secret.copied') THEN
    changes:=changes||'{"secrets.read_operations":1,"secrets.values_read":1}'::jsonb;
  ELSIF p_action IN ('secrets.runtime_read','secrets.exported') THEN
    changes:=changes||'{"secrets.read_operations":1}'::jsonb;
    IF coalesce(p_metadata->>'count','') ~ '^[0-9]{1,10}$' THEN
      changes:=changes||jsonb_build_object('secrets.values_read',(p_metadata->>'count')::bigint);
    END IF;
  END IF;
  RETURN changes;
END $$;
CREATE FUNCTION product_usage_secret_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_at >= (SELECT collection_started_at FROM product_usage_coverage WHERE source='secrets') THEN
    PERFORM record_product_usage(NEW.organization_id,'secrets',NEW.id,NEW.created_at,secret_product_usage_deltas(NEW.action,NEW.result,NEW.metadata));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_secret_usage AFTER INSERT ON secret_audit_events FOR EACH ROW EXECUTE FUNCTION product_usage_secret_trigger();
--> statement-breakpoint
CREATE FUNCTION product_usage_registration_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_at AT TIME ZONE 'UTC' >= (SELECT collection_started_at FROM product_usage_coverage WHERE source='tunnel-registrations') THEN
    PERFORM record_product_usage(NEW.organization_id,'tunnel-registrations',NEW.id,NEW.created_at AT TIME ZONE 'UTC',
      jsonb_build_object('tunnels.registrations.'||NEW.protocol,1));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_tunnel_registration_usage AFTER INSERT ON tunnels FOR EACH ROW EXECUTE FUNCTION product_usage_registration_trigger();
CREATE FUNCTION product_usage_probe_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.checked_at >= (SELECT collection_started_at FROM product_usage_coverage WHERE source='probe') THEN
    PERFORM record_product_usage(NEW.organization_id,'probe',NEW.id,NEW.checked_at,
      jsonb_build_object(CASE WHEN NEW.success THEN 'uptime.checks.success' ELSE 'uptime.checks.failure' END,1));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_probe_usage AFTER INSERT ON uptime_checks FOR EACH ROW EXECUTE FUNCTION product_usage_probe_trigger();
CREATE FUNCTION product_usage_alert_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evaluated_at >= (SELECT collection_started_at FROM product_usage_coverage WHERE source='alerts') THEN
    PERFORM record_product_usage(NEW.organization_id,'alerts',NEW.id,NEW.evaluated_at,
      jsonb_build_object('observability.evaluations.'||NEW.status,1));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_alert_usage AFTER INSERT ON observability_alert_evaluations FOR EACH ROW EXECUTE FUNCTION product_usage_alert_trigger();
--> statement-breakpoint
CREATE FUNCTION record_agent_product_usage(p_org text,p_run text,p_started timestamptz,p_status text,p_input bigint,p_output bigint,p_backfill boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE progress product_usage_agent_progress; changes jsonb:='{}'; terminal boolean;
BEGIN
  INSERT INTO product_usage_agent_progress(organization_id,run_id) VALUES(p_org,p_run) ON CONFLICT DO NOTHING;
  SELECT * INTO progress FROM product_usage_agent_progress WHERE organization_id=p_org AND run_id=p_run FOR UPDATE;
  IF progress.started_recorded=0 THEN
    PERFORM record_product_usage(p_org,'agent',p_run||':start',p_started,'{"agent.runs_started":1}',p_backfill);
  END IF;
  changes:=jsonb_build_object('agent.input_tokens',greatest(p_input-progress.input_tokens,0),
    'agent.output_tokens',greatest(p_output-progress.output_tokens,0));
  terminal:=p_status IN ('complete','failed','cancelled') AND progress.terminal_recorded=0;
  IF terminal THEN changes:=changes||jsonb_build_object('agent.runs.'||p_status,1); END IF;
  IF p_input>progress.input_tokens OR p_output>progress.output_tokens OR terminal THEN
    PERFORM record_product_usage(p_org,'agent',p_run||':'||p_input||':'||p_output||':'||p_status,p_started,changes,p_backfill);
  END IF;
  UPDATE product_usage_agent_progress SET input_tokens=greatest(input_tokens,p_input),output_tokens=greatest(output_tokens,p_output),
    started_recorded=1,terminal_recorded=CASE WHEN terminal THEN 1 ELSE terminal_recorded END WHERE organization_id=p_org AND run_id=p_run;
END $$;
CREATE FUNCTION product_usage_agent_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org text;
BEGIN
  IF NEW.started_at < (SELECT collection_started_at FROM product_usage_coverage WHERE source='agent') THEN RETURN NEW; END IF;
  SELECT organization_id INTO org FROM agent_threads WHERE id=NEW.thread_id;
  -- Run tokens belong to the run's start day, including late terminal updates.
  PERFORM record_agent_product_usage(org,NEW.id::text,NEW.started_at,NEW.status,NEW.input_tokens,NEW.output_tokens,true);
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_agent_usage AFTER INSERT OR UPDATE OF status,input_tokens,output_tokens ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION product_usage_agent_trigger();
