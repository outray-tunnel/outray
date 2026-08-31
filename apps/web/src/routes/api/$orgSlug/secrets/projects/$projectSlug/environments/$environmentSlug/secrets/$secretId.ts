import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { deleteSecret, updateSecret } from "@/lib/secrets/entries";
import { readJsonBody, withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug/secrets/$secretId",
)({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:write",
          );
          return Response.json(
            await updateSecret(
              access,
              params.projectSlug,
              params.environmentSlug,
              params.secretId,
              await readJsonBody(request),
            ),
          );
        }),
      DELETE: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:delete",
          );
          return Response.json(
            await deleteSecret(
              access,
              params.projectSlug,
              params.environmentSlug,
              params.secretId,
              await readJsonBody(request),
            ),
          );
        }),
    },
  },
});
