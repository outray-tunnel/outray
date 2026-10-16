<a href="https://vercel.com/oss">
  <img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />
</a>

# OutRay

**Expose your localhost to the internet.** Outray is an open-source tunneling solution that lets you share local servers with anyone, anywhere.

## Features

- **HTTP Tunnels** - Expose web servers with custom subdomains
- **TCP Tunnels** - Tunnel any TCP service (databases, game servers, etc.)
- **UDP Tunnels** - Tunnel UDP traffic (DNS, VoIP, TFTP, etc.)
- **Custom Domains** - Bring your own domain with automatic TLS
- **Dashboard** - Monitor traffic, view analytics, manage tunnels
- **Secrets** - Version, audit, and inject encrypted environment secrets
- **Team Support** - Collaborate with organizations and role-based access

## Quick Start

### Install the CLI

```bash
npm install -g outray
```

### Create a tunnel

```bash
# HTTP tunnel
outray http 3000

# TCP tunnel (e.g., for PostgreSQL)
outray tcp 5432

# UDP tunnel
outray udp 53
```

### Requirements

- Node.js 20+
- npm 10+
- PostgreSQL
- Redis
- Tinybird (tunnel analytics and observability)

### Project Structure

```
outray/
├── apps/
│   ├── cli/             # CLI client
│   ├── cron/            # Background jobs
│   ├── ingest/          # Observability ingestion
│   ├── internal-check/  # Domain verification for Caddy
│   ├── secrets-share/   # Standalone encrypted secret sharing
│   ├── status/          # Public status pages
│   ├── tunnel/          # Tunnel server
│   ├── uptime-probe/    # Uptime checks and notifications
│   └── web/             # Dashboard & API
├── packages/            # Core client and framework integrations
├── shared/              # Shared utilities
└── deploy/              # Deployment configs
```

## Development

For an independent installation with all products, restricted OAuth signup,
and instance-owned limits instead of paid plans, see the
[self-hosting guide](deploy/self-hosted/README.md). It includes a separate
Docker Compose stack, configuration initializer, and deployment checks;
it does not use the hosted edge VPS or production credentials.

Create the single local environment file, then install the workspaces. Icons
use the public MIT-licensed Hugeicons pack by default; no icon license is needed:

```bash
cp .env.example .env
set -a
source .env
set +a
npm ci
```

Hugeicons Pro is optional. If you hold your own license, export
`HUGEICONS_LICENSE_KEY` before installing; `auto` mode uses the original Pro
styles when both licensed packs install successfully. `OUTRAY_ICON_MODE=free`
forces public icons even on a licensed checkout, and `OUTRAY_ICON_MODE=pro`
requires the Pro packs. Re-run `npm run icons:prepare` after changing modes.
See the [icon licensing notes](deploy/self-hosted/README.md#icon-licensing).

Ensure PostgreSQL and Redis are running and the Tinybird project is deployed, then start all runtime
apps together:

```bash
npm run dev
```

This includes web, tunnel, cron, internal-check, ingest, status, secrets-share,
and uptime-probe. New runtime workspaces under `apps/` are included automatically.
The CLI compiler watcher and legacy standalone website remain separate;
the landing page runs in web, and `dev:website` is an alias for `dev:web`.

Use `npm run dev:web`, `npm run dev:tunnel`, `npm run dev:cron`,
`npm run dev:internal-check`, `npm run dev:ingest`, `npm run dev:status`,
`npm run dev:secrets-share`, or `npm run dev:uptime-probe` to run a single service
and its workspace dependencies. Status uses port 4323; Secrets Share defaults to
4324. All services load the root `.env`, including `SHARE_DATABASE_URL` for
Secrets Share. The uptime worker honors the existing `UPTIME_PROBES_ENABLED`
and `UPTIME_NOTIFICATIONS_ENABLED` flags; starting it does not enable these
features automatically.

### Account notification emails

Hosted usage and billing notices use the shared OutRay email design and a
PostgreSQL outbox. Deploy migration `0034_product_email_outbox` through the normal
migration pipeline before updating **web and cron**. No manual production
migration is needed when CI already runs migrations.

Give cron the same hosted `DATABASE_URL`, `REDIS_URL`, public console `APP_URL`,
`ZEPTO_API_KEY`, and optional verified `ZEPTO_FROM_EMAIL` / `ZEPTO_FROM_NAME` as web.
The default sender is `OutRay <no-reply@outray.co>`. Usage is checked every five
minutes; queued emails are polled every 15 seconds. Missing provider configuration
leaves messages queued. Delivery retries back off, up to five attempts.

Verified owners and admins receive 80%/100% monthly bandwidth and telemetry
warnings, local payment-failure notices, and subscription lifecycle changes.
Monthly warnings deduplicate per organization, recipient, allowance, metric, and
UTC month threshold, so an upgrade re-arms warnings for the new allowance.
Billing events enqueue in the same transaction as the state change;
membership is checked again at delivery. Provider requests are timed out and
errors are redacted. Delivery is at-least-once: an ambiguous provider acceptance
or crash after sending can still cause a retry to be delivered twice.

Polar's customer emails remain provider-managed by default. Set
`POLAR_OUTRAY_EMAILS=true` on **web** only after disabling the equivalent Polar
subscription confirmation/update/cancellation/past-due/revocation emails. Leave
provider receipts and invoices enabled. This avoids sending the same notice from
both Polar and OutRay. These hosted billing/usage jobs stay disabled in
self-hosted installations; existing invitations and monitoring emails are unchanged.

### Secrets development

Secrets are encrypted with a per-organization data key. Before using the
Secrets dashboard locally, generate the web runtime's 32-byte master key and
set it in the root `.env`:

```bash
openssl rand -base64 32
```

Set the result as `OUTRAY_SECRETS_ACTIVE_MASTER_KEY` and keep
`OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID` stable for that key. Back up production
master keys separately from the database: losing every configured copy makes
the wrapped organization keys unrecoverable.

Slack and Discord alert destinations also use these organization data keys.
Deploy the alert-webhook migration before updating the web and cron services,
and give cron the same `OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID`,
`OUTRAY_SECRETS_ACTIVE_MASTER_KEY`, and
`OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS` as web. Without a valid keyring, cron
leaves provider notifications pending rather than attempting delivery.

For alert notification OAuth, configure `OUTRAY_SLACK_CLIENT_ID` and
`OUTRAY_SLACK_CLIENT_SECRET` for a Slack app with the `incoming-webhook` scope,
and/or `OUTRAY_DISCORD_CLIENT_ID` and `OUTRAY_DISCORD_CLIENT_SECRET` for a
Discord app with the `webhook.incoming` scope. Register these exact redirect
URLs for the deployed `APP_URL`:

`{APP_URL}/api/observability/alerts/integrations/slack/callback`
`{APP_URL}/api/observability/alerts/integrations/discord/callback`

The provider's authorization screen selects the channel. OutRay encrypts the
delivery credential returned by OAuth, never returns it from alert APIs, and
lets an alert manager change the selected channel or remove each destination from the alert's
Notifications page.

The CLI uses the existing browser login and stores only the selected vault
and environment in `outray/config.toml`:

```bash
outray secrets use --vault payments-api --env development
outray secrets list
outray secrets run -- npm run dev
```

For automation, provide a scoped machine credential through `OUTRAY_TOKEN`.
Never commit tokens or exported `.env` files.

## Documentation

Visit [outray.dev/docs](https://outray.dev/docs) for full documentation.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Publishing npm packages

The release script covers the eight public SDK packages and the `outray` CLI;
private application workspaces are never published. Start with a preview:

```bash
npm run packages:publish:dry-run -- --all
# Or select one package; dependencies are included automatically:
npm run packages:publish:dry-run -- @outray/tanstack-start
```

Dry runs build and test the public packages, compare the files inside their
packed artifacts with npm, and show the proposed release. They do not change
package versions, the lockfile, or the registry. For an offline selection check,
use `npm run packages:publish -- --all --plan`.

For a live release, supply `NPMJS_TOKEN` through your shell or CI secret store,
then run `npm run packages:publish -- --all` (or a public package name). Use a
[granular npm token with write permission and Bypass 2FA enabled](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow/),
scoped to the packages you intend to release. The script uses temporary npm
configuration, leaves your existing `.npmrc` untouched, and does not pass this
token to builds or tests. It does not load `.env` automatically; locally you can
use `npx dotenv -e .env -- npm run packages:publish -- --all`.

Changed published packages receive an automatic patch bump. An already-prepared,
unpublished version is reused when newer than the published stable versions.
Shared-package bumps do not automatically bump or publish unchanged public
consumers, even with `--all`; they keep their existing dependency ranges. Only
selected consumers with their own changed artifacts or pending releases have
their shared dependency minima aligned to the versions they are built and tested
against. For a dependency-only feature or fix, explicitly edit that consumer's
dependency range before running the script; manifest changes count as package
changes. Private workspace dependency ranges are updated where needed, without
bumping or publishing those workspaces. The script refreshes the lockfile and
rebuilds, tests, and audits the final artifacts before uploading them dependency-first.
Review breaking API changes first: automatic patch bumps do not determine
semantic compatibility. Different build toolchains can also change generated
files and therefore trigger a release.

Live releases require a clean working tree unless you explicitly pass
`--allow-dirty`. Version and lockfile edits are left for you to review and
commit; the script does not commit, create Git tags, or push. Pre-upload failures
restore its manifest and lockfile edits. After an upload attempt, edits are kept
because npm may already have accepted a package. Rerun with `--all --allow-dirty`
and the same dist-tag to include all prepared releases, compare the prepared
versions against npm and resume; identical published contents are skipped.
Use `--tag next` for a non-default dist-tag; prerelease
versions cannot be published under `latest`.

Run `npm run packages:publish:test` for the release script's tests. This script is
manual/CI-invoked; it does not enable automatic publishing on pushes or change
the existing CLI binary-release workflow.

## License

AGPL-3.0-only
