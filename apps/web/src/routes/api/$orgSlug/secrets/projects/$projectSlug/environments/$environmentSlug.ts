import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import {
  readJsonBody,
  withSecretsErrors,
} from "@/lib/secrets/http";
import {
  deleteEnvironment,
  updateEnvironment,
} from "@/lib/secrets/projects";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug",
)({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          const environment = await updateEnvironment(
            access,
            params.projectSlug,
            params.environmentSlug,
            await readJsonBody(request),
          );
          return Response.json({ environment });
        }),
      DELETE: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          return Response.json(
            await deleteEnvironment(
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
