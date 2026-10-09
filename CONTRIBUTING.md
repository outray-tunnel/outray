# Contributing to Outray

Thanks for your interest in contributing to Outray! This guide will help you get started.

## Project Structure

```
outray/
├── apps/
│   ├── cli/             # CLI client for creating tunnels
│   ├── cron/            # Background jobs (tunnel snapshots)
│   ├── ingest/          # Observability ingestion
│   ├── internal-check/  # Domain verification for Caddy on-demand TLS
│   ├── secrets-share/   # Standalone encrypted secret sharing
│   ├── status/          # Public status pages
│   ├── tunnel/          # Tunnel server (HTTP, TCP, UDP proxying)
│   ├── uptime-probe/    # Uptime checks and notifications
│   └── web/             # Dashboard & API (React + TanStack Router)
├── packages/            # Core client and framework integrations
├── shared/              # Shared utilities and types
└── deploy/              # Deployment scripts and configs
```

## Prerequisites

- Node.js 20+
- npm
- Redis (for tunnel state)
- PostgreSQL (for user data)
- Tinybird (for tunnel analytics and observability)

## Getting Started

1. **Clone the repository**

   ```bash
   git clone https://github.com/akinloluwami/outray.git
   cd outray
   ```

2. **Set up environment variables**

   Copy the root environment template and fill in the values, including
   `HUGEICONS_LICENSE_KEY` for access to the private Pro icon package:

   ```bash
   cp .env.example .env
   ```

   Generate `OUTRAY_SECRETS_ACTIVE_MASTER_KEY` with
   `openssl rand -base64 32` before exercising the Secrets product. This key
   is consumed by the web runtime and must not be committed.

3. **Install dependencies**

   Export the root environment while npm authenticates with the Hugeicons
   registry:

   ```bash
   set -a
   source .env
   set +a
   npm install
   ```

   CI environments must provide the same key as a
   `HUGEICONS_LICENSE_KEY` secret.

4. **Run database migrations**

   ```bash
   npm run db:migrate
   ```

5. **Set up Tinybird data sources and endpoints**

   Deploy the project to your isolated development branch before starting services:

   ```bash
   tb --branch development deploy
   ```

6. **Start development servers**

   ```bash
   npm run dev
   ```

   This starts web, tunnel, cron, internal-check, ingest, status, secrets-share,
   and uptime-probe. New runtime apps under `apps/` are included automatically;
   the CLI compiler and legacy standalone website are excluded. PostgreSQL,
   Redis must already be running, and Tinybird must be configured. The uptime worker still
   honors its existing probe and notification enable flags in the root `.env`.

## Development

### Web Dashboard (`apps/web`)

- React with TanStack Router
- Drizzle ORM for database
- Better Auth for authentication

### Tunnel Server (`apps/tunnel`)

- Handles HTTP, TCP, and UDP tunneling
- WebSocket-based protocol for client communication
- Redis for tunnel state management

### CLI (`apps/cli`)

- TypeScript CLI for creating tunnels
- Supports HTTP, TCP, and UDP protocols

### Common commands

```bash
npm run dev                 # All runtime services
npm run dev:web             # A single service and its dependencies
npm run build               # Every workspace in dependency order
npm run lint                # Every workspace with a lint task
npm run dev --workspace=outray  # CLI compiler in watch mode
```

Production migration ordering, Tinybird deployment credentials, and alert
runtime variables are documented in [deploy/README.md](deploy/README.md).

## Code Style

- Use TypeScript
- Follow existing code patterns
- Run `npm run lint` before committing

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test your changes locally
5. Commit with a descriptive message
6. Push and open a PR. Add a detailed description of your changes and attach a screenshot if you made UI changes.
