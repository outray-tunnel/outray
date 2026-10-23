import { createFileRoute } from "@tanstack/react-router";
import { continueMcpLogin } from "@/lib/mcp/consent";
export const Route = createFileRoute("/plugins/continue")({ server: { handlers: {
  GET: ({ request }) => continueMcpLogin(request),
} } });
