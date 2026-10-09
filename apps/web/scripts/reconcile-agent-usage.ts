import { getAgentMonthlyUsageKey } from "../src/lib/agent/monthly-usage";
import { reconcileAgentMonthlyUsage } from "../src/lib/agent/usage-reconciliation";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--organization" || args[2] !== "--month") {
    throw new Error("Usage: reconcile-agent-usage --organization <organization-id> --month <YYYY-MM>");
  }
  const organizationId = args[1];
  const month = args[3];
  getAgentMonthlyUsageKey(organizationId, month);
  // Import connections only after explicit tenant/month validation. No automatic backfill.
  const [{ db, pool }, { agentUsageRedis }] = await Promise.all([
    import("../src/db"), import("../src/lib/agent/monthly-usage-redis"),
  ]);
  try {
    const { createAgentMonthlyUsage } = await import("../src/lib/agent/monthly-usage");
    const usage = createAgentMonthlyUsage(agentUsageRedis);
    const result = await reconcileAgentMonthlyUsage(db, usage, { organizationId, month });
    console.log(JSON.stringify({ ...result, usage: await usage.get(organizationId, month) }));
  } finally {
    agentUsageRedis.disconnect();
    await pool.end();
  }
}

main().catch(() => {
  console.error("Agent usage reconciliation failed. Supply --organization <organization-id> --month <YYYY-MM>; check the selected database and Redis connection. No counters were reset; retrying is safe.");
  process.exitCode = 1;
});
