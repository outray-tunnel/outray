# Production deployment

The `Deploy` GitHub Actions workflow installs the monorepo once, validates and
builds the server workspaces, applies committed primary PostgreSQL migrations,
copies the artifacts to the host, and then runs `deploy.sh`. Build validation
happens before any database mutation. The migration step runs before the cron
process is restarted and uses `drizzle-kit migrate`; it never generates schema
changes in CI.

When a change includes `tinybird/endpoints/alert_*.pipe`, the workflow also
checks and deploys the Tinybird project before applying the database migration
and restarting cron. Tinybird deployments are project-atomic, so the CLI cannot
deploy only those four files; the path check limits when this deployment runs.

## GitHub Actions configuration

The existing server deployment secrets remain required, including
`DATABASE_URL`, `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, and `SSH_PORT`.

Alerts add these secrets:

- `TINYBIRD_QUERY_TOKEN`: runtime token scoped to read the four `alert_*`
  endpoints.
- `ZEPTO_API_KEY`: runtime ZeptoMail API key for firing and recovery emails.
- `TINYBIRD_HOST` and `TINYBIRD_TOKEN`: CI deployment credentials using
  Tinybird's standard CI names. `TINYBIRD_TOKEN` must be able to deploy the
  project and is intentionally distinct from `TINYBIRD_QUERY_TOKEN`. They are
  required whenever an `alert_*.pipe` file changes; the rollout fails closed if
  either is absent.

Alerts also use these repository variables:

- `TINYBIRD_API_HOST` (falls back to the `TINYBIRD_HOST` secret)
- `APP_URL` (defaults to `https://outray.dev`)
- `ALERT_POLL_INTERVAL_MS` (defaults to `15000`)
- `ALERT_BATCH_SIZE` (defaults to `25`)
- `ALERT_EVALUATION_CONCURRENCY` (defaults to `5`)
- `ALERT_LEASE_SECONDS` (defaults to `120`)
- `ALERT_LATE_DATA_SECONDS` (defaults to `60`)
- `ALERT_EVALUATION_RETENTION_DAYS` (defaults to `30`)
- `DATABASE_SSL_REJECT_UNAUTHORIZED` (defaults to `true`; set it to `false`
  only for a development database whose certificate chain is self-signed)

Set `ALERT_LATE_DATA_SECONDS` to the same value in Vercel and the cron runtime.
The web app uses it to identify the current closed telemetry window for manual
evaluations, while cron uses it for scheduled evaluations.

To validate or promote the evaluators manually before rerunning a failed
deployment:

```bash
tb --cloud --host "$TINYBIRD_HOST" --token "$TINYBIRD_TOKEN" deploy --check
tb --cloud --host "$TINYBIRD_HOST" --token "$TINYBIRD_TOKEN" deploy
```

## Database migration contract

Schema changes must be generated and reviewed locally, then committed with the
application change:

```bash
npm run db:migrate
git diff -- apps/web/drizzle apps/web/src/db
```

The production workflow only applies files already committed under
`apps/web/drizzle`. A missing or unreachable `DATABASE_URL`, or a failed
migration, stops the server rollout.

The web application is currently deployed by Vercel outside this workflow.
GitHub Actions therefore cannot strictly order the migration ahead of an
automatic Vercel production deployment. Configure Vercel production promotion
to wait for the `Deploy` check, or promote web manually after that check passes,
whenever a release depends on a new schema.
