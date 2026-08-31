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

Before touching production, the workflow also migrates an isolated PostgreSQL
service and runs the complete Secrets lifecycle, authorization, concurrency,
and encryption integration suite against it. Those tests use an ephemeral
CI-only master key and never connect to the production database.

The web application is currently deployed by Vercel outside this workflow.
GitHub Actions therefore cannot strictly order the migration ahead of an
automatic Vercel production deployment. Configure Vercel production promotion
to wait for the `Deploy` check, or promote web manually after that check passes,
whenever a release depends on a new schema.

## Secrets rollout and key custody

Configure these server-only variables in the web runtime before enabling the
Secrets routes:

- `OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID`: stable identifier for the active key.
- `OUTRAY_SECRETS_ACTIVE_MASTER_KEY`: base64-encoded 32-byte master key.
- `OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS`: JSON object of prior key IDs to
  base64-encoded keys during a rotation; use `{}` initially.

Store an offline backup of every active master key outside the database. The
database contains only wrapped organization data keys and cannot recover them
after the last copy of a master key is lost. Production should configure these
variables only on Vercel/web; the browser bundle never receives them.

Durable API-token migration is intentionally staged. Release one applies the
additive machine-token migration, deploys the hashed writer and hashed-first
validator, and keeps the legacy fallback. The workflow's first idempotent
backfill is only an initial pass because Vercel promotion is separate. After
the new web and tunnel builds are both live, run `npm run tokens:backfill`
again; its locked reconciliation must report `missing=0`, and a subsequent run
should report `created=0`. A late legacy credential is also migrated on its
first fallback use, which is logged as `legacy_auth_token_fallback`. After the
final reconciliation and production logs show zero fallback use, release two
may remove the fallback and plaintext `auth_tokens` table. Never remove that
compatibility table in release one.

Master-key rotation does not rewrite secret ciphertext. Add the new active key,
keep the previous key in `OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS`, run
`npm run secrets:rewrap`, then run `npm run secrets:rewrap:verify`. Remove the
previous key only after verification reports zero old key references. Both
commands accept `-- --organization=<organization-id>` to limit an operation.
