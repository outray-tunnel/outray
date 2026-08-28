# Contributing to Outray

Thanks for your interest in contributing to Outray! This guide will help you get started.

## Project Structure

```
outray/
├── apps/
│   ├── cli/             # CLI client for creating tunnels
│   ├── cron/            # Background jobs (tunnel snapshots)
│   ├── internal-check/  # Domain verification for Caddy on-demand TLS
│   ├── tunnel/          # Tunnel server (HTTP, TCP, UDP proxying)
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
- Tiger Data / TimescaleDB (for analytics)

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

5. **Set up Tiger Data (TimescaleDB) tables**

   Run the schema file against your TimescaleDB instance:

   ```bash
   psql "$TIMESCALE_URL" -f deploy/setup_tigerdata.sql
   ```

6. **Start development servers**

   ```bash
   npm run dev
   ```

   This starts the web, tunnel, cron, and internal-check services. PostgreSQL,
   Redis, and TimescaleDB must already be running.

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
