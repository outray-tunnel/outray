import { HOSTED_PLAN_LIMITS, resolveHostedPlan } from "../../../../shared/hosted-plan-limits";
import { getBandwidthKey } from "../../../../shared/helpers";
import { instanceConfig } from "../../../../shared/instance-config";
import { enqueueProductEmail } from "../../../../shared/product-email-outbox";
import { TELEMETRY_USAGE_METRIC, telemetryUsagePeriod } from "../../../../shared/telemetry-usage";

export const USAGE_EMAIL_SCAN_INTERVAL_MS = 5 * 60_000;
export const USAGE_EMAIL_BATCH_SIZE = 200;

interface UsageEmailDatabase {
  query(sql: string, parameters?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

interface UsageEmailRedis {
  mget(...keys: string[]): Promise<Array<string | null>>;
}

interface ScanOptions {
  environment?: Record<string, string | undefined>;
  now?: Date;
  batchSize?: number;
}

interface OrganizationRow {
  organization_id: string;
  plan: string | null;
}

interface TelemetryUsageRow {
  organization_id: string;
  used: string | number;
}

/** Only real counters are eligible; malformed values must never create a warning. */
function counter(value: unknown): number | null {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Read known organization IDs in bounded pages, not the Redis keyspace. Persist
 * recipient work in the outbox; neither scanning nor quota enforcement sends mail.
 */
export async function scanUsageEmailWarnings(
  database: UsageEmailDatabase,
  redis: UsageEmailRedis,
  options: ScanOptions = {},
) {
  const instance = instanceConfig(options.environment);
  const bandwidthEnabled = instance.products.includes("tunnels");
  const telemetryEnabled = instance.products.includes("observability");
  if (!instance.billingEnabled || (!bandwidthEnabled && !telemetryEnabled)) return 0;

  const batchSize = options.batchSize ?? USAGE_EMAIL_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error("Usage email batch size must be an integer from 1 to 1000");
  }
  // Capture one UTC period for the entire run, even if a long scan crosses midnight.
  const now = options.now ?? new Date();
  const period = telemetryUsagePeriod(now);
  let afterId: string | null = null;
  let queued = 0;

  while (true) {
    const result = await database.query(
      `SELECT organization.id AS organization_id, subscription.plan
       FROM organizations AS organization
       LEFT JOIN subscriptions AS subscription
         ON subscription.organization_id = organization.id
       WHERE ($1::text IS NULL OR organization.id > $1)
       ORDER BY organization.id ASC
       LIMIT $2`,
      [afterId, batchSize],
    );
    const organizations = result.rows as OrganizationRow[];
    if (!organizations.length) break;

    // Match tunnel/ingest entitlement enforcement: the stored plan grants access
    // until the billing lifecycle actually downgrades or removes the subscription.
    const metered = organizations.filter((organization) => resolveHostedPlan(organization.plan) !== "unlimited");
    const bandwidth = bandwidthEnabled && metered.length
      ? await redis.mget(...metered.map((organization) => getBandwidthKey(organization.organization_id, now)))
      : [];
    const telemetry = new Map<string, string | number>();
    if (telemetryEnabled && metered.length) {
      const usage = await database.query(
        `SELECT organization_id, used
         FROM organization_monthly_usage
         WHERE organization_id = ANY($1::text[])
           AND month = $2::date
           AND metric = $3`,
        [metered.map((organization) => organization.organization_id), period.month, TELEMETRY_USAGE_METRIC],
      );
      for (const row of usage.rows as TelemetryUsageRow[]) telemetry.set(row.organization_id, row.used);
    }

    for (const [index, organization] of metered.entries()) {
      const limits = HOSTED_PLAN_LIMITS[resolveHostedPlan(organization.plan)];
      const metrics = [
        { metric: "bandwidth" as const, enabled: bandwidthEnabled, used: bandwidth[index], limit: limits.bandwidthPerMonth },
        { metric: "telemetry" as const, enabled: telemetryEnabled, used: telemetry.get(organization.organization_id), limit: limits.telemetryBytesPerMonth },
      ];
      for (const { metric, enabled, used, limit } of metrics) {
        if (!enabled || !Number.isFinite(limit) || limit <= 0) continue;
        const usedBytes = counter(used);
        if (usedBytes === null || usedBytes < limit * 0.8) continue;
        // Jumping straight to the limit produces only the actionable 100% email.
        const threshold = usedBytes >= limit ? 100 : 80;
        queued += await enqueueProductEmail(database, {
          organizationId: organization.organization_id,
          // A new allowance after a plan change needs its own warning lifecycle.
          eventKey: `usage:${period.month.slice(0, 7)}:${metric}:${limit}:${threshold}`,
          event: { kind: "usage-warning", metric, threshold, usedBytes, limitBytes: limit, resetsAt: period.resetsAt },
        });
      }
    }

    afterId = organizations[organizations.length - 1].organization_id;
    if (organizations.length < batchSize) break;
  }
  return queued;
}

/** The caller owns polling; shutdown drains the active scan before closing clients. */
export function createUsageEmailScanner(
  database: UsageEmailDatabase,
  redis: UsageEmailRedis,
  options: Omit<ScanOptions, "now"> & {
    clock?: () => Date;
    logger?: Pick<Console, "log" | "error">;
  } = {},
) {
  const logger = options.logger ?? console;
  let activeRun: Promise<void> | null = null;
  let stopped = false;

  function run() {
    if (stopped || activeRun) return Promise.resolve();
    activeRun = (async () => {
      try {
        const queued = await scanUsageEmailWarnings(database, redis, {
          ...options, now: options.clock?.() ?? new Date(),
        });
        if (queued) logger.log(`[Usage] Queued ${queued} usage warning email(s)`);
      } catch (error) {
        logger.error("[Usage] Failed to queue usage warning emails", error);
      }
    })().finally(() => { activeRun = null; });
    return activeRun;
  }

  async function shutdown() {
    stopped = true;
    await activeRun;
  }

  return { run, shutdown };
}
