import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth-schema";
import { domains } from "./app-schema";
import { incidents } from "./alerts-schema";
import type { EncryptedUptimeHeaders, EncryptedUptimeWebhook } from "@/lib/secrets/crypto";

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3 });

export const uptimeMonitors = pgTable(
  "uptime_monitors",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    method: text("method").notNull().default("GET"),
    headersCiphertext: jsonb("headers_ciphertext").$type<EncryptedUptimeHeaders>(),
    expectedStatus: integer("expected_status"),
    responseText: text("response_text"),
    notificationEmails: text("notification_emails").array().notNull().default(sql`ARRAY[]::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    state: text("state").notNull().default("unknown"),
    failureStreak: integer("failure_streak").notNull().default(0),
    successStreak: integer("success_streak").notNull().default(0),
    lastCheckedAt: timestamptz("last_checked_at"),
    lastStateChangedAt: timestamptz("last_state_changed_at"),
    nextCheckAt: timestamptz("next_check_at").notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamptz("lease_until"),
    deletedAt: timestamptz("deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("uptime_monitors_org_idx").on(table.organizationId, table.createdAt),
    index("uptime_monitors_due_idx").on(table.nextCheckAt, table.leaseUntil).where(sql`${table.enabled} = true AND ${table.deletedAt} IS NULL`),
    check("uptime_monitors_method_check", sql`${table.method} IN ('GET', 'HEAD')`),
    check("uptime_monitors_state_check", sql`${table.state} IN ('unknown', 'up', 'down')`),
    check("uptime_monitors_expected_status_check", sql`${table.expectedStatus} IS NULL OR ${table.expectedStatus} BETWEEN 100 AND 599`),
    check("uptime_monitors_streaks_check", sql`${table.failureStreak} >= 0 AND ${table.successStreak} >= 0`),
  ],
);

export const uptimeChecks = pgTable(
  "uptime_checks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id").notNull().references(() => uptimeMonitors.id, { onDelete: "cascade" }),
    checkedAt: timestamptz("checked_at").notNull().defaultNow(),
    success: boolean("success").notNull(),
    statusCode: integer("status_code"),
    latencyMs: integer("latency_ms"),
    errorKind: text("error_kind"),
  },
  (table) => [
    index("uptime_checks_monitor_time_idx").on(table.monitorId, table.checkedAt),
    index("uptime_checks_org_time_idx").on(table.organizationId, table.checkedAt),
    index("uptime_checks_checked_at_idx").on(table.checkedAt),
    check("uptime_checks_latency_check", sql`${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0`),
  ],
);

export const uptimeStatusPages = pgTable(
  "uptime_status_pages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    logoUrl: text("logo_url"),
    accentColor: text("accent_color").notNull().default("#8367c7"),
    published: boolean("published").notNull().default(false),
    domainId: text("domain_id").unique().references(() => domains.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("uptime_status_pages_org_idx").on(table.organizationId),
    check("uptime_status_pages_slug_check", sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'`),
  ],
);

export const uptimeStatusGroups = pgTable(
  "uptime_status_groups",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull().references(() => uptimeStatusPages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("uptime_status_groups_page_order_idx").on(table.pageId, table.sortOrder)],
);

export const uptimeStatusComponents = pgTable(
  "uptime_status_components",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull().references(() => uptimeStatusPages.id, { onDelete: "cascade" }),
    groupId: text("group_id").notNull().references(() => uptimeStatusGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    manualState: text("manual_state").notNull().default("unknown"),
    manualUpdatedAt: timestamptz("manual_updated_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("uptime_status_components_group_order_idx").on(table.groupId, table.sortOrder),
    check("uptime_status_components_manual_state_check", sql`${table.manualState} IN ('unknown', 'operational', 'degraded', 'outage')`),
  ],
);

export const uptimeComponentMonitors = pgTable(
  "uptime_component_monitors",
  {
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    componentId: text("component_id").notNull().references(() => uptimeStatusComponents.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id").notNull().references(() => uptimeMonitors.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.componentId, table.monitorId] }),
    index("uptime_component_monitors_monitor_idx").on(table.monitorId),
  ],
);

export const uptimeIncidentComponents = pgTable(
  "uptime_incident_components",
  {
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    incidentId: text("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    componentId: text("component_id").notNull().references(() => uptimeStatusComponents.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.incidentId, table.componentId] })],
);

export const uptimeIncidentUpdates = pgTable(
  "uptime_incident_updates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    incidentId: text("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    status: text("status").notNull(),
    componentStates: jsonb("component_states").$type<Record<string, "unknown" | "operational" | "degraded" | "outage">>().notNull().default({}),
    publishedAt: timestamptz("published_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("uptime_incident_updates_incident_idx").on(table.incidentId, table.createdAt),
    check("uptime_incident_updates_status_check", sql`${table.status} IN ('investigating', 'identified', 'monitoring', 'resolved')`),
    check("uptime_incident_updates_note_check", sql`length(trim(${table.note})) > 0`),
  ],
);

export const uptimeSubscribers = pgTable(
  "uptime_subscribers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull().references(() => uptimeStatusPages.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: text("status").notNull().default("pending"),
    tokenHash: text("token_hash"),
    tokenExpiresAt: timestamptz("token_expires_at"),
    confirmedAt: timestamptz("confirmed_at"),
    unsubscribedAt: timestamptz("unsubscribed_at"),
    lastSentAt: timestamptz("last_sent_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uptime_subscribers_page_email_idx").on(table.pageId, table.email),
    index("uptime_subscribers_status_idx").on(table.pageId, table.status),
    check("uptime_subscribers_status_check", sql`${table.status} IN ('pending', 'confirmed', 'unsubscribed')`),
  ],
);

export const uptimeSubscriptionAttempts = pgTable(
  "uptime_subscription_attempts",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").notNull().references(() => uptimeStatusPages.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    emailHash: text("email_hash").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("uptime_subscription_attempts_ip_idx").on(table.pageId, table.ipHash, table.createdAt),
    index("uptime_subscription_attempts_email_idx").on(table.pageId, table.emailHash, table.createdAt),
  ],
);

export const uptimeIntegrations = pgTable(
  "uptime_integrations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    webhookCiphertext: jsonb("webhook_ciphertext").$type<EncryptedUptimeWebhook>().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uptime_integrations_org_provider_idx").on(table.organizationId, table.provider),
    check("uptime_integrations_provider_check", sql`${table.provider} IN ('slack', 'discord')`),
  ],
);
