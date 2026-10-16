import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth-schema";

/** Transactional delivery queue for account usage and billing notices. Payloads
 * contain only the event's display fields, never credentials or telemetry. */
export const productEmailOutbox = pgTable("product_email_outbox", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseOwner: text("lease_owner"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("product_email_outbox_due_idx").on(table.status, table.nextAttemptAt, table.leaseUntil),
  index("product_email_outbox_organization_idx").on(table.organizationId),
  check("product_email_outbox_status_check", sql`${table.status} IN ('pending', 'processing', 'sent', 'failed', 'suppressed')`),
  check("product_email_outbox_attempts_check", sql`${table.attempts} BETWEEN 0 AND 5`),
]);
