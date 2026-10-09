# Self-hosted verification — 2026-10-09

These checks used synthetic configuration, temporary CLI files, mocked database/provider clients, and source builds. No production credentials, databases, DNS records, or deployments were changed. No application server or container was started.

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

## Required isolated-host acceptance

Docker CLI is installed, but its Compose plugin is unavailable and no Docker daemon is reachable at the current socket. Therefore these are not yet verified:

1. Image construction with the build-only icon credential, then fresh Compose startup.
2. Applying every committed migration to a disposable PostgreSQL 16 database, running Share-role bootstrap twice, and testing actual restricted credentials against vault/account tables, column grants, and elevated permissions.
3. Concurrent Share reveal/revocation/expiry through the restricted runtime role. The existing live test needs `TEST_SHARE_DATABASE_URL` pointing only to a migrated disposable database.
4. Public DNS/ACME, approved custom domains, denied hostnames, OAuth callbacks, and verified-email restrictions with real provider apps.
5. A CLI-to-edge tunnel, SDK telemetry ingestion/query, background queue recovery, and Secrets lifecycle against that installation's stores.
6. Worker-specific network denial tests before enabling public Uptime probes, followed by monitor failure/recovery, acknowledgement/publication, subscriber delivery, and unsubscribe.
7. Backup/restore, an image/migration upgrade, and workload sizing on the chosen host.

Share-role unit tests prove control flow and requested privilege checks, not PostgreSQL's actual execution of the bootstrap SQL. Local configuration validation does not verify external tokens, certificates, provider callbacks, or a firewall. Worker health checks indicate process liveness, not successful jobs.

## Existing unrelated dashboard diagnostics

The full `tsc --noEmit -p tsconfig.app.json` still reports existing errors in these groups, outside the changed self-hosted paths:

- Unused imports/variables: landing hero/Vite hero, report-bug modal, Secrets project helpers, admin users, invitation acceptance.
- Type mismatches: observability alert metric nullability, organization-access session generics, admin organization metrics, request/trace boolean query filters.

The Vite build succeeds, but retains existing Recharts circular-chunk and large-chunk warnings. These were not changed as part of self-hosting.

No npm package was published. CLI custom-origin isolation is available in this checkout, not automatically in previously installed CLI versions.
