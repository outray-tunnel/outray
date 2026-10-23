import { createFileRoute } from "@tanstack/react-router";
import { pool } from "@/db";
import { adminJson, requireAdminAccess } from "@/lib/admin-access.server";
import { cachedDashboardRead, dashboardCacheKey } from "@/lib/dashboard-cache";
import { loadUsageAggregates, parseUsageAggregateParams, UsageAggregateInputError } from "@/lib/product-usage-report.server";
import { redis } from "@/lib/redis";

export const Route = createFileRoute("/api/admin/usage/aggregates")({
  server: { handlers: { GET: async ({ request }) => {
    const denied = await requireAdminAccess(request);
    if (denied) return denied;
    try {
      const params = parseUsageAggregateParams(new URL(request.url).searchParams);
      const report = await cachedDashboardRead(dashboardCacheKey("admin-permanent-usage", { ...params, day: new Date().toISOString().slice(0, 10) }), async () => {
        const data = await loadUsageAggregates(pool, params);
        let tunnelQueue: { queued: string; deadLetters: string; oldestQueuedAt: string | null } | null = null;
        try {
          const [queued, deadLetters, oldest] = await Promise.all([redis.xlen("usage:tunnels:pending"), redis.xlen("usage:tunnels:dead-letter"), redis.xrange("usage:tunnels:pending", "-", "+", "COUNT", 1)]);
          tunnelQueue = { queued: String(queued), deadLetters: String(deadLetters), oldestQueuedAt: oldest[0] ? new Date(Number(oldest[0][0].split("-")[0])).toISOString() : null };
        } catch { /* Unavailable queue evidence is not a zero. */ }
        return { ...data, tunnelQueue };
      });
      return adminJson(report);
    } catch (error) {
      if (error instanceof UsageAggregateInputError) return adminJson({ error: error.message }, { status: 400 });
      console.error("Permanent usage report unavailable");
      return adminJson({ error: "Permanent usage is temporarily unavailable." }, { status: 503 });
    }
  } } },
});
