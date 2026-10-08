import { createFileRoute } from "@tanstack/react-router";
import { agentHandlers } from "../../../../lib/agent/server";

export const Route = createFileRoute("/api/$orgSlug/agent/threads")({
  server: { handlers: { GET: ({ request, params }) => agentHandlers.list(request, params.orgSlug) } },
});
