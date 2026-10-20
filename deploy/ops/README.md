# Hosted production → independent Ops

Ops is a normal self-hosted OutRay installation. Production services use the
public OutRay SDK or standard OTLP export with a server-side machine token
scoped to `observability:write`. The SDK's base URL points to Ops instead of
the hosted ingest endpoint; no Ops-specific ingestion code is required.

- Cloudflare's account-level OpenTelemetry destinations
  `outray-ops-worker-logs` and `outray-ops-worker-traces` export the hosted
  ingest and delivery Workers. Wrangler enables unsampled invocation logs,
  10% traces, and query-string redaction. Keep destination credentials in
  Cloudflare, not in Wrangler or this repository.
- The hosted web already uses the public TanStack Start adapter, with its
  existing private credential names. The other Node services call the public
  `@outray/observability` SDK directly. Add `OUTRAY_API_KEY` and
  `OUTRAY_OTLP_ENDPOINT` to Unbe's OutRay / OutRay / Production environment
  for connect, internal-check, Status, and the uptime probe. The edge deploy
  helper passes them to those runtimes. Cron on Aeroplane and Secrets Share
  on Brimble need the same pair in their private runtime environment. The
  standalone Secrets Share package lock includes the SDK for Brimble's
  `npm ci` install. Use the Ops machine token, never a browser credential.
  These services disable automatic HTTP/database spans to avoid exporting
  sensitive paths or SQL; console logs still use the SDK's redaction.
- The CI VPS runs `docker-log-forwarder.service` with the generic
  `docker-log-forwarder.py`. It reads only the long-running Woodpecker server
  and agent containers, not build-step containers. Its private root-owned
  `/etc/outray/ops-log-forwarder.env` contains `OPS_OTLP_ENDPOINT` and
  `OPS_OTLP_TOKEN`; keep mode `0600` and rotate independently of CI's deploy
  credentials. The forwarder strips URL query strings and common credentials,
  but do not emit secrets in service logs.
- Ops uptime checks cover the public web liveness, web PostgreSQL/Redis
  readiness, connect edge, Status, ingest, delivery, Secrets Share, and CI.
  Checks for `?jobs=true` (cron and probe freshness) and `?tinybird=true`
  (a real pipe query) are staged disabled until the web release containing
  those endpoints is live. Then verify each returns 200 before enabling it.
- Missing-telemetry alerts are active for web, both Workers, and the CI server
  and agent. Add one for another service only after verifying that it normally
  emits logs in every alert window; use uptime checks for quiet services.

Ops currently evaluates alerts but email delivery requires its own notification
configuration. Until that is enabled, alerts and uptime failures are visible
in Ops but do not send email.
