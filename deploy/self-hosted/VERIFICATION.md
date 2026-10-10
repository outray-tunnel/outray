# Self-hosted verification — 2026-10-10

The initial source-only checks below used synthetic configuration, temporary CLI files, mocked database/provider clients, and source builds; no application server or container was started during that phase. The later independent-host rehearsal and authorized restricted public previews are recorded separately. Hosted production databases, Redis, Tinybird, existing DNS records and services were not changed; only new independent Ops DNS records were added in the documented public-preview phases.

## Passing checks

| Area | Result |
| --- | --- |
| Installer, preflight, Share-role policy, packaging | 29 passed; 1 Docker Compose check skipped |
| Focused web policy, setup, DNS, capabilities, address UI, email | 65 passed |
| CLI authentication/Secrets commands/instance isolation | 48 passed; TypeScript build passed |
| Internal domain authorization | 7 passed; build passed |
| Tunnel edge and analytics | 23 passed; build and TypeScript check passed |
| Observability ingestion | 16 passed; build and TypeScript check passed |
| Uptime worker and email configuration | 19 passed; build and TypeScript check passed |
| Public status service | 18 passed; Astro check and build passed |
| Cron | 10 passed; build passed |
| Secrets Share | 18 passed; 1 live database test skipped; Astro check and build passed |
| Dashboard | Production build passed with normal defaults and with self-hosted public origins plus harmless loopback DB/Redis placeholders |
| Caddy configuration | Real `caddy adapt` passed; host routes, on-demand authorization, strict SNI/Host policy and header replacement inspected |
| Source hygiene | Changed web files linted; `git diff --check` passed |

Secrets Share's shared PostgreSQL helper import failed under the ESM/CJS development boundary during verification. It was changed to the same compatible default-helper import as the other workers; the suite then passed. A stale setup fixture was updated from `/acme` to the current `/acme/tunnel` route.

## License-free icons

- Ordinary `npm ci` with both icon environment variables unset succeeded in a clean Node 22 checkout without either Pro pack installed.
- Default free, explicit Pro (using the operator's existing local packs), and switch-back free dashboard builds passed. Generated wrappers contain re-exports, not copied Pro SVG data; they remain gitignored.
- All eight self-hosted runtime apps built in free mode with independent Ops public origins, disabled telemetry and harmless loopback database/Redis placeholders: 11 build tasks passed.
- Six icon tests passed. The installer/packaging/rehearsal/artifact suite passed 45 checks locally and on the independent host, including Docker 29 missing-network handling and a real HTTP Host-header regression. Local Compose validation was skipped because the development machine lacks its plugin; real Compose validation passed on Ubuntu with synthetic configuration. Real Caddy parsing passed locally (its CLI is absent on the independent host).
- The full web suite ran 1,790 tests: 1,773 passed, 5 skipped, and 12 failed. Each of those failures was reproduced against unchanged pre-icon source/tests (agent draft restoration, setup navigation/mock fixtures, alert-detail polling, and hardcoded hosted DNS expectations). They are not new free-icon regressions.
- Default Docker/Compose builds explicitly use `free`; the licensed overlay explicitly uses `pro`. Both Docker layers and Turbo's public mode stamp separate cache identity without hashing a license secret.

## Independent private host rehearsal

Target: `209.74.86.89`, Ubuntu 24.04 amd64, 1 vCPU, approximately 2 GB RAM and a 24-GB root filesystem. SSH uses the existing verified key on port 22022. Docker/Compose and checksum-verified Node 22 were installed without changing SSH, firewall, hosted services or DNS. A dedicated 4-GiB swap file was added. Installation config is private and uses fresh internal credentials; OAuth/Tinybird credentials remain absent. The temporary operator icon license copy was removed.

The first on-host build exhausted a 1,536-MiB V8 heap. A 3,072-MiB retry caused heavy swap thrashing during final Nitro packaging and was deliberately cancelled. Fresh license-free outputs were instead built off-host, audited for native/Pro/configuration content and bound to the source/lockfile and five Ops origins, then packaged on Linux using the separate prebuilt path. The free image built successfully. Unused trial build cache was reclaimed without deleting the image or any application data.

Live database acceptance passed against fresh PostgreSQL 16 and Redis 7 on an internal Docker network with no published ports:

- All committed migrations applied; Share-role bootstrap passed twice.
- Restricted Share-table/rate-limit CRUD and ownership reads passed, with rolled-back test writes.
- Real account/vault permission denials, effective column-privilege checks, role flags, membership/ownership and schema/database CREATE-denial checks passed.
- The Share integration test passed through the restricted role: invalid proof cannot reveal, exactly one of 20 concurrent reveals succeeds for a one-view share, password checks hold, and expired/revoked shares consume no views. Only random dummy ciphertext was inserted; exact test IDs were cleaned up.

The initial dashboard smoke returned HTTP 500 because request middleware expected an unsupported `pathname` field; the actual TanStack middleware supplies `request`. It now derives the path from `request.url`; four new Request-based regressions and existing policy tests passed 13/13, and focused lint passed. All eight apps rebuilt with zero cached tasks. The tunnel probe also exposed Node `fetch` replacing the custom Host header; the runner and normal Compose probe now use `node:http`, without weakening edge hostname validation. A real HTTP fixture checks acceptance of the correct host and rejection of the wrong host. These issues were fixed rather than bypassing health checks.

Corrected image: `outray-ops-rehearsal:free-fixed`, image ID `sha256:e24b93e123d1edbed4545cb800b18b809890e8daccb9b31745cc3b0ce293b489`; audited source digest starts `e1a1f474cc23`. The private runner completed successfully:

| Process | Actual result |
| --- | --- |
| PostgreSQL / Redis | Healthy, persistent isolated volumes |
| Dashboard | Deep PostgreSQL/Redis health passed; login rendered HTTP 200 HTML |
| Internal-check / tunnel / status / Secrets Share | Private HTTP health passed |
| Cron | Process liveness only; successful jobs are not established |
| Ingest | Expected missing-Tinybird startup failure; **not healthy** |
| Uptime probe | Not started; public probe egress remains unverified |

All application containers run non-root/read-only on an internal network, with no published host ports. Eight running containers (six application processes plus PostgreSQL/Redis) used approximately **385 MiB combined** in the post-start snapshot. The whole host had approximately **752 MiB available RAM** and **9.2 GiB disk available** after removing unused build cache, while retaining both trial images and the data volumes. Build-era swap usage remained, with no swap-out in the two measured post-start `vmstat` intervals; this is not evidence of runtime workload capacity. The Share live test also passed again inside the final Share container.

Twenty sequential warmed private dashboard deep-health requests passed: median 9.27 ms, p95 24.03 ms, maximum 29.92 ms. These check local `SELECT 1`/Redis `PING`, not authenticated dashboard pages, Tinybird queries, concurrent traffic or end-user network latency. This is an empty-instance startup/smoke result, **not** a production sizing benchmark. The small VPS can start these configured core processes; build complete images elsewhere and verify workload capacity after real providers are configured.

## Remaining functional and public acceptance

The independent private rehearsal passed fresh PostgreSQL 16/Redis 7 health, every committed migration, Share-role bootstrap twice, and real effective-privilege audits covering restricted columns, role flags, membership/ownership and schema/database CREATE denial. Live Share proof, 20-concurrent reveal, password, expiry and revocation checks also passed. Corrected free-image startup and the limited idle/smoke checks are recorded above.

Those checks used the separate private runner on an internal network with no published ports, not the normal public Compose deployment. Remaining acceptance is:

1. An operator-licensed Linux image build and fresh startup. Private free-image idle results do not establish workload capacity.
2. The normal public Compose path with real DNS/ACME, approved custom domains, denied hostnames, OAuth callbacks and verified-email restrictions using installation-owned provider apps.
3. A CLI-to-edge tunnel, SDK telemetry ingestion/query against the installation's Tinybird workspace, successful background jobs and queue recovery, and the full Secrets lifecycle against its stores.
4. Worker-specific network denial tests before enabling public Uptime probes, followed by monitor failure/recovery, acknowledgement/publication, email/subscriber delivery and unsubscribe.
5. Backup/restore, an image/migration upgrade, and workload sizing on the chosen host.

The private run exercised the actual bootstrap SQL and restricted credentials; unit tests alone would not establish those results. Local configuration validation still does not authenticate external tokens or verify certificates, provider callbacks or a firewall. Worker liveness is not job readiness. The parser blocker identified below was remediated for the separate limited dashboard preview; full public functional acceptance remains outstanding.

## Parser security blocker identified during private rehearsal

This subsection records the pre-remediation state. The subsequent patch and limited public preview are recorded below; the earlier private image has not become the public dashboard image.

The license-free dependency install reported 64 audit findings, including 5 critical groups; those critical groups also appear with development dependencies omitted. The public free icon pack has no transitive dependencies or audit advisory.

The current lockfile resolves production `@tanstack/react-start` → `@tanstack/start-server-core` → `seroval` to **1.4.2**. The fresh Nitro output contains that version and calls its `fromJSON` parser on incoming server-function context. This is a production-reachable deserialization boundary, not just unused build tooling. The upstream [resolver-confusion advisory](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-mv8w-475r-vwqw), [subsequent bypass advisory](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-p6vx-979v-rg4c), and [memory-exhaustion advisory](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-jp82-f5mq-hwhp) require remediation before public exposure. Version 1.6.2 addresses the two critical findings but remains affected by the high-severity memory-exhaustion finding; **1.6.3 is the minimum covering all three reported Seroval advisories**, not a clearance of all application security findings. An upgrade must be followed by fresh dependency/artifact audits and regression tests, not a blanket `npm audit fix --force`.

Astro is also an affected production dependency, but an attacker-controlled image-optimization path was not established in the inspected source. The specific Better Auth prerequisites reviewed were absent or outside the affected installed-version range; that does not clear its other findings. No exploit attempts, package upgrades or production-version checks were performed. The Ops rehearsal remains private with no published application ports and is not a security release clearance.

## Authorized dashboard-only public preview (initial closed mode)

On the operator's request, `ops.outray.dev` was added to the existing Cloudflare zone as a DNS-only A record for `209.74.86.89`, TTL 300. No existing records or zone-wide TLS settings were changed. Both Cloudflare and Google's public DNS resolvers returned the new address. The development machine retained a negative system DNS cache, so external origin checks used the exact public address with the correct hostname/SNI and **normal certificate verification**; the VPS also passed a normal-DNS HTTPS request.

The root lockfile now pins Seroval **1.6.3** through a narrow override. Only its version, registry tarball URL and verified integrity changed in the lockfile. A fresh Node 22 free-mode install passed, followed by 17 focused parser/round-trip/request-middleware/auth-policy/session-cache checks. All eight apps rebuilt with zero cached tasks (11/11 tasks, 1m7.063s). A followed-symlink audit found only Seroval 1.6.3 in the actual Nitro trace. Root and clean build-source manifests matched: 1,060 files, digest starting `ed744cd4dc14`. Audit now reports 63 findings and four other Critical groups; this targeted patch and prerequisite review are **not** blanket security clearance. Status and Share remain private; deny the status service's unused `/_image` endpoint before exposing that service.

The separate `Dockerfile.preview` verified the full audited artifact/source manifest, then copied only dashboard Nitro output and the manifest into a non-root Node 22 runtime. It contains no root/workspace dependencies, migration runner, environment files or Pro icons. The resulting `outray-console-preview:patched` image is 421,569,958 bytes, image ID `sha256:a272560838cdcb6af096596925650b6792883964da3daeca783d0814bd4165f1`.

`outray-ops-public-web` runs read-only on the existing internal network, without published ports. It preserves the rehearsal's closed signup, empty OAuth/Tinybird/email credentials and disabled public Uptime probes. PostgreSQL/Redis deep health passed before public proxy opt-in. The dedicated Caddy 2.11.7 gateway first served maintenance 503 while issuing its Let's Encrypt certificate, then switched to the patched privately healthy dashboard. Certificate/config volumes were retained when the exact owned gateway container was replaced. Actual Docker 29 checks required two covered adjustments: retain the official Caddy binary's NET_BIND_SERVICE capability during network-isolated syntax validation, and recognize Docker's normalized `CAP_NET_BIND_SERVICE` spelling without granting additional capabilities.

Public checks passed:

- `/` and `/login` returned HTTP 200; all three referenced JavaScript/CSS assets returned 200.
- HTTPS certificate verification passed without `-k`; HTTP redirected to the fixed HTTPS Ops origin with 308.
- An unrelated HTTP Host and a mismatched TLS SNI/Host request both returned 421.
- `/api/health?deep=true` reported healthy local PostgreSQL and Redis.
- Only Caddy publishes TCP 80/443. Database, Redis and dashboard have no host port bindings; Caddy's admin and UDP ports are not published.
- The public dashboard, Caddy and its required PostgreSQL/Redis containers use `unless-stopped` restart policy. Existing private app containers and all data volumes were retained.

At this initial checkpoint it was a publicly reachable **login preview**, not a usable signed-in console. OAuth was configured in the later checkpoint below; Tinybird is still absent. Normal full-deployment preflight remains strict. Other product endpoints were not added to DNS or exposed. See `preview/README.md` for repeatable maintenance/proxy commands.

## Authorized GitHub console and self-hosted entry point

The operator supplied installation-owned GitHub OAuth credentials. They were
transferred over SSH stdin with terminal echo disabled and saved only in the
mode0600 `/opt/outray-ops/config/instance.env`. The additive credential updater
changed only the GitHub ID/secret fields and preserved every other value. The
verified-email signup policy remains the two approved addresses, with no allowed
email domains. A read-only database audit found zero users before enabling access.
Hosted environment files, credentials, stores and the old edge VPS were untouched.

Self-hosted `/` resolves the existing server session and redirects before landing
render to `/login` or `/select`. Hosted `/` retains the landing page without an
additional session lookup. Installation login/signup views show only configured
providers and administrator guidance, not hosted marketing or signup upsells.
The selected GitHub email must be verified and allowlisted; the installed provider
may prefer a public profile email over the primary email. The allowlist is a
signup gate, not retroactive revocation of existing accounts.

Verification: 67 focused auth/root/session/security tests passed, including real
TanStack router tests for anonymous/authenticated redirects, pending-session
zero landing renders and unchanged hosted behavior. Nine preview safety tests
and three private credential-update tests passed. The broader Node22 packaging,
artifacts, rehearsal and preflight suite passed 47 tests with one optional local
Compose skip. All eight applications rebuilt in explicit free mode with no OAuth
credentials in the build environment: 11/11 tasks, zero cached, 59.398s. Root and
fresh-build source manifests matched 1061 files, SHA256
`5066804ace04f42640ef8d23cc73fa9d2a153c736af7c40cf516bc6ea8638ac4`.

The standalone `outray-console-preview:github` image is 421,604,258 bytes, ID
`sha256:684f7de9afac65075cc24500872f9a9ce84d7096f869818e0fa4ffa6ad18f2ec`.
The gateway entered owned maintenance before replacing only the exact owned
public web container. Prior image/artifacts remain recoverable; PostgreSQL,
Redis, private apps and certificate volumes were retained. The web now has its
own labelled outbound bridge for GitHub; only that web container joins it. Caddy
keeps separate ACME egress. PG/Redis/private apps remain internal-only. This is
general outbound networking, not a destination-filtering firewall. Google,
Tinybird, mail, billing and public Uptime probes/notifications remain disabled.

Live checks passed:

- Anonymous `/` returned307 with `/login`; `/login` returned200 with GitHub only
  and no hosted marketing. Three referenced JS/CSS assets returned200.
- `/api/auth/ok` returned200. GitHub sign-in initiation returned200, generating
  a GitHub authorization URL with the configured client ID, state, `user:email`
  scope and exact `https://ops.outray.dev/api/auth/callback/github` redirect URI.
  State, cookies and credentials were not printed. Unconfigured Google returned404.
- PostgreSQL/Redis deep health returned200, with local checks completing in4ms.
- External HTTPS certificate verification passed without `-k`; HTTP308, unknown
  HTTP Host421 and TLS SNI/Host mismatch421 remained intact.
- Actual runtime inspection confirmed no dashboard/PG/Redis host ports, exactly
  the intended network sets and preserved restart policies. GitHub HTTPS egress
  returned200. Scanning 6580 runtime output files found no GitHub client secret;
  Node22 and the actual traced Seroval1.6.3 were rechecked inside the container.

GitHub authorization initiation is **not** a completed token exchange or sign-in.
The operator must register the exact callback in the OAuth app and finish sign-in
with an approved verified account. Live callback completion, nonapproved-account
denial and session continuity remain browser acceptance checks. Tinybird and the
rest of full product/public deployment acceptance remain outstanding.

## Independent Tinybird workspace and read-only console (2026-10-09)

The operator created `internal_ops`, ID
`b603a640-07eb-4089-baaa-99840b7ac34a`, in the existing Tinybird account. Its
identity and empty resource inventory were verified before any mutation. An
isolated temporary CLI project deployed, checked and promoted the repository's
7 datasources and 33 endpoint pipes into that workspace only. The local `.tinyb`
profile remained pointed at the original `OutRay` workspace, with its contents
unchanged. No hosted workspace resources or customer telemetry were changed.

The two deployment-generated runtime tokens were verified against the exact
resource inventory: `PIPES:READ` on 33 endpoints and `DATASOURCES:APPEND` on 7
datasources, with no additional, wildcard, admin or deployment scopes. Only these
scoped values were transferred through SSH stdin to the mode0600 independent
runtime configuration. The atomic updater preserved all unrelated settings;
account/admin credentials were never sent to the VPS, image, argv or logs. An
initial config update refused the absent derived `CONSOLE_PUBLIC_URL`; the helper
now validates the installation's actual `OUTRAY_APP_HOST` and checks the derived
origin when present. The failed attempt did not write the configuration.

One synthetic event with a unique dummy organization and one-day retention
verified APPEND-to-READ delivery: one request, 8 total bytes and 7ms duration.
There was no customer-data copying or bulk seeding. The repeatable smoke helper
explicitly requests `wait=true` committed-row acknowledgements.

Both preview runners now require explicit `--enable-tinybird` to add only the API
origin and READ token to the public dashboard. GitHub remains a separate opt-in;
both APPEND-token environment variants remain forbidden in the web container.
The gateway entered owned maintenance before replacement, then resumed proxy
mode. The same audited standalone image was reused without a rebuild:
`sha256:684f7de9afac65075cc24500872f9a9ce84d7096f869818e0fa4ffa6ad18f2ec`.
Data/certificate volumes and private apps were retained; no extra network, DNS
record, Caddy route or published port was added.

Live checks:

- Actual web environment matched the private READ token, contained neither
  APPEND token, and retained exactly the internal and web-only egress networks.
- `trace_stats`, `logs`, `metric_catalog` and `alert_service_heartbeat` queries
  executed from inside the public dashboard container and returned200 with
  valid empty evidence. Direct SQL access to `tunnel_events` returned403.
- PostgreSQL/Redis deep health returned200. Anonymous observability API access
  returned401; anonymous `/` returned307 to `/login`; `/login` returned200 with
  successful TLS verification. HTTP308 and unknown-host421 remained intact.
- `npm run self-host:test`: 69 passed, one optional local Compose-plugin skip.

Public ingestion and Uptime probes remain disabled. The APPEND token is saved
for the next independently verified ingestion-service phase, not injected into
existing private apps. Browser sign-in, authenticated dashboard flows, tenant
isolation and public telemetry/queue acceptance are not claimed complete.

The operator's latest GitHub callback reached the user-create hook, but was
rejected by the verified-email signup allowlist. Sanitized logs showed the
explicit signup-restriction error rather than a token-exchange or database error.
The policy still permits only two approved email addresses; verification must not
be bypassed or the allowlist silently expanded.

The operator subsequently confirmed a typo in the approved Gmail address. The
private `self-hosted-config-allowlist.mjs` helper replaced only that explicitly
confirmed entry, preserved the OutRay email and all OAuth/Tinybird/instance
settings, and retained mode0600. Its seven synthetic safety tests and thirteen
preview tests passed. Only the owned public dashboard was recreated through the
maintenance/proxy procedure using the same image and both existing mode flags.
Runtime checks confirmed the corrected exact two-email list, removal of the old
entry, no domain-wide signup, preserved GitHub and READ credentials, and no
APPEND credentials or dashboard host ports. PostgreSQL/Redis deep health, public
login/TLS and the auth health endpoint passed. No database or hosted configuration
was modified. A fresh browser GitHub sign-in is still required to confirm the
completed user session; the configuration correction alone is not that proof.

## Workspace onboarding refresh (October 9)

Self-hosted workspace creation now ignores hosted branding/future-name
reservations, including `outray`. Actual top-level app routes and static
directories remain unavailable to avoid routing collisions. Both the availability
endpoint and Better Auth creation hook use the same policy; existing workspace
URLs still cannot be reused. Hosted reservations are unchanged.

The root instance loader supplies the workspace URL prefix from the validated
`CONSOLE_PUBLIC_URL`, falling back to `APP_URL` or `BETTER_AUTH_URL`. Only its
hostname and port reach the form, including its first server-rendered view;
credentials, paths, queries and fragments are rejected.

Verification: 32 focused workspace/auth/home tests passed; changed-file lint
passed; the self-hosting suite passed 76 tests with one optional local
Compose-plugin skip. Fresh Node22/free builds completed all 11 tasks without
cache reuse. Source-matched artifacts were audited and used to replace only the
owned Ops console through maintenance/proxy mode. Previous sources, artifacts,
image and persistent volumes were retained. No database/schema, provider
configuration, or hosted deployment changes were made.

Live HTTPS checks confirmed login and PostgreSQL/Redis deep health (200),
anonymous workspace availability denial (401), and the public instance function
returning `ops.outray.dev/` without the old prefix. Runtime isolation, the exact
approved signup policy, GitHub and Tinybird READ settings were preserved; APPEND
credentials remain absent. Successful workspace creation in the user's signed-in
browser is left for the operator, not claimed from the anonymous health checks.

## Tunnel analytics timestamp repair (October 10)

The Ops tunnel overview returned 500 because the thirteen tunnel query pipes
declare required UTC `DateTime64` parameters, while dashboard callers sent zoned
ISO strings. Live Tinybird responses rejected the trailing `Z`. The repeated
browser requests were normal query retries and periodic refreshes, not a new
frontend polling loop.

The shared HTTP client now normalizes only those pipes' declared datetime fields
to UTC SQL timestamps with millisecond precision, before constructing the wire
URL and cache key. Public API timestamps, caller objects, tenant parameters,
unrelated observability queries and no-store capture behavior remain unchanged.
SQL definitions and provider resources were not modified.

Verification: 114 focused tests passed, including twenty-one actual HTTP-client
regression tests and exact coverage of all thirteen pipe definitions. Changed-file
lint passed. The self-hosted suite passed 76 tests with one optional local
Compose-plugin skip. Fresh Node22/free builds completed all 11 tasks without
cache reuse. Source-matched artifacts passed the existing JS-only dependency and
public-origin audits, then only the owned Ops console was replaced through the
maintenance/proxy procedure. Previous source, artifacts and images were retained.
No database, schema, credentials, Tinybird resources or hosted deployment changed.

Inside the replacement console, the freshly compiled query helper received ISO
inputs and made eight successful live READ requests: overview statistics and
chart queries for 1h, 24h, 7d and 30d. Outgoing timestamps were checked at the HTTP
boundary; all eight returned 200 with valid empty diagnostic-tenant evidence.
Credentials and result contents were not printed, and no events were written.
Public login and PostgreSQL/Redis deep health returned 200 with verified TLS;
anonymous overview access remained 401. Runtime checks preserved the exact signup
allowlist, GitHub and READ configuration, non-root/read-only policy, the two
existing networks, no dashboard host ports and no APPEND credentials.

Public ingestion and probes remain disabled. A signed-in browser refresh is
still the operator's final UI check; these diagnostics did not impersonate a user
or create an authentication session.

## Approved metallic self-hosted favicon (October 10)

The operator approved the local transparent polished-gold SVG preview. The root
route now chooses it from the existing public instance context, including the
first server-rendered login and console view; no extra configuration request was
added. Nested landing/product heads cannot override it. Hosted console implicit
favicon behavior and the hosted landing/product SVG remain unchanged. The mark
preserves the original vector geometry and transparent gaps, with no background
shape, external resources, script or animation.

Verification: eight favicon regressions and four existing self-hosted-home tests
passed, including actual router/SSR head aggregation, hosted icon preservation
and failed-config metadata/style preservation. Changed-file lint and diff checks
passed. The self-hosting suite passed 76 tests with one optional local
Compose-plugin skip. Fresh Node22/free builds completed all 11 tasks without
cache reuse; source-matched artifacts passed the existing audits. Only the owned
Ops console was replaced through maintenance/proxy mode, retaining prior source,
artifacts, images and persistent volumes. No database/schema, credentials,
provider configuration or hosted deployment was changed.

Live HTTPS checks confirmed exactly one gold icon in the login's server-rendered
head, the SVG's correct content type and byte-for-byte equality with the approved
local asset, and successful TLS verification. Login, SVG and PostgreSQL/Redis deep
health returned 200; anonymous overview access remained 401 and `/` still
redirected to login. Runtime checks preserved non-root/read-only operation, no
dashboard/database host ports, the two existing networks, the exact signup
allowlist, GitHub and Tinybird READ configuration, and no APPEND credentials.
Public ingestion and probes remain disabled. Final browser appearance/cache
refresh is left to the operator.

## Authorized public status hosting (October 10)

Only the independent Ops VPS (`209.74.86.89`) was changed. Cloudflare received
two new DNS-only A records, `status.ops.outray.dev` and
`*.status.ops.outray.dev`, pointing to that host with TTL300. Existing console
and hosted DNS records and zone-wide settings were left unchanged. The canonical
hostname is also the custom-domain CNAME target; a customer-selected hostname
still requires the console-generated TXT challenge and verification. No custom
domain, status page, component or incident was created or published by this work.

The new private `/internal/status-domain-check` endpoint authorizes only the
canonical status host, published one-label page hosts, and active custom status
domains bound to a published page in the same organization. Infrastructure,
tunnel namespaces, malformed names and failed database lookups fail closed. The
existing combined edge checker was not changed into a public status authorizer.
The public renderer now also checks organization equality on its custom-domain
join, including requests made after a certificate has already been issued.

Verification: 85 self-hosted tests, 14 internal-check tests and 21 status tests
passed (120 total, no skips). This includes real isolated Caddy routing/header
tests, malformed and denied certificates, cross-tenant/unpublished/revoked
bindings, private service ownership, unsafe-image/isolation refusal, startup
failure and idempotent reuse. Focused internal-check TypeScript and status Astro
checks passed. Fresh Node22/free-mode builds completed all 11 tasks with zero
cache hits (1m9.817s); all eight application outputs and three dependency outputs
passed the source, JS-only traced-dependency and public-origin audits. Source
digest: `b126ff141f3014de6b26b4ef562107d562965c1ef5fab0121672d14048728f79`.

The status-only Linux image passed artifact and license-free dependency checks.
Its runtime contains the new status renderer/checker, not a dashboard or tunnel
runtime, and its network-free audit verifies Node22, patched Seroval, expected
source, the new ask endpoint and required Linux dependencies. Dependency
installation still reports the previously recorded 63 audit findings (including
four Critical groups); this restricted routing and parser guard are not a blanket
dependency security clearance. The unused Astro image endpoint is blocked at the
public gateway.

During final image unpacking, the operator resized the VPS and it rebooted.
After reconnecting, the host reported approximately 4 GB RAM, a 58-GB root
filesystem and no swap in use. The fresh image unpacked and passed its runtime
audit after the interruption. Only the abandoned network-free audit container
was removed; prior source/artifact backups, images, application containers and
data/certificate volumes were retained. No database migration or credential
change was performed.

Image: `outray-ops-status-preview:public`, ID
`sha256:86bbbf89cbedcf00d257feab0df63a916c6170c42fc93ea574b57aa984a68a4e`.
`outray-ops-public-status` and `outray-ops-status-check` both passed real Docker
health checks, run as `node` with read-only filesystems and dropped capabilities,
have no host ports or data mounts, and join only the owned internal network.
They receive the independent database/signing configuration, not OAuth, Tinybird,
vault, email, billing or license credentials. Restart policy is `unless-stopped`.
The public console image remained byte-for-byte unchanged.

The pinned Caddy2.11.7 image adapted the status configuration before replacing
only the exact owned gateway. It retains TCP80/443, strict SNI/Host checks, the
existing two gateway networks and persistent certificate/config volumes. It
proxies directly to the new private status renderer, strips spoofable headers
before injecting its trusted edge secret/client IP, and uses only the new
status-specific ask endpoint. The runtime credential is absent from adapted
JSON, labels and command arguments. Status remains independently routed during
console maintenance; future maintenance/proxy commands must retain
`--enable-status` and refuse accidental removal.

Live checks passed:

- Authoritative and public recursive DNS resolve canonical and wildcard names
  to the independent VPS.
- Normal HTTPS certificate verification passes for the canonical status host.
  Its root redirects302 to `/not-found` (404), because a read-only database check
  confirmed zero configured pages. This is hosting acceptance, not a published
  page or incident-flow acceptance.
- Canonical status and console HTTP redirect308 to HTTPS; unpublished page,
  tunnel/ingest/share infrastructure and unknown custom HTTP hosts return403.
- Unpublished page and edge TLS handshakes are denied; mismatched SNI/Host
  returns421. No certificate was issued to those denied names.
- Status `/health`, `/api/health`, `/internal/status-domain-check`, `/metrics`
  and `/_image` return404 without exposing private handlers.
- Console login and PostgreSQL/Redis deep health return200, anonymous `/`
  still redirects307 to login, and anonymous Uptime settings remain401.
- Live private authorization checks allow canonical status only; unpublished,
  nested, infrastructure, tunnel, unverified and malformed names are denied.
  Renderer database health, exact runtime isolation and gateway ownership pass.

The post-start snapshot measured about 49 MiB for the status renderer, 24 MiB
for its checker, 272 MiB for the console and 16 MiB for Caddy. These idle figures
are not workload sizing evidence. No authentication session was manufactured,
page was published, subscriber signed up, email sent, or monitor probed. A real
published page, organization-owned custom-domain TLS and incident updates remain
operator acceptance steps. Public probes, telemetry ingestion and subscriber
delivery remain disabled and require their separate setup/verification.

## Organization-owned status hostname (October 10)

The operator created and published the `outray` status page in the independent
Ops console. On the operator's request, Cloudflare received only two new
DNS-only records in the `outray.co` zone: the page's exact TXT ownership
challenge at `_outray-challenge.status.outray.co` and
`status.outray.co` CNAME to `status.ops.outray.dev`, both TTL300. The challenge
was checked against the independent database before writing DNS; existing
records, hosted services and zone-wide settings were left unchanged.

The operator completed **Verify DNS** in the authenticated Ops console. A
read-only database check then confirmed the custom domain was active and bound
to the published page in the same organization. Authoritative and public
recursive DNS returned the expected challenge and target. External HTTPS at
`https://status.outray.co/` returned200 with normal trusted certificate
verification, without `-k`; HTTP returned308. Console deep health remained200.
No authentication session, page, component or incident was manufactured by the
diagnostic checks. This completes this page's DNS/TLS acceptance, not incident
publishing, subscriber delivery or monitoring acceptance.

## Independent Ops probe-only startup (October 10)

The existing restricted preview intentionally had no running public Uptime
worker. A read-only check found one enabled monitor configured for manual
incident publishing, no prior check timestamp and no stored check evidence.
The operator requested that monitoring run. This authorizes the separate
probe-only runtime, not notifications, public ingestion or hosted changes.

The dedicated image and guarded runner use the fresh audited Node22/free-mode
source, a minimal pure-JS database dependency closure, an inert boot wrapper,
and host plus actual-container-namespace isolation. Docker automatic restart is
disabled. The separate systemd supervisor gates initial activation and every
recovery on policy/connectivity checks, then checks for policy drift every
15 seconds. Console/status configuration and their existing flags remain
unchanged. Public IPv4 HTTP/S and the selected resolver are allowed, with only
the inspected independent PostgreSQL address on TCP 5432 exempted from private
range denial. IPv6, host/private/metadata/loopback, Redis, alternate resolvers and
other ports are denied. Notification delivery is explicitly disabled.

Image assembly passed for `outray-ops-probe-preview:public`, ID
`sha256:6478c48bb803cb045b949f1b01be47e5a1cb8bdaf5575b3e06340325ccce9aae`.
The host's verified Node22 runtime is `/usr/local/bin/node`; the policy and
worker units use that path, rather than an absent `/usr/bin/node`.

Verification: all 98 `scripts/self-hosted-*.test.mjs` checks passed, including
24 new probe runner/network checks. The Uptime worker's 19 tests and TypeScript
check also passed. The existing audited application-source digest remained
`b126ff141f3014de6b26b4ef562107d562965c1ef5fab0121672d14048728f79`;
no application rebuild or hosted configuration change was needed. A real-host
serialization mismatch was corrected by placing the embedded-DNS conntrack
reply-direction option after its original destination/port options. The exact
query/reply restriction was retained; no broad loopback or established-traffic
exception was introduced.

Live checks passed on the actual worker namespace before activation:

- Both the Docker embedded resolver and direct `1.1.1.1` DNS resolved a public
  name. `https://example.com/` passed normal trusted TLS verification, and the
  inspected private PostgreSQL address accepted TCP 5432.
- All 12 denied connection attempts increased the namespace's DROP counters:
  ordinary and embedded-resolver loopback non-DNS traffic, metadata, private
  space, Redis, the Ops public host, the probe itself and bridge gateway,
  an alternate resolver, another public port, IPv6 `::1`, and PostgreSQL's
  non-database port. Socket refusal alone was not counted as firewall acceptance.
- The host and namespace policies matched the exact intended owned rules.
  Only the dedicated probe bridge was attached; core services retained their
  existing networking and published ports.

Both `outray-ops-probe-policy.service` and
`outray-ops-uptime-probe.service` are enabled and active. Starting the supervisor
after manual activation safely reused the same healthy container after repeating
ownership, firewall and connectivity verification. A controlled
`systemctl restart outray-ops-uptime-probe.service` then cleanly stopped the
worker, replaced only its exact owned container, and changed its host PID from
96822 to 105821. The full activation gate passed again; worker readiness was
recorded at 07:47:48 UTC. The supervisor remained active with no failure restart
(`NRestarts=0`) and a successful preceding stop (`ExecMainStatus=0`). A full VPS
reboot was not performed during this acceptance check.

Actual independent-database evidence advanced from zero checks to two by
07:46:23 UTC, three by 07:47:23 UTC, and four by 07:48:24 UTC, including a successful
check after the supervised restart. The one enabled monitor was Up, its failure
streak was zero, its lease was cleared and its next check was scheduled 60 seconds
later. Daily aggregation contained four checks and four successes. The
notification queue remained empty. This demonstrates real monitoring and
continued scheduling, not just process readiness.

Final runtime inspection confirmed healthy, non-root/read-only operation, no
published worker ports, Docker restart policy `no`, and approximately 21.86 MiB
usage against the 256 MiB limit. These short-run figures are not load/sizing
evidence. After probe startup/restart, `https://status.outray.co/` still returned
200 with trusted HTTPS, HTTP redirected 308, and console PostgreSQL/Redis deep
health returned 200. No hosted store, database migration, synthetic monitor,
authentication session, email or webhook was created or sent. Notification
delivery, public telemetry ingestion, private/IPv6 target support and longer-run
failure/incident flows remain separate acceptance work. See `preview/README.md`
for the exact scoped operator recipe; never start an unguarded worker or reuse
hosted stores.

## Independent Ops public ingestion and prepared hosted instrumentation (October 10)

The operator authorized configuring independent Ops ingestion for the hosted
`outray.co` web application, then chose to push/deploy the hosted changes
themselves. No hosted web release, Git commit/push, hosted migration, tunnel
restart, or hosted PostgreSQL/Redis/Tinybird mutation was performed.

Only the new DNS-only `ingest.ops.outray.dev` A record was added, pointing to
`209.74.86.89` with TTL300. Public resolver checks and normal trusted HTTPS
verification passed. The dedicated ingestion worker uses the audited Node22/free
artifact source digest `b126ff141f3014de6b26b4ef562107d562965c1ef5fab0121672d14048728f79`.
It is non-root/read-only, has no published ports, has a512MiB memory limit, and
joins only the independent internal network and its own outbound bridge.
PostgreSQL, Redis, HTTP health, and all three live queue consumers were verified
before exposing it through the existing Caddy gateway. Caddy remains the only
process publishing TCP80/443; console/status services and data/certificate
volumes were retained. Maintenance requires retaining the explicit status and
ingestion flags to avoid silently cutting either service off.

One hashed machine token was created for the existing independent Ops `outray`
organization and verified owner, with only `observability:write`, no Secrets
scope and no expiry. Its raw value is private in the independent integration
file and the local ignored mode0600 `.env.prod`; no provider/admin credential
was added to the hosted integration. Tinybird READ and APPEND credentials retain
their separate exact scopes in `internal_ops` only.

Live acceptance passed:

- Trusted public ingestion health returned200; unauthenticated OTLP returned401
  and an unknown ingestion route returned404.
- A synthetic OTLP trace, correlated log and integer gauge each returned200,
  then the scoped READ endpoints returned exactly one trace, log, gauge(value7)
  and request, matched by unique IDs/service name.
- The actual prepared SDK/TanStack adapter exported a synthetic request without
  starting a server. Independent queries verified one trace/request plus
  `http.server.request.count`=1, a duration histogram, and active requests=0.
  The query value and test cookie were absent from returned trace/request data.
  Force-flush and shutdown exported two cumulative metric snapshots; the reader
  correctly returned the cumulative count1, not a doubled request count.
- All three queues had zero queued and pending records after the successful
  checks. Two earlier failed synthetic metrics remain in the metric dead-letter
  stream as diagnostic evidence; no new failures were added by the passing
  checks. Trace/log dead-letter streams were empty.
- Console PostgreSQL/Redis deep health and `https://status.outray.co/` remained200
  after the gateway change and metric-schema repair. Probe/notification settings
  were unchanged; notification delivery is still disabled.

The first test caught a real Tinybird schema mismatch: normalized OTLP integers
are exact decimal strings, but `ValueInt Nullable(Int64)` rejected them. The
datasource now stores `Nullable(String)` with a null-preserving forward cast;
existing three metric readers already convert either representation to Float64.
Only `otel_metrics` was changed in `internal_ops`: a scoped deployment check
verified one datasource change and zero token changes before staging/promotion.
Hosted Tinybird and the project's original `.tinyb` profile remained unchanged.
All ten quarantined rows were retries of the two synthetic gauges; there were
zero committed metric rows before repair. Their redacted error/count evidence
and Redis dead letters were retained. Tinybird recreates its quarantine table
during datasource evolution; no customer telemetry was removed or copied.

Verification: all 145 self-hosted script checks and all 20 ingest tests passed.
The SDK/adapter/web focused suites passed 35 tests, focused TypeScript checks
passed, and the full filtered web production build passed all six Turbo tasks.
Browser output contained none of the dedicated server environment-variable
names. Source diff hygiene passed. No development server was started.

The hosted server integration is opt-in and metadata-only, excluding credential
and Secrets routes, bodies, headers, query values, raw console capture, automatic
HTTP/SQL/logger instrumentation, and exception text/stacks. The four dedicated
variables are prepared privately in `.env.prod` for the user to add to Brimble
project `outray` at runtime. That file is not committed or pushed. Real hosted
`outray-web` traffic remains **unverified until the user releases the web app**.
The existing Woodpecker workflow still deploys hosted DB/Tinybird/status/edge/
probe on pushes to `main`/`next`; pause it before a web-only release that must not
touch those services. See `apps/web/README.md` for the release handoff.

## Payload and console-log capture preparation (October 10)

The operator subsequently requested payload and log capture. This supersedes the
metadata-only capture policy above in the prepared hosted web integration; it
does not deploy that integration or change independent Ops runtime configuration.
The same four dedicated server variables opt in, without additional credentials.

The adapter now captures supported JSON/form payloads with a16KiB body limit and
8KiB header limit, redacting credential fields and opaque nested customer capture
fields. Original application request/response bodies remain intact. Unsupported
binary/HTML/streaming/compressed bodies are skipped. Bounded cloned-body reads
can still wait for slow streams; this is not latency-free capture.

Console capture retains local output and exports bounded, redacted logs with
active trace correlation. A request-scoped AsyncLocalStorage predicate suppresses
logs from credential and Secrets routes, including their asynchronous work,
without suppressing concurrent allowed requests. The SDK context predicate fails
closed if it throws. Background logs are enabled. Automatic client/database/logger
instrumentation and span exception text remain disabled. Console error messages
and stacks can be exported after best-effort redaction; arbitrary secrets/PII
must not be logged. Neither the predicate nor convenience-method redaction is a
DLP guarantee, and direct low-level OpenTelemetry logger calls bypass them.

The actual final SDK and TanStack adapter exported one synthetic allowed request
and one correlated console log through trusted HTTPS to independent Ops, without
starting a local server. Scoped `internal_ops` readers verified:

- Exactly one trace, request and log for the unique verification service.
- Request/response headers and JSON bodies captured; useful operation/result
  fields retained and test passwords, API keys, cookies, authorization values,
  opaque nested bodies and log access tokens redacted.
- Query values absent, log trace/span IDs matched, and the ignored Secrets-route
  diagnostic absent. Both handlers executed normally and preserved their bodies;
  both console calls still reached the original local writer.

All52 focused SDK/adapter/core/web tests passed (23+12+6+11), focused TypeScript
checks passed, and the final source-matched filtered web production build passed
all six Turbo tasks. Browser output contained none of the dedicated server
environment-variable names; source diff hygiene passed. No Git commit/push,
package publication, hosted release, migration or hosted store mutation occurred.
Real hosted traffic remains unverified until the user releases the web app.
The existing Woodpecker hosted-service deployment warning above still applies.

## Existing unrelated dashboard diagnostics

The full `tsc --noEmit -p tsconfig.app.json` still reports existing errors in these groups, outside the changed self-hosted paths:

- Unused imports/variables: landing hero/Vite hero, report-bug modal, Secrets project helpers, admin users, invitation acceptance.
- Type mismatches: observability alert metric nullability, organization-access session generics, admin organization metrics, request/trace boolean query filters.

The Vite build succeeds, but retains existing Recharts circular-chunk and large-chunk warnings. These were not changed as part of self-hosting.

No npm package was published. CLI custom-origin isolation is available in this checkout, not automatically in previously installed CLI versions.
