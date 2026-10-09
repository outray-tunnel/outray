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
`next` install dependencies, apply checked-in PostgreSQL migrations, build the edge, status renderer, and uptime probe,
deploy Tinybird endpoints, then deploy Status, Edge, and the uptime probe as
separate, health-gated steps. Status is deployed first so the edge has a healthy
upstream; the probe is deployed last. Each step copies only its own artifacts.
These are serial steps in one workflow, not independently triggered workflows.
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
| `unbe_token` | Push, Manual | Project-scoped, read-only access to OutRay Production secrets in Unbe. |
| `database_url` | Push, Manual | Production PostgreSQL URL used only by the migration step. |

The edge deployment key is already generated in
`/opt/woodpecker/secrets/edge-deploy` on the CI VPS. Its public key is restricted
to the CI server's IP in the edge VPS's `/root/.ssh/authorized_keys`. The deploy
script pins the edge's ED25519 SSH host key. The edge, status renderer, and
uptime probe credentials used by this workflow live in Unbe's `OutRay / OutRay /
Production` environment. Woodpecker holds only a project-scoped, read-only
Unbe token. Each deploy step streams it to the edge over SSH standard input;
it is never passed as a command argument or written to disk by the CI job.
`run-service-deploy.mjs` retrieves the required credentials directly on the edge,
combines them with the currently online tunnel PM2 process settings, and
passes them to the selected service script without printing or transferring
application secret values to Woodpecker. A separate read-only token remains in the edge's
root-owned `/etc/outray/unbe-token` (mode `0600`) for manual fallback deploys.
The four Uptime feature flags (`UPTIME_ENABLED`, `UPTIME_PROBES_ENABLED`,
`UPTIME_NOTIFICATIONS_ENABLED`, and `UPTIME_EGRESS_POLICY_READY`) may also be
set in Unbe. Add all four as exact `true` or `false` strings; a complete set
overrides the active tunnel's settings on every service deploy. If none are
present, the existing tunnel settings remain in use. A partial or invalid set
fails the pre-deploy check. Do not set `UPTIME_EGRESS_POLICY_READY=true`
until the probe worker's network egress policy has been verified on the VPS.
If Unbe or the token is unavailable, the pre-deploy check fails and the
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
Unbe, and the deployment scripts; no service is deployed or restarted.

The CI VPS has 4 GB of swap to supplement its 2 GB RAM. A systemd timer backs up
the Woodpecker SQLite database locally each day and keeps 14 days of copies at
`/opt/woodpecker/backups`. These are not offsite backups; include that directory
and `/opt/woodpecker/secrets` in encrypted VPS backups.

The workflow and this deploy helper must be committed to both branches before
either branch can trigger Woodpecker. The first pushed run should be watched
through Tinybird and the edge health checks before relying on it
for unattended deployments.
