import { createFileRoute } from "@tanstack/react-router";
import { handleOutrayMcp } from "@/lib/mcp/server";

export const Route = createFileRoute("/api/mcp/")({ server: { handlers: {
  POST: ({ request }) => handleOutrayMcp(request, "direct"),
  GET: ({ request }) => handleOutrayMcp(request, "direct"),
  DELETE: ({ request }) => handleOutrayMcp(request, "direct"),
} } });
