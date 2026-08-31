import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { listAuditEvents } from "@/lib/secrets/governance";
import { withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute("/api/$orgSlug/secrets/audit")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:read",
          );
          return Response.json(
            await listAuditEvents(access, new URL(request.url).searchParams),
          );
        }),
    },
  },
});
