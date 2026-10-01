# Uptime probe worker

This is a separate, single-region Node 20 worker. It is deliberately disabled
until both the database migration and network policy are ready.

Required runtime configuration:

- `DATABASE_URL` — primary OutRay Postgres; use TLS outside local development.
- `OUTRAY_UPTIME_DISABLED=true` — global emergency disable switch (also accepts the older `UPTIME_ENABLED=false`).
- `UPTIME_PROBES_ENABLED=true` — enable one-minute HTTP(S) checks (off by default).
- `UPTIME_EGRESS_POLICY_READY=true` — required for probes under `NODE_ENV=production`; set only after an operator verifies the deployed network policy.
- `UPTIME_NOTIFICATIONS_ENABLED=true` — enable team and published subscriber outbox delivery (off by default).
- `OUTRAY_DASHBOARD_URL` and `OUTRAY_STATUS_URL` — explicit HTTPS origins, e.g. `https://outray.co` and `https://status.outray.app`. The worker also accepts `UPTIME_DASHBOARD_URL` / `STATUS_PUBLIC_URL` for compatibility. Do not include a workspace path in the dashboard origin.
- `UPTIME_UNSUBSCRIBE_SECRET` — same HMAC secret as the status service.
- `ZEPTO_API_KEY` — required for email delivery.
- `OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID`, `OUTRAY_SECRETS_ACTIVE_MASTER_KEY`, and optionally `OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS` — same keyring as the dashboard, for encrypted monitor headers and Uptime-specific Slack/Discord integrations.

Deploy the worker behind an **egress policy** that permits probe TCP 80/443 only to
publicly routable addresses, plus the exact DNS resolver, primary Postgres, and
trusted email provider destinations needed by the service. In particular, deny
RFC1918, loopback, link-local, metadata, carrier-grade NAT, benchmark, and
other special-use destinations at the network layer. The in-process URL/DNS
validation and connection pinning are defense in depth, not a substitute for
that firewall. The provided systemd unit denies private and special-use IP
ranges; it does not by itself allowlist public ports or provider destinations.
Do not set `UPTIME_PROBES_ENABLED=true` until the full policy has been tested
in the deployed execution context.

The worker accepts only public HTTP port 80 or HTTPS port 443 targets. The
worker never logs monitor URLs, request headers, or response bodies. It
stores only check outcomes, status codes, bounded latency, and a fixed error
classification. It trims raw check history to 30 days and compact daily check
summaries to 90 days, and cleans stale signup
rate-limit attempts after two days. Automatic monitor incidents enqueue team
alerts only. Subscriber email is claimed only for a team-published incident
update, and each recipient is rechecked as confirmed before sending.
