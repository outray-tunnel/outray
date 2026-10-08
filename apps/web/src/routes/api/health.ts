import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { redis } from "@/lib/redis";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startTime = Date.now();

        // Keep the platform liveness probe independent of remote services.
        // Dependency checks remain available explicitly for diagnostics, but
        // a slow Redis or database must not make the web process look dead.
        const deep = new URL(request.url).searchParams.get("deep") === "true";
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
