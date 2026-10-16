# Move an existing installation to standard self-hosting

Older manual, rehearsal or preview deployments need a one-time migration into
the standard Compose stack before using `npm run self-host:update`. This is a
deployment migration, not a new installation: retain the same data, identity,
domains and encryption keys. No host or instance receives a special updater.

The updater deliberately refuses installations without the standard Compose
project. Running `self-host:up` beside an older deployment can create an empty
database and contend for public ports; it is not an adoption mechanism.

## 1. Inventory and back up

- Record actual container, volume and network names; never infer ownership from
  names alone. Include PostgreSQL, Redis, status-page logos and both Caddy
  certificate/configuration volumes. Record service images and database major
  version. The standard stack currently uses PostgreSQL 16 and Redis 7.
- Securely save the current installation configuration, OAuth and Tinybird
  credentials, all signing keys, and the complete Secrets master-key ring.
  **Do not rerun `self-host:init` or generate replacement keys.** Losing existing
  master keys makes stored vault values unrecoverable.
- Make and test a PostgreSQL dump plus backups of Redis data, logos and Caddy
  state. Keep a copy off-host. A PostgreSQL dump alone does not include queues,
  uploaded files or certificates. Treat every archive as sensitive.
- Keep the old images, configuration and volumes intact for reviewed recovery.
  Do not use `down --volumes`, volume pruning or broad container deletion.

## 2. Prepare the standard configuration

Use a clean tracked checkout and a private mode-`0600` environment file based
on `deploy/self-hosted/.env.example`. Transfer existing values carefully; fill
new required settings without replacing established credentials. Retain the
public hostnames, OAuth callbacks, signup allowlist and Tinybird workspace.
Keep this file outside Git and verify it with:

```bash
npm run self-host:check -- --file /absolute/path/private.env
```

Check network/subnet conflicts, available memory/disk, raw tunnel port ranges
and firewall rules. Build the standard image before the maintenance window;
public browser origins are build-time settings. Do not publish licensed icon
images or copy runtime credentials into a build context.

Choose one reviewed data-transfer method:

- **Dump/restore:** restore PostgreSQL into a fresh standard volume using a
  compatible server version. Copy Redis persistence, logos and Caddy state into
  their new volumes with compatible ownership. Restore into an isolated target
  before exposing it; verify application records and master-key compatibility.
- **Reuse existing named volumes:** only if the old service versions and disk
  layouts are compatible. Configure their exact inspected names in the private
  environment before starting Compose:

  ```dotenv
  POSTGRES_VOLUME_NAME=existing-postgresql-volume
  POSTGRES_VOLUME_EXTERNAL=true
  REDIS_VOLUME_NAME=existing-redis-volume
  REDIS_VOLUME_EXTERNAL=true
  STATUS_PAGE_LOGOS_VOLUME_NAME=existing-logo-volume
  STATUS_PAGE_LOGOS_VOLUME_EXTERNAL=true
  CADDY_DATA_VOLUME_NAME=existing-certificate-volume
  CADDY_DATA_VOLUME_EXTERNAL=true
  CADDY_CONFIG_VOLUME_NAME=existing-caddy-config-volume
  CADDY_CONFIG_VOLUME_EXTERNAL=true
  ```

  These are explicit local names, not bind-mount paths. Set each matching
  `*_VOLUME_EXTERNAL=true` for a volume created outside this Compose project;
  this avoids ownership-label conflicts and makes Compose require its existence
  rather than create an empty replacement. External defaults are `false` for
  fresh installations. Verify every selected volume belongs to this installation.
  New logos directories must be writable by the image's `node` user
  (UID 1000). Do not recursively change ownership on unrelated volumes.

Never attach two running PostgreSQL or Redis servers to the same data volume.
Do not reuse PostgreSQL files across incompatible major versions. For bind
mounts or external databases, plan an explicit transfer rather than pretending
the standard updater already manages them.

## 3. Perform a cold cutover

1. Put public traffic into maintenance and stop the old application writers,
   ingestion consumers, cron and monitoring workers. Disable any legacy
   systemd/process supervisors so they cannot respawn competing containers.
2. Take the final consistent backup. For volume copying, shut down the old
   database/Redis cleanly before copying or attaching their files. For a logical
   restore, keep old writers stopped after the final dump. Ensure Redis has
   persisted its latest state before copying its data.
3. Stop the old public gateway before binding ports 80/443. Retain its certificate
   volumes; copying them avoids unnecessary certificate reissuance. Keep the old
   containers and volumes stopped, not deleted.
4. Start the standard stack using the prepared configuration:

   ```bash
   npm run self-host:up -- --file /absolute/path/private.env
   ```

   Its one-shot migration job applies committed migrations to this installation
   and bootstraps the restricted Share role before application services start.
   Never generate or push a schema during cutover.
5. Verify console deep health, sign-in, an existing encrypted vault, status pages
   and logo URLs, telemetry ingestion, and tunnel connections before restoring
   traffic. Check that queues continue processing without a second old consumer.

Keep Uptime probes disabled until the outbound policy is verified for the new
container/network layout. Legacy namespace-specific rules do not automatically
protect a new Compose container. Recheck private/metadata denial, DNS and only
the required database/provider access before setting the readiness flags. The
standard root/Linux lifecycle uses a dedicated bridge, an inert activation gate
and the generic `outray-self-hosted-probe.service` supervisor; never start its
worker command directly or copy old namespace rules onto a new PID blindly.

After successful acceptance, remove only the reviewed, stopped legacy
containers **without removing their volumes**; retain the old images, private
configuration and backups. The updater refuses volumes attached to containers
outside the standard project, including stopped containers. Never broadly
prune resources to clear that check, and keep legacy supervisors disabled.

If cutover fails after migrations, do not simply restart the old binaries on
the changed database. Review the schema and bootstrap changes, then either fix
forward or restore the matching backup into an isolated recovery volume before
switching traffic. Account for writes and queued telemetry since that backup;
never automatically rewind a live installation.

## 4. Use the standard updater thereafter

```bash
npm run self-host:update -- --file /absolute/path/private.env --dry-run
npm run self-host:update -- --file /absolute/path/private.env
```

All installations use this same path. Migration is not performed by writing
this guide or by running its dry-run command; an existing legacy deployment
remains unchanged until the operator completes the cutover and checks above.
