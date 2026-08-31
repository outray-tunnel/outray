import { createFileRoute } from "@tanstack/react-router";
import { requireSecretsAccess } from "@/lib/secrets/access";
import { exportSecrets } from "@/lib/secrets/entries";
import {
  readJsonBody,
  withPlaintextSecretsErrors,
} from "@/lib/secrets/http";

export const Route = createFileRoute(
  "/api/$orgSlug/secrets/projects/$projectSlug/environments/$environmentSlug/export",
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
          const exported = await exportSecrets(
            access,
            params.projectSlug,
            params.environmentSlug,
            await readJsonBody(request),
          );
          return new Response(exported.envText, {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "content-disposition": `attachment; filename="${exported.filename}"`,
              "x-outray-revision": String(exported.revision),
              "x-outray-secret-count": String(exported.count),
            },
          });
        }),
    },
  },
});
