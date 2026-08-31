import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { createSecret, listSecrets } from "@/lib/secrets/entries";
import { readJsonBody, withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug/secrets",
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
            await listSecrets(
              access,
              params.projectSlug,
              params.environmentSlug,
            ),
          );
        }),
      POST: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:write",
          );
          const result = await createSecret(
            access,
            params.projectSlug,
            params.environmentSlug,
            await readJsonBody(request),
          );
          return Response.json(
            { ...result, secret: result.secrets[0] ?? null },
            { status: 201 },
          );
        }),
    },
  },
});
