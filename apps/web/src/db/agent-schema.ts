import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth-schema";
import type { AgentEvidenceReference, AgentStep } from "../lib/agent/protocol";

const timestampWithTimezone = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3 });

/** Agent conversations are private to the authenticated creator, not shared by members. */
export const agentThreads = pgTable("agent_threads", {
  id: uuid("id").primaryKey(),
  organizationId: text("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sourceRequestId: text("source_request_id"),
  createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
  updatedAt: timestampWithTimezone("updated_at").defaultNow().notNull(),
}, (table) => [
  index("agent_threads_owner_updated_idx").on(table.organizationId, table.createdBy, table.updatedAt),
  index("agent_threads_creator_idx").on(table.createdBy),
]);

export const agentMessages = pgTable("agent_messages", {
  id: uuid("id").primaryKey(),
  threadId: uuid("thread_id").notNull()
    .references(() => agentThreads.id, { onDelete: "cascade" }),
  role: text("role").$type<"user" | "assistant">().notNull(),
  text: text("text").notNull().default(""),
  steps: jsonb("steps").$type<AgentStep[]>().notNull().default(sql`'[]'::jsonb`),
  evidence: jsonb("evidence").$type<AgentEvidenceReference[]>().notNull().default(sql`'[]'::jsonb`),
  status: text("status").$type<"pending" | "complete" | "failed" | "cancelled">().notNull(),
  error: text("error"),
  createdAt: timestampWithTimezone("created_at").defaultNow().notNull(),
}, (table) => [
  index("agent_messages_thread_created_idx").on(table.threadId, table.createdAt),
  check("agent_messages_role_check", sql`${table.role} IN ('user', 'assistant')`),
  check("agent_messages_status_check", sql`${table.status} IN ('pending', 'complete', 'failed', 'cancelled')`),
]);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey(),
  threadId: uuid("thread_id").notNull()
    .references(() => agentThreads.id, { onDelete: "cascade" }),
  clientMessageId: uuid("client_message_id").notNull()
    .references(() => agentMessages.id, { onDelete: "cascade" }),
  assistantMessageId: uuid("assistant_message_id").notNull()
    .references(() => agentMessages.id, { onDelete: "cascade" }),
  status: text("status").$type<"running" | "complete" | "failed" | "cancelled">().notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  maxTokens: integer("max_tokens").notNull(),
  maxSteps: integer("max_steps").notNull(),
  error: text("error"),
  startedAt: timestampWithTimezone("started_at").defaultNow().notNull(),
  updatedAt: timestampWithTimezone("updated_at").defaultNow().notNull(),
  completedAt: timestampWithTimezone("completed_at"),
}, (table) => [
  uniqueIndex("agent_runs_client_message_unique").on(table.clientMessageId),
  uniqueIndex("agent_runs_assistant_message_unique").on(table.assistantMessageId),
  index("agent_runs_thread_started_idx").on(table.threadId, table.startedAt),
  index("agent_runs_running_idx").on(table.updatedAt).where(sql`${table.status} = 'running'`),
  check("agent_runs_status_check", sql`${table.status} IN ('running', 'complete', 'failed', 'cancelled')`),
  check("agent_runs_tokens_check", sql`${table.inputTokens} >= 0 AND ${table.outputTokens} >= 0 AND ${table.maxTokens} > 0`),
  check("agent_runs_steps_check", sql`${table.maxSteps} > 0`),
]);

export const agentThreadsRelations = relations(agentThreads, ({ one, many }) => ({
  organization: one(organizations, { fields: [agentThreads.organizationId], references: [organizations.id] }),
  creator: one(users, { fields: [agentThreads.createdBy], references: [users.id] }),
  messages: many(agentMessages),
  runs: many(agentRuns),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  thread: one(agentThreads, { fields: [agentMessages.threadId], references: [agentThreads.id] }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  thread: one(agentThreads, { fields: [agentRuns.threadId], references: [agentThreads.id] }),
}));
