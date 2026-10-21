# OutRay Woodpecker

This installation runs on `159.198.39.191` behind the existing Cloudflare proxy at
`https://ci.outray.dev`. Caddy terminates TLS on the origin and proxies only to the
Woodpecker server's loopback port. The Docker agent is limited to one workflow at a
time. Server data, agent data, and root-only secret files live in `/opt/woodpecker`.

`compose.yaml` and `Caddyfile` are the checked-in configuration templates. Keep
`secrets/` and `data/` out of Git. On the VPS, use `cd /opt/woodpecker && docker
compose ps` to inspect services, and `docker compose logs --tail=100 server agent`
for diagnostics. The health endpoint is `https://ci.outray.dev/healthz` (HTTP 204).

The repository workflow is `.woodpecker/ci.yaml`. Pushes to either `main` or
`next` install dependencies, apply checked-in PostgreSQL migrations, build the edge,
Node status renderer, and uptime probe, deploy Tinybird endpoints, then deploy
Edge and the uptime probe as separate, health-gated steps. The probe is deployed
last. Hosted Status builds and deploys directly through Cloudflare Workers Builds;
Woodpecker does not deploy or restart it. The Node Status build remains a compile
check and is available to ordinary VPS/self-hosted deployments and manual rollback.
These are serial steps in one workflow, not independently triggered workflows.
The edge VPS must run Node.js 22.19.0 or later, matching the build toolchain.
Both deployment paths generate production-only runtime manifests before copying
artifacts. Build adapters, dev dependencies, workspace links and lifecycle scripts
are not sent to the VPS; `--omit=dev` alone still resolves development dependencies.
Woodpecker serializes these workflows across both branches. Both branches use
the **same production Tinybird workspace and edge VPS**, so the latest successful deploy
from either branch becomes live. The GitHub Actions deploy is a manual fallback,
not a second automatic deploy path.
The web app is not built or deployed by this workflow. Woodpecker applies the
checked-in PostgreSQL migrations before deploying the edge services. Brimble's
web build must therefore compile the web app without running `drizzle-kit migrate`.

Required repository secrets, with pull-request exposure disabled:

| Secret | Events | Purpose |
| --- | --- | --- |
| `hugeicons_license_key` | Push, Manual | Install private icon packages. |
| `tinybird_host` | Push, Manual | Deploy alert evaluator pipes. |
| `tinybird_token` | Push, Manual | Tinybird deployment token, not the query token. |
| `edge_ssh_key` | Push, Manual | SSH from CI to the edge VPS. |
| `ops_secrets_token` | Push, Manual | Production-environment-scoped Secrets Read token for the self-hosted Ops instance. |
| `database_url` | Push, Manual | Production PostgreSQL URL used only by the migration step. |

The hosted Status Worker is connected to `outray-tunnel/outray`, production
branch `next`, in Cloudflare. Its publish script waits for the exact commit's
`ci/woodpecker/push/ci` status to succeed before deploying, so database migrations
and Tinybird resources cannot be overtaken by a parallel Cloudflare build.
Other GitHub checks are not used as this release gate. Failed, timed-out, or
superseded commits are not deployed. No database URL or SSH key is supplied to
Cloudflare Builds. See [Status deployment settings](../../apps/status/README.md#direct-github-deployment-cloudflare-workers-builds).
The previously configured `cloudflare_api_token` secret is not used by this
Woodpecker workflow; it may remain available for an explicit manual fallback.

The edge deployment key is already generated in
`/opt/woodpecker/secrets/edge-deploy` on the CI VPS. Its public key is restricted
to the CI server's IP in the edge VPS's `/root/.ssh/authorized_keys`. The deploy
script pins the edge's ED25519 SSH host key. The edge, status renderer, and
uptime probe credentials used by this workflow live in Ops's `outray / outray /
production` vault environment. Woodpecker holds only an environment-scoped,
read-only OutRay token. Each deploy step streams it to the edge over SSH standard input;
it is never passed as a command argument or written to disk by the CI job.
`run-service-deploy.mjs` retrieves the required credentials directly on the edge,
combines them with the currently online tunnel PM2 process settings, and
passes them to the selected service script without printing or transferring
application secret values to Woodpecker. A separate read-only token remains in the edge's
root-owned `/etc/outray/ops-secrets-token` (mode `0600`) for manual fallback deploys.
Status retains its own deployed `DATABASE_SSL_REJECT_UNAUTHORIZED` setting rather
than inheriting the tunnel's policy. An explicit `true` or `false` value in Ops
Secrets overrides it. Private-CA databases need their provider CA configured for
verified TLS; deployments must not silently change an existing service's policy.
The VPS's Brimble CA is installed at `/etc/ssl/outray/brimble-ca.pem` (root-owned,
mode `0644`). The helper passes that file through `NODE_EXTRA_CA_CERTS` when no
extra CA is already configured; Status also retains its own deployed CA path.
This augments Node's normal public roots without disabling certificate or
hostname verification. The probe uses a persistent systemd drop-in pointing to
the same CA. Installing or changing the CA requires restarting the affected
Node service; do not restart active tunnel processes merely to refresh trust.
The four Uptime feature flags (`UPTIME_ENABLED`, `UPTIME_PROBES_ENABLED`,
`UPTIME_NOTIFICATIONS_ENABLED`, and `UPTIME_EGRESS_POLICY_READY`) may also be
set in Ops Secrets. Add all four as exact `true` or `false` strings; a complete set
overrides the active tunnel's settings on every service deploy. If none are
present, the existing tunnel settings remain in use. A partial or invalid set
fails the pre-deploy check. Do not set `UPTIME_EGRESS_POLICY_READY=true`
until the probe worker's network egress policy has been verified on the VPS.
If Ops Secrets or the token is unavailable, the pre-deploy check fails and the
running services stay up. Rotate CI and edge tokens independently. The helper
deliberately sets `DEPLOY_CRON=false`; cron runs on Aeroplane.

All three service deploys pin `OUTRAY_DASHBOARD_URL=https://outray.dev` and
`WEB_API_URL=https://outray.dev/api`. These override stale origins inherited
from PM2 or the deploy shell without changing credentials or feature flags.
`outray.co` is not the public dashboard yet. When it launches, deliberately
update the helper's `dashboardOrigin` and verify CLI API compatibility before
changing these endpoints; do not infer the public origin from an old process.

Run the helper's isolated deployment-environment tests with
`node --test deploy/woodpecker/run-service-deploy.test.mjs`. They mock PM2,
Ops Secrets, and the deployment scripts; no service is deployed or restarted.

The CI VPS has 4 GB of swap to supplement its 2 GB RAM. A systemd timer backs up
the Woodpecker SQLite database locally each day and keeps 14 days of copies at
`/opt/woodpecker/backups`. These are not offsite backups; include that directory
and `/opt/woodpecker/secrets` in encrypted VPS backups.

The workflow and this deploy helper must be committed to both branches before
either branch can trigger Woodpecker. The first pushed run should be watched
through Tinybird and the edge health checks before relying on it
for unattended deployments.
