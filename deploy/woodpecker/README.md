# OutRay Woodpecker

This installation runs on `159.198.39.191` behind the existing Cloudflare proxy at
`https://ci.outray.dev`. Caddy terminates TLS on the origin and proxies only to the
Woodpecker server's loopback port. The Docker agent is limited to one workflow at a
time. Server data, agent data, and root-only secret files live in `/opt/woodpecker`.

`compose.yaml` and `Caddyfile` are the checked-in configuration templates. Keep
`secrets/` and `data/` out of Git. On the VPS, use `cd /opt/woodpecker && docker
compose ps` to inspect services, and `docker compose logs --tail=100 server agent`
for diagnostics. The health endpoint is `https://ci.outray.dev/healthz` (HTTP 204).

The repository workflow is `.woodpecker/ci.yaml`. Pushes to `main` run build and
tests. A manual run on `main` also deploys Tinybird endpoints, applies production
PostgreSQL migrations, then copies built edge artifacts and runs `deploy.sh`. The
manual deploy path intentionally remains separate from the existing GitHub Actions
automatic deploy until a full Woodpecker run succeeds. Do not enable both automatic
deploy paths at once.

Required repository secrets, with pull-request exposure disabled:

| Secret | Events | Purpose |
| --- | --- | --- |
| `hugeicons_license_key` | Push, Manual | Install private icon packages. |
| `tinybird_host` | Manual | Deploy alert evaluator pipes. |
| `tinybird_token` | Manual | Tinybird deployment token, not the query token. |
| `database_url` | Manual | Apply production PostgreSQL migrations. |
| `edge_ssh_key` | Manual | SSH from CI to the edge VPS. |

The edge deployment key is already generated in
`/opt/woodpecker/secrets/edge-deploy` on the CI VPS. Its public key is restricted
to the CI server's IP in the edge VPS's `/root/.ssh/authorized_keys`. The deploy
script pins the edge's ED25519 SSH host key. Runtime secrets stay on the edge:
`run-edge-deploy.mjs` reads an allowlist from the currently online tunnel PM2
process and passes it to `deploy.sh` without printing or transferring values to
Woodpecker. It deliberately sets `DEPLOY_CRON=false`; cron runs on Aeroplane.

The CI VPS has 4 GB of swap to supplement its 2 GB RAM. A systemd timer backs up
the Woodpecker SQLite database locally each day and keeps 14 days of copies at
`/opt/woodpecker/backups`. These are not offsite backups; include that directory
and `/opt/woodpecker/secrets` in encrypted VPS backups.

Before switching automatic deployment to Woodpecker:

1. Add all five repository secrets and validate the production database and
   Tinybird credentials.
2. Merge the workflow to `main` and verify the automatic build/test run.
3. Trigger one manual `main` pipeline and verify the live edge services.
4. Only then change the deploy steps to run on `push` to `main` and disable the
   GitHub Actions deploy workflow.
