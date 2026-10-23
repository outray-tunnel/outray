import { createFileRoute } from "@tanstack/react-router";
import { handleMcpConnections } from "@/lib/mcp/consent";
export const Route = createFileRoute("/api/mcp/connections")({ server: { handlers: {
  GET: ({ request }) => handleMcpConnections(request), DELETE: ({ request }) => handleMcpConnections(request),
} } });
