# Tunnel analytics in Tinybird

The new runtime uses Tinybird for HTTP request history, captured requests,
TCP/UDP events, tunnel metrics, and active-tunnel snapshots. Timescale is no
longer a runtime dependency. PostgreSQL remains the source of truth for
organizations, permissions, tunnel configuration, Uptime, and Secrets; Redis
remains the live tunnel state and telemetry delivery queue.

## Rollout order

1. Validate and deploy the committed Tinybird project to an isolated development
   workspace/branch first. Then test HTTP, TCP, UDP, request capture, filters,
   dashboard metrics, and recovery after a simulated Tinybird outage.
2. Deploy the same definitions to the intended production workspace before
   deploying any new tunnel, cron, or dashboard runtime. This is an additive
   Tinybird change; it does not migrate PostgreSQL or modify Timescale.
3. Configure `TINYBIRD_API_HOST` and scoped credentials in each runtime:
   - Tunnel: `TINYBIRD_TUNNEL_INGEST_TOKEN` or fallback `TINYBIRD_INGEST_TOKEN`.
   - Cron: the same append-token choice and `TINYBIRD_QUERY_TOKEN` (alerts).
   - Dashboard: `TINYBIRD_QUERY_TOKEN`.
   - Observability ingest: its existing `TINYBIRD_INGEST_TOKEN`.
4. Append scopes must include `tunnel_events`, `tunnel_request_captures`,
   `tunnel_protocol_events`, and `tunnel_active_snapshots`. Query scopes must
   include the new `tunnel_*` endpoints. Redeploying resource-scoped tokens
   updates scopes; check the credentials actually supplied by the host/Unbe.
   Never give runtime services a workspace-admin/deployment token.
5. Promote the new runtimes together after verification. Remove `TIMESCALE_URL`
   from their environment only after promotion, not from an old runtime that
   still requires it. An old process must not be restarted without its old
   credentials.

For development, use `tb --branch development deploy` before restarting your
own `npm run dev`. Deployment is not performed by implementing this change.

## Existing history

This change switches readers and writers; it does **not** transfer existing
Timescale history. Old history will not appear in the new dashboard unless it
is backfilled. Keep Timescale and its backups until you have either accepted a
fresh analytics history or separately exported/backfilled and verified the
retained rows. Do not delete its database or cancel the service as part of the
code rollout.

If retaining history, export only unexpired rows, mapping old `request_captures`
to `tunnel_request_captures` and `protocol_events` to `tunnel_protocol_events`.
Serialize UTC timestamps with millisecond precision and headers as JSON strings.
Assign stable event identities before importing so retries are deduplicated.
Compare organization/range counts, byte totals, and capture samples before
promotion. Use a consistent export snapshot; avoid overlapping legacy and new
writers for the same imported events. Historical SQL/setup scripts are retained
for recovery, not executed by deployments.

## Safety and retention

All organization endpoints require an authenticated organization context; tunnel
detail and capture lookups additionally verify tunnel ownership. Tinybird read
tokens stay server-side. HTTP/protocol events retain stable identities for
retry deduplication; query pipes apply per-row retention even before physical
TTL cleanup. Storage keeps the existing maximum of 90 days. Captured payloads
remain sensitive data: protect the Tinybird workspace and tokens as you would
the previous capture database. Redis also temporarily holds sensitive capture
payloads while delivering/retrying them, so restrict network access and protect
its credentials, persistence files, and backups. Exhausted retries are visible
in `analytics:tunnels:<datasource>:dead-letter`; monitor these and replay retained
valid rows deliberately after fixing the delivery error.

Unsent capture storage is intentionally bounded independently of plan retention:
the queue and dead-letter stream each hold at most 64 messages of at most 4 MiB
each (approximately 256 MiB payload each), with a three-day cutoff. Captures may
therefore expire from an outage backlog before a paid plan's 14–90-day retention
ends. A capture larger than 3 MiB is rejected individually rather than poisoning
its neighboring captures; ordinary request metadata continues to be recorded.
Redis persistence backups need their own deletion/retention policy—stream
trimming does not remove data from old AOF/RDB backups.

The legacy destructive reset utility now refuses to run before opening any
store: its backup/deletion plan does not cover the new tunnel data sources.
The development seeder now appends tunnel fixtures to Tinybird, and the dashboard
benchmark now measures authenticated local HTTP reads without Timescale.

## Verification performed

Application tests cover tenancy, range-bound totals, UTC chart buckets, capture
matching, header/body formats, retry identity, and bounded ingestion batches.
Web, tunnel, cron, and ingest production builds were verified. Initial Tinybird
verification covered local datafile syntax only. On October 9, a follow-up
`tb --cloud deploy --check --no-auto` passed against the configured workspace
after all tunnel date parameters were changed from parsed `String` parameters
to typed `DateTime64` parameters. This prevents deployment validation's missing
String placeholder from reaching a datetime parser while keeping real request
dates required and preserving UTC millisecond precision. The focused schema,
read, authorization, and chart tests all pass (66 tests).

The cloud check validated the definitions only: it did not deploy/promote any
resources, ingest/copy data, or exercise an end-to-end live tunnel. Test those
flows against development Tinybird before promotion.

The web suite retains two pre-existing setup/get-started link assertions that
expect retired tunnel URLs. The full web type check also reports existing errors
outside the changed analytics routes. These are separate from the migration;
focused migration checks pass.
