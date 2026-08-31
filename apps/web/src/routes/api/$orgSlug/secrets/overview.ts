import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { withSecretsErrors } from "@/lib/secrets/http";
import { getOverview } from "@/lib/secrets/projects";

export const Route = createFileRoute("/api/$orgSlug/secrets/overview")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:read",
          );
          return Response.json(await getOverview(access));
        }),
    },
  },
});
