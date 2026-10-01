import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import { snapshotSecrets } from "@/lib/secrets/shares";
import { readJsonBody, withPlaintextSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute("/api/$orgSlug/secrets/shares/snapshot")({
  server: { handlers: { POST: async ({ request, params }) => withPlaintextSecretsErrors(async () => {
    const access = await requireSecretsAdmin(request, params.orgSlug);
    const input = await readJsonBody(request);
    return Response.json(await snapshotSecrets(access, String(input.projectSlug || ""), String(input.environmentSlug || ""), input));
  }) } },
});
