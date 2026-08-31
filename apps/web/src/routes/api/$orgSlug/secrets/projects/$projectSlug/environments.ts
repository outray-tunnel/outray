import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import {
  readJsonBody,
  withSecretsErrors,
} from "@/lib/secrets/http";
import { createEnvironment } from "@/lib/secrets/projects";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug/environments",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          const environment = await createEnvironment(
            access,
            params.projectSlug,
            await readJsonBody(request),
          );
          return Response.json({ environment }, { status: 201 });
        }),
    },
  },
});
