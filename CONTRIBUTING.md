# Contributing to Outray

Thanks for your interest in contributing to Outray! This guide will help you get started.

## Project Structure

```
outray/
├── apps/
│   ├── cli/             # CLI client for creating tunnels
│   ├── cron/            # Background jobs (tunnel snapshots)
│   ├── internal-check/  # Domain verification for Caddy on-demand TLS
│   ├── landing/         # Marketing website (Astro)
│   ├── tunnel/          # Tunnel server (HTTP, TCP, UDP proxying)
│   └── web/             # Dashboard & API (React + TanStack Router)
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

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy `.env.example` to `.env` in each app directory and fill in the values:

   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/tunnel/.env.example apps/tunnel/.env
   cp apps/cron/.env.example apps/cron/.env
   cp apps/internal-check/.env.example apps/internal-check/.env
   ```

4. **Run database migrations**

   ```bash
   cd apps/web
   npx drizzle-kit push
   ```

5. **Set up Tiger Data (TimescaleDB) tables**

   Run the schema file against your TimescaleDB instance:

   ```bash
   psql "$TIMESCALE_URL" -f deploy/setup_tigerdata.sql
   ```

6. **Start development servers**

   ```bash
   # Terminal 1: Web dashboard
   cd apps/web && npm run dev

   # Terminal 2: Tunnel server
   cd apps/tunnel && npm run dev

   # Terminal 3: CLI (for testing)
   cd apps/cli && npm run dev
   ```

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
