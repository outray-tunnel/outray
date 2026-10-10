# Private infrastructure rehearsal

This opt-in path checks a fresh installation's local infrastructure and packaged processes before its OAuth/Tinybird accounts are configured. It is **not** `self-host:up`, does not weaken its preflight, and is not a functional or public deployment.

Initialize a new private configuration on an independent disposable host, using installation-owned hostnames and fresh generated keys. Build the shared image separately using the selected icon mode; any optional private icon credential belongs only to that build. Then run from the repository root with Node.js 22+:

```bash
node scripts/self-hosted-rehearsal.mjs --file /absolute/path/fresh-private.env --image outray-rehearsal:local
```

The script does not require host npm dependencies or Compose. It accepts only a local Unix Docker socket. It never reads `.env`, `.env.prod` or `.env.production`; the supplied configuration must be a regular private file, not a symlink. Only selected generated internal credentials and installation hostnames are used. OAuth, Tinybird, email, xAI and Hugeicons credentials are not copied to application runtimes, and no external credentials are fabricated.

Resources use the separate stable prefix `outray-ops-rehearsal`. The bridge network is internal, there are no published host ports, no Caddy/ACME service, and no Uptime probe worker. Docker administrators and the host can still access container metadata and private addresses; this is isolation for a deliberate smoke test, not protection from a hostile host. Docker may pull the PostgreSQL/Redis images through the host's network; application containers have no external network route.

The runner waits for PostgreSQL 16 and durable Redis 7 health, applies committed migrations, bootstraps the restricted Share role, runs bootstrap again, and verifies restricted Share-table CRUD/ownership reads plus actual permission denial and effective column privileges on user/account/vault tables. The restricted session also checks elevated role flags, membership, ownership, and schema/database CREATE denial. Sanity-test writes are rolled back. Its one-shot application containers run as non-root with read-only filesystems and no mounted data volumes; only those temporary containers are automatically removed.

It then starts web, internal-check, tunnel, ingest, cron, status and Secrets Share privately, checking HTTP health from inside each container where available. Web's check includes PostgreSQL/Redis; cron's check is process liveness only. Ingest currently requires Tinybird configuration at startup, so its specific missing-Tinybird exit is reported as `expected-unconfigured`, never as healthy. Unexpected exits, OOM kills, privilege failures and health deadlines fail the rehearsal.

Container CPU/memory and Docker/filesystem disk snapshots are printed without raw service logs or resolved environment values. The runner uses a 10-connection dashboard pool and a 128-MB Redis ceiling as unbenchmarked empty-host smoke settings. Services have no restart policy. Application health does not verify OAuth, Tinybird ingestion/query, notifications, DNS/ACME, public tunnels, Uptime probes, backups or production capacity.

Containers and both labelled data volumes are retained. Existing resources are reused only when their ownership/configuration and isolation match; unlabelled or mismatched resources are never overwritten. The script never removes a volume or database. Keep the fresh private configuration to retain access to this rehearsal's data. Do not delete volumes or copy credentials from a hosted installation to make a retry pass.
