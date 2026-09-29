# Uptime v1 rollout

Uptime code can ship before the product is enabled. Keep `UPTIME_ENABLED=false`,
`UPTIME_PROBES_ENABLED=false`, and `UPTIME_NOTIFICATIONS_ENABLED=false` during
the additive migration and initial deploy. The dashboard can be hidden in an
emergency with `OUTRAY_UPTIME_DISABLED=true`.

1. Deploy migrations 0016–0020 from `apps/web/drizzle`. The main deployment
   workflow applies them before transferring the edge, renderer, and worker.
2. Add DNS-only `A`/`AAAA` records for both `status.outray.app` and
   `*.status.outray.app` pointing to the existing edge VPS. The wildcard
   certificate is a separate Caddy site and uses the Cloudflare DNS challenge;
   verify the installed Caddy build has the Cloudflare DNS provider and that
   `/etc/caddy/cloudflare.env` has a token permitted to edit this zone. A
   certificate for `*.outray.app` does **not** cover `slug.status.outray.app`.
   Keep OutRay's own `status.outray.dev` on its current, separate service. Set the production
   dashboard's `OUTRAY_DASHBOARD_URL=https://dash.outray.dev` and
   `VITE_OUTRAY_STATUS_URL=https://status.outray.app`. Configure the Slack and
   Discord OAuth apps with the additional callbacks
   `https://dash.outray.dev/api/uptime/integrations/{slack,discord}/callback`.
3. Set `OUTRAY_DASHBOARD_URL=https://dash.outray.dev` and
   `OUTRAY_STATUS_URL=https://status.outray.app` in GitHub Actions variables.
   The latter is the canonical **base origin** used to construct
   `https://<page-slug>.status.outray.app`; it is not a page URL. Provide `STATUS_EDGE_SECRET`,
   `UPTIME_RATE_LIMIT_SECRET`, `UPTIME_UNSUBSCRIBE_SECRET`, `DATABASE_URL`,
   `ZEPTO_API_KEY`, and the dashboard's Secrets master-key settings as Actions
   secrets. The dashboard also needs the existing
   `OUTRAY_SLACK_CLIENT_ID`/`OUTRAY_SLACK_CLIENT_SECRET` and
   `OUTRAY_DISCORD_CLIENT_ID`/`OUTRAY_DISCORD_CLIENT_SECRET` for Uptime OAuth.
   Do not put these values in a repository file.
4. Set `UPTIME_ENABLED=true` while leaving probes and notifications disabled.
   Verify the private status renderer's `/health`, the canonical hostname,
   domain-check TLS authorization, and that untrusted edge headers are stripped.
   Create and publish a test page; confirm its grouped components render at
   `https://<slug>.status.outray.app/` with a valid wildcard certificate.
   Confirm `https://status.outray.app/<slug>` redirects to the new URL,
   unpublished/unknown page hosts do not render, and nested status labels do
   not route to a tunnel. Verify that an unverified custom domain
   cannot receive a certificate or page, then prove a DNS-only TXT+CNAME
   binding and load the page from its custom subdomain root.
5. Install and inspect `deploy/uptime-probe.service` on the server. Its systemd
   IP deny rules are a second boundary around the worker, but the full egress
   policy must also limit probe traffic to public TCP 80/443 and permit only
   explicitly reviewed DNS, Postgres, and delivery-provider access. Test the
   policy from the worker's execution context against loopback, RFC1918,
   link-local/metadata, mixed public/private DNS, and redirects. Only after
   that succeeds, set `UPTIME_EGRESS_POLICY_READY=true` and
   `UPTIME_PROBES_ENABLED=true`.
6. Confirm one-minute checks, Unknown-before-first-check, the two-failure
   Down and two-success Recovery transitions, automatic team alerts, and
   30-day history. Then set `UPTIME_NOTIFICATIONS_ENABLED=true` and verify
   member email plus Uptime-specific Slack/Discord destinations. Finally test
   subscriber confirmation, publish-only incident email, unsubscribe, and
   duplicate-send protection using a non-production recipient.

No production URLs, provider secrets, DNS records, or server egress firewall
are created by the source build. Do not mark the release complete until a real
hosted page and verified custom-domain page have passed the checks above.
