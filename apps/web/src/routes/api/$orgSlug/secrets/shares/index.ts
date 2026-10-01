import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAdmin } from "@/lib/secrets/access";
import { createOrganizationShare, listOrganizationShares } from "@/lib/secrets/shares";
import { readJsonBody, withSecretsErrors } from "@/lib/secrets/http";

export const Route = createFileRoute("/api/$orgSlug/secrets/shares/")({
  server: { handlers: {
    GET: async ({ request, params }) => withSecretsErrors(async () => {
      const access = await requireSecretsAdmin(request, params.orgSlug);
      return Response.json(await listOrganizationShares(access), { headers: { "Cache-Control": "private, no-store" } });
    }),
    POST: async ({ request, params }) => withSecretsErrors(async () => {
      const access = await requireSecretsAdmin(request, params.orgSlug);
      const input = await readJsonBody(request);
      return Response.json(await createOrganizationShare(access, String(input.projectSlug || ""), String(input.environmentSlug || ""), input), { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }),
  } },
});
