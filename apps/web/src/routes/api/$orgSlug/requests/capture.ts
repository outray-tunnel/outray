import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "../../../../lib/org";
import { tigerData } from "../../../../lib/tigerdata";

export const Route = createFileRoute("/api/$orgSlug/requests/capture")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { orgSlug } = params;

          const orgContext = await requireOrgFromSlug(request, orgSlug);
          if ("error" in orgContext) {
            return orgContext.error;
          }

          const body = await request.json();
          const { tunnelId, timestamp } = body;

          if (!tunnelId || !timestamp) {
            return Response.json(
              { error: "tunnelId and timestamp are required" },
              { status: 400 },
            );
          }

          // Query TimescaleDB for request capture data
          // We'll search for captures within a small time window around the event timestamp
          const timestampDate = new Date(timestamp);
          const beforeTime = new Date(timestampDate.getTime() - 5000); // 5 seconds before
          const afterTime = new Date(timestampDate.getTime() + 5000); // 5 seconds after

          const result = await tigerData.query(
            `SELECT 
              id,
              timestamp,
              tunnel_id,
              organization_id,
              request_headers,
              request_body,
              request_body_size,
              response_headers,
              response_body,
              response_body_size
            FROM request_captures 
            WHERE tunnel_id = $1 
              AND organization_id = $2 
              AND timestamp BETWEEN $3 AND $4
            ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - $5))) ASC
            LIMIT 1`,
            [
              tunnelId,
              orgContext.organization.id,
              beforeTime,
              afterTime,
              timestampDate,
            ],
          );

          if (result.rows.length === 0) {
            return Response.json(
              { error: "Request capture not found" },
              { status: 404 },
            );
          }

          const capture = result.rows[0];

          // Parse JSON headers
          const requestHeaders =
            typeof capture.request_headers === "string"
              ? JSON.parse(capture.request_headers)
              : capture.request_headers;

          const responseHeaders =
            typeof capture.response_headers === "string"
              ? JSON.parse(capture.response_headers)
              : capture.response_headers;

          // Decode base64 bodies if they exist
          let requestBody = null;
          let responseBody = null;

          if (capture.request_body) {
            try {
              requestBody = Buffer.from(
                capture.request_body,
                "base64",
              ).toString("utf-8");
            } catch (e) {
              requestBody = capture.request_body; // fallback to raw if not base64
            }
          }

          if (capture.response_body) {
            try {
              responseBody = Buffer.from(
                capture.response_body,
                "base64",
              ).toString("utf-8");
            } catch (e) {
              responseBody = capture.response_body; // fallback to raw if not base64
            }
          }

          return Response.json({
            capture: {
              id: capture.id,
              timestamp: capture.timestamp,
              tunnelId: capture.tunnel_id,
              request: {
                headers: requestHeaders,
                body: requestBody,
                bodySize: capture.request_body_size,
              },
              response: {
                headers: responseHeaders,
                body: responseBody,
                bodySize: capture.response_body_size,
              },
            },
          });
        } catch (error) {
          console.error("Error fetching request capture:", error);

          // Provide more specific error messages
          let errorMessage = "Failed to fetch request capture";
          if (error instanceof Error) {
            if (
              error.message.includes("SSL") ||
              error.message.includes("ssl")
            ) {
              errorMessage =
                "Database SSL connection error. Please check TimescaleDB configuration.";
            } else if (
              error.message.includes("connect") ||
              error.message.includes("connection")
            ) {
              errorMessage =
                "Unable to connect to TimescaleDB. Please check database URL and network connectivity.";
            } else if (
              error.message.includes("authentication") ||
              error.message.includes("password")
            ) {
              errorMessage =
                "Database authentication failed. Please check credentials.";
            }
          }

          return Response.json({ error: errorMessage }, { status: 500 });
        }
      },
    },
  },
});
