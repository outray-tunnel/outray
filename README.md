<div align="center">

# Outray

<p align="center">
  <img src="https://img.shields.io/github/stars/outray-tunnel/outray?style=flat-square" alt="GitHub stars">
  <img src="https://img.shields.io/github/license/outray-tunnel/outray?style=flat-square" alt="License">
  <img src="https://img.shields.io/npm/v/outray?style=flat-square" alt="npm version">
  <img src="https://img.shields.io/github/v/release/outray-tunnel/outray?style=flat-square" alt="GitHub release">
</p>

**Expose your localhost to the internet.**

An open-source tunneling solution that lets you share local servers with anyone, anywhere.

[Website](https://outray.dev) • [Documentation](https://outray.dev/docs) • [Report Bug](https://github.com/outray-tunnel/outray/issues)

</div>

---

## Overview

Outray is a self-hostable alternative to ngrok that enables developers to expose their local development servers to the internet instantly. It supports HTTP/HTTPS, TCP, and UDP tunneling with a comprehensive dashboard for monitoring and management.

## Features

- **HTTP Tunnels** - Expose web servers with custom subdomains and automatic HTTPS
- **TCP Tunnels** - Tunnel any TCP service including databases and game servers
- **UDP Tunnels** - Support for DNS, VoIP, TFTP, and other UDP-based protocols
- **Custom Domains** - Bring your own domain with automatic TLS certificate management
- **Dashboard** - Web interface for tunnel management, traffic monitoring, and analytics
- **Team Support** - Organization and role-based access control for team collaboration
- **Self-Hostable** - Full control over your infrastructure and data

## Quick Start

### Installation

Install the Outray CLI globally using npm:

```bash
npm install -g outray
```

### Basic Usage

Create an HTTP tunnel:

```bash
outray http 3000
```

Create a TCP tunnel:

```bash
outray tcp 5432
```

Create a UDP tunnel:

```bash
outray udp 53
```

### Advanced Usage

Use a custom subdomain:

```bash
outray http 3000 --subdomain my-app
```

Use your own domain:

```bash
outray http 3000 --domain api.mycompany.com
```

Specify an authentication token:

```bash
outray http 3000 --token your-auth-token
```

## Use Cases

### Webhook Development

Test webhooks from third-party services like Stripe, GitHub, or Twilio during local development:

```bash
outray http 4000 --subdomain stripe-webhooks
```

### Mobile App Development

Share your local backend with mobile devices on different networks:

```bash
outray http 8080 --subdomain mobile-api
```

### Home Lab Access

Access home lab services remotely without exposing your home IP:

```bash
outray http 8123 --subdomain homeassistant
```

### Client Demonstrations

Show work-in-progress to clients without deploying to staging:

```bash
outray http 3000 --subdomain client-demo
```

### IoT Development

Connect IoT devices to your local development server:

```bash
outray tcp 1883 --subdomain mqtt-broker
```

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Client    │◄───────►│ Tunnel Server│◄───────►│  Your App   │
│     CLI     │ WebSocket│   (Node.js)  │  Local  │ (localhost) │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Dashboard &    │
                    │    Web API       │
                    └──────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
          ┌──────────┐  ┌──────────┐  ┌──────────┐
          │PostgreSQL│  │  Redis   │  │TimescaleDB│
          └──────────┘  └──────────┘  └──────────┘
```

### Components

- **CLI Client** - Establishes secure tunnels and manages connections
- **Tunnel Server** - Routes incoming traffic to clients via WebSocket
- **Dashboard** - Web interface for tunnel management and monitoring
- **PostgreSQL** - Primary database for user data and configurations
- **Redis** - Caching layer for high-performance operations
- **TimescaleDB** - Time-series analytics and metrics storage

## Self-Hosting

### System Requirements

- OS: Linux (Ubuntu 20.04+ recommended)
- CPU: 2+ cores
- RAM: 4GB minimum, 8GB recommended
- Storage: 20GB+ SSD
- Network: Public IP with open ports 80, 443

### Installation Steps

Clone the repository:

```bash
git clone https://github.com/outray-tunnel/outray.git
cd outray
```

Install dependencies:

```bash
npm install
```

Configure environment variables:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/outray
REDIS_URL=redis://localhost:6379
TIMESCALEDB_URL=postgresql://user:password@localhost:5432/outray_analytics

NODE_ENV=production
PORT=3000
TUNNEL_PORT=4000

BASE_DOMAIN=your-domain.com
DASHBOARD_URL=https://dashboard.your-domain.com

JWT_SECRET=your-super-secret-jwt-key
ENCRYPTION_KEY=your-encryption-key
```

Run database migrations:

```bash
npm run migrate
```

Build the project:

```bash
npm run build
```

Start the services:

```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start ecosystem.config.js

# Or manually
npm run start:tunnel  # Terminal 1
npm run start:web     # Terminal 2
npm run start:cron    # Terminal 3
```

### Docker Deployment

Deploy using Docker Compose:

```bash
docker-compose up -d
```

See the `deploy/` directory for additional deployment configurations including Kubernetes and Terraform.

## Development

### Project Structure

```
outray/
├── apps/
│   ├── cli/              # CLI client
│   ├── cron/             # Background jobs
│   ├── internal-check/   # Domain verification for Caddy
│   ├── landing/          # Marketing website
│   ├── tunnel/           # Tunnel server
│   └── web/              # Dashboard & API
├── shared/               # Shared utilities
└── deploy/               # Deployment configs
```

### Local Development

Set up local environment:

```bash
git clone https://github.com/outray-tunnel/outray.git
cd outray
npm install
```

Start local databases:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Configure environment:

```bash
cp .env.example .env.local
```

Run migrations:

```bash
npm run migrate:dev
```

Start development servers:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

## Documentation

Full documentation is available at [outray.dev/docs](https://outray.dev/docs).

## Troubleshooting

### Connection Refused

**Error:** `connect ECONNREFUSED 127.0.0.1:3000`

**Solution:** Ensure your local server is running on the specified port.

### Port Already in Use

**Error:** `Port 3000 is already in use`

**Solution:** Stop the process using that port or specify a different port.

### Authentication Failed

**Error:** `Invalid authentication token`

**Solution:** Generate a new token from the dashboard or use `outray login`.

### SSL Certificate Errors

**Error:** `certificate has expired`

**Solution:** Renew your Let's Encrypt certificates using `certbot renew`.

For additional help, visit the [documentation](https://outray.dev/docs) or [open an issue](https://github.com/outray-tunnel/outray/issues).

## Comparison with Alternatives

| Feature | Outray | ngrok | localtunnel | Cloudflare Tunnel | frp |
|---------|--------|-------|-------------|-------------------|-----|
| Open Source | Yes | No | Yes | No | Yes |
| Self-Hostable | Yes | No | Limited | No | Yes |
| HTTP/HTTPS | Yes | Yes | Yes | Yes | Yes |
| TCP Support | Yes | Yes | No | Yes | Yes |
| UDP Support | Yes | Paid Only | No | No | Yes |
| Custom Domains | Yes | Paid Only | No | Yes | Yes |
| Dashboard | Yes | Yes | No | Yes | No |
| Team Features | Yes | Paid Only | No | Yes | No |
| Analytics | Yes | Paid Only | No | Yes | No |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

### How to Contribute

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Areas for Contribution

- Documentation improvements
- Bug fixes and testing
- Feature development
- Performance optimizations
- Deployment scripts and configurations

## Security

Security is a priority for Outray. All tunnel traffic is encrypted with TLS, and the system includes token-based authentication, rate limiting, and role-based access control.

If you discover a security vulnerability, please email security@outray.dev instead of opening a public issue.

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only). See the [LICENSE](LICENSE) file for details.

## Acknowledgments

Thanks to all [contributors](https://github.com/outray-tunnel/outray/graphs/contributors) who have helped improve Outray.

## Contact

- Website: [outray.dev](https://outray.dev)
- Documentation: [outray.dev/docs](https://outray.dev/docs)
- Issues: [github.com/outray-tunnel/outray/issues](https://github.com/outray-tunnel/outray/issues)
- Email: hello@outray.dev

---

<div align="center">

Made by the Outray team and contributors

</div>
