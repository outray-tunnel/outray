import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { redis } from "@/lib/redis";
import { queryTinybird } from "@/lib/tinybird";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startTime = Date.now();
        const searchParams = new URL(request.url).searchParams;

        if (searchParams.get("tinybird") === "true") {
          try {
            // An empty, non-tenant result is fine: this checks that the query
            // credential and deployed pipe actually work, not just DNS/TLS.
            await queryTinybird("service_names", {
              organization_id: "__healthcheck__",
              hours: 1,
            }, { cache: "no-store", signal: AbortSignal.timeout(5_000), maximumResponseBytes: 64 * 1024 });
            return Response.json({ status: "healthy" }, {
              headers: { "Cache-Control": "no-store" },
            });
          } catch (error) {
            console.error("Tinybird health check failed:", error);
            return Response.json({ status: "unhealthy" }, {
              status: 503,
              headers: { "Cache-Control": "no-store" },
            });
          }
        }

        // A separate external check catches silent background-worker failures.
        // Keep it distinct from web liveness and dependency readiness so each
        // monitor points to the service that actually failed.
        if (searchParams.get("jobs") === "true") {
          try {
            const result = await db.execute(sql`
              SELECT
                (SELECT max(last_checked_at) FROM uptime_monitors
                  WHERE enabled = true AND deleted_at IS NULL) AS probe_last_seen,
                (SELECT max(last_evaluated_at) FROM observability_alerts
                  WHERE enabled = true AND deleted_at IS NULL) AS cron_last_seen
            `);
            const row = result.rows[0];
            const fresh = (value: unknown) => {
              if (!value) return false;
              const timestamp = new Date(String(value)).getTime();
              return Number.isFinite(timestamp) && startTime - timestamp < 5 * 60_000
                && timestamp - startTime < 60_000;
            };
            const probeHealthy = fresh(row?.probe_last_seen);
            const cronHealthy = fresh(row?.cron_last_seen);
            return Response.json({
              status: probeHealthy && cronHealthy ? "healthy" : "unhealthy",
              services: {
                uptimeProbe: probeHealthy ? "healthy" : "unhealthy",
                cron: cronHealthy ? "healthy" : "unhealthy",
              },
            }, {
              status: probeHealthy && cronHealthy ? 200 : 503,
              headers: { "Cache-Control": "no-store" },
            });
          } catch (error) {
            console.error("Background worker health check failed:", error);
            return Response.json({ status: "unhealthy" }, {
              status: 503,
              headers: { "Cache-Control": "no-store" },
            });
          }
        }

        // Keep the platform liveness probe independent of remote services.
        // Dependency checks remain available explicitly for diagnostics, but
        // a slow Redis or database must not make the web process look dead.
        const deep = searchParams.get("deep") === "true";
        if (!deep) {
          return new Response(
            JSON.stringify({
              status: "healthy",
              timestamp: new Date().toISOString(),
              services: { application: "healthy" },
              latency: { total: Date.now() - startTime },
              mode: "liveness",
            }),
            {
              status: 200,
              headers: {
                "Cache-Control": "no-store",
                "Content-Type": "application/json",
              },
            },
          );
        }
        
        let dbStatus = "healthy";
        let dbLatency = 0;
        
        try {
          const dbStart = Date.now();
          await db.execute(sql`SELECT 1`);
          dbLatency = Date.now() - dbStart;
        } catch (error) {
          dbStatus = "unhealthy";
          console.error("Database health check failed:", error);
        }
        
        let cacheStatus = "healthy";
        let cacheLatency = 0;
        
        try {
          const cacheStart = Date.now();
          await redis.ping();
          cacheLatency = Date.now() - cacheStart;
        } catch (error) {
          cacheStatus = "unhealthy";
          console.error("Cache health check failed:", error);
        }
        
        const isHealthy = dbStatus === "healthy" && cacheStatus === "healthy";
        const totalLatency = Date.now() - startTime;
        
        return new Response(
          JSON.stringify({
            status: isHealthy ? "healthy" : "unhealthy",
            timestamp: new Date().toISOString(),
            services: {
              database: dbStatus,
              cache: cacheStatus,
            },
            latency: {
              database: dbLatency,
              cache: cacheLatency,
              total: totalLatency,
            },
          }),
          {
            status: isHealthy ? 200 : 503,
            headers: {
              "Cache-Control": "no-store",
              "Content-Type": "application/json",
            },
          }
        );
      },
    },
  },
});
