import { createFileRoute } from "@tanstack/react-router";
import { agentHandlers } from "../../../../lib/agent/server";

export const Route = createFileRoute("/api/$orgSlug/agent/chat")({
  server: { handlers: { POST: ({ request, params }) => agentHandlers.chat(request, params.orgSlug) } },
});
