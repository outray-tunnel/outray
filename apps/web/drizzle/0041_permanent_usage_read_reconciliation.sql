-- Custom SQL migration file, put your code below! --
-- Shared snapshots return plaintext values, just like runtime reads and exports.
CREATE OR REPLACE FUNCTION secret_product_usage_deltas(p_action text,p_result text,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE changes jsonb;
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
  ELSIF p_action IN ('secrets.runtime_read','secrets.exported','share.snapshot_revealed') THEN
    changes:=changes||'{"secrets.read_operations":1}'::jsonb;
    IF coalesce(p_metadata->>'count','') ~ '^[0-9]{1,10}$' THEN
      changes:=changes||jsonb_build_object('secrets.values_read',(p_metadata->>'count')::bigint);
    END IF;
  END IF;
  RETURN changes;
END $$;
--> statement-breakpoint
-- Repair only receipts written by the earlier mapper. Future receipts already
-- include reads; the fingerprint predicate prevents importing those twice.
SELECT record_product_usage(a.organization_id,'secrets',a.id||':snapshot-read-v1',a.created_at,
  secret_product_usage_deltas(a.action,a.result,a.metadata)-'secrets.operations.success',true)
FROM secret_audit_events a JOIN product_usage_receipts r
  ON r.organization_id=a.organization_id AND r.source='secrets' AND r.event_id=a.id
WHERE a.action='share.snapshot_revealed' AND a.result='success'
  AND r.fingerprint=md5(extract(epoch FROM a.created_at)::text||':'||'{"secrets.operations.success": 1}');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION record_product_usage(p_org text,p_source text,p_id text,p_at timestamptz,p_deltas jsonb,p_backfill boolean DEFAULT false)
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
  -- A freshness sample is sufficient. Do not serialize every organization on
  -- one coverage row after sharding the actual platform counters.
  UPDATE product_usage_coverage SET
    collection_started_at=CASE WHEN p_backfill THEN collection_started_at ELSE coalesce(collection_started_at,now()) END,
    last_processed_at=CASE WHEN p_backfill THEN last_processed_at ELSE now() END,
    earliest_backfill_at=CASE WHEN p_backfill THEN least(earliest_backfill_at,p_at) ELSE earliest_backfill_at END,
    updated_at=now() WHERE source=p_source AND (
      (NOT p_backfill AND (collection_started_at IS NULL OR last_processed_at IS NULL OR last_processed_at<now()-interval '1 minute'))
      OR (p_backfill AND (earliest_backfill_at IS NULL OR earliest_backfill_at>p_at)));
  RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION record_agent_product_usage(p_org text,p_run text,p_started timestamptz,p_status text,p_input bigint,p_output bigint,p_backfill boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE progress product_usage_agent_progress; changes jsonb:='{}'; terminal boolean;
BEGIN
  -- Same lock order as ordinary usage and organization deletion.
  PERFORM id FROM organizations WHERE id=p_org FOR KEY SHARE;
  IF NOT FOUND THEN RETURN; END IF;
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
    PERFORM record_product_usage(p_org,'agent',p_run||':'||p_input||':'||p_output||':'||p_status,
      CASE WHEN p_backfill THEN p_started ELSE clock_timestamp() END,changes,p_backfill);
  END IF;
  UPDATE product_usage_agent_progress SET input_tokens=greatest(input_tokens,p_input),output_tokens=greatest(output_tokens,p_output),
    started_recorded=1,terminal_recorded=CASE WHEN terminal THEN 1 ELSE terminal_recorded END WHERE organization_id=p_org AND run_id=p_run;
END $$;
CREATE OR REPLACE FUNCTION product_usage_agent_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org text;
BEGIN
  SELECT organization_id INTO org FROM agent_threads WHERE id=NEW.thread_id;
  IF NEW.started_at < (SELECT collection_started_at FROM product_usage_coverage WHERE source='agent')
     AND NOT EXISTS(SELECT 1 FROM product_usage_agent_progress WHERE organization_id=org AND run_id=NEW.id::text)
  THEN RETURN NEW; END IF;
  PERFORM record_agent_product_usage(org,NEW.id::text,NEW.started_at,NEW.status,NEW.input_tokens,NEW.output_tokens,false);
  RETURN NEW;
END $$;
