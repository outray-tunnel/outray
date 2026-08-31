import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { revealSecret } from "@/lib/secrets/entries";
import {
  readJsonBody,
  withPlaintextSecretsErrors,
} from "@/lib/secrets/http";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug/secrets/$secretId/reveal",
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withPlaintextSecretsErrors(async () => {
          const access = await requireSecretsAccess(
            request,
            params.orgSlug,
            "secrets:reveal",
          );
          const result = await revealSecret(
              access,
              params.projectSlug,
              params.environmentSlug,
              params.secretId,
              await readJsonBody(request),
            );
          return Response.json({
            ...result,
            secret: { ...result.secret, expiresIn: 30 },
            expiresIn: 30,
          });
        }),
    },
  },
});
