import { and, asc, desc, eq, getTableColumns, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { agentMessages, agentRuns, agentThreads } from "../../db/agent-schema";
import type * as schema from "../../db/schema";
import type { AgentEvidenceReference, AgentSavedMessage, AgentSavedThread, AgentStep } from "./protocol";

export interface AgentScope { organizationId: string; userId: string }
export interface AgentStoreLimits {
  maxActiveUser: number;
  maxActiveOrganization: number;
  maxDailyUser: number;
  maxDailyOrganization: number;
  staleAfterMs: number;
}
export const DEFAULT_AGENT_STORE_LIMITS: AgentStoreLimits = {
  maxActiveUser: 1, maxActiveOrganization: 3,
  maxDailyUser: 50, maxDailyOrganization: 250,
  staleAfterMs: 120_000,
};

export class AgentStoreError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AgentStoreError";
    this.code = code;
    this.status = status;
  }
}

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;
type ThreadRow = typeof agentThreads.$inferSelect;
type MessageRow = typeof agentMessages.$inferSelect;
export type AgentStoredRun = typeof agentRuns.$inferSelect;

export interface BeginAgentRun extends AgentScope {
  threadId: string;
  clientMessageId: string;
  assistantId: string;
  text: string;
  sourceRequestId?: string;
  runId?: string;
  budget?: { maxTokens: number; maxSteps: number };
}
export interface AgentRunUpdate extends AgentScope {
  runId: string;
  text?: string;
  steps?: AgentStep[];
  evidence?: AgentEvidenceReference[];
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}
export interface FinishAgentRun extends AgentRunUpdate {
  status: "complete" | "failed" | "cancelled";
}
export interface AgentRunResult {
  kind: "created" | "existing";
  thread: AgentSavedThread;
  run: AgentStoredRun;
  userMessage: AgentSavedMessage;
  assistantMessage: AgentSavedMessage;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERRUPTED = "The investigation was interrupted. Send a new message to try again.";
const MESSAGE_LIMIT = 100;
const THREAD_LIMIT = 30;

function scopeCondition(scope: AgentScope) {
  return and(eq(agentThreads.organizationId, scope.organizationId), eq(agentThreads.createdBy, scope.userId));
}
function ownedThreads(executor: Executor, scope: AgentScope) {
  return executor.select({ id: agentThreads.id }).from(agentThreads).where(scopeCondition(scope));
}
function runCondition(executor: Executor, scope: AgentScope, runId: string) {
  return and(eq(agentRuns.id, runId), inArray(agentRuns.threadId, ownedThreads(executor, scope)));
}
function messageDto(row: MessageRow): AgentSavedMessage {
  return {
    id: row.id, role: row.role, text: row.text,
    status: row.status === "pending" ? "running" : row.status,
    steps: row.steps, evidence: row.evidence,
    ...(row.error ? { error: row.error } : {}),
  };
}
function threadWithMessages(row: ThreadRow, messages: MessageRow[]): AgentSavedThread {
  return {
    id: row.id, title: row.title, sourceRequestId: row.sourceRequestId,
    createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime(),
    messages: messages.map(messageDto),
  };
}
async function threadDto(executor: Executor, scope: AgentScope, row: ThreadRow): Promise<AgentSavedThread> {
  const messages = await executor.select().from(agentMessages)
    .where(and(eq(agentMessages.threadId, row.id), inArray(agentMessages.threadId, ownedThreads(executor, scope))))
    .orderBy(desc(agentMessages.createdAt), desc(agentMessages.id)).limit(MESSAGE_LIMIT);
  return threadWithMessages(row, messages.reverse());
}
function assertId(value: string) {
  if (!UUID.test(value)) throw new AgentStoreError("Invalid conversation identifier", "INVALID_ID", 400);
}
function assertScope(scope: AgentScope) {
  if (!scope.organizationId || !scope.userId) throw new AgentStoreError("Authentication is required", "UNAUTHORIZED", 401);
}
function assertCounter(value: number | undefined) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new AgentStoreError("Invalid token count", "INVALID_USAGE", 400);
  }
}
function assertUpdate(input: AgentRunUpdate) {
  assertScope(input);
  assertId(input.runId);
  assertCounter(input.inputTokens);
  assertCounter(input.outputTokens);
  if (input.text !== undefined && input.text.length > 64_000) {
    throw new AgentStoreError("Agent response is too large", "RESPONSE_TOO_LARGE", 400);
  }
  if (input.steps && (input.steps.length > 32 || new Set(input.steps.map((step) => step.id)).size !== input.steps.length)) {
    throw new AgentStoreError("Invalid investigation steps", "INVALID_STEPS", 400);
  }
  if (input.evidence && input.evidence.length > 100) {
    throw new AgentStoreError("Too many evidence references", "INVALID_EVIDENCE", 400);
  }
}

/** Explicit database injection: persistence never falls back to in-memory conversations. */
export function createAgentStore(database: Database, options: Partial<AgentStoreLimits> = {}) {
  const limits = { ...DEFAULT_AGENT_STORE_LIMITS, ...options };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("Agent store limits must be positive integers");
  }

  async function lockAdmission(tx: Transaction, scope: AgentScope) {
    // Lock the organization AND user: starts in different organizations cannot race the user's cap.
    const keys = [`outray:agent:org:${scope.organizationId}`, `outray:agent:user:${scope.userId}`].sort();
    for (const key of keys) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  async function expireStale(tx: Transaction, scope: AgentScope, now: Date) {
    const stale = await tx.update(agentRuns).set({ status: "failed", error: INTERRUPTED, completedAt: now, updatedAt: now })
      .where(and(inArray(agentRuns.threadId, ownedThreads(tx, scope)), eq(agentRuns.status, "running"),
        lt(agentRuns.updatedAt, new Date(now.getTime() - limits.staleAfterMs))))
      .returning({ assistantMessageId: agentRuns.assistantMessageId, threadId: agentRuns.threadId });
    if (!stale.length) return;
    await tx.update(agentMessages).set({ status: "failed", error: INTERRUPTED,
      steps: sql<AgentStep[]>`COALESCE((SELECT jsonb_agg(CASE WHEN step->>'status' = 'running' THEN step || '{"status":"failed"}'::jsonb ELSE step END ORDER BY ordinal) FROM jsonb_array_elements(${agentMessages.steps}) WITH ORDINALITY AS entries(step, ordinal)), '[]'::jsonb)` })
      .where(and(inArray(agentMessages.id, stale.map((row) => row.assistantMessageId)),
        inArray(agentMessages.threadId, ownedThreads(tx, scope)), eq(agentMessages.status, "pending")));
    await tx.update(agentThreads).set({ updatedAt: now })
      .where(and(scopeCondition(scope), inArray(agentThreads.id, stale.map((row) => row.threadId))));
  }

  async function readThread(executor: Executor, scope: AgentScope, threadId: string) {
    const [row] = await executor.select().from(agentThreads)
      .where(and(eq(agentThreads.id, threadId), scopeCondition(scope))).limit(1);
    return row ? threadDto(executor, scope, row) : null;
  }

  async function result(executor: Executor, input: BeginAgentRun, run: AgentStoredRun, kind: AgentRunResult["kind"]): Promise<AgentRunResult> {
    const thread = await readThread(executor, input, input.threadId);
    if (!thread) throw new AgentStoreError("Conversation not found", "NOT_FOUND", 404);
    // Fetch the exact pair separately: idempotent retries remain valid after the history window moves.
    const messages = await executor.select().from(agentMessages)
      .where(and(inArray(agentMessages.id, [run.clientMessageId, run.assistantMessageId]),
        eq(agentMessages.threadId, input.threadId), inArray(agentMessages.threadId, ownedThreads(executor, input))));
    const userMessage = messages.find((message) => message.id === run.clientMessageId);
    const assistantMessage = messages.find((message) => message.id === run.assistantMessageId);
    if (!userMessage || !assistantMessage) throw new AgentStoreError("Conversation is incomplete", "NOT_FOUND", 404);
    return { kind, thread, run, userMessage: messageDto(userMessage), assistantMessage: messageDto(assistantMessage) };
  }

  async function beginRun(input: BeginAgentRun): Promise<AgentRunResult> {
    assertScope(input);
    [input.threadId, input.clientMessageId, input.assistantId, ...(input.runId ? [input.runId] : [])].forEach(assertId);
    if (new Set([input.threadId, input.clientMessageId, input.assistantId, input.runId].filter(Boolean)).size !== (input.runId ? 4 : 3)) {
      throw new AgentStoreError("Conversation identifiers must be distinct", "INVALID_ID", 400);
    }
    const text = input.text.trim();
    if (!text || text.length > 4_000) throw new AgentStoreError("Message must contain 1–4000 characters", "INVALID_MESSAGE", 400);
    if (input.sourceRequestId !== undefined && (!input.sourceRequestId.trim() || input.sourceRequestId.length > 256)) {
      throw new AgentStoreError("Invalid source request", "INVALID_SOURCE", 400);
    }
    const budget = input.budget ?? { maxTokens: 12_000, maxSteps: 8 };
    if (![budget.maxTokens, budget.maxSteps].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new AgentStoreError("Invalid investigation budget", "INVALID_BUDGET", 400);
    }
    try {
      return await database.transaction(async (tx) => {
        await lockAdmission(tx, input);
        const now = new Date();
        await expireStale(tx, input, now);
        const [existing] = await tx.select().from(agentRuns)
          .where(and(eq(agentRuns.clientMessageId, input.clientMessageId),
            inArray(agentRuns.threadId, ownedThreads(tx, input)))).limit(1);
        if (existing) {
          if (existing.threadId !== input.threadId || existing.assistantMessageId !== input.assistantId) {
            throw new AgentStoreError("Message identifier was already used", "IDEMPOTENCY_CONFLICT", 409);
          }
          const saved = await result(tx, input, existing, "existing");
          if (saved.userMessage.text !== text || (input.sourceRequestId !== undefined && saved.thread.sourceRequestId !== input.sourceRequestId)) {
            throw new AgentStoreError("Message identifier was already used", "IDEMPOTENCY_CONFLICT", 409);
          }
          return saved;
        }

        const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const active = and(eq(agentRuns.status, "running"), gte(agentRuns.updatedAt, new Date(now.getTime() - limits.staleAfterMs)));
        const [usage] = await tx.select({
          userActive: sql<number>`count(*) FILTER (WHERE ${eq(agentThreads.createdBy, input.userId)} AND ${active})::integer`,
          organizationActive: sql<number>`count(*) FILTER (WHERE ${eq(agentThreads.organizationId, input.organizationId)} AND ${active})::integer`,
          userDaily: sql<number>`count(*) FILTER (WHERE ${eq(agentThreads.createdBy, input.userId)} AND ${gte(agentRuns.startedAt, day)})::integer`,
          organizationDaily: sql<number>`count(*) FILTER (WHERE ${eq(agentThreads.organizationId, input.organizationId)} AND ${gte(agentRuns.startedAt, day)})::integer`,
        }).from(agentRuns).innerJoin(agentThreads, eq(agentRuns.threadId, agentThreads.id))
          .where(or(eq(agentThreads.organizationId, input.organizationId), eq(agentThreads.createdBy, input.userId)));
        if (usage.userActive >= limits.maxActiveUser || usage.organizationActive >= limits.maxActiveOrganization) {
          throw new AgentStoreError("An investigation is already running. Try again shortly.", "CONCURRENT_RUN_LIMIT", 429);
        }
        if (usage.userDaily >= limits.maxDailyUser || usage.organizationDaily >= limits.maxDailyOrganization) {
          throw new AgentStoreError("The daily investigation limit has been reached.", "DAILY_RUN_LIMIT", 429);
        }

        await tx.insert(agentThreads).values({ id: input.threadId, organizationId: input.organizationId, createdBy: input.userId,
          title: text.replace(/\s+/g, " ").slice(0, 80), sourceRequestId: input.sourceRequestId ?? null, createdAt: now, updatedAt: now })
          .onConflictDoNothing({ target: agentThreads.id });
        const [thread] = await tx.select().from(agentThreads)
          .where(and(eq(agentThreads.id, input.threadId), scopeCondition(input))).limit(1);
        if (!thread) throw new AgentStoreError("Conversation not found", "NOT_FOUND", 404);
        if (input.sourceRequestId !== undefined && thread.sourceRequestId !== input.sourceRequestId) {
          throw new AgentStoreError("Conversation source cannot be changed", "SOURCE_CONFLICT", 409);
        }
        await tx.insert(agentMessages).values([
          { id: input.clientMessageId, threadId: thread.id, role: "user", text, status: "complete", createdAt: now },
          { id: input.assistantId, threadId: thread.id, role: "assistant", text: "", status: "pending", createdAt: new Date(now.getTime() + 1) },
        ]);
        const [run] = await tx.insert(agentRuns).values({ id: input.runId ?? crypto.randomUUID(), threadId: thread.id,
          clientMessageId: input.clientMessageId, assistantMessageId: input.assistantId, status: "running",
          maxTokens: budget.maxTokens, maxSteps: budget.maxSteps, startedAt: now, updatedAt: now }).returning();
        await tx.update(agentThreads).set({ updatedAt: now }).where(and(eq(agentThreads.id, thread.id), scopeCondition(input)));
        return result(tx, input, run, "created");
      });
    } catch (error) {
      // Collisions with another user's UUID never expose that user's conversation or overwrite it.
      if (error && typeof error === "object" && ("code" in error && error.code === "23505" || "cause" in error &&
        error.cause && typeof error.cause === "object" && "code" in error.cause && error.cause.code === "23505")) {
        throw new AgentStoreError("Message identifier was already used", "IDEMPOTENCY_CONFLICT", 409);
      }
      throw error;
    }
  }

  async function writeRun(input: AgentRunUpdate | FinishAgentRun) {
    assertUpdate(input);
    return database.transaction(async (tx) => {
      const now = new Date();
      const terminal = "status" in input;
      const [run] = await tx.update(agentRuns).set({
        updatedAt: now,
        ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
        ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
        ...(input.error === undefined ? {} : { error: input.error }),
        ...(terminal ? { status: input.status, completedAt: now } : {}),
      }).where(and(runCondition(tx, input, input.runId), eq(agentRuns.status, "running"))).returning();
      if (!run) {
        const [existing] = await tx.select().from(agentRuns).where(runCondition(tx, input, input.runId)).limit(1);
        if (!existing) throw new AgentStoreError("Investigation not found", "NOT_FOUND", 404);
        return existing; // A late stream callback cannot resurrect a cancelled or finished run.
      }
      const messageChanges = {
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.steps === undefined ? {} : { steps: input.steps }),
        ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
        ...(input.error === undefined ? {} : { error: input.error }),
        ...(terminal ? { status: input.status } : {}),
      };
      if (Object.keys(messageChanges).length) {
        await tx.update(agentMessages).set(messageChanges)
          .where(and(eq(agentMessages.id, run.assistantMessageId), eq(agentMessages.threadId, run.threadId),
            inArray(agentMessages.threadId, ownedThreads(tx, input))));
      }
      await tx.update(agentThreads).set({ updatedAt: now }).where(and(eq(agentThreads.id, run.threadId), scopeCondition(input)));
      return run;
    });
  }

  return {
    beginRun,
    updateRun: (input: AgentRunUpdate) => writeRun(input),
    finishRun: (input: FinishAgentRun) => writeRun(input),
    cancelRun: (input: AgentScope & { runId: string }) => writeRun({ ...input, status: "cancelled" }),
    async getRun(input: AgentScope & { runId: string }) {
      assertScope(input); assertId(input.runId);
      const [run] = await database.select().from(agentRuns).where(runCondition(database, input, input.runId)).limit(1);
      return run ?? null;
    },
    async getThread(input: AgentScope & { threadId: string }) {
      assertScope(input); assertId(input.threadId);
      return database.transaction(async (tx) => {
        await expireStale(tx, input, new Date());
        return readThread(tx, input, input.threadId);
      });
    },
    async listThreads(input: AgentScope) {
      assertScope(input);
      return database.transaction(async (tx) => {
        await expireStale(tx, input, new Date());
        const rows = await tx.select().from(agentThreads).where(scopeCondition(input))
          .orderBy(desc(agentThreads.updatedAt), desc(agentThreads.id)).limit(THREAD_LIMIT);
        if (!rows.length) return [];
        // One bounded history query for every thread, avoiding 30 remote database round trips.
        const ranked = tx.select({ ...getTableColumns(agentMessages),
          messageIndex: sql<number>`row_number() OVER (PARTITION BY ${agentMessages.threadId} ORDER BY ${agentMessages.createdAt} DESC, ${agentMessages.id} DESC)`.as("message_index"),
        }).from(agentMessages).where(and(inArray(agentMessages.threadId, rows.map((row) => row.id)),
          inArray(agentMessages.threadId, ownedThreads(tx, input)))).as("ranked_messages");
        const messages = await tx.select({
          id: ranked.id, threadId: ranked.threadId, role: ranked.role, text: ranked.text,
          steps: ranked.steps, evidence: ranked.evidence, status: ranked.status, error: ranked.error, createdAt: ranked.createdAt,
        }).from(ranked).where(sql`${ranked.messageIndex} <= ${MESSAGE_LIMIT}`)
          .orderBy(asc(ranked.threadId), asc(ranked.createdAt), asc(ranked.id));
        const byThread = new Map<string, MessageRow[]>();
        for (const message of messages) {
          const history = byThread.get(message.threadId) ?? [];
          history.push(message);
          byThread.set(message.threadId, history);
        }
        return rows.map((row) => threadWithMessages(row, byThread.get(row.id) ?? []));
      });
    },
  };
}

export type AgentStore = ReturnType<typeof createAgentStore>;
