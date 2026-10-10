# Restricted Ops public preview

By default this explicit trial exposes only `https://ops.outray.dev`. The separate
`--enable-status` opt-in below also serves published status pages through two
private status-only services. Neither mode is normal full public
self-hosted deployment or acceptance: by default OAuth, Tinybird, email and signup
remain unconfigured/closed, other product endpoints remain private, and uptime
workers remain disabled unless the separate probe-only procedure below is
explicitly completed. The independent GitHub-only and Tinybird READ-only
exceptions below each require an explicit operator opt-in; GitHub additionally
requires two approved email addresses. Normal preflight is unchanged and still fails
closed until its real external configuration and signup policy are supplied.

The gateway uses the [official Caddy image](https://hub.docker.com/_/caddy), pinned
to `2.11.7-alpine` and its [immutable official image index](https://github.com/docker-library/repo-info/blob/master/repos/caddy/remote/2.11.7-alpine.md):
`sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`.
Only TCP80/443 are published; HTTP/3 and the public admin port are disabled.
Without `--enable-status`, only the explicit dashboard hostname is proxied.
Unknown HTTP hosts get 421;
unknown TLS SNI has no certificate, and SNI/Host mismatches are rejected through
[strict SNI/Host checking](https://caddyserver.com/docs/caddyfile/options#strict_sni_host).
The default mode has no wildcard, on-demand TLS or custom-domain validator.
Status mode adds narrowly authorized status-host certificates and redirects,
not tunnel, ingestion or share routing. Access logging is not enabled, and setup
suppresses Docker diagnostics.

Only Caddy joins `outray-ops-preview-egress` for outbound DNS/ACME plus the existing
internal `outray-ops-rehearsal` network. In closed mode, the web app, PostgreSQL
and Redis retain only the internal network with no host ports. GitHub/Tinybird
console modes add a separate web-only outbound bridge, never new inbound routing.
Certificate state is kept in
`outray-ops-preview-caddy-data`; Caddy configuration state is kept in
`outray-ops-preview-caddy-config`. Both are labelled persistent volumes and are
never removed. Unlabelled/mismatched resources or a shared egress network are
refused. Switching maintenance/proxy replaces only the exact owned gateway
container by inspected ID, preserving all volumes and application containers.

## Operator sequence

Run from the repository root on the authorized host. `PRIVATE_FRESH_CONFIG` below
means the existing dedicated private fresh rehearsal file (mode0600), not a
production `.env` file. No secrets or licenses belong in command arguments.
For the default mode, DNS must point only the dashboard hostname to this host;
ports80/443 must be available and reachable. These gateway scripts do not change
DNS or firewall rules; the separate probe runner installs its own scoped policy.

```sh
docker pull caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co
```

The default is a maintenance503 response, never the old application. Verify a
publicly trusted certificate and HTTP→HTTPS redirect before continuing. Do not
enable proxy until fresh outputs from the security-patched source are staged
using the existing Node22 artifact staging/audit process. All eight applications
and three dependency outputs, their complete source digest, free icon mode, native
binary audit and all five public origins must verify. Do not reuse the old image
or stale artifacts. Build the dedicated standalone dashboard image:

```sh
docker build --file deploy/self-hosted/Dockerfile.preview \
  --build-arg APP_PUBLIC_URL=https://ops.outray.dev \
  --build-arg STATUS_PUBLIC_URL=https://status.ops.outray.dev \
  --build-arg SHARE_PUBLIC_URL=https://share.ops.outray.dev \
  --build-arg EDGE_PUBLIC_URL=wss://edge.ops.outray.dev \
  --build-arg INGEST_PUBLIC_URL=https://ingest.ops.outray.dev \
  --tag outray-console-preview:patched .
node scripts/self-hosted-preview-web.mjs --file PRIVATE_FRESH_CONFIG --image outray-console-preview:patched
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co \
  --enable-proxy --image outray-console-preview:patched
```

The build's verification stage reads the complete clean context and audited
artifact tree, without runtime credentials. The runtime copies only the web
Nitro `.output` with its exact JS-only traced dependencies and manifest into
Node22 Debian, running as `node`. It never copies root/workspace `node_modules`
or runs a host dependency fallback. This smaller image cannot run migrations or
other apps; the already-rehearsed infrastructure and private services are retained.
The private web runner creates `outray-ops-public-web`, keeps signup/providers
closed, and checks PostgreSQL/Redis deep health. Gateway opt-in additionally
checks its exact image/config labels, actual environment and isolation, Node22,
free manifest, absence of root/workspace dependencies, and traced Seroval>=1.6.3.
That version check is a guard against the known parser issue, not a general claim
that every public security or functional acceptance test has passed.

Verify externally without `curl -k`: anonymous `/` redirects to `/login` before
rendering any landing page, `/login` and `/api/health?deep=true` return200,
HTTP308 to the fixed ops origin, unknown HTTP Host421, and an ops TLS
connection with a mismatched Host421. Unknown SNI must not obtain a certificate.
Signup should remain denied and provider routes should remain unconfigured.
For maintenance again, rerun the default gateway command; once public status is
enabled, also retain `--enable-status` as described below. This does not stop or
delete any app/database container. Existing gateway config/email fingerprints
must still match; do not edit mounted Caddyfiles in place while running.

This path avoids a full Nitro build on the small VPS. Runtime memory and disk
must still be measured under actual usage; successful image assembly/private
health is not a sizing benchmark. Full public Compose, custom domains, OAuth,
CLI/SDK/Tinybird/jobs, worker egress/uptime/email, backups, upgrade and licensed
Linux-build acceptance remain separate work in `../VERIFICATION.md`. The status
recipe below is an explicit narrower exception, not completion of those checks.

## Explicit public status-only mode

This opt-in exposes public Uptime status pages without exposing the tunnel
runtime, SDK ingestion, Secrets Share, PostgreSQL, Redis or the certificate
checker. It does not create a status page, change a draft to published, enable
monitoring probes or send email. Configure the page and its components in the
console, then deliberately publish it. Until then, an unknown or unpublished
page returns not found; a valid certificate alone does not make its data public.

On the authorized independent Ops VPS, configure these DNS-only records (not
Cloudflare-proxied), leaving the existing console record unchanged:

| Type | Name | Target |
| --- | --- | --- |
| A | `status.ops.outray.dev` | `209.74.86.89` |
| A | `*.status.ops.outray.dev` | `209.74.86.89` |

The wildcard DNS record routes page subdomains to this host; it is **not** a
wildcard TLS certificate. Caddy obtains individual certificates only after its
private status-only checker authorizes the hostname. The canonical
`status.ops.outray.dev` target can have HTTPS even before a page is configured.

For an organization-owned custom hostname, add a **CNAME to
`status.ops.outray.dev`**, then add the exact TXT ownership challenge generated
by the console. Do not reuse another installation's challenge or infer a TXT
name/value from an example. Verify the hostname in the UI and publish its page.
Certificate authorization requires a verified custom domain linked to a
published page in the same organization. Draft pages, unrelated organization
bindings, tunnel/ingest/share names and unknown names are denied.

Build fresh source-matched Node22/free-mode outputs for all eight applications
and their dependencies, stage them through `self-hosted-artifacts.mjs`, and
verify all five origins before building. Do not reuse an old status renderer or
generic domain checker: status mode depends on the new status-only ask endpoint.
The dedicated image runs only the renderer and checker, using the existing
private installation database and signing keys. No hosted configuration,
OAuth, Tinybird, email, vault key, build license or DNS API credential is copied
into these services.

```sh
docker build --file deploy/self-hosted/Dockerfile.status-preview \
  --build-arg APP_PUBLIC_URL=https://ops.outray.dev \
  --build-arg STATUS_PUBLIC_URL=https://status.ops.outray.dev \
  --build-arg SHARE_PUBLIC_URL=https://share.ops.outray.dev \
  --build-arg EDGE_PUBLIC_URL=wss://edge.ops.outray.dev \
  --build-arg INGEST_PUBLIC_URL=https://ingest.ops.outray.dev \
  --tag outray-status-preview:patched .
node scripts/self-hosted-status-services.mjs --file PRIVATE_FRESH_CONFIG \
  --image outray-status-preview:patched
```

The runner audits the image with no network or runtime credentials, creates
`outray-ops-public-status` and `outray-ops-status-check`, and waits for both to
be healthy. Both run as `node`, read-only, with dropped capabilities, no host
ports and only the internal rehearsal network. A mismatched, partial or
unhealthy installation is refused; the runner does not silently replace it.
Only after both services pass should the existing console gateway be upgraded.
Use the actual currently audited console image and retain its independent
GitHub/Tinybird flags; for an Ops console with both already enabled:

```sh
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co \
  --enable-proxy --image CURRENT_AUDITED_CONSOLE_IMAGE \
  --enable-github --enable-tinybird --enable-status
```

Gateway mode uses the pinned Caddy image and the same two gateway networks,
TCP80/443 and persistent certificate/configuration volumes. It preserves Host,
removes client-supplied forwarding/security headers and supplies the trusted
client IP and independent `STATUS_EDGE_SECRET` to the private renderer.
The secret is a runtime placeholder, not embedded in adapted/autosaved Caddy
JSON, arguments or labels; the gateway fingerprint includes only its digest.
On status hosts, public `/health`, `/api/health`, `/internal`, `/metrics` and `/_image` routes
(including their children) are blocked. HTTP redirects for non-console hosts
first require the private status-only authorization check. Unknown TLS names
cannot obtain a certificate, and strict SNI/Host checking remains enabled.

Verify DNS, trusted HTTPS, authorized HTTP308 redirects, rejected unknown hosts,
draft privacy, tenant isolation, verified custom domains and public-route
blocking before considering the mode accepted. This is a deployment recipe,
not a claim that live verification has completed. This status procedure does not
enable probes, worker egress or subscriber email. Probes require the separate
procedure below; subscriber delivery remains disabled.

### Keep status available during console upgrades

Once status mode is enabled, **retain `--enable-status` on both maintenance and
proxy gateway commands**, including the GitHub/Tinybird upgrade and rollback
sequences below. The console-web runner itself does not take that flag. The
status-maintenance template keeps public status working while only the console
returns503. For example, with both console opt-ins retained:

```sh
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co \
  --enable-status
node scripts/self-hosted-preview-web.mjs --file PRIVATE_FRESH_CONFIG \
  --image NEW_AUDITED_CONSOLE_IMAGE --enable-github --enable-tinybird --replace-owned
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co \
  --enable-proxy --image NEW_AUDITED_CONSOLE_IMAGE \
  --enable-github --enable-tinybird --enable-status
```

The gateway refuses a status-enabled installation's maintenance/proxy command
without `--enable-status`; this prevents a console upgrade from silently
disabling public status. Disabling status intentionally requires a separately
planned rollback, not omission of the flag. Do not edit mounted templates in
place or remove certificate/database volumes.

## Explicit independent Ops probe-only mode

This is a separate opt-in for the authorized `209.74.86.89` installation, not a
generic arbitrary-host installer. It starts only the Uptime worker. It does not
expose ingestion, tunnels or Secrets Share, change the console/status runtime or
its private configuration, send notifications, or start the old rehearsal cron.
Existing enabled monitors are checked and their normal monitoring evidence is
stored in the independent PostgreSQL database. Incident publishing follows each
monitor's setting; starting a probe is not permission to publish an incident.

Run as root on the independent Ops VPS, from `/opt/outray-ops/source`, with
the verified Node22 runtime at `/usr/local/bin/node` and local Docker. Keep the
private file at
`/opt/outray-ops/config/instance.env` mode0600. Never substitute hosted `.env`
files, credentials, the hosted edge VPS or another installation's stores.
First stage and audit fresh source-matched outputs through the same eight-app,
three-dependency Node22/free-mode artifact process used for status hosting.
`CURRENT_AUDITED_STATUS_IMAGE` below must be the already audited Linux status
image on this host. The build copies only the pure-JS `pg`, `dotenv` and
`ipaddr.js` dependency closure from it, never a root dependency tree, provider
credentials or a build license, and performs no package installation.

```sh
docker build --file deploy/self-hosted/Dockerfile.probe-preview \
  --build-arg PROBE_DEPENDENCY_IMAGE=CURRENT_AUDITED_STATUS_IMAGE \
  --build-arg APP_PUBLIC_URL=https://ops.outray.dev \
  --build-arg STATUS_PUBLIC_URL=https://status.ops.outray.dev \
  --build-arg SHARE_PUBLIC_URL=https://share.ops.outray.dev \
  --build-arg EDGE_PUBLIC_URL=wss://edge.ops.outray.dev \
  --build-arg INGEST_PUBLIC_URL=https://ingest.ops.outray.dev \
  --tag outray-ops-probe-preview:public .
/usr/local/bin/node scripts/self-hosted-probe.mjs \
  --file /opt/outray-ops/config/instance.env \
  --image outray-ops-probe-preview:public
```

The runner checks the source/boot fingerprints, actual image contents,
installation ownership, PostgreSQL health and address, all Docker networks and
host routes before activation. Foreign, shared, overlapping or drifted resources
are refused. `outray-ops-uptime-probe` runs as `node`, read-only, with dropped
capabilities, no host ports, no data mounts, a temporary 16 MiB `/tmp`, a 256 MiB
memory/no-swap limit and 64-process limit. It receives only its independent
database and vault-key configuration; OAuth, Tinybird, Redis, email, DNS API and
other service credentials are absent. Notifications are explicitly disabled.
Probe concurrency and batch size are five, with a five-second scheduler poll;
that polling frequency does not change the monitor check cadence.

The worker joins only its dedicated `outray-ops-probe-egress` bridge
(`br-or-probe`, `172.21.42.0/29`), not the shared internal application bridge.
Host forwarding/INPUT rules and rules inside the actual container network
namespace both constrain outbound access. The only private exception is the
inspected independent PostgreSQL address on TCP 5432. Public IPv4 TCP 80/443 and
DNS to `1.1.1.1` on TCP/UDP 53 are allowed; the Docker embedded resolver permits
only its original DNS query/reply tuples. Loopback, metadata, private/special
ranges, the Ops host/subnet, Redis, alternate resolvers and other ports are
denied. IPv6 egress is disabled and denied. This trial is IPv4-only; monitors of
private services or IPv6-only targets require a separately reviewed policy.

Only newly owned firewall chains/hooks are added. Existing unrelated chains,
global policies, services and volumes are not flushed or replaced. The runner
keeps the child worker inert while it installs and verifies both policies and
performs live allowed/denied connectivity checks. Only after these pass is the
temporary activation marker written. A failed gate stops the exact owned
container without running a monitor. Treat any refusal as a diagnostic failure;
do not bypass it by starting the container directly or changing global rules.

After a successful first manual activation, install the shipped supervisor unit
only if its exact target is absent. If a unit already exists, audit its ownership
and content instead of overwriting it. The unit is specifically bound to the
paths and image tag shown above:

```sh
if [ -e /etc/systemd/system/outray-ops-uptime-probe.service ] || \
   [ -L /etc/systemd/system/outray-ops-uptime-probe.service ]; then
  printf '%s\n' 'Existing probe unit must be audited before replacement.' >&2
  exit 1
fi
install -o root -g root -m 0644 \
  deploy/self-hosted/outray-ops-uptime-probe.service \
  /etc/systemd/system/outray-ops-uptime-probe.service
systemctl daemon-reload
systemctl enable --now outray-ops-uptime-probe.service
```

Docker restart policy is deliberately `no`: an active worker must never resume
automatically in a new unverified namespace. The runner installs the root-owned,
secret-free `outray-ops-probe-policy.service` to restore its scoped host rules.
The worker unit invokes `--recover --supervise`: it can replace only an exactly
owned inactive container, recreates a fresh temporary filesystem, and repeats
network checks before every activation. Every 15 seconds the supervisor rechecks
the running container and both firewall policies; detected drift stops it.
Systemd uses a controlled restart after failures, re-entering the full gate.
Do not use `docker start` or change the restart policy to `unless-stopped`.

Verify the unit, Docker health and real advancing check timestamps/counts in
the independent database; a healthy process alone is not monitoring acceptance.
Exercise a controlled `systemctl restart outray-ops-uptime-probe.service`, then
verify the same activation checks and continued monitoring. Also verify the
unchanged console deep health and published status HTTPS, and that no additional
ports or notifications were enabled. To stop monitoring, use
`systemctl stop outray-ops-uptime-probe.service`; disable that unit as well if it
must stay stopped after reboot. Leave its owned isolation rules in place.
The current recipe and live acceptance record are separate; see
`../VERIFICATION.md` for measured results and remaining limitations.

## Explicit GitHub-only signed-in console

Use this mode only after the user has authorized GitHub sign-in and the exact two
approved email addresses. The operator securely adds `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET` and `OUTRAY_SIGNUP_ALLOWED_EMAILS` to the same dedicated
private fresh configuration. Keep `OUTRAY_SIGNUP_ALLOWED_DOMAINS` empty; never put
credential values in shell arguments, logs, image builds or repository files.
The scripts import only those three fields when `--enable-github` is present.
Absent the flag, they ignore them and keep signup/providers closed. Exactly two
distinct valid addresses are required, normalized by trimming and lowercasing.
This is a verified-email **signup** allowlist, not retroactive revocation of
existing accounts: audit the fresh database for any nonapproved accounts before
enabling and treat existing-account access as a separate acceptance check.

The credential-only updater accepts one JSON line with `clientId` and
`clientSecret` through stdin, using `scripts/self-hosted-config-github.mjs --file
PRIVATE_FRESH_CONFIG`. Supply it through a secure input channel, not a shell
command containing values. It atomically updates only the two GitHub fields,
preserves the existing policy and other configuration, and requires a private
owned file and directory. It refuses hosted `.env` files and never prints values.
Register `https://ops.outray.dev/api/auth/callback/github` as the GitHub OAuth
application's authorization callback URL. The GitHub-selected email must be
verified and match an approved address; a public profile email can take precedence
over the primary email. Self-hosted `/` opens login or workspace selection;
hosted landing behavior is unchanged.

Build a fresh source-matched standalone image containing the authorized auth
changes using the preceding image command. Put the owned gateway in maintenance
first, then explicitly replace the existing owned console and enable matching
proxy mode:

The example is the console-only sequence. If public status was enabled, add
`--enable-status` to **both** gateway commands; do not add it to the web runner.

```sh
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co
node scripts/self-hosted-preview-web.mjs --file PRIVATE_FRESH_CONFIG \
  --image outray-console-preview:github --enable-github --replace-owned
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co \
  --enable-proxy --image outray-console-preview:github --enable-github
```

`--replace-owned` never adopts unlabelled/mismatched resources. It validates the
old container's actual environment, prior image and configuration fingerprint,
command, nonroot/read-only policy, absence of ports/mounts and its exact network
set. It requires the exact owned running maintenance gateway and verifies the
new runtime before stopping/removing only the old console's inspected ID. No
volumes are removed. A failed new startup leaves the gateway in maintenance.

Only `outray-ops-public-web` joins a distinct labelled
`outray-ops-public-web-egress` bridge for GitHub token/profile/email requests;
its default gateway is explicitly selected with priority1. Caddy retains its
separate ACME egress. PostgreSQL, Redis and other apps remain internal-only, and
no database/application ports are published. Egress is a general outbound bridge,
not a destination-filtering firewall. Without the separate Tinybird opt-in below,
Google, Tinybird, mail, billing, license
credentials and public uptime probes/notifications stay disabled. Gateway opt-in
rechecks the exact GitHub-enabled environment and exactly those two web networks.
Successful health is not proof of OAuth completion: verify GitHub callback,
verified approved-email signup/sign-in, nonapproved denial and session continuity
through the browser separately. Normal full-deployment acceptance remains open.

To return to closed preview, first select maintenance, then run the web runner
without `--enable-github` and with `--replace-owned`, and enable proxy without
`--enable-github`. The now-unused labelled web egress network is retained rather
than deleted; the closed web must have only the internal network.

## Explicit Tinybird READ-only console

This independent opt-in connects dashboard queries to the installation-owned
`internal_ops` workspace (`b603a640-07eb-4089-baaa-99840b7ac34a`), not the hosted
workspace. Deploy the intended data sources and query pipes there through an
isolated operator context, then securely add its bare HTTPS `TINYBIRD_API_HOST`
and scoped `TINYBIRD_QUERY_TOKEN` to the dedicated private fresh configuration.
The token must have READ access only to the intended query pipes, no APPEND,
workspace administration or deployment permissions. Credential syntax checks
do not authenticate a workspace or prove token permissions; verify that scope
separately without printing credentials or reading hosted configuration.

For this specific authorized Ops workspace, `scripts/self-hosted-tinybird-setup.mjs`
checks the exact workspace identity and resource/token scopes. `--deploy` refuses
a nonempty workspace and uses a temporary private CLI profile, without switching
the repository's existing `.tinyb`. `--smoke` appends one isolated synthetic event
with one-day retention and verifies its query result. `--configure-ops` sends only
the verified scoped reader/writer credentials over SSH stdin to the independent
VPS's private `instance.env`, using `self-hosted-config-tinybird.mjs`. The updater
changes only the three Tinybird fields, preserves other configuration and refuses
hosted env files, wrong installation/workspace identities, broad permissions and
an existing tunnel-token override. It does not start any application. The setup
helper is bound to this Ops installation, not a generic arbitrary-host installer.

Both runners require `--enable-tinybird`; without it they ignore these fields
and continue to reject Tinybird configuration in the actual dashboard runtime.
The public dashboard imports only the API origin and READ token. It never imports
`TINYBIRD_INGEST_TOKEN` or `TINYBIRD_TUNNEL_INGEST_TOKEN`, and actual runtime
containers carrying either APPEND credential are always rejected. Other
providers, domain-wide signup, notifications and public Uptime probes remain
disabled. `--enable-github` remains independent and retains the existing two-email
signup policy; Tinybird-only mode does not enable signup or authentication.

Tinybird reads use runtime configuration already present in the audited web
image. These preview-runner/configuration changes do not change the build-source
digest, so they do not require rebuilding all eight applications or assembling a
new full image on the small VPS. Reuse only the existing audited standalone image
whose runtime audit passes; application, lockfile or other build-source changes
still require fresh source-matched artifacts. Never put tokens in an image build,
repository file, shell argument or log.

For the current GitHub-enabled console, first put the owned gateway in
maintenance, replace only the owned web container with both explicit modes, then
enable matching proxy mode. The image below is the existing audited image:

The example is the console-only sequence. If public status was enabled, add
`--enable-status` to **both** gateway commands; do not add it to the web runner.

```sh
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co
node scripts/self-hosted-preview-web.mjs --file PRIVATE_FRESH_CONFIG \
  --image outray-console-preview:github --enable-github --enable-tinybird --replace-owned
node scripts/self-hosted-preview.mjs --file PRIVATE_FRESH_CONFIG --email akinkunmi@outray.co \
  --enable-proxy --image outray-console-preview:github --enable-github --enable-tinybird
```

The previous owned container's GitHub and Tinybird modes are reconstructed from
its labels and actual environment, not the replacement credentials. Its prior
image/configuration fingerprint, policy and exact networks must still match
before replacement. Both enabled modes share the existing labelled unshared
`outray-ops-public-web-egress` bridge with its explicit default-gateway priority;
there is no additional egress network, Caddy route, DNS record or published port.
PostgreSQL, Redis, ingestion and all other rehearsal apps remain internal-only
and receive no new credentials. Data and certificate volumes are preserved.

PostgreSQL/Redis deep health and runtime audits do not prove a successful
Tinybird query. Separately verify a fresh READ query against `internal_ops`,
signed-in observability routes, anonymous denial and organization isolation.
An empty fresh workspace is a valid empty result, not ingestion acceptance.
No ingestion service is started or exposed by this mode; SDK/OTLP ingestion,
delivery acknowledgement, queue recovery and telemetry workload sizing remain
separate acceptance work.

To remove Tinybird reads while retaining GitHub sign-in, select maintenance,
replace the owned web with `--enable-github --replace-owned` but no
`--enable-tinybird`, then enable proxy with `--enable-github` only. To close both
modes, omit both flags for the replacement and proxy commands. The unused
labelled egress network is retained; the fully closed web has only the internal
network.
