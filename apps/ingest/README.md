# OutRay ingestion

Both deployment targets accept the same OTLP HTTP contract: JSON or protobuf,
optional gzip, and `/v1/{traces,logs,metrics}` (including the legacy
`/api/otlp/v1/*` aliases). SDK configuration does not change when switching hosts.

## Node / self-hosted

The existing service is retained for Docker and self-hosted installations. It
uses PostgreSQL authentication and Redis Streams for durable Tinybird delivery.

```sh
npm run build --workspace=outray-ingest
npm run start --workspace=outray-ingest
```

## Cloudflare Workers

`wrangler.jsonc` deploys a native request/queue Worker. The committed resource IDs
belong to the hosted OutRay account; replace them for another installation.
Worker tooling and local `workerd` tests require Node.js 22 or newer.

Required bindings:

- `HYPERDRIVE`: PostgreSQL configuration with **query caching disabled**. Token
  revocation and expiry must not be served from cached SELECT results. Limit the
  origin connection pool to suit the database (hosted configuration: five).
- `OTLP_QUEUE`: durable ingestion queue; consumer batches of ten, five retries,
  concurrency of five. Accepted requests have already awaited confirmed queue storage.
- `outray-otel-ingest-dlq`: failed messages remain available for inspection/replay.
  Both queues have 14-day retention; never purge a backlog during a release.
- `OTLP_OVERFLOW`: **private** R2 bucket for normalized rows that cannot fit a
  Queue message. Keep public access disabled. A 30-day lifecycle rule covers both
  primary and dead-letter retention plus a safety margin. Successful/ambiguous
  sends retain objects for safe redelivery; do not delete them early. This retry
  buffer retention is separate from the plan's Tinybird analytics retention.
- `ORG_RATE_LIMITER`: one SQLite Durable Object per organization, enforcing the
  existing global 600 exports/minute limit across Cloudflare locations.
- `TINYBIRD_INGEST_TOKEN`: Worker secret, scoped to the three OTLP data sources.
  Do not put credentials in Wrangler vars, repository files, or CLI arguments.

There is no Redis dependency or continuously running worker loop on Cloudflare.
Database clients are created per request; Hyperdrive owns connection pooling.
Last-used writes and cleanup are attached to `waitUntil`, but accepted telemetry
delivery is never deferred to it.

### Verify and deploy

```sh
npm run generate:protobuf --workspace=outray-ingest
npm run types:worker --workspace=outray-ingest
npm run check:worker --workspace=outray-ingest
npm test --workspace=outray-ingest
npm run build:worker --workspace=outray-ingest
```

Provision only the ingestion secret from an existing environment file and deploy:

```sh
cd apps/ingest
node scripts/deploy-worker.mjs ../../.env.prod
```

The helper sends only `TINYBIRD_INGEST_TOKEN` through stdin. It does not upload
the dashboard's database URL, OAuth secrets, query token, or other credentials.
Hyperdrive's origin credentials are configured separately in Cloudflare.

`deploy:worker` also supports standard Wrangler secret provisioning. For local
Worker development, supply local credentials via ignored `.dev.vars` and
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`; use a development
database and Tinybird workspace, never production test data.

### Runtime and acceptance limits

The Worker retains the existing 8 MiB raw/decoded body limit and 10,000 accepted
records limit. It additionally bounds cumulative normalized records to 16 MiB
before enqueueing: OTLP shared attributes can otherwise amplify a small export
into gigabytes. Excess records are reported in the standard OTLP
`partialSuccess` response, not silently dropped. Send smaller batches when
resource/scope attributes are unusually large.

Queue messages are packed by UTF-8 byte size (124,000-byte ceiling), with
250,000-byte send batches. Oversized individual rows use checksum-validated R2
pointers. Tinybird acknowledgements require every row to commit with zero
quarantined rows. Failures retry individually and ultimately reach the DLQ.
At-least-once delivery reuses stable span/log/metric identities already used by
the Tinybird ReplacingMergeTree data sources.

### Monthly telemetry admission

Hosted subscriptions share one organization allowance across traces, logs and
metrics: Free 1 GiB, Ray 5 GiB, Beam 20 GiB, and Pulse 100 GiB. Allowances reset at
the start of each **UTC calendar month**, including annually billed subscriptions.
Self-hosted installations instead use `OUTRAY_TELEMETRY_BYTES_PER_MONTH` (a
positive safe integer; default 1 PiB), independently of hosted subscriptions.

Both Node and Workers count the UTF-8 bytes of accepted, sanitized normalized
rows, not compressed request bytes. Derived HTTP request rows and queue-consumer
redelivery are not charged again. Initial parser/normalization rejections never
reserve usage. The authentication PostgreSQL database owns the shared
`organization_monthly_usage` counter and payload-free
`organization_telemetry_receipts`. Apply the web database migration **before**
deploying either ingestion runtime; missing quota storage fails closed with 503.

Admission locks the monthly counter, preflights the complete new export before
queueing, and returns 429 with `resetsAt` if insufficient allowance remains.
Deterministic bounded chunks allow a failed queue send to release unsent bytes
while retaining usage/receipts for chunks whose durable storage was confirmed.
Exact normalized SDK retries reuse these receipts without charging or queueing
accepted chunks again. Receipts ignore ingestion timestamps, retention metadata
and object-key order; they contain no captured data or credentials.

PostgreSQL and Redis/Cloudflare Queues do not share a distributed transaction.
A crash or ambiguous database commit after queue acceptance can still produce
at-least-once delivery on an SDK retry; stable Tinybird identities deduplicate
those rows. Usage is committed when admission completes, not a guarantee of
exactly-once distributed billing under an interrupted cross-store commit.

`/health` is liveness only. Before production cutover, check authenticated exports,
queue delivery, DLQ/backlog health, and Tinybird arrival. The hosted endpoint is
the Worker Custom Domain `ingest.outray.co`; Cloudflare manages its DNS and TLS,
with no VPS origin or automatic VPS fallback. Keep this Custom Domain in the
Wrangler configuration so subsequent deployments preserve the binding.
For recovery, roll back the Worker to a known-good version. Keep the Worker
consumer running to drain accepted exports; do not delete its queue, Hyperdrive,
or overflow bucket.
Monitor queue backlog, oldest-message age, delivery failures, and DLQ arrivals;
replay DLQ messages only after fixing the cause, within their retention window.

The test suite includes actual `workerd` HTTP→Queue→R2→consumer delivery with an
isolated Tinybird mock and retry verification. No production database or
analytics records are used by those tests.

References: [Queues guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/),
[Queues limits](https://developers.cloudflare.com/queues/platform/limits/),
[Hyperdrive cache freshness](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).
