# OutRay public status service

Astro 5 standalone server for published Uptime pages. This is a separate service from the authenticated dashboard and from OutRay's own `status.outray.dev`.

## Runtime

Build with `npm run build --workspace=outray-status`, then run `npm run start --workspace=outray-status`. The server binds `127.0.0.1` by default; set `HOST`/`PORT` for the Astro Node adapter as needed and keep it behind the OutRay edge. `/health` returns 200 only when Uptime is enabled and the database schema is available.

Required in production:

- `DATABASE_URL`
- `OUTRAY_STATUS_URL=https://status.outray.app` (the canonical external origin)
- `UPTIME_RATE_LIMIT_SECRET` (HMAC key for hashed signup rate-limit identifiers)
- `UPTIME_UNSUBSCRIBE_SECRET` (HMAC key shared with the subscriber email worker)
- `STATUS_EDGE_SECRET` (private header value set by the edge for trusted client IP forwarding)
- `ZEPTO_API_KEY` for confirmation email delivery

Optional: `ZEPTO_FROM_EMAIL` (defaults to `no-reply@outray.dev`), `DATABASE_SSL_REJECT_UNAUTHORIZED=false` only for a trusted private database connection, `UPTIME_ENABLED=false` to disable public pages and signups.

The edge must set `Host` to the original external hostname, strip any incoming `X-Outray-Edge-Secret` and `X-Outray-Client-IP`, and set its own `X-Outray-Edge-Secret` plus `X-Outray-Client-IP` containing a validated client address. Do not derive the client address from an untrusted incoming `X-Forwarded-For`. Do not expose the standalone service port to the public network. Canonical pages live at `https://<page-slug>.status.outray.app/`; an active status-purpose domain bound to a published page also serves that page at `/`. The base `OUTRAY_STATUS_URL` host handles health and subscription confirmation/unsubscribe routes, but has no default customer page. Legacy `/<page-slug>` links redirect to the page's subdomain.

Public forms use no client JavaScript. A subscription remains pending until the visitor opens the confirmation URL and submits the confirmation form. Confirmation tokens are SHA-256 hashes in Postgres and expire after 24 hours. Unsubscribe URLs are HMAC-signed and contain an expiry; visiting the URL only renders a page, and its POST performs the unsubscribe. Subscriber emails are sent only by the dedicated Uptime outbox worker for team-published incident updates.
