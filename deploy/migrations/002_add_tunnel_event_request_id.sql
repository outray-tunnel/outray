-- Migration: Link aggregate tunnel events to their full request captures
-- Existing tunnel_events tables predate the request_id column in setup_tigerdata.sql.

ALTER TABLE tunnel_events
ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tunnel_events_request_id
ON tunnel_events (request_id)
WHERE request_id IS NOT NULL;
