-- Migration script: ClickHouse to Tiger Data (TimescaleDB Cloud)
-- 
-- This uses the new Tiger Data syntax for creating hypertables
-- See: https://docs.timescale.com/use-timescale/latest/hypertables/
--
-- This script is idempotent - safe to run multiple times in CI
-- Tables are only created if they don't exist, data is preserved

-- ============================================================================
-- Active tunnel snapshots (for cron job)
-- ============================================================================
CREATE TABLE IF NOT EXISTS active_tunnel_snapshots (
    ts TIMESTAMPTZ NOT NULL,
    active_tunnels INTEGER NOT NULL
);

-- Convert to hypertable if not already (safe to call multiple times)
SELECT create_hypertable('active_tunnel_snapshots', 'ts', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================================================
-- Tunnel events (HTTP requests)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tunnel_events (
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tunnel_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    retention_days SMALLINT DEFAULT 3,
    host TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code SMALLINT NOT NULL,
    request_duration_ms INTEGER NOT NULL,
    bytes_in INTEGER NOT NULL,
    bytes_out INTEGER NOT NULL,
    client_ip TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    request_id TEXT  -- UUID stored as text, links to request_captures.id when full capture is enabled
);

-- Convert to hypertable if not already
SELECT create_hypertable('tunnel_events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Create indexes (IF NOT EXISTS is implicit for CREATE INDEX on TimescaleDB)
CREATE INDEX IF NOT EXISTS idx_tunnel_events_tunnel_id ON tunnel_events (tunnel_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tunnel_events_organization_id ON tunnel_events (organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tunnel_events_request_id ON tunnel_events (request_id) WHERE request_id IS NOT NULL;

-- ============================================================================
-- Protocol events for TCP/UDP tunnels
-- ============================================================================
CREATE TABLE IF NOT EXISTS protocol_events (
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tunnel_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    retention_days SMALLINT DEFAULT 3,
    protocol TEXT NOT NULL,  -- 'tcp' or 'udp'
    event_type TEXT NOT NULL, -- 'connection', 'data', 'close' for TCP; 'packet' for UDP
    connection_id TEXT NOT NULL DEFAULT '',
    client_ip TEXT NOT NULL,
    client_port INTEGER NOT NULL,
    bytes_in INTEGER NOT NULL,
    bytes_out INTEGER NOT NULL,
    duration_ms INTEGER DEFAULT 0
);

-- Convert to hypertable if not already
SELECT create_hypertable('protocol_events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_protocol_events_tunnel_id ON protocol_events (tunnel_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_protocol_events_organization_id ON protocol_events (organization_id, timestamp DESC);

-- ============================================================================
-- Request captures (full request/response bodies)
-- ============================================================================
CREATE TABLE IF NOT EXISTS request_captures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tunnel_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    
    -- Request data
    request_headers JSONB,
    request_body TEXT,
    request_body_size INTEGER DEFAULT 0,
    
    -- Response data
    response_headers JSONB,
    response_body TEXT,
    response_body_size INTEGER DEFAULT 0
);

-- Convert to hypertable if not already
SELECT create_hypertable('request_captures', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Create indexes for request captures
CREATE INDEX IF NOT EXISTS idx_request_captures_tunnel_id ON request_captures (tunnel_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_captures_organization_id ON request_captures (organization_id, timestamp DESC);

-- ============================================================================
-- Continuous Aggregates (only create if they don't exist)
-- ============================================================================

-- Tunnel stats aggregated per minute
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.continuous_aggregates 
        WHERE view_name = 'tunnel_stats_1m'
    ) THEN
        CREATE MATERIALIZED VIEW tunnel_stats_1m
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 minute', timestamp) AS minute,
            tunnel_id,
            COUNT(*) AS requests,
            COUNT(*) FILTER (WHERE status_code >= 400) AS errors,
            AVG(request_duration_ms)::REAL AS avg_latency_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY request_duration_ms)::INTEGER AS p95_latency_ms,
            SUM(bytes_in)::BIGINT AS bytes_in,
            SUM(bytes_out)::BIGINT AS bytes_out
        FROM tunnel_events
        GROUP BY minute, tunnel_id
        WITH NO DATA;

        -- Refresh policy for continuous aggregate
        PERFORM add_continuous_aggregate_policy('tunnel_stats_1m',
            start_offset => INTERVAL '10 minutes',
            end_offset => INTERVAL '1 minute',
            schedule_interval => INTERVAL '1 minute'
        );
    END IF;
END $$;

-- Protocol stats aggregated per minute
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.continuous_aggregates 
        WHERE view_name = 'protocol_stats_1m'
    ) THEN
        CREATE MATERIALIZED VIEW protocol_stats_1m
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 minute', timestamp) AS minute,
            tunnel_id,
            protocol,
            COUNT(*) FILTER (WHERE event_type = 'connection') AS connections,
            COUNT(DISTINCT connection_id) FILTER (WHERE event_type = 'data' AND protocol = 'tcp') AS active_connections,
            COUNT(*) FILTER (WHERE event_type IN ('data', 'packet')) AS packets,
            SUM(bytes_in)::BIGINT AS bytes_in,
            SUM(bytes_out)::BIGINT AS bytes_out
        FROM protocol_events
        GROUP BY minute, tunnel_id, protocol
        WITH NO DATA;

        -- Refresh policy for protocol stats continuous aggregate
        PERFORM add_continuous_aggregate_policy('protocol_stats_1m',
            start_offset => INTERVAL '10 minutes',
            end_offset => INTERVAL '1 minute',
            schedule_interval => INTERVAL '1 minute'
        );
    END IF;
END $$;

-- ============================================================================
-- Retention policies (90 days max - for Pulse plan)
-- ============================================================================
SELECT add_retention_policy('active_tunnel_snapshots', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('tunnel_events', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('protocol_events', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('request_captures', INTERVAL '90 days', if_not_exists => TRUE);

-- Add retention to continuous aggregates if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'tunnel_stats_1m') THEN
        PERFORM add_retention_policy('tunnel_stats_1m', INTERVAL '90 days', if_not_exists => TRUE);
    END IF;
    IF EXISTS (SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'protocol_stats_1m') THEN
        PERFORM add_retention_policy('protocol_stats_1m', INTERVAL '90 days', if_not_exists => TRUE);
    END IF;
END $$;

-- ============================================================================
-- Per-Organization Retention Cleanup
-- ============================================================================
-- Since TimescaleDB doesn't support per-row TTL, we use a scheduled job to
-- delete expired rows based on each row's retention_days value.
-- 
-- Retention tiers (based on subscription plans):
--   Free: 3 days | Ray: 14 days | Beam: 30 days | Pulse: 90 days
-- ============================================================================

-- Function to clean up expired tunnel events
CREATE OR REPLACE FUNCTION cleanup_expired_tunnel_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM tunnel_events
    WHERE timestamp < NOW() - (retention_days * INTERVAL '1 day');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % expired rows from tunnel_events', deleted_count;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired protocol events
CREATE OR REPLACE FUNCTION cleanup_expired_protocol_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM protocol_events
    WHERE timestamp < NOW() - (retention_days * INTERVAL '1 day');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % expired rows from protocol_events', deleted_count;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Combined cleanup function for the scheduled job (must return void for add_job)
CREATE OR REPLACE FUNCTION cleanup_expired_events(job_id INTEGER, config JSONB)
RETURNS VOID AS $$
BEGIN
    PERFORM cleanup_expired_tunnel_events();
    PERFORM cleanup_expired_protocol_events();
END;
$$ LANGUAGE plpgsql;

-- Schedule the cleanup job to run every hour (only if not already scheduled)
DO $$
DECLARE
    job_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM timescaledb_information.jobs
        WHERE proc_name = 'cleanup_expired_events' AND proc_schema = 'public'
    ) INTO job_exists;
    
    IF NOT job_exists THEN
        PERFORM add_job('cleanup_expired_events', '1 hour');
    END IF;
END $$;
