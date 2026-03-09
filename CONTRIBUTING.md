# Contributing to Outray

Thanks for your interest in contributing to Outray! This guide will help you get set up and start shipping features quickly.

## Project Structure

Our monorepo is organized to keep logic decoupled and reusable:

```
outray/
├── apps/
│   ├── cli/             # Main Outray CLI (TypeScript)
│   ├── web/             # Dashboard & API (React + TanStack Start)
│   ├── tunnel/          # High-performance Tunnel Server
│   ├── cron/            # Maintenance snapshots & background tasks
│   └── internal-check/  # Caddy domain verification service
├── packages/
│   ├── core/            # Shared tunnel core logic
│   ├── vite-plugin/     # Outray integration for Vite
│   └── ...plugins/      # Next.js, Express, NestJS plugins
├── shared/              # Global types and utility helpers
└── deploy/              # Infrastructure-as-Code & scripts
```

## Quick Start (Local Setup)

Prepare your environment in three simple steps:

1. **Clone & Install**
   ```bash
   git clone https://github.com/akinloluwami/outray.git
   cd outray
   npm install
   ```

2. **Initialize Environment**
   We provide a helper script to set up all `.env` files across the monorepo:
   ```bash
   npm run setup:envs
   ```

3. **Spin Up Infrastructure**
   Outray requires Redis, Postgres, and TimescaleDB. Use Docker to start them instantly:
   ```bash
   docker compose up -d
   ```

## Development Workflow

Instead of managing multiple terminals, use our root commands:

- **Full Application**: Run `npm run dev` in the root to start the Web Dashboard, Tunnel Server, and CLI in parallel.
- **Specific App**: Run `npm run dev -w apps/web` (or any other app).
- **Database Migrations**: 
  ```bash
  cd apps/web
  npm run db:migrate
  ```

## Code Guidelines

- **TypeScript First**: All new code must be type-safe.
- **Consistency**: Follow the patterns in `packages/core` for any tunnel logic.
- **Linting**: Run `npm run lint` at the root before pushing.

## Pull Requests

1. **Branching**: Use `feat/`, `fix/`, or `docs/` prefixes (e.g., `feat/add-github-oauth`).
2. **Quality**: Ensure your code builds locally with `npm run build`.
3. **Description**: Describe *what* changed and *why*. Attach screenshots if you've touched the Dashboard UI.

---
*Stay sharp and happy coding!*
