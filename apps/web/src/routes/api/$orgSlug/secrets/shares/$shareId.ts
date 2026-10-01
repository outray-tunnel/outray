import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import { revokeOrganizationShare } from "@/lib/secrets/shares";
import { withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute("/api/$orgSlug/secrets/shares/$shareId")({
  server: { handlers: { DELETE: async ({ request, params }) => withSecretsErrors(async () => {
    const access = await requireSecretsAdmin(request, params.orgSlug);
    return Response.json(await revokeOrganizationShare(access, params.shareId), { headers: { "Cache-Control": "private, no-store" } });
  }) } },
});
