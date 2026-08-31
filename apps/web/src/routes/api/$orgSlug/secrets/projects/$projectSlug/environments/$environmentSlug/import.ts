import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { importSecrets } from "@/lib/secrets/entries";
import { readJsonBody, withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug/import",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:write",
          );
          return Response.json(
            await importSecrets(
              access,
              params.projectSlug,
              params.environmentSlug,
              await readJsonBody(request),
            ),
          );
        }),
    },
  },
});
