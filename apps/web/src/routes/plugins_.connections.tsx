import { createFileRoute } from "@tanstack/react-router";
import { redirectMcpConnectionsToDashboard } from "@/lib/mcp/consent";

export const Route = createFileRoute("/plugins_/connections")({
  server: { handlers: { GET: ({ request }) => redirectMcpConnectionsToDashboard(request) } },
});
