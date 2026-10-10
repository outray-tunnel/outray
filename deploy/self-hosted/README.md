# Self-hosting OutRay

This package runs all four products—Tunnels, Observability, Secrets, and Uptime—on your own host. It is separate from OutRay's hosted VPS, Woodpecker pipeline, databases, and credentials. There are no paid plans: quotas are configured by the installation owner and applied per organization.

The deployment includes web/API, tunnel edge, domain authorization, telemetry ingestion, cron, public status pages, and anonymous Secrets Share. PostgreSQL 16, Redis 7, and Caddy run alongside them with persistent volumes. The Uptime worker is opt-in after its outbound network policy has been verified.

This is not an offline distribution. Analytics still use your own Tinybird workspace; sign-in uses your GitHub/Google OAuth apps. Icons build with the public MIT-licensed Hugeicons pack without a license. Email uses your own ZeptoMail configuration. The optional console agent uses your own xAI key.

Public-launch gate: the current checkout's production Seroval dependency needs a security update before exposing this stack. See the [verification/security record](VERIFICATION.md#public-launch-security-blocker). The private infrastructure rehearsal does not clear that gate.

## 1. Prepare an independent installation

Use a fresh checkout on a different host from the hosted OutRay edge for an internal Ops instance. Install Node.js 22+, Docker Engine with BuildKit, and the Docker Compose plugin. Reserve a public domain and enough disk/memory for your expected telemetry, Redis backlog, PostgreSQL data, and application builds. This package has not been load-tested to establish hardware sizing guarantees.

From the repository root:

```bash
npm run self-host:init -- --domain ops.example.com --email owner@example.com
```

Initialization needs only Node, not installed npm dependencies. It writes a gitignored `.env.self-hosted` with mode `0600`, independent random credentials, and a fresh Secrets master key. It never reads `.env` or `.env.prod`, never starts services, and refuses to overwrite an existing configuration.

Edit that file privately. Do not reuse hosted production tokens, OAuth apps, signing keys, or database URLs. Back up the file and master keys securely outside the host before storing real secrets. Quote values containing `#`, whitespace, or other dotenv syntax.

You can supply `-- --file /absolute/path/private.env` to each `self-host:*` setup command. Use a separate machine/Docker context for a second installation: the helper deliberately uses the stable Compose project name `outray-self-hosted`.

### Required external configuration

- `HUGEICONS_LICENSE_KEY`: optional, only for operators with their own Pro license. Leave blank for a license-free build. If supplied, `self-host:up` adds the licensed build overlay and Docker receives it through a BuildKit secret mount, never a build argument or runtime environment. This follows [Docker's build-secret guidance](https://docs.docker.com/build/building/secrets/).
- At least one complete GitHub or Google OAuth app: `*_CLIENT_ID` and `*_CLIENT_SECRET`.
- `OUTRAY_SIGNUP_ALLOWED_EMAILS`: comma-separated exact verified addresses. Initialization allows only the supplied owner email.
- `OUTRAY_SIGNUP_ALLOWED_DOMAINS`: optional exact email domains; this does not implicitly allow subdomains. A domain-only list is supported, but broader than individual addresses. Both lists empty means new users are rejected.
- `TINYBIRD_API_HOST`, `TINYBIRD_INGEST_TOKEN`, and `TINYBIRD_QUERY_TOKEN` from the installation's separate workspace.

Register these sign-in callbacks for the console hostname:

```text
https://ops.example.com/api/auth/callback/github
https://ops.example.com/api/auth/callback/google
```

OAuth must supply a verified email matching the allowlist. The allowlist gates new account creation; removing an address is not session revocation for an existing user. Remove their access and revoke their sessions separately when offboarding.

For invitations or email alerts, add `ZEPTO_API_KEY`, a verified `ZEPTO_FROM_EMAIL`, and optionally `ZEPTO_FROM_NAME`. Self-hosted deliveries do not fall back to an OutRay-owned sender. Welcome/marketing subscriptions are disabled. Without email configuration, configure users through the allowlist and do not rely on invitations or subscriber delivery.

### Deploy the Tinybird project separately

Authenticate a dedicated Tinybird CLI profile/checkout to the new workspace, confirm its selected workspace, then validate and deploy the committed project under `tinybird/` from the repository root:

```bash
tb --cloud deploy --check --no-auto
tb --cloud deploy --no-auto
```

These commands are operator actions against that new workspace, not part of `self-host:up`. Do not use a checkout/profile authenticated to hosted production. Keep the workspace deployment/admin token out of application runtimes.

The project declares `OUTRAY_INGEST_TOKEN` and `OUTRAY_QUERY_TOKEN`. Retrieve their values privately from that workspace's token UI after deployment. Tinybird creates resource-scoped tokens from deployed definitions. See [Tinybird token management](https://guides.tinybird.co/docs/forward/dev-reference/commands/tb-token).

- The ingest token needs APPEND on `otel_spans`, `otel_logs`, `otel_metrics`, `tunnel_events`, `tunnel_request_captures`, `tunnel_protocol_events`, and `tunnel_active_snapshots` only.
- The query token needs READ on the project's dashboard/alert endpoints. Web receives only the query token; edge and ingestion receive only the append token. Cron needs both.

Telemetry retention follows configured policy and the deployed datasource TTLs, capped at 90 days. Database/Redis backups need their own retention policy; a telemetry TTL does not remove old backups.

## 2. Configure DNS and inbound access

The initializer derives these addresses from `ops.example.com`. Point their A records at the new host; add AAAA only if IPv6 is actually served.

| Address | Purpose |
| --- | --- |
| `ops.example.com` | Console, sign-in, CLI authentication, API |
| `edge.ops.example.com` | CLI WebSocket control connection |
| `tunnels.ops.example.com` and `*.tunnels.ops.example.com` | Tunnel addresses and raw TCP/UDP hostname |
| `ingest.ops.example.com` | Observability SDK endpoint |
| `status.ops.example.com` and `*.status.ops.example.com` | Public status pages |
| `share.ops.example.com` | Anonymous encrypted secret links |

Use DNS-only records for this baseline. If you add another proxy/CDN, explicitly redesign certificate validation and trusted client-IP handling; do not blindly trust arbitrary forwarded headers.

Allow inbound TCP 80/443, and UDP 443 if using HTTP/3. By default, raw tunnel ports expose TCP 20000–20009 and UDP 30000–30009. Change allocation bounds and firewall exposure together. PostgreSQL, Redis, renderer, internal-check, and application ports have no host port mappings.

Caddy obtains individual certificates for approved tunnel/status addresses and verified custom domains. Its private authorization endpoint prevents arbitrary certificate requests. There is no wildcard certificate or DNS API credential requirement in this baseline; DNS wildcards route traffic, while certificates remain per hostname. See [Caddy's On-Demand TLS documentation](https://caddyserver.com/docs/automatic-https#on-demand-tls).

Keep `OUTRAY_DOCKER_SUBNET` separate from existing networks. `OUTRAY_CADDY_PRIVATE_IP` must be a usable fixed address inside it; the edge trusts only that proxy address for status client-IP forwarding.

Persist Caddy's certificate volumes. Repeated certificate issuance or many new tunnel hostnames can reach the certificate authority's limits; high-volume installations should evaluate DNS-provider-backed wildcard certificates separately.

For custom domains, use the TXT challenge supplied in the console and its configured CNAME target: tunnel domains point to the edge hostname; status domains point to the canonical status hostname. Public status domains also need the tenant's published status-page binding. Internal infrastructure and the status/tunnel namespaces cannot be claimed as customer status domains.

## 3. Validate, build, and start

```bash
npm run self-host:check
npm run self-host:up
```

### Icon licensing

The default build needs no Hugeicons registry credentials. `@hugeicons/core-free-icons`
is [MIT-licensed](https://github.com/hugeicons/hugeicons/blob/main/README.md), with
Stroke Rounded alternatives for the app's solid and stroke icons. Its package
retains the MIT notice; no Pro SVG source is copied into this repository.

For local npm builds, `OUTRAY_ICON_MODE=auto` uses the original Pro styles only
when your build key is present and both optional Pro packs are available. A
missing key or unavailable Pro pack falls back to the free pack.
`OUTRAY_ICON_MODE=free` always selects free icons; `OUTRAY_ICON_MODE=pro`
explicitly requires your licensed packs (and a key to install them).
Changes require rebuilding the image. Plain `npm ci` and web builds work without
a key; do not use `--omit=optional`, because native build tools are optional too.

The normal Compose file has no icon secret. `npm run self-host:up` selects
`compose.pro-icons.yaml` only when a non-placeholder key is supplied and free
mode is not forced. The base Docker/Compose build is deterministically `free`;
the overlay explicitly sets `pro` and requires the packs to install. This
separates BuildKit cache keys without relying on secret contents or presence.
For manual licensed Compose builds, append
`-f deploy/self-hosted/compose.pro-icons.yaml` after the base Compose file and
export your key in the build environment. Licensed images contain Pro packages:
do not publish or redistribute them as open-source distributions, templates, or
kits. Public images must be built without the Pro overlay or credentials and in
free mode. See [Hugeicons' Free/Pro terms](https://github.com/hugeicons/hugeicons/blob/main/README.md).
For bare `docker build` with licensed icons, supply both
`--build-arg OUTRAY_ICON_MODE=pro` and
`--secret id=hugeicons_license_key,env=HUGEICONS_LICENSE_KEY`; never put the key in
a build argument. Docker rejects `auto` to keep free/Pro cache identity explicit.

The check validates only local configuration; it does not authenticate to OAuth/Tinybird or test DNS/firewalls. It prints variable names and fixed messages, not credential values. `up` repeats preflight, builds the shared image, and starts Compose with that private env file.

### Small-host rehearsal

For an empty, disposable 1-vCPU/2-GB host, these optional settings in the private installation file are a starting point for a smoke test, not a benchmarked capacity recommendation:

```dotenv
DASHBOARD_DB_POOL_MAX=10
REDIS_MAX_MEMORY=128mb
```

Build the image separately from the running services; avoid installing a second copy of npm dependencies on the host. The Docker build already runs workspace builds one at a time. On the initial 2-GB trial, a 1,536-MiB V8 ceiling exhausted the heap; a 3,072-MiB retry with 4 GiB swap caused heavy swap thrashing during final dashboard packaging and was cancelled. Prefer an off-host build for this class of machine. The [explicit free prebuilt trial](PREBUILT.md) validates source/origin hashes and rejects native host dependencies before installing Linux dependencies. Build memory and runtime memory are different requirements.

For a private infrastructure-only smoke test before OAuth/Tinybird are ready, use the [explicit rehearsal runner](REHEARSAL.md). It never publishes ports or bypasses the normal deployment preflight. Leave the Uptime worker disabled until its separate egress policy is verified. Watch available memory, swap, disk, Redis backlog and container restarts throughout the rehearsal.

The build setting accepts a positive decimal integer in MiB and caps V8 old-space only, not total build memory. Leave it empty to preserve Node's default; a heap-exhaustion failure may require more build memory. It is not passed to application runtimes. The dashboard pool defaults to 50 connections and has a minimum of 10; other services have their own pools. Redis defaults to 512 MB and retains `noeviction`, so a reduced ceiling can reject queued ingestion rather than discard it. These controls are not container memory limits, and a successful empty-host startup does not establish production sizing.

At startup, a one-shot job applies committed Drizzle migrations, then creates/configures `outray_share_app`. It never runs migration generation or schema push. Application readers wait for migration success.

Secrets Share connects to the same installation PostgreSQL database through its restricted role: CRUD on ciphertext links/rate limits, and SELECT on Share ownership. It never receives the owner URL or vault master key. Bootstrap fails closed on role membership/ownership, excessive table or column privileges, elevated functions, sequence access, or default grants that would expand access. This includes effective PUBLIC grants; see [PostgreSQL privileges](https://www.postgresql.org/docs/16/ddl-priv.html).

The browser encrypts Share content and keeps the decryption key in the URL fragment. Use an HTTPS viewing link; the complete key-bearing link remains visible only at creation.

Inspect the deployment without dumping its resolved environment:

```bash
docker compose --project-name outray-self-hosted --env-file .env.self-hosted -f deploy/self-hosted/compose.yaml ps
docker compose --project-name outray-self-hosted --env-file .env.self-hosted -f deploy/self-hosted/compose.yaml logs --tail=100 migrate web tunnel ingest cron
curl --fail https://ops.example.com/api/health
```

Treat service logs as sensitive. Avoid sharing `docker compose config` output: it contains interpolated credentials. Worker checks report process liveness, not successful job execution. Web's `/api/health?deep=true` checks PostgreSQL/Redis; telemetry ingestion and notification delivery still need their own acceptance checks.

Sign in using an allowed verified account, create an organization, and use the console's installation-scoped setup snippets.

## 4. Connect clients to this instance

Always set the console and edge URL together for CLI commands:

```bash
OUTRAY_WEB_URL=https://ops.example.com OUTRAY_SERVER_URL=wss://edge.ops.example.com outray login
OUTRAY_WEB_URL=https://ops.example.com OUTRAY_SERVER_URL=wss://edge.ops.example.com outray 3000
```

Custom console origins have isolated CLI credential files, so switching instances does not reuse hosted tokens or log out another installation. The hosted `.dev`/`.co` config remains compatible. This change has not been published to npm by this work; use a CLI built from this checkout until released (`npm run build --workspace=outray`, then `node apps/cli/dist/index.js` in place of `outray`).

Observability integrations must pass `endpoint: "https://ingest.ops.example.com"` and a token created in this installation. Use the console's generated framework example for the correct SDK configuration. Secret automation likewise needs installation-issued machine credentials and the custom `OUTRAY_WEB_URL`; do not send hosted tokens to this instance.

Public browser origins are build-time settings. If you change hostnames, update DNS/OAuth callbacks and `.env.self-hosted`, then rebuild through `self-host:up`. Runtime policy/limits live in the same file.

## 5. Enable Uptime safely

All Uptime routes and status publishing are included, but the probe/delivery worker starts only when enabled. The default configuration has both features disabled.

Before enabling checks, establish and test a worker-specific outbound policy that blocks loopback, private/VPC networks, link-local/metadata services, and other special-use destinations. Keep required database, DNS, and provider access separate from arbitrary monitored targets. Application URL/DNS validation and pinned lookup remain enabled; they are not a replacement for network isolation. Do not run public probes next to unprotected internal control-plane endpoints.

Only after verifying that policy, set:

```dotenv
UPTIME_PROBES_ENABLED=true
UPTIME_EGRESS_POLICY_READY=true
```

For email delivery, configure the Zepto sender first, then set `UPTIME_NOTIFICATIONS_ENABLED=true`. Rerun `self-host:check` and `self-host:up`; the helper selects the `uptime-worker` profile. A readiness flag does not install or verify a firewall. Do not simply set it to bypass startup protection.

Existing Slack/Discord flows can use your own provider apps. Configure the callback URLs on this console:

```text
https://ops.example.com/api/uptime/integrations/slack/callback
https://ops.example.com/api/uptime/integrations/discord/callback
https://ops.example.com/api/observability/alerts/integrations/slack/callback
https://ops.example.com/api/observability/alerts/integrations/discord/callback
```

Before relying on the deployment, test a real public monitor's failure/recovery, acknowledgement/publication, subscriber confirmation/delivery, and a rejected private-network target. Keep public monitor state distinct from published incidents.

## Internal OutRay Ops

Give the Ops installation its own host, OAuth apps, PostgreSQL/Redis volumes, Tinybird workspace, encryption/signing keys, and email credentials. Monitor hosted OutRay's public console, ingestion, edge, and status endpoints from there. Instrument hosted services to send telemetry to the Ops ingest hostname when deliberately configured to do so.

This isolates Ops from routine hosted edge/database deployments; it does not eliminate common DNS, OAuth, cloud-provider, or Tinybird outages. The bundled public status renderer shares the Ops host. For a public OutRay status page that must survive failure of that Ops host too, place its serving/monitoring path in a separate failure domain rather than claiming this single-host Compose deployment is highly available.

## Upgrades, backups, and limits

- Back up PostgreSQL, persistent Redis data, `.env.self-hosted`/master keys, and Caddy certificate state. Test restoration before using real vault values. Losing the last master-key copy makes wrapped vault keys unrecoverable.
- Review committed migrations before upgrading; back up first, then run `self-host:up`. For an explicit migration retry after a failed job, use `docker compose --project-name outray-self-hosted --env-file .env.self-hosted -f deploy/self-hosted/compose.yaml run --rm migrate`. This modifies only the installation DB selected by that env file.
- Do not use `down --volumes` during upgrades. It deletes persistent data; ordinary container replacement retains named volumes.
- Keep old encryption keys in `OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS` during a documented key rotation. Do not rerun initialization to rotate an existing database's credentials.
- Redis uses AOF and `noeviction`; monitor disk/memory pressure and queue/dead-letter health. Capacity exhaustion must not silently discard ingestion queues.
- Defaults allow 1,000 active tunnels, domains, subdomains, members, monitors, and observability alerts per organization, with 1 TiB monthly bandwidth and 30-day analytics retention. These are operator limits, not capacity or throughput guarantees. Configure the corresponding `OUTRAY_*` values for your host.
- Applications run as non-root with read-only filesystems and dropped capabilities. Container environment variables remain visible to a Docker administrator: secure host access and the private env file. This is not a secrets-manager replacement.

## Verification status

Policy, routing, CLI isolation, public setup endpoints, email configuration, and packaging/initializer tests pass; focused service builds/checks also pass. The packaging suite adapts the real Caddy configuration without starting it. Share-role tests use mocked database clients and cover transaction rollback/security checks.

The development machine does not have a working Docker Compose plugin/daemon. An independent Ubuntu host has been provisioned for a private rehearsal; its exact image, migration/bootstrap and runtime results are recorded separately. No hosted production database, DNS or deployment was changed. Existing unrelated dashboard type-check and test failures are separate from the focused self-host checks.

See [the verification record](VERIFICATION.md) for exact results and the remaining acceptance checklist.

Run source tests after installing development dependencies (no icon license is required):

```bash
npm run self-host:test
npm run test --workspace=outray
npm run test --workspace=outray-internal-check
npm run test --workspace=outray-tunnel
npm run test --workspace=outray-ingest
npm run test --workspace=outray-uptime-probe
npm run test --workspace=outray-status
```
