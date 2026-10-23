import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth-schema";

export const mcpConnections = pgTable("mcp_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  resource: text("resource").notNull(),
  generation: text("generation").notNull(),
  organizationIds: jsonb("organization_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("mcp_connections_user_client_resource_idx").on(t.userId, t.clientId, t.resource)]);

export const mcpActivity = pgTable("mcp_activity", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => mcpConnections.id, { onDelete: "cascade" }),
  tool: text("tool").notNull(),
  organizationId: text("organization_id"),
  resourceIds: jsonb("resource_ids").$type<Record<string, string>>().notNull(),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("mcp_activity_created_at_idx").on(t.createdAt), index("mcp_activity_user_id_idx").on(t.userId)]);
