import { relations, sql } from "drizzle-orm";
import {
  check,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth-schema";

const timestampWithTimezone = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3 });

export const secretOrganizationKeys = pgTable(
  "secret_organization_keys",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("active"),
    wrappedKey: text("wrapped_key").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    wrappingKeyId: text("wrapping_key_id").notNull(),
    algorithm: text("algorithm").notNull().default("AES-256-GCM"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
    updatedAt: timestampWithTimezone("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    rewrappedAt: timestampWithTimezone("rewrapped_at"),
  },
  (table) => [
    uniqueIndex("secret_organization_keys_org_version_unique_idx").on(
      table.organizationId,
      table.version,
    ),
    uniqueIndex("secret_organization_keys_one_active_idx")
      .on(table.organizationId)
      .where(sql`${table.status} = 'active'`),
    index("secret_organization_keys_wrapping_key_idx").on(
      table.wrappingKeyId,
    ),
    check(
      "secret_organization_keys_algorithm_check",
      sql`${table.algorithm} = 'AES-256-GCM'`,
    ),
    check(
      "secret_organization_keys_version_check",
      sql`${table.version} >= 1`,
    ),
    check(
      "secret_organization_keys_status_check",
      sql`${table.status} IN ('active', 'retired')`,
    ),
  ],
);

export const secretDeletionBatches = pgTable(
  "secret_deletion_batches",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rootType: text("root_type").notNull(),
    rootId: text("root_id").notNull(),
    rootName: text("root_name").notNull(),
    projectId: text("project_id"),
    environmentId: text("environment_id"),
    itemCount: integer("item_count").notNull().default(1),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    deletedByType: text("deleted_by_type").notNull(),
    deletedById: text("deleted_by_id"),
    deletedAt: timestampWithTimezone("deleted_at").defaultNow().notNull(),
    expiresAt: timestampWithTimezone("expires_at"),
    restoredByType: text("restored_by_type"),
    restoredById: text("restored_by_id"),
    restoredAt: timestampWithTimezone("restored_at"),
    purgedByType: text("purged_by_type"),
    purgedById: text("purged_by_id"),
    purgedAt: timestampWithTimezone("purged_at"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("secret_deletion_batches_organization_idx").on(
      table.organizationId,
      table.status,
      table.deletedAt,
    ),
    index("secret_deletion_batches_expiry_idx").on(
      table.status,
      table.expiresAt,
    ),
    check(
      "secret_deletion_batches_root_type_check",
      sql`${table.rootType} IN ('project', 'environment', 'secret')`,
    ),
    check(
      "secret_deletion_batches_status_check",
      sql`${table.status} IN ('active', 'restored', 'purged')`,
    ),
    check(
      "secret_deletion_batches_actor_type_check",
      sql`${table.deletedByType} IN ('user', 'machine', 'system')`,
    ),
  ],
);

export const secretProjects = pgTable(
  "secret_projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deletionBatchId: text("deletion_batch_id"),
    deletedAt: timestampWithTimezone("deleted_at"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
    updatedAt: timestampWithTimezone("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("secret_projects_active_slug_unique_idx")
      .on(table.organizationId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    index("secret_projects_organization_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("secret_projects_deletion_batch_idx").on(table.deletionBatchId),
  ],
);

export const secretEnvironments = pgTable(
  "secret_environments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => secretProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    isProduction: boolean("is_production").notNull().default(false),
    revision: bigint("revision", { mode: "number" }).notNull().default(0),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deletionBatchId: text("deletion_batch_id"),
    deletedAt: timestampWithTimezone("deleted_at"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
    updatedAt: timestampWithTimezone("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("secret_environments_active_slug_unique_idx")
      .on(table.projectId, table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    index("secret_environments_organization_idx").on(table.organizationId),
    index("secret_environments_project_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("secret_environments_deletion_batch_idx").on(table.deletionBatchId),
    check(
      "secret_environments_revision_check",
      sql`${table.revision} >= 0`,
    ),
  ],
);

export const secretEntries = pgTable(
  "secret_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => secretProjects.id, { onDelete: "cascade" }),
    environmentId: text("environment_id")
      .notNull()
      .references(() => secretEnvironments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    description: text("description"),
    currentVersion: integer("current_version").notNull().default(1),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedById: text("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deletionBatchId: text("deletion_batch_id"),
    deletedAt: timestampWithTimezone("deleted_at"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
    updatedAt: timestampWithTimezone("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("secret_entries_active_key_unique_idx")
      .on(table.environmentId, table.key)
      .where(sql`${table.deletedAt} IS NULL`),
    index("secret_entries_organization_idx").on(table.organizationId),
    index("secret_entries_environment_idx").on(
      table.environmentId,
      table.updatedAt,
    ),
    index("secret_entries_project_idx").on(table.projectId),
    index("secret_entries_deletion_batch_idx").on(table.deletionBatchId),
    check(
      "secret_entries_version_check",
      sql`${table.currentVersion} >= 1`,
    ),
  ],
);

export const secretVersions = pgTable(
  "secret_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entryId: text("entry_id")
      .notNull()
      .references(() => secretEntries.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    keySnapshot: text("key_snapshot").notNull(),
    organizationKeyVersion: integer("organization_key_version").notNull(),
    version: integer("version").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    algorithm: text("algorithm").notNull().default("AES-256-GCM"),
    valueDigest: text("value_digest").notNull(),
    createdByType: text("created_by_type").notNull(),
    createdById: text("created_by_id"),
    source: text("source").notNull().default("write"),
    sourceVersion: integer("source_version"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("secret_versions_entry_version_unique_idx").on(
      table.entryId,
      table.version,
    ),
    index("secret_versions_organization_idx").on(table.organizationId),
    index("secret_versions_organization_key_idx").on(
      table.organizationId,
      table.organizationKeyVersion,
    ),
    index("secret_versions_entry_idx").on(table.entryId, table.createdAt),
    check(
      "secret_versions_version_check",
      sql`${table.version} >= 1`,
    ),
    check(
      "secret_versions_organization_key_version_check",
      sql`${table.organizationKeyVersion} >= 1`,
    ),
    check(
      "secret_versions_algorithm_check",
      sql`${table.algorithm} = 'AES-256-GCM'`,
    ),
    check(
      "secret_versions_actor_type_check",
      sql`${table.createdByType} IN ('user', 'machine', 'system')`,
    ),
    check(
      "secret_versions_source_check",
      sql`${table.source} IN ('create', 'write', 'import', 'rollback')`,
    ),
  ],
);

export const secretAuditEvents = pgTable(
  "secret_audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    environmentId: text("environment_id"),
    entryId: text("entry_id"),
    actorType: text("actor_type").notNull(),
    actorCredential: text("actor_credential").notNull(),
    actorId: text("actor_id"),
    actorTokenId: text("actor_token_id"),
    action: text("action").notNull(),
    result: text("result").notNull(),
    requestId: text("request_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    targetName: text("target_name"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("secret_audit_events_organization_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("secret_audit_events_project_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("secret_audit_events_entry_idx").on(table.entryId, table.createdAt),
    index("secret_audit_events_action_idx").on(table.action, table.createdAt),
    index("secret_audit_events_request_idx").on(table.requestId),
    index("secret_audit_events_actor_token_idx").on(table.actorTokenId),
    check(
      "secret_audit_events_actor_type_check",
      sql`${table.actorType} IN ('user', 'machine', 'system')`,
    ),
    check(
      "secret_audit_events_actor_credential_check",
      sql`${table.actorCredential} IN ('session', 'cli', 'machine', 'system')`,
    ),
    check(
      "secret_audit_events_result_check",
      sql`${table.result} IN ('success', 'failure', 'denied')`,
    ),
  ],
);

export const machineTokens = pgTable(
  "secrets_machine_tokens",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => secretProjects.id, {
      onDelete: "set null",
    }),
    environmentId: text("environment_id").references(
      () => secretEnvironments.id,
      { onDelete: "set null" },
    ),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestampWithTimezone("expires_at"),
    revokedAt: timestampWithTimezone("revoked_at"),
    revokedById: text("revoked_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestampWithTimezone("last_used_at"),
    createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("secrets_machine_tokens_organization_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("secrets_machine_tokens_project_idx").on(table.projectId),
    index("secrets_machine_tokens_environment_idx").on(table.environmentId),
    index("secrets_machine_tokens_prefix_idx").on(table.prefix),
  ],
);

export const secretProjectsRelations = relations(
  secretProjects,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [secretProjects.organizationId],
      references: [organizations.id],
    }),
    creator: one(users, {
      fields: [secretProjects.createdById],
      references: [users.id],
    }),
    environments: many(secretEnvironments),
    entries: many(secretEntries),
    machineTokens: many(machineTokens),
  }),
);

export const secretEnvironmentsRelations = relations(
  secretEnvironments,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [secretEnvironments.organizationId],
      references: [organizations.id],
    }),
    project: one(secretProjects, {
      fields: [secretEnvironments.projectId],
      references: [secretProjects.id],
    }),
    creator: one(users, {
      fields: [secretEnvironments.createdById],
      references: [users.id],
    }),
    entries: many(secretEntries),
    machineTokens: many(machineTokens),
  }),
);

export const secretEntriesRelations = relations(
  secretEntries,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [secretEntries.organizationId],
      references: [organizations.id],
    }),
    project: one(secretProjects, {
      fields: [secretEntries.projectId],
      references: [secretProjects.id],
    }),
    environment: one(secretEnvironments, {
      fields: [secretEntries.environmentId],
      references: [secretEnvironments.id],
    }),
    versions: many(secretVersions),
  }),
);

export const secretVersionsRelations = relations(secretVersions, ({ one }) => ({
  organization: one(organizations, {
    fields: [secretVersions.organizationId],
    references: [organizations.id],
  }),
  entry: one(secretEntries, {
    fields: [secretVersions.entryId],
    references: [secretEntries.id],
  }),
}));

export const secretOrganizationKeysRelations = relations(
  secretOrganizationKeys,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [secretOrganizationKeys.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const secretDeletionBatchesRelations = relations(
  secretDeletionBatches,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [secretDeletionBatches.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const secretAuditEventsRelations = relations(
  secretAuditEvents,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [secretAuditEvents.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const machineTokensRelations = relations(machineTokens, ({ one }) => ({
  organization: one(organizations, {
    fields: [machineTokens.organizationId],
    references: [organizations.id],
  }),
  project: one(secretProjects, {
    fields: [machineTokens.projectId],
    references: [secretProjects.id],
  }),
  environment: one(secretEnvironments, {
    fields: [machineTokens.environmentId],
    references: [secretEnvironments.id],
  }),
  creator: one(users, {
    fields: [machineTokens.createdById],
    references: [users.id],
  }),
  revoker: one(users, {
    fields: [machineTokens.revokedById],
    references: [users.id],
  }),
}));
