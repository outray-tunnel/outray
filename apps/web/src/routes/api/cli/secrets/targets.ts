import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsTargetsAccess } from "@/lib/secrets/access";
import { listSecretTargets } from "@/lib/secrets/governance";
import { withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute("/api/cli/secrets/targets")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withSecretsErrors(async () => {
          const accesses = await requireSecretsTargetsAccess(request);
          return Response.json({
            organizations: await listSecretTargets(accesses),
          });
        }),
    },
  },
});
