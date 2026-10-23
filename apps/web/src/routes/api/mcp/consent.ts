import { createFileRoute } from "@tanstack/react-router";
import { handleMcpConsent } from "@/lib/mcp/consent";
export const Route = createFileRoute("/api/mcp/consent")({ server: { handlers: {
  GET: ({ request }) => handleMcpConsent(request), POST: ({ request }) => handleMcpConsent(request),
} } });
