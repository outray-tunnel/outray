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
`next` install dependencies, build the edge, status renderer, and uptime probe,
deploy Tinybird endpoints, then copy built artifacts and run `deploy.sh`.
Woodpecker serializes these workflows across both branches. Both branches use
the **same production Tinybird workspace and edge VPS**, so the latest successful deploy
from either branch becomes live. The GitHub Actions deploy is a manual fallback,
not a second automatic deploy path.
The web app is not built or deployed by this workflow. Brimble handles database
migrations separately; Woodpecker does not run PostgreSQL or Timescale migrations.

Required repository secrets, with pull-request exposure disabled:

| Secret | Events | Purpose |
| --- | --- | --- |
| `hugeicons_license_key` | Push, Manual | Install private icon packages. |
| `tinybird_host` | Push, Manual | Deploy alert evaluator pipes. |
| `tinybird_token` | Push, Manual | Tinybird deployment token, not the query token. |
| `edge_ssh_key` | Push, Manual | SSH from CI to the edge VPS. |
| `unbe_token` | Push, Manual | Project-scoped, read-only access to OutRay Production secrets in Unbe. |

The edge deployment key is already generated in
`/opt/woodpecker/secrets/edge-deploy` on the CI VPS. Its public key is restricted
to the CI server's IP in the edge VPS's `/root/.ssh/authorized_keys`. The deploy
script pins the edge's ED25519 SSH host key. The edge, status renderer, and
uptime probe credentials used by this workflow live in Unbe's `OutRay / OutRay /
Production` environment. Woodpecker holds only a project-scoped, read-only
Unbe token. The deploy script streams it to the edge over SSH standard input;
it is never passed as a command argument or written to disk by the CI job.
`run-edge-deploy.mjs` retrieves the required credentials directly on the edge,
combines them with the currently online tunnel PM2 process settings, and
passes them to `deploy.sh` without printing or transferring application secret
values to Woodpecker. A separate read-only token remains in the edge's
root-owned `/etc/outray/unbe-token` (mode `0600`) for manual fallback deploys.
If Unbe or the token is unavailable, the pre-deploy check fails and the
running services stay up. Rotate CI and edge tokens independently. The helper
deliberately sets `DEPLOY_CRON=false`; cron runs on Aeroplane.

The CI VPS has 4 GB of swap to supplement its 2 GB RAM. A systemd timer backs up
the Woodpecker SQLite database locally each day and keeps 14 days of copies at
`/opt/woodpecker/backups`. These are not offsite backups; include that directory
and `/opt/woodpecker/secrets` in encrypted VPS backups.

The workflow and this deploy helper must be committed to both branches before
either branch can trigger Woodpecker. The first pushed run should be watched
through Tinybird and the edge health checks before relying on it
for unattended deployments.
