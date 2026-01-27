import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth-schema";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("free"), // free, ray, beam, pulse
    status: text("status").notNull().default("active"), // active, cancelled, past_due, paused
    polarCustomerId: text("polar_customer_id"),
    polarSubscriptionId: text("polar_subscription_id"),
    polarProductId: text("polar_product_id"),
    // Paystack fields
    paystackCustomerCode: text("paystack_customer_code"),
    paystackAuthorizationCode: text("paystack_authorization_code"),
    paystackEmail: text("paystack_email"), // Email tied to authorization (required for charging)
    paymentProvider: text("payment_provider").default("polar"), // 'polar' | 'paystack'
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at"),
    trialEndsAt: timestamp("trial_ends_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subscriptions_organizationId_idx").on(table.organizationId),
    index("subscriptions_polarCustomerId_idx").on(table.polarCustomerId),
    index("subscriptions_polarSubscriptionId_idx").on(
      table.polarSubscriptionId,
    ),
    index("subscriptions_paystackCustomerCode_idx").on(
      table.paystackCustomerCode,
    ),
    index("subscriptions_paymentProvider_idx").on(table.paymentProvider),
  ],
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
}));
