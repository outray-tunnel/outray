import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { createClient } from "@clickhouse/client";

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE,
});

export const Route = createFileRoute("/api/admin/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const period = url.searchParams.get("period") || "24h";

        let intervalUnit = "MINUTE";
        let intervalValue = 15;
        let points = 96;

        switch (period) {
          case "1h":
            intervalUnit = "MINUTE";
            intervalValue = 1;
            points = 60;
            break;
          case "24h":
            intervalUnit = "MINUTE";
            intervalValue = 15;
            points = 96;
            break;
          case "7d":
            intervalUnit = "HOUR";
            intervalValue = 1;
            points = 168;
            break;
          case "30d":
            intervalUnit = "HOUR";
            intervalValue = 4;
            points = 180;
            break;
        }

        const query = `
          WITH times AS (
            SELECT
              CAST(
                toStartOfInterval(
                  now('UTC') - INTERVAL number * ${intervalValue} ${intervalUnit},
                  INTERVAL ${intervalValue} ${intervalUnit}
                ) AS DateTime
              ) AS time
            FROM numbers(${points})
          )
          SELECT
            t.time as time,
            max(s.active_tunnels) as active_tunnels
          FROM times t
          LEFT JOIN active_tunnel_snapshots s ON
            toStartOfInterval(s.ts, INTERVAL ${intervalValue} ${intervalUnit}) = t.time
          GROUP BY t.time
          ORDER BY t.time ASC
        `;

        try {
          const resultSet = await clickhouse.query({
            query,
            format: "JSONEachRow",
          });
          const data = await resultSet.json();
          return json(data);
        } catch (error) {
          console.error("ClickHouse query error:", error);
          return json({ error: "Failed to fetch stats" }, { status: 500 });
        }
      },
    },
  },
});
