import { createFileRoute } from "@tanstack/react-router";
import { handleOutrayMcp } from "@/lib/mcp/server";

export const Route = createFileRoute("/api/mcp/openai")({ server: { handlers: {
  POST: ({ request }) => handleOutrayMcp(request, "openai"),
  GET: ({ request }) => handleOutrayMcp(request, "openai"),
  DELETE: ({ request }) => handleOutrayMcp(request, "openai"),
} } });
