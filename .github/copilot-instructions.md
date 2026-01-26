# Outray - AI Coding Instructions

## Project Overview

Outray is an open-source tunneling solution that exposes localhost servers to the internet. It supports HTTP, TCP, and UDP protocols with custom domains, team management, and real-time analytics.

## Architecture

### Monorepo Structure (npm workspaces)
- **apps/tunnel** - Tunnel server handling HTTP/TCP/UDP proxying via WebSocket protocol
- **apps/web** - React + TanStack Router dashboard with Drizzle ORM, Better Auth, and Vite
- **apps/cli** - TypeScript CLI for creating tunnels
- **apps/cron** - Background jobs (tunnel snapshots, stale cleanup)
- **apps/internal-check** - Domain verification service for Caddy on-demand TLS
- **packages/core** - Shared WebSocket client used by CLI and framework plugins
- **packages/vite-plugin** - Vite integration (`@outray/vite`)
- **packages/next-plugin** - Next.js integration (`@outray/next`)
- **shared/** - Shared types, utilities, and protocol definitions

### Data Flow
1. CLI/plugin → WebSocket → `apps/tunnel` (WSHandler validates via `apps/web` API)
2. Tunnel server → Redis (tunnel state, bandwidth tracking)
3. Tunnel server → TimescaleDB (analytics via `tunnel_events` hypertable)
4. Dashboard → PostgreSQL (user/org data via Drizzle) + Redis (real-time status)

## Key Patterns

### WebSocket Protocol
Messages are JSON-encoded in [shared/types.ts](shared/types.ts). Key message types:
- `open_tunnel` - Client requests tunnel with optional subdomain/API key
- `tunnel_opened` - Server confirms with URL and assigned port (TCP/UDP)
- `request`/`response` - HTTP request proxying
- `tcp_data`/`udp_data` - Binary data (base64 encoded)

### TanStack Router (apps/web)
- File-based routing in `src/routes/`
- Dynamic org routes: `$orgSlug/` for authenticated dashboard pages
- API routes: `src/routes/api/` for backend endpoints
- Route tree auto-generated: `routeTree.gen.ts` (don't edit manually)

### Database Schema
- **PostgreSQL** - User/org data, managed by Drizzle in [apps/web/src/db/](apps/web/src/db/)
- **TimescaleDB** - Analytics in hypertables, schema in [deploy/setup_tigerdata.sql](deploy/setup_tigerdata.sql)
- Migrations: `npx drizzle-kit push` (Drizzle), `psql -f deploy/setup_tigerdata.sql` (Tiger Data)

### Authentication
- Better Auth with GitHub/Google OAuth in [apps/web/src/lib/auth.ts](apps/web/src/lib/auth.ts)
- CLI auth flow: browser-based OAuth → poll for token → exchange for org token
- API tokens validated by tunnel server calling web API's `/api/tunnel/auth`

## Development Commands

```bash
# Install all workspaces
npm install

# Run dev servers (separate terminals)
cd apps/web && npm run dev      # Dashboard on :3000
cd apps/tunnel && npm run dev   # Tunnel server on :3547
cd apps/cli && npm run dev      # CLI in watch mode

# Build packages before using in other apps
cd packages/core && npm run build
cd packages/vite-plugin && npm run build
cd packages/next-plugin && npm run build

# Database migrations
cd apps/web && npx drizzle-kit push
psql "$TIGER_DATA_URL" -f deploy/setup_tigerdata.sql
```

## Conventions

### IDs
Use UUIDs for all entity identifiers (tunnels, tokens, users, orgs). Generate with `crypto.randomUUID()` or your database's UUID function.

### Subdomains
Generated via `generateSubdomain()` using adjective-noun format (e.g., `quick-tiger`). Reserved slugs in [shared/reserved-slugs.ts](shared/reserved-slugs.ts).

### Environment Variables
Each app has `.env.example`. Key variables:
- `BASE_DOMAIN` - Tunnel domain (e.g., `outray.dev`)
- `REDIS_URL` - Tunnel state and pub/sub
- `DATABASE_URL` - PostgreSQL for web app
- `TIGER_DATA_URL` - TimescaleDB for analytics
- `INTERNAL_API_SECRET` - Auth between tunnel server and web API

### Error Handling
Tunnel server returns typed error codes to clients (see `ErrorCodes` in [packages/core/src/types.ts](packages/core/src/types.ts)).

## Redis Pub/Sub Patterns

Redis is used for real-time tunnel state and cross-service communication:

**Keys:**
- `tunnel:{subdomain}` - Tunnel reservation with TTL
- `org:{orgId}:online_tunnels` - Set of active tunnel IDs per org
- `tunnel:last_seen:{tunnelId}` - Heartbeat timestamp with TTL
- `bw:{orgId}:YYYY-MM` - Monthly bandwidth counter
- `global:orgs_with_online_tunnels` - Index for fast org lookups

**Channels:**
- `tunnel:control` - Commands like `kill:{tunnelId}` to terminate tunnels remotely

Example: Dashboard stops a tunnel via `redis.publish("tunnel:control", "kill:abc123")`, and TunnelRouter handles it in [apps/tunnel/src/core/TunnelRouter.ts](apps/tunnel/src/core/TunnelRouter.ts).

## Caddy Integration (On-Demand TLS)

The `apps/internal-check` service validates domains for Caddy's on-demand TLS:
- Endpoint: `GET /internal/domain-check?domain=example.com`
- Returns 200 for valid domains (active tunnels or verified custom domains)
- Returns 403/non-200 to deny certificate issuance
- Checks both `*.outray.app` subdomains and custom domains in the `domains` table

## CI/CD Workflows

**deploy.yml** (on push to main):
- Builds tunnel server, internal-check, and cron services
- Deploys via SCP to production server
- Restarts services via SSH

**release.yml** (on version tags `v*`):
- Builds CLI binaries for macOS (ARM64/x64), Linux, and Windows
- Creates GitHub Release with tarballs/zips
- Publishes `outray` CLI to npm

## Testing

No formal test framework is currently set up. Manual testing workflow:
1. Run `apps/web` and `apps/tunnel` locally
2. Use `apps/cli` with `npm run dev` to create test tunnels
3. Use `test-server/` for a simple HTTP target

## Component Locations
- UI components: [apps/web/src/components/](apps/web/src/components/)
- Email templates: [apps/web/src/email/](apps/web/src/email/)
- Tunnel core classes: [apps/tunnel/src/core/](apps/tunnel/src/core/) (TunnelRouter, HTTPProxy, TCPProxy, UDPProxy)

## Styling

**Stack:** Tailwind CSS v4 with custom theme in [apps/web/src/index.css](apps/web/src/index.css)

**Theme:**
- Dark theme by default (black backgrounds: `bg-black`, `bg-[#0A0A0A]`)
- Accent color: `--color-accent: #8367c7` (purple)
- Font: Geom (`--font-family-sans`)

**Patterns:**
- Use Tailwind utility classes directly in JSX (no separate CSS files)
- Common component patterns: `bg-white/5`, `border-white/10`, `rounded-2xl`
- Animations via `motion/react` (Framer Motion) for modals and transitions
- Icons from `lucide-react`

**Example button styles:**
```tsx
// Primary button
className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-xl"
// Ghost button
className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white"
```
