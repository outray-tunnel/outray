import { bigint, check, date, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./auth-schema";
import { uptimeStatusPages } from "./uptime-schema";

const org = () => text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" });
const time = (name: string) => timestamp(name, { withTimezone: true });
export const productUsageMetrics = pgTable("product_usage_metrics", {
  key: text("key").primaryKey(), product: text("product").notNull(), label: text("label").notNull(), unit: text("unit").notNull(),
}, t => [check("product_usage_metrics_unit_check", sql`${t.unit} IN ('count','bytes')`)]);
const metric = () => text("metric").notNull().references(() => productUsageMetrics.key);
export const organizationProductUsageDaily = pgTable("organization_product_usage_daily", {
  organizationId: org(), day: date("day").notNull(), metric: metric(), value: bigint("value", { mode: "bigint" }).notNull(), updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.organizationId, t.day, t.metric] }), index("product_usage_daily_metric_day").on(t.metric, t.day), check("organization_product_usage_daily_value_check", sql`${t.value} >= 0`)]);
export const platformProductUsageDaily = pgTable("platform_product_usage_daily", {
  day: date("day").notNull(), metric: metric(), shard: smallint("shard").notNull(), value: bigint("value", { mode: "bigint" }).notNull(), updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.metric, t.day, t.shard] }), check("platform_product_usage_daily_shard_check", sql`${t.shard} BETWEEN 0 AND 63`), check("platform_product_usage_daily_value_check", sql`${t.value} >= 0`)]);
export const productUsageReceipts = pgTable("product_usage_receipts", {
  organizationId: org(), source: text("source").notNull(), eventId: text("event_id").notNull(), fingerprint: text("fingerprint").notNull(), createdAt: time("created_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.organizationId, t.source, t.eventId] }), index("product_usage_receipts_created").on(t.createdAt)]);
export const productUsageCoverage = pgTable("product_usage_coverage", {
  source: text("source").primaryKey(), collectionStartedAt: time("collection_started_at"), lastProcessedAt: time("last_processed_at"), backfillStatus: text("backfill_status").notNull().default("not_started"), earliestBackfillAt: time("earliest_backfill_at"), updatedAt: time("updated_at").notNull().defaultNow(),
});
export const productUsageBackfillCheckpoints = pgTable("product_usage_backfill_checkpoints", {
  jobId: text("job_id").notNull(), source: text("source").notNull(), organizationId: org(), cutoffAt: time("cutoff_at").notNull(), cursor: text("cursor"), status: text("status").notNull().default("pending"), processed: bigint("processed", { mode: "bigint" }).notNull().default(sql`0`), updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.jobId, t.source, t.organizationId] })]);
export const organizationProductUsageBaselines = pgTable("organization_product_usage_baselines", {
  organizationId: org(), metric: metric(), period: text("period").notNull(), value: bigint("value", { mode: "bigint" }).notNull(), recordedAt: time("recorded_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.organizationId, t.metric, t.period] }), check("organization_product_usage_baselines_value_check", sql`${t.value} >= 0`)]);
export const platformProductUsageBaselines = pgTable("platform_product_usage_baselines", {
  metric: metric(), period: text("period").notNull(), shard: smallint("shard").notNull(), value: bigint("value", { mode: "bigint" }).notNull(),
}, t => [primaryKey({ columns: [t.metric, t.period, t.shard] }), check("platform_product_usage_baselines_shard_check", sql`${t.shard} BETWEEN 0 AND 63`), check("platform_product_usage_baselines_value_check", sql`${t.value} >= 0`)]);
export const productUsageAgentProgress = pgTable("product_usage_agent_progress", {
  organizationId: org(), runId: text("run_id").notNull(), inputTokens: bigint("input_tokens", { mode: "bigint" }).notNull().default(sql`0`), outputTokens: bigint("output_tokens", { mode: "bigint" }).notNull().default(sql`0`), startedRecorded: integer("started_recorded").notNull().default(0), terminalRecorded: integer("terminal_recorded").notNull().default(0),
}, t => [primaryKey({ columns: [t.organizationId, t.runId] })]);
export const statusAnalyticsOutbox = pgTable("status_analytics_outbox", {
  organizationId: org(), pageId: text("page_id").notNull().references(() => uptimeStatusPages.id, { onDelete: "cascade" }), eventId: text("event_id").notNull(), event: jsonb("event").notNull(), createdAt: time("created_at").notNull().defaultNow(), expiresAt: time("expires_at").notNull(), nextAttemptAt: time("next_attempt_at").notNull().defaultNow(), attempts: integer("attempts").notNull().default(0), status: text("status").notNull().default("pending"), leaseUntil: time("lease_until"), leaseOwner: text("lease_owner"),
}, t => [primaryKey({ columns: [t.pageId, t.eventId] }), index("status_analytics_outbox_due").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`), check("status_analytics_outbox_status_check", sql`${t.status} IN ('pending','failed')`)]);
