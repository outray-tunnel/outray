import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import { revokeMachineToken } from "@/lib/secrets/governance";
import { withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/machine-tokens/$tokenId",
)({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          return Response.json(await revokeMachineToken(access, params.tokenId));
        }),
    },
  },
});
