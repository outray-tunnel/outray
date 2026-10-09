import { createFileRoute } from "@tanstack/react-router";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import { queryTinybird } from "../../../lib/tinybird";

export const Route = createFileRoute("/api/admin/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Admin token check
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length)
          : "";

        if (!token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tokenKey = `admin:token:${hashToken(token)}`;
        const exists = await redis.get(tokenKey);
        if (!exists) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const url = new URL(request.url);
        const period = url.searchParams.get("period") || "24h";

        let intervalMinutes = 15;
        let points = 96;

        switch (period) {
          case "1h":
            intervalMinutes = 1;
            points = 60;
            break;
          case "24h":
            intervalMinutes = 15;
            points = 96;
            break;
          case "7d":
            intervalMinutes = 60;
            points = 168;
            break;
          case "30d":
            intervalMinutes = 240;
            points = 180;
            break;
        }

        try {
          const bucketMs = intervalMinutes * 60_000;
          const end = Math.floor(Date.now() / bucketMs) * bucketMs;
          const start = end - bucketMs * points;
          const rows = await queryTinybird<{ time: string; active_tunnels: number }>(
            "tunnel_admin_active_series",
            { start: new Date(start).toISOString(), end: new Date(end + bucketMs).toISOString(), interval_minutes: intervalMinutes },
          );
          const values = new Map(rows.map((row) => [
            Date.parse(row.time.endsWith("Z") ? row.time : `${row.time.replace(" ", "T")}Z`),
            Number(row.active_tunnels),
          ]));
          return Response.json(Array.from({ length: points + 1 }, (_, index) => {
            const time = start + index * bucketMs;
            return { time: new Date(time).toISOString(), active_tunnels: values.get(time) || 0 };
          }));
        } catch (error) {
          console.error("Tunnel analytics query failed:", error);
          return Response.json({ error: "Failed to fetch stats" }, { status: 500 });
        }
      },
    },
  },
});
