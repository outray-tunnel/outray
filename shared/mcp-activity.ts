export const MCP_ACTIVITY_RETENTION_DAYS = 90;
export const MCP_ACTIVITY_CLEANUP_INTERVAL_MS = 60_000;
interface Database {
  query(sql: string, parameters: Array<Date | number>): Promise<{ rowCount: number | null }>;
}

export async function cleanupMcpActivity(database: Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - MCP_ACTIVITY_RETENTION_DAYS * 86_400_000);
  await database.query(`WITH expired AS (
    SELECT id FROM mcp_activity WHERE created_at < $1 ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED
  ) DELETE FROM mcp_activity AS activity USING expired WHERE activity.id = expired.id`, [cutoff, 10_000]);
  await database.query(`WITH expired AS (
    SELECT id FROM mcp_connections WHERE revoked_at < $1 ORDER BY revoked_at LIMIT $2 FOR UPDATE SKIP LOCKED
  ) DELETE FROM mcp_connections AS connection USING expired WHERE connection.id = expired.id`, [cutoff, 1_000]);
}

export function createMcpActivityCleanup(database: Database, log: Pick<Console, "error"> = console) {
  let job: Promise<void> | null = null;
  let stopped = false;
  return {
    run() {
      if (stopped) return Promise.resolve();
      if (job) return job;
      job = cleanupMcpActivity(database).catch(() => log.error("[MCP] Activity retention cleanup failed"))
        .finally(() => { job = null; });
      return job;
    },
    async shutdown() { stopped = true; await job; },
  };
}
