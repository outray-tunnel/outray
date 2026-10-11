import { bigint, check, date, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./auth-schema";

/** Shared by hosted Node and Worker ingestion. Counts accepted normalized bytes,
 * not compressed payloads or derived request rows. Months are calendar UTC. */
export const organizationMonthlyUsage = pgTable("organization_monthly_usage", {
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  month: date("month").notNull(),
  metric: text("metric").notNull().default("telemetry_bytes"),
  used: bigint("used", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.organizationId, table.month, table.metric] }),
  check("organization_monthly_usage_nonnegative", sql`${table.used} >= 0`),
]);

/** Payload-free fingerprints let retries reuse accepted batches without charging
 * twice. No API keys, secret values or telemetry bodies are stored here. */
export const organizationTelemetryReceipts = pgTable("organization_telemetry_receipts", {
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  receiptKey: text("receipt_key").notNull(),
  month: date("month").notNull(),
  bytes: bigint("bytes", { mode: "number" }).notNull(),
  status: text("status").notNull().default("accepted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.organizationId, table.receiptKey] }),
  index("organization_telemetry_receipts_created_at_idx").on(table.createdAt),
  check("organization_telemetry_receipts_nonnegative", sql`${table.bytes} >= 0`),
]);
