import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import {
  createSecretsMachineToken,
  listMachineTokens,
} from "@/lib/secrets/governance";
import {
  readJsonBody,
  withPlaintextSecretsErrors,
  withSecretsErrors,
} from "@/lib/secrets/http";

export const Route = createFileRoute("/api/$orgSlug/secrets/machine-tokens")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          return Response.json({ machineTokens: await listMachineTokens(access) });
        }),
      POST: async ({ request, params }) =>
        withPlaintextSecretsErrors(async () => {
          const access = await requireSecretsAdmin(request, params.orgSlug);
          return Response.json(
            await createSecretsMachineToken(access, await readJsonBody(request)),
            { status: 201 },
          );
        }),
    },
  },
});
