import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { listSecretVersions } from "@/lib/secrets/entries";
import { withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug/secrets/$secretId/versions",
)({
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
            await listSecretVersions(
              access,
              params.projectSlug,
              params.environmentSlug,
              params.secretId,
            ),
          );
        }),
    },
  },
});
