import type { AgentMonthlyUsageRecorder } from "./monthly-usage";
import type { AgentStore, AgentStoredRun } from "./store";

/** PostgreSQL commits first; a Redis outage must not fail or repeat a paid model run. */
export function createAgentUsageStore(
  store: AgentStore,
  usage: AgentMonthlyUsageRecorder,
  options: { onAccountingError?: () => void } = {},
): AgentStore {
  async function record(organizationId: string, run: AgentStoredRun) {
    try {
      await usage.record({
        organizationId,
        runId: run.id,
        startedAt: run.startedAt,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        status: run.status,
      });
    } catch {
      // The committed run is the recovery source. Do not expose Redis errors/credentials.
      try { options.onAccountingError?.(); } catch { /* Isolate logging failures too. */ }
    }
  }

  return {
    ...store,
    async beginRun(input) {
      const result = await store.beginRun(input);
      await record(input.organizationId, result.run);
      return result;
    },
    async updateRun(input) {
      const run = await store.updateRun(input);
      await record(input.organizationId, run);
      return run;
    },
    async finishRun(input) {
      const run = await store.finishRun(input);
      await record(input.organizationId, run);
      return run;
    },
    async cancelRun(input) {
      const run = await store.cancelRun(input);
      await record(input.organizationId, run);
      return run;
    },
    async getRun(input) {
      const run = await store.getRun(input);
      if (run) await record(input.organizationId, run);
      return run;
    },
  };
}
