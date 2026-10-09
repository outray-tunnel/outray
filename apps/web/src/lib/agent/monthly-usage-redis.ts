import Redis from "ioredis";
import { createAgentMonthlyUsage } from "./monthly-usage";

// Same Redis/database as the rest of the console, but bounded accounting commands.
// Do not change the shared dashboard client's retry behavior or log raw Redis errors.
export const agentUsageRedis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  lazyConnect: true,
  connectTimeout: 1_000,
  commandTimeout: 1_000,
  maxRetriesPerRequest: 0,
  autoResendUnfulfilledCommands: false,
});
agentUsageRedis.on("error", () => {});

const usage = createAgentMonthlyUsage(agentUsageRedis);
let retryAfter = 0;
let warningAfter = 0;

export const agentMonthlyUsage = {
  async record(snapshot: Parameters<typeof usage.record>[0]) {
    if (Date.now() < retryAfter) throw new Error("Agent monthly usage is temporarily unavailable");
    try {
      await usage.record(snapshot);
      retryAfter = 0;
    } catch {
      // Fail fast on later checkpoints during an outage instead of delaying every step.
      retryAfter = Date.now() + 30_000;
      throw new Error("Agent monthly usage is temporarily unavailable");
    }
  },
  get: usage.get,
};

export function reportAgentUsageAccountingError() {
  if (Date.now() < warningAfter) return;
  warningAfter = Date.now() + 60_000;
  console.warn("Agent monthly Redis accounting unavailable; saved PostgreSQL usage can be reconciled.");
}
