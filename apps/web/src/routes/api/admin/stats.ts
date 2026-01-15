import { createFileRoute } from "@tanstack/react-router";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import { tigerData } from "../../../lib/tigerdata";

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

        const query = `
          WITH times AS (
            SELECT generate_series(
              time_bucket($1::interval, NOW()) - ($1::interval * $2),
              time_bucket($1::interval, NOW()),
              $1::interval
            ) AS time
          )
          SELECT
            t.time as time,
            COALESCE(MAX(s.active_tunnels), 0) as active_tunnels
          FROM times t
          LEFT JOIN active_tunnel_snapshots s ON
            time_bucket($1::interval, s.ts) = t.time
          GROUP BY t.time
          ORDER BY t.time ASC
        `;

        try {
          const result = await tigerData.query(query, [
            `${intervalMinutes} minutes`,
            points,
          ]);
          return Response.json(result.rows);
        } catch (error) {
          console.error("TimescaleDB query error:", error);
          return Response.json(
            { error: "Failed to fetch stats" },
            { status: 500 },
          );
        }
      },
    },
  },
});
