import { and, asc, eq, gt, gte, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { agentRuns, agentThreads } from "../../db/agent-schema";
import type * as schema from "../../db/schema";
import { getAgentMonthlyUsageKey, type AgentMonthlyUsageRecorder } from "./monthly-usage";

interface ReconciliationOptions {
  organizationId: string;
  month: string;
  pageSize?: number;
}

/** Internal maintenance, not a user-facing chat-history API. Includes every org member. */
export async function reconcileAgentMonthlyUsage(
  database: NodePgDatabase<typeof schema>,
  usage: AgentMonthlyUsageRecorder,
  { organizationId, month, pageSize = 250 }: ReconciliationOptions,
) {
  // Validate tenant/month without making any Redis or PostgreSQL calls.
  getAgentMonthlyUsageKey(organizationId, month);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new Error("Agent usage reconciliation page size must be between 1 and 1000");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(0);
  start.setUTCFullYear(year, monthNumber - 1, 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  let cursor: string | undefined;
  let processedRuns = 0;

  for (;;) {
    const runs = await database.select({
      id: agentRuns.id,
      startedAt: agentRuns.startedAt,
      inputTokens: agentRuns.inputTokens,
      outputTokens: agentRuns.outputTokens,
      status: agentRuns.status,
    }).from(agentRuns)
      .innerJoin(agentThreads, eq(agentRuns.threadId, agentThreads.id))
      .where(and(
        eq(agentThreads.organizationId, organizationId),
        gte(agentRuns.startedAt, start),
        lt(agentRuns.startedAt, end),
        cursor ? gt(agentRuns.id, cursor) : undefined,
      )).orderBy(asc(agentRuns.id)).limit(pageSize);

    for (const run of runs) {
      // Unlike chat writes, maintenance fails loudly so operators can retry safely.
      await usage.record({ organizationId, runId: run.id, startedAt: run.startedAt,
        inputTokens: run.inputTokens, outputTokens: run.outputTokens, status: run.status });
      processedRuns++;
    }
    if (runs.length < pageSize) break;
    cursor = runs[runs.length - 1].id;
  }
  return { organizationId, month, processedRuns };
}
