# Dashboard-only public preview

This explicit trial exposes only `https://ops.outray.dev`. It is not normal public
self-hosted deployment or acceptance: by default OAuth, Tinybird, email and signup
remain unconfigured/closed, other product endpoints remain private, and uptime
workers remain disabled. The independent GitHub-only and Tinybird READ-only
exceptions below each require an explicit operator opt-in; GitHub additionally
requires two approved email addresses. Normal preflight is unchanged and still fails
closed until its real external configuration and signup policy are supplied.

The gateway uses the [official Caddy image](https://hub.docker.com/_/caddy), pinned
to `2.11.7-alpine` and its [immutable official image index](https://github.com/docker-library/repo-info/blob/master/repos/caddy/remote/2.11.7-alpine.md):
`sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`.
Only TCP80/443 are published; HTTP/3 and the public admin port are disabled.
Only the explicit dashboard hostname is proxied. Unknown HTTP hosts get 421;
unknown TLS SNI has no certificate, and SNI/Host mismatches are rejected through
[strict SNI/Host checking](https://caddyserver.com/docs/caddyfile/options#strict_sni_host).
No wildcard, on-demand TLS, custom-domain validator or other product routing is
present. Access logging is not enabled, and setup suppresses Docker diagnostics.

Only Caddy joins `outray-ops-preview-egress` for outbound DNS/ACME plus the existing
internal `outray-ops-rehearsal` network. In closed mode, the web app, PostgreSQL
and Redis retain only the internal network with no host ports. The explicit
modes below add a separate web-only outbound bridge, never new inbound routing.
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
DNS must point only the dashboard hostname to this host; ports80/443 must be
available and reachable. These scripts do not change DNS or firewall rules.

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
For maintenance again, rerun the default gateway command; it does not stop or
delete any app/database container. Existing gateway config/email fingerprints
must still match; do not edit mounted Caddyfiles in place while running.

This path avoids a full Nitro build on the small VPS. Runtime memory and disk
must still be measured under actual usage; successful image assembly/private
health is not a sizing benchmark. Full public Compose, custom domains, OAuth,
CLI/SDK/Tinybird/jobs, worker egress/uptime/email, backups, upgrade and licensed
Linux-build acceptance remain separate work in `../VERIFICATION.md`.

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
