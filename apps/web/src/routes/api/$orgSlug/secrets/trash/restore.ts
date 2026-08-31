import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import { restoreTrash } from "@/lib/secrets/governance";
import { readJsonBody, withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute("/api/$orgSlug/secrets/trash/restore")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          return Response.json(
            await restoreTrash(access, await readJsonBody(request)),
          );
        }),
    },
  },
});
