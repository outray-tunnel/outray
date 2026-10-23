-- Continue accounting for pre-rollout Agent runs after their initial backfill.
-- Runs without a backfilled checkpoint remain historical/unknown until imported.
CREATE OR REPLACE FUNCTION product_usage_agent_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org text;
BEGIN
  SELECT organization_id INTO org FROM agent_threads WHERE id=NEW.thread_id;
  IF NEW.started_at < (SELECT collection_started_at FROM product_usage_coverage WHERE source='agent')
     AND NOT EXISTS(SELECT 1 FROM product_usage_agent_progress WHERE organization_id=org AND run_id=NEW.id::text) THEN
    RETURN NEW;
  END IF;
  PERFORM record_agent_product_usage(org,NEW.id::text,NEW.started_at,NEW.status,NEW.input_tokens,NEW.output_tokens,true);
  RETURN NEW;
END $$;
