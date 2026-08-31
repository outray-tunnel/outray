import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import { rewrapOrganizationKeys } from "@/lib/secrets/governance";
import { withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute("/api/$orgSlug/secrets/keys/rewrap")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          return Response.json(await rewrapOrganizationKeys(access));
        }),
    },
  },
});
