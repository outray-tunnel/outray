# Hosted plan limits

The authoritative entitlement matrix is `shared/hosted-plan-limits.ts`. These limits are independent of the payment provider. Existing subscription prices remain unchanged.

| Organization allowance | Free | Ray | Beam | Pulse |
| --- | ---: | ---: | ---: | ---: |
| Concurrent tunnels | 2 | 3 | 5 | 20 |
| Tunnel bandwidth/month | 2 GiB | 25 GiB | 100 GiB | 1 TiB |
| Reserved tunnel subdomains | 1 | 5 | 20 | 200 |
| Tunnel custom domains | 0 | 1 | 5 | 25 |
| Organization members | 1 | 3 | 5 | 25 |
| Telemetry/month, shared across logs, spans, and metrics | 1 GiB | 5 GiB | 20 GiB | 100 GiB |
| Telemetry retention | 3 days | 14 days | 30 days | 90 days |
| Observability alert rules | 3 | 10 | 30 | 100 |
| Uptime monitors | 5 | 10 | 25 | 100 |
| Status pages | 1 | 2 | 5 | 20 |
| Status custom domain | Included | Included | Included | Included |
| Status page visitor analytics | — | Included | Included | Included |
| Active secret vaults | 1 | 3 | 10 | 50 |
| Active environments per vault | 3 | 5 | 10 | 20 |
| Active secret entries across the organization | 100 | 1,000 | 5,000 | 25,000 |

The existing UI may label binary allowances as GB; the actual limits use GiB (`1,073,741,824` bytes), consistent with the existing tunnel bandwidth convention. A key present in Development, Staging, and Production counts as three secret entries, not one.

## Enforcement behavior

- Entitlements are resolved from the authenticated organization's subscription, not a client-provided plan. Missing or unknown hosted plans use Free limits.
- Resource growth is checked server-side within the mutation transaction while holding the organization's PostgreSQL row lock. Simultaneous creations cannot all consume the last available slot.
- A downgrade does not delete existing resources. Reads, secret reveals, existing-secret updates, version rollbacks, and deletion remain available. New growth that exceeds capacity is rejected; secret APIs return HTTP 403 with `PLAN_LIMIT_REACHED` and limit/current/addition details.
- Member seats include members and unexpired invitation reservations. Invitation and member writes are serialized by the Better Auth adapter; accepting an invitation transfers its reserved seat. Successful membership expires its invitation reservations so later removal immediately frees capacity.
- Secret imports and multi-environment creation count all new entries. Restoring trash counts restored vaults, environments, and entries. Moving secrets between environments has no net increase in organization entries and remains possible at capacity. A newly created vault's three default environments must fit the configured per-vault limit.
- This is server enforcement, not a guarantee that every UI proactively disables every action at capacity. Imports can still preview before their final write is rejected.
- Telemetry admission uses a durable PostgreSQL organization/month usage counter shared by Node ingest and the Cloudflare Worker. UTC calendar-month allowances reset monthly even for annually billed subscriptions. Accepted normalized telemetry bytes consume the combined allowance; queue redelivery and derived analytics do not consume it again. The configured receipt mechanism avoids charging identical accepted chunks repeatedly.
- Exact normalized retries are deduplicated for 120 days, including JSON/protobuf retries and UTC month boundaries. Reshaping or rebatching an export can change its fingerprint and is not guaranteed to deduplicate. PostgreSQL and Queue storage cannot commit atomically: a process failure or ambiguous commit after queue acceptance can still cause at-least-once delivery or temporarily missing usage. Stable telemetry IDs preserve the existing delivery deduplication behavior; this is not an exactly-once billing ledger.
- Cron expires up to 1,000 old retry receipts per minute, without deleting monthly usage counters. Organization deletion cascades to its counters and receipts.
- Exceeding the telemetry allowance rejects new admission until allowance is available; it does not block viewing previously retained data. Retention is stamped with the plan at ingestion time; a later downgrade does not retroactively delete previously accepted rows or shorten their TTL. Existing retention policy remains separate from ingestion capacity.
- Uptime checks remain every 60 seconds. Raw uptime check history remains 30 days, with 90-day daily component history; the telemetry retention row above does not change those values.
- Multiple status pages use the per-plan allowance above. Free includes a status custom domain; paid-only tunnel custom domains remain unchanged.
- Visitor analytics collection and reports require a paid plan (or a self-hosted installation). History follows plan retention; a downgrade stops collection and blocks reports. See `apps/status/README.md` for privacy and deployment details.
- Polar revocation now clears paid capacity, and legitimate activation restores the product's plan. Cancelling at period end still preserves access until revocation. Historical already-revoked subscription rows are not automatically repaired by this change; those require separately approved reconciliation. Past-due/grace-period payment policy is unchanged.
- Encryption, redaction, production confirmation, scoped credentials, and revocation are not paywalled. Operational safety limits are separate from plan allowances. No new machine-token, share-count, secrets-history, or secrets-audit-retention quota is introduced here.

## Self-hosted installations

Self-hosted instances retain instance-owned limits, not hosted subscriptions or payment-provider gating. New positive-integer overrides are:

```dotenv
OUTRAY_TELEMETRY_BYTES_PER_MONTH=1099511627776
OUTRAY_MAX_SECRET_VAULTS=1000
OUTRAY_MAX_SECRET_ENVIRONMENTS=1000
OUTRAY_MAX_SECRET_ENTRIES=1000000
```

Existing `OUTRAY_MAX_UPTIME_MONITORS`, `OUTRAY_MAX_OBSERVABILITY_ALERTS`, tunnel/domain/member overrides, and `OUTRAY_RETENTION_DAYS` continue to apply. Values above are the Compose defaults, not mandatory; legacy `.env` files may omit the new overrides. The internal hosted Unlimited plan keeps its generous resource sentinels and unlimited telemetry allowance; it is not a public paid plan.

## Deployment requirement

Apply the checked-in migration `apps/web/drizzle/0029_organization_quotas.sql` to the intended environment before deploying the updated web, ingest, or cron services. It adds `organization_monthly_usage` and `organization_telemetry_receipts`; do not reset or delete the database. Use the existing migration-only deployment command from the correct configured environment:

```sh
npm run db:migrate:ci --workspace=outray-web
```

This change does not publish SDKs, configure Polar/Bachs checkout, migrate an environment automatically, or deploy services. Do not release an ingest build that expects the new usage tables before the migration is complete.
