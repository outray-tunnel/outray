import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  index,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { users, organizations } from "./auth-schema";

export const tunnels = pgTable(
  "tunnels",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    name: text("name"),
    protocol: text("protocol").notNull().default("http"), // http, tcp, udp
    remotePort: integer("remote_port"), // For TCP/UDP tunnels
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("tunnels_userId_idx").on(table.userId),
    index("tunnels_organizationId_idx").on(table.organizationId),
    index("tunnels_lastSeenAt_idx").on(table.lastSeenAt),
  ],
);

export const subdomains = pgTable(
  "subdomains",
  {
    id: text("id").primaryKey(),
    subdomain: text("subdomain").notNull().unique(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("subdomains_subdomain_idx").on(table.subdomain),
    index("subdomains_organizationId_idx").on(table.organizationId),
    index("subdomains_userId_idx").on(table.userId),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("auth_tokens_organizationId_idx").on(table.organizationId),
    index("auth_tokens_userId_idx").on(table.userId),
  ],
);

export const domains = pgTable(
  "domains",
  {
    id: text("id").primaryKey(),
    domain: text("domain").notNull().unique(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending, active, failed
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("domains_domain_idx").on(table.domain),
    index("domains_organizationId_idx").on(table.organizationId),
    index("domains_userId_idx").on(table.userId),
  ],
);

export const organizationSettings = pgTable(
  "organization_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fullCaptureEnabled: boolean("full_capture_enabled")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("organization_settings_organizationId_idx").on(table.organizationId),
  ],
);

export const tunnelsRelations = relations(tunnels, ({ one }) => ({
  user: one(users, {
    fields: [tunnels.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [tunnels.organizationId],
    references: [organizations.id],
  }),
}));

export const subdomainsRelations = relations(subdomains, ({ one }) => ({
  organization: one(organizations, {
    fields: [subdomains.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [subdomains.userId],
    references: [users.id],
  }),
}));

export const authTokensRelations = relations(authTokens, ({ one }) => ({
  organization: one(organizations, {
    fields: [authTokens.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [authTokens.userId],
    references: [users.id],
  }),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  organization: one(organizations, {
    fields: [domains.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [domains.userId],
    references: [users.id],
  }),
}));

export const organizationSettingsRelations = relations(
  organizationSettings,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationSettings.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const usersAppRelations = relations(users, ({ many }) => ({
  tunnels: many(tunnels),
  authTokens: many(authTokens),
  subdomains: many(subdomains),
  domains: many(domains),
}));

export const organizationsAppRelations = relations(
  organizations,
  ({ many, one }) => ({
    tunnels: many(tunnels),
    authTokens: many(authTokens),
    subdomains: many(subdomains),
    domains: many(domains),
    settings: one(organizationSettings),
  }),
);
