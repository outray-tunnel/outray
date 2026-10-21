# OutRay public status service

Public Uptime pages, separate from the authenticated dashboard and from OutRay's own `status.outray.dev`. The default target remains an Astro standalone Node server for VPS and self-hosted deployments. The hosted service can instead be built for Cloudflare Workers; choosing that target must be explicit.

## VPS and self-hosting: Node remains the default

From the repository root:

```sh
npm ci
npm run build --workspace=outray-status
npm run start --workspace=outray-status
```

`build` produces `dist/`; `start` runs `dist/server/entry.mjs`. Do not set `OUTRAY_STATUS_RUNTIME=cloudflare` for a Node build. Existing self-hosted Docker/Compose deployments continue to use this target; see [the self-hosted guide](../../deploy/self-hosted/README.md).

The server binds `127.0.0.1` by default; set `HOST`/`PORT` for the Astro Node adapter as needed and keep it behind the OutRay edge. `/health` returns 200 only when Uptime is enabled and the database schema is available.

Required in production:

- `DATABASE_URL`
- `OUTRAY_STATUS_URL=https://status.outray.app` (the canonical external origin)
- `UPTIME_RATE_LIMIT_SECRET` (HMAC key for hashed signup rate-limit identifiers)
- `UPTIME_UNSUBSCRIBE_SECRET` (HMAC key shared with the subscriber email worker)
- `STATUS_EDGE_SECRET` (private header value set by the edge for trusted client IP forwarding)
- `ZEPTO_API_KEY` for confirmation email delivery

Optional: `ZEPTO_FROM_EMAIL` (defaults to `no-reply@outray.co`), `DATABASE_SSL_REJECT_UNAUTHORIZED=false` only for a trusted private database connection, `UPTIME_ENABLED=false` to disable public pages and signups.

## Status-page analytics

Each page has an **Analytics** tab in the console. Collection and reports are
enabled for Ray, Beam, Pulse, Unlimited, and self-hosted installations, not Free.
An upgrade starts collection; there is no historical backfill. Downgrades stop
collection and deny report access immediately on the next API request.

Deploy `tinybird/datasources/status_page_views.datasource` and
`tinybird/endpoints/status_page_analytics.pipe` through the normal Tinybird
deployment **before** deploying Status and the console. Existing named
`OUTRAY_INGEST_TOKEN` / `OUTRAY_QUERY_TOKEN` scopes must include the new resources;
custom scoped tokens need `status_page_views:APPEND` and
`status_page_analytics:READ`, respectively. No PostgreSQL migration is required.
The Status runtime needs `TINYBIRD_API_HOST` and `TINYBIRD_INGEST_TOKEN`; the console
continues using `TINYBIRD_QUERY_TOKEN`. Compose and both deployment paths forward
these existing server-only credentials. No tokens are included in the beacon.

The same-origin browser beacon counts the overview and public incident reports,
including CDN-served pages. Health checks, static assets, subscription routes,
known bots, prefetches, DNT and Global Privacy Control are excluded. It requires
the current host to resolve to a published page, and uses the database's
organization and plan, never client-supplied tenant or plan identifiers.
Ingestion is bounded and best-effort, independent of public HTML availability;
failures emit `status_analytics_unavailable` without sensitive details. The
collector has a bounded per-process rate limiter (20 events/minute/address).
For distributed abuse protection, also rate-limit `/api/analytics` at your edge.

Views and approximate daily unique visitors are reported hourly/daily, alongside
top referrer hostnames, countries and pages. Visitor HMACs use the existing
`UPTIME_RATE_LIMIT_SECRET` with a separate purpose prefix and rotate daily in UTC
and per page. Totals sum daily uniques, not deduplicated people across days.
There are no analytics cookies, local storage, raw IPs, user agents, full
referrer URLs or query strings in Tinybird. Countries come only from trusted
Worker `request.cf.country`; VPS installs report Unknown. Retention follows the
plan (14/30/90 days), or the installation policy (at most 90). Reports enforce
the current retention window even before Tinybird's asynchronous TTL deletion.
Browser blockers and privacy preferences can make counts lower than access logs.

The edge must set `Host` to the original external hostname, strip any incoming `X-Outray-Edge-Secret` and `X-Outray-Client-IP`, and set its own `X-Outray-Edge-Secret` plus `X-Outray-Client-IP` containing a validated client address. Do not derive the client address from an untrusted incoming `X-Forwarded-For`. Do not expose the standalone service port to the public network. Canonical pages live at `https://<page-slug>.status.outray.app/`; an active status-purpose domain bound to a published page also serves that page at `/`. The base `OUTRAY_STATUS_URL` host handles health and subscription confirmation/unsubscribe routes, but has no default customer page. Legacy `/<page-slug>` links redirect to the page's subdomain.

The public signup UI is hydrated separately from the native confirmation and unsubscribe forms. A subscription remains pending until the visitor opens the confirmation URL and submits the confirmation form. Confirmation tokens are SHA-256 hashes in Postgres and expire after 24 hours. Unsubscribe URLs are HMAC-signed and contain an expiry; visiting the URL only renders a page, and its POST performs the unsubscribe. Subscriber emails are sent only by the dedicated Uptime outbox worker for team-published incident updates.

## Hosted Cloudflare Workers target

Build the Worker separately from the default Node artifact:

```sh
npm run build:worker --workspace=outray-status
```

This command explicitly sets `OUTRAY_STATUS_RUNTIME=cloudflare` and writes `dist-worker/`. It does not replace `dist/`, run the Node entry point, or restart the VPS renderer. Use the checked-in Worker deployment helper rather than putting secret values into Wrangler arguments, the manifest, or build output.

Before activating hosted Worker deployments, configure the Cloudflare account, the Worker's bindings and production credentials, and the public hostname routing. Keep database migrations in the existing migration step; deploying a Worker is not a schema migration.

The Worker uses the existing Hyperdrive configuration for PostgreSQL. The private `outray-status-snapshots` R2 bucket is provisioned, but **`STATUS_SNAPSHOTS` is deliberately unbound** until publication/domain revocation fences are implemented. No stale HTML fallback is active in this initial rollout. Check the actual Wrangler manifest before deployment: account, Hyperdrive ID, Worker name, and any routes must belong to the intended environment. Do not put a database URL, email key, signing secret, or API token in that manifest.

The deployment helper builds the Worker, reads only the allowlisted Status environment from the existing remote PM2 configuration, uploads Worker secrets over standard input, and deploys through Wrangler:

```sh
# Supply CLOUDFLARE_API_TOKEN securely through the shell/CI environment.
npm run deploy:worker --workspace=outray-status -- \
  --source-ssh root@209.74.86.123 --ssh-port 22022 \
  --ssh-key /secure/path/to/edge-deploy-key
```

SSH uses strict host-key checking. Install the verified existing edge host key in the operator's `known_hosts` before running this command; do not bypass verification or use `StrictHostKeyChecking=no`. The helper reads configuration, not PM2 process state mutations: it must not stop, restart, or reconfigure the live VPS renderer. Do not replace its allowlist with `pm2 jlist`, `env`, or an entire `.env` dumped into CI logs.

### Woodpecker activation and token permissions

`.woodpecker/ci.yaml` intentionally keeps `STATUS_DEPLOY_TARGET: vps`. There are no live Worker routes in the initial manifest. Adding an API token alone must not change production traffic or the deployment target.

After the account/bindings/hostnames are ready:

1. Create the Woodpecker repository secret `cloudflare_api_token`, available only for the existing Push/Manual production events, not pull requests.
2. Enable the commented `CLOUDFLARE_API_TOKEN` secret binding in the Status step.
3. Review the manifest, then deliberately change `STATUS_DEPLOY_TARGET` to `cloudflare`.

Scope the token to the target account. It needs **Workers Scripts: Edit** and **Account Settings: Read**. Grant **Workers R2 Storage: Edit** and **Hyperdrive: Edit/Read** only as required by Wrangler to resolve/manage the declared bindings; the existing Hyperdrive and R2 resources are provisioned separately. If the manifest later installs zone routes, add **Workers Routes: Edit** and **Zone: Read** scoped to those zones. The code-deploy token does not need DNS, SaaS custom-hostname, or certificate administration permissions: keep that onboarding credential separate.

With the gate unchanged, CI does not request the new Cloudflare secret and continues the current VPS deploy. With `cloudflare` selected, missing credentials fail before the helper runs; there is no silent fallback. Status remains ahead of the unchanged Edge and uptime-probe deployment steps, after the existing database migration and Tinybird deployment. The default Node Status artifact is still built for rollback and self-hosting. The helper builds `dist-worker/` itself; CI does not run a second Worker build.

### Hostnames and SaaS onboarding

Deployment and hostname onboarding are separate operations. Configure the hosted `status.outray.app` origin and its customer-page subdomains before redirecting traffic. A customer's custom status subdomain also needs Cloudflare for SaaS onboarding, the correct fallback origin/routing, ownership validation, and an active certificate. Merely publishing Worker code does not complete those steps or publish an unpublished status page.

Use the validation and DNS records supplied for the particular hostname; do not reuse another customer's ownership token or assume a wildcard route covers externally owned hostnames. Keep the dashboard's status-domain approval and page-publication controls in the cutover checklist.

The console's provider integration is **opt-in**. Self-hosted installations always
use their existing Caddy flow. For the hosted console, first apply the checked-in
`0033_status_cloudflare_hostnames` migration through the normal CI migration step,
then configure these server-only variables:

```text
STATUS_DOMAIN_PROVIDER=cloudflare
STATUS_CLOUDFLARE_ACCOUNT_ID=c24bce6c7c75dad3f96b41f09a1f00d5
STATUS_CLOUDFLARE_ZONE_ID=de0d9497f5416120b3b338a8a4abd451
STATUS_CLOUDFLARE_WORKER_SCRIPT=outray-status-worker
STATUS_CLOUDFLARE_API_TOKEN=<separate securely stored onboarding token>
```

Scope the onboarding token to the SaaS zone with Zone Read, DNS Edit, Workers
Routes Edit, and SSL and Certificates Edit. Never expose it through `VITE_*` or
reuse the narrower deployment token. Canonical owned hostnames use exact proxied
CNAME records; external customer CNAME records must remain DNS-only. Each exact
Worker route has more-specific **None** routes for `/.well-known/acme-challenge/*`
and `/.well-known/pki-validation/*`, allowing Cloudflare certificate validation.
These are account-owned API tokens; verify one at
`GET /client/v4/accounts/{account_id}/tokens/verify`, not the user-token endpoint.
The hosted production console fails closed if this provider is not configured:
publishing must not report success while its public DNS, route, and certificate
cannot be provisioned. Self-hosted installations continue to use Caddy.

Domains remain pending until both the hostname and its certificate are active.
The UI offers “Check provisioning” rather than treating DNS proof alone as a live
connection. Publishing a new canonical address similarly waits for its certificate.
Failed domain removals retain a disabled row so an authorized retry can finish.

Before enabling the provider on an existing database, explicitly backfill its
verified provider IDs; do not adopt arbitrary same-name Cloudflare hostnames.
The initial hosted cutover used these mappings, all with provider status `active`:

| Resource | Cloudflare custom-hostname ID |
| --- | --- |
| Page slug `byteship` | `a14297fb-1621-497d-8aec-5eff8de2a5ad` |
| Page slug `notling` | `f6dd0213-16a7-4335-8d83-2d2aef8106c9` |
| Page slug `cencori` | `de389a95-d4c6-4e4b-8a09-2a66ae6f6532` |
| Status domain `status.byteship.dev` | `f7f7f8eb-1090-446d-8cb7-ac7650e2d17b` |

Backfill only exact matching live rows after comparing both sides. Organization
deletion still needs an external-resource cleanup/reconciliation mechanism before
this opt-in provider lifecycle is considered fully automated; database deletion
revokes public access, but must not silently abandon paid hostname resources.

### Snapshot limitations

The optional private `STATUS_SNAPSHOTS` R2 binding holds last-known-good public HTML by exact hostname and path. Successful eligible public GETs refresh it; query-string, authenticated, cookie-bearing, health, API, and subscription/confirmation/unsubscribe requests are excluded. Snapshot fallback is only for renderer exceptions or 5xx responses, never an authoritative 404, 410, or redirect. The default maximum age is five minutes, with a hard one-hour cap if explicitly configured.

Stale responses show a timestamped warning and `X-Outray-Status-Snapshot: stale` / `X-Outray-Status-Snapshot-At` headers, with `Cache-Control: no-store`. This is read-only last-known information, not fresh probe evidence or a database replacement. It cannot record new checks, write incident updates, confirm subscriptions, or send notifications while the required backing services are unavailable. Do not describe cached green states as an availability guarantee, and do not invent successful checks for missing observations.

An authoritative missing/unpublished/redirected page evicts the matching snapshot when observed. During a database outage, a previously published page may remain eligible until its bounded expiry; do not promise immediate unpublishing or domain revocation from an unreachable database. Any administrative invalidation must enumerate every affected public hostname/path, including custom hostnames and incident URLs. The bucket must not be publicly readable.

Subscription and other database-backed writes must fail safely rather than pretending that a snapshot accepted them. The Uptime probe and notification worker remain separate services; moving this renderer does not move or make those workers highly available.

## Cutover and rollback

Keep the existing VPS renderer and its Node artifact available while preparing the Worker. Validate Worker configuration, public/custom hostname routing, page visibility, subscriptions, and the deployment health check before deliberately selecting the Worker deployment path. Never stop the live PM2 process merely to prepare or validate a Worker build.

Rollback requires both code and traffic routing: restore the known-good Node service configuration and route the hosted/custom status hostnames back to their previous origin. A Node rebuild or PM2 restart alone does not reverse Cloudflare routes, DNS, custom-hostname configuration, or certificate changes. Keep compatible database migrations in place; do not roll back the database automatically as part of a renderer rollback.

Initial hosted routing is exact, not `*/*`: `status.outray.app`, its three published
page hosts above, and the Byteship custom host. `*.outray.app` and `edge.outray.app`
still point to the tunnel VPS. The previous `status.outray.app` origin was the
DNS-only VPS wildcard (`209.74.86.123`). A rollback must restore that origin,
remove only the exact Status Worker routes/overrides, and first deploy the repaired
Node artifact (the pre-cutover VPS artifact had mismatched Motion dependencies).
Do not stop the tunnel edge, remove its wildcard DNS, or delete unrelated routes.
