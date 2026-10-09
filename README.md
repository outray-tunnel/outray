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

Create the single local environment file, add your Hugeicons Pro license key,
then export it while installing the workspaces:

```bash
cp .env.example .env
set -a
source .env
set +a
npm install
```

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

## License

AGPL-3.0-only
