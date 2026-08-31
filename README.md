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
- Tiger Data (TimescaleDB)

### Project Structure

```
outray/
├── apps/
│   ├── cli/             # CLI client
│   ├── cron/            # Background jobs
│   ├── internal-check/  # Domain verification for Caddy
│   ├── tunnel/          # Tunnel server
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

Ensure PostgreSQL, Redis, and TimescaleDB are running, then start the web,
tunnel, cron, and internal-check services together:

```bash
npm run dev
```

Use `npm run dev:web`, `npm run dev:tunnel`, `npm run dev:cron`, or
`npm run dev:internal-check` to run a single service and its workspace
dependencies.

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

The CLI uses the existing browser login and stores only the selected project
and environment in `outray/config.toml`:

```bash
outray secrets use --project payments-api --env development
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
