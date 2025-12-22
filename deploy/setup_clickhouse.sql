CREATE TABLE IF NOT EXISTS tunnel_events
(
    `timestamp` DateTime64(3) DEFAULT now64(),
    `tunnel_id` String,
    `organization_id` String,
    `host` String,
    `method` LowCardinality(String),
    `path` String,
    `status_code` UInt16,
    `request_duration_ms` UInt32,
    `bytes_in` UInt32,
    `bytes_out` UInt32,
    `client_ip` IPv4,
    `user_agent` String
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (tunnel_id, timestamp)
TTL timestamp + toIntervalDay(7)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS tunnel_stats_1m
(
    `minute` DateTime,
    `tunnel_id` String,
    `requests` UInt32,
    `errors` UInt32,
    `avg_latency_ms` Float32,
    `p95_latency_ms` UInt32,
    `bytes_in` UInt64,
    `bytes_out` UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toDate(minute)
ORDER BY (tunnel_id, minute)
TTL minute + toIntervalDay(30)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS tunnel_events_to_stats_1m TO tunnel_stats_1m
AS SELECT
    toStartOfMinute(timestamp) AS minute,
    tunnel_id,
    count() AS requests,
    countIf(status_code >= 400) AS errors,
    CAST(avg(request_duration_ms), 'Float32') AS avg_latency_ms,
    CAST(quantileExact(0.95)(request_duration_ms), 'UInt32') AS p95_latency_ms,
    sum(bytes_in) AS bytes_in,
    sum(bytes_out) AS bytes_out
FROM tunnel_events
GROUP BY
    minute,
    tunnel_id;
