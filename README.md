<a href="https://vercel.com/oss">
  <img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />
</a>

# OutRay

**Expose your localhost to the internet.** Outray is an open-source tunneling solution that lets you share local servers with anyone, anywhere.


## Features

- **HTTP Tunnels** - Expose web servers with custom subdomains
- **TCP Tunnels** - Tunnel any TCP service (databases, game servers, etc.)
- **UDP Tunnels** - Tunnel UDP traffic (DNS, VoIP,TFTP etc.)
- **Custom Domains** - Bring your own domain with automatic TLS
- **Dashboard** - Monitor traffic, view analytics, manage tunnels
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
- PostgreSQL
- Redis
- Tiger Data (TimescaleDB)

### Project Structure

```
outray/
├── apps/
│   ├── cli/             # Main CLI client
│   ├── web/             # Dashboard & API
│   ├── tunnel/          # Tunnel server
│   ├── cron/            # Background jobs
│   └── internal-check/  # Caddy domain verification
├── packages/            # Core logic & plugins
├── shared/              # Shared utilities
└── deploy/              # Deployment configs
```

## Documentation

Visit [outray.dev/docs](https://outray.dev/docs) for full documentation.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

AGPL-3.0-only
