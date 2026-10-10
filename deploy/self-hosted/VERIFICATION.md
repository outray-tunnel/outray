# Self-hosted verification — 2026-10-09

The initial source-only checks below used synthetic configuration, temporary CLI files, mocked database/provider clients, and source builds; no application server or container was started during that phase. The later independent-host rehearsal and authorized dashboard-only public preview are recorded separately. Hosted production databases, Redis, Tinybird, existing DNS records and services were not changed; only a new independent Ops DNS record was added in the public-preview phase.

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

## Existing unrelated dashboard diagnostics

The full `tsc --noEmit -p tsconfig.app.json` still reports existing errors in these groups, outside the changed self-hosted paths:

- Unused imports/variables: landing hero/Vite hero, report-bug modal, Secrets project helpers, admin users, invitation acceptance.
- Type mismatches: observability alert metric nullability, organization-access session generics, admin organization metrics, request/trace boolean query filters.

The Vite build succeeds, but retains existing Recharts circular-chunk and large-chunk warnings. These were not changed as part of self-hosting.

No npm package was published. CLI custom-origin isolation is available in this checkout, not automatically in previously installed CLI versions.
